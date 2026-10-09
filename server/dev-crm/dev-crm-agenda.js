import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { consolidarPacksMensais } from './payment-status.js';
import { carregarAgendaGoogle, chaveTituloAgenda, normalizarTituloAgenda } from './calendar-agenda.js';
import { erroTemporarioGoogle, registarErroTemporario } from '../../api/_transient-errors.js';
import { googleServiceAccountEmail } from '../../api/_google-cloud.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}
function texto(valor, maximo = 300) { return String(valor || '').trim().slice(0, maximo); }
function dataLisboa(valor = new Date()) { const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(valor); const parte = tipo => partes.find(item => item.type === tipo).value; return `${parte('year')}-${parte('month')}-${parte('day')}`; }
function adicionarDias(data, dias) { const resultado = new Date(`${data}T12:00:00Z`); resultado.setUTCDate(resultado.getUTCDate() + dias); return resultado.toISOString().slice(0, 10); }
function inicioSemana(offset) { const hoje = dataLisboa(); const cursor = new Date(`${hoje}T12:00:00Z`); const dia = cursor.getUTCDay() || 7; cursor.setUTCDate(cursor.getUTCDate() - dia + 1 + offset * 7); return cursor.toISOString().slice(0, 10); }
function tituloSemana(inicio) { const primeiro = new Date(`${inicio}T12:00:00Z`); const ultimo = new Date(`${adicionarDias(inicio, 6)}T12:00:00Z`); const formato = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'long' }); return `${formato.format(primeiro)} — ${formato.format(ultimo)}`; }
function frequenciaEsperada(valor) { const resultado = String(valor || '').match(/^(\d+)x/i); return resultado ? Number(resultado[1]) : 0; }

async function exigirContextoEquipa(req) {
  const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove();
  exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
  return { identidade, db };
}

async function guardarConfiguracao(req, res) {
  const { identidade, db } = await exigirContextoEquipa(req); const dados = req.body && typeof req.body === 'object' ? req.body : {};
  const action = texto(dados.action, 50); const titulo = texto(dados.titulo, 300); const tituloNormalizado = normalizarTituloAgenda(titulo);
  if (!tituloNormalizado) return responder(res, 400, { ok: false, erro: 'TITULO_INVALIDO' });
  const referencia = db.collection(action === 'ignore-calendar-title' ? 'crmCalendarIgnoredTitles' : 'crmCalendarAliases').doc(chaveTituloAgenda(titulo));
  const agora = new Date(); const lote = db.batch();
  if (action === 'ignore-calendar-title') {
    lote.set(referencia, { titulo, tituloNormalizado, motivo: texto(dados.motivo, 160) || 'Ignorado manualmente', updatedAt: agora, updatedBy: identidade.uid }, { merge: true });
    lote.create(db.collection('auditLogs').doc(), { action: 'development.calendar-title.ignored', title: titulo, actorUid: identidade.uid, createdAt: agora });
    await lote.commit();
    return responder(res, 200, { ok: true });
  }
  if (action === 'associate-calendar-title') {
    const clientId = texto(dados.clientId, 128); const cliente = await db.collection('crmMigrationClients').doc(clientId).get();
    if (!cliente.exists || cliente.data()?.estado !== 'Ativo') return responder(res, 404, { ok: false, erro: 'CLIENTE_ATIVO_NAO_ENCONTRADO' });
    lote.set(referencia, { titulo, tituloNormalizado, clientId, clientName: texto(cliente.data()?.nome, 200), updatedAt: agora, updatedBy: identidade.uid }, { merge: true });
    lote.create(db.collection('auditLogs').doc(), { action: 'development.calendar-title.associated', title: titulo, clientId, actorUid: identidade.uid, createdAt: agora });
    await lote.commit();
    return responder(res, 200, { ok: true, cliente: texto(cliente.data()?.nome, 200) });
  }
  return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    if (req.method === 'POST') return guardarConfiguracao(req, res);
    const { db } = await exigirContextoEquipa(req);
    const modo = texto(req.query?.mode, 30) || 'semana'; const offsetBruto = Number(req.query?.offset || 0);
    const offset = Number.isFinite(offsetBruto) ? Math.max(-52, Math.min(52, Math.trunc(offsetBruto))) : 0;
    const semanaInicio = inicioSemana(offset); const semanaFim = adicionarDias(semanaInicio, 6); const mesReferencia = semanaInicio.slice(0, 7);
    const [clientesSnap, packsSnap, sessoesSnap, agendaPortalSnap] = await Promise.all([
      db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get(), db.collection('crmMigrationSessions').get(), db.collection('crmMigrationPortalAgenda').get()
    ]);
    const clientes = clientesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(cliente => cliente.estado === 'Ativo').map(cliente => ({ id: cliente.id, nome: texto(cliente.nome, 200) }));
    const nomes = new Map(clientes.map(cliente => [cliente.id, cliente.nome]));
    if (modo === 'monthly-pt') {
      const mes = texto(req.query?.mes, 7) || dataLisboa().slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mes)) return responder(res, 400, { ok: false, erro: 'MES_INVALIDO' });
      const itens = sessoesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(sessao => sessao.mesAno === mes && nomes.has(sessao.clientId)).map(sessao => ({ idCliente: sessao.clientId, clienteNome: nomes.get(sessao.clientId), numero: Number(sessao.numSessao || 0), estado: texto(sessao.estado, 20) || 'Pendente', data: texto(sessao.dataConfirmada, 10) })).sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-PT') || a.numero - b.numero);
      return responder(res, 200, { ok: true, mes, pendentes: itens.filter(item => item.estado === 'Pendente'), concluidas: itens.filter(item => item.estado === 'Confirmada'), canceladas: itens.filter(item => item.estado === 'Cancelada') });
    }
    const packs = new Map(consolidarPacksMensais(packsSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }))).filter(pack => pack.mesAno === mesReferencia).map(pack => [pack.clientId, pack]));
    const eventosGoogle = await carregarAgendaGoogle({ db, clientes, semanaInicio, semanaFim });
    const eventosAvaliacaoManual = agendaPortalSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(item => String(item.estado || 'Marcada').toLowerCase() !== 'cancelada' && texto(item.dataHora).slice(0, 10) >= semanaInicio && texto(item.dataHora).slice(0, 10) <= semanaFim).map(item => ({ id: item.id, tipo: 'AVALIAÇÃO', titulo: texto(item.titulo) || 'Avaliação física', clienteId: texto(item.idCliente, 128), clienteNome: nomes.get(item.idCliente) || 'Cliente', reconhecido: nomes.has(item.idCliente), ignorado: false, motivoNaoReconhecido: nomes.has(item.idCliente) ? '' : 'Cliente não encontrado', dia: texto(item.dataHora).slice(0, 10), horaInicio: texto(item.dataHora).slice(11, 16) || '—', horaFim: '', inicioMs: Date.parse(item.dataHora) || 0, diaSemana: '', local: texto(item.local, 300), situacao: (Date.parse(item.dataHora) || 0) >= Date.now() ? 'Marcada' : 'Decorrida', origem: 'firestore-manual' }));
    const eventos = [...eventosGoogle, ...eventosAvaliacaoManual].sort((a, b) => a.inicioMs - b.inicioMs || a.titulo.localeCompare(b.titulo, 'pt-PT'));
    const eventosPt = eventosGoogle.filter(evento => evento.tipo === 'PT' && evento.reconhecido); const contagem = new Map(); eventosPt.forEach(evento => contagem.set(evento.clienteId, (contagem.get(evento.clienteId) || 0) + 1));
    const resumoClientes = clientes.map(cliente => { const pack = packs.get(cliente.id); const esperado = frequenciaEsperada(pack?.frequencia); const marcadas = contagem.get(cliente.id) || 0; return { id: cliente.id, nome: cliente.nome, frequencia: texto(pack?.frequencia, 32), esperado, marcadas, emFalta: esperado ? Math.max(0, esperado - marcadas) : 0, semFrequencia: !esperado, pagamentoPendente: Boolean(pack) && texto(pack.estadoPagamento).toLowerCase() !== 'pago' }; }).sort((a, b) => b.emFalta - a.emFalta || a.nome.localeCompare(b.nome, 'pt-PT'));
    const comFrequencia = resumoClientes.filter(cliente => !cliente.semFrequencia); const porConfirmar = eventosGoogle.filter(evento => evento.tipo === 'PT' && !evento.reconhecido);
    return responder(res, 200, { ok: true, fonteAgenda: 'google-calendar', semanaInicio, semanaFim, tituloSemana: tituloSemana(semanaInicio), mesReferencia, clientes: resumoClientes, eventos, porConfirmar, resumo: { esperadas: comFrequencia.reduce((soma, cliente) => soma + cliente.esperado, 0), marcadas: eventosPt.length, futuras: eventosPt.filter(evento => evento.situacao === 'Marcada').length, emFalta: comFrequencia.reduce((soma, cliente) => soma + cliente.emFalta, 0), avaliacoes: eventos.filter(evento => evento.tipo === 'AVALIAÇÃO').length, porConfirmar: porConfirmar.length, semFrequencia: resumoClientes.filter(cliente => cliente.semFrequencia).length } });
  } catch (erro) {
    const codigo = texto(erro?.code || erro?.message || 'FALHA', 100);
    if (erroTemporarioGoogle(erro)) { registarErroTemporario('dev-crm-agenda', erro); return responder(res, 503, { ok: false, erro: 'SERVICO_TEMPORARIAMENTE_INDISPONIVEL' }); }
    if (/^FIREBASE_/.test(codigo)) return responder(res, 401, { ok: false, erro: codigo });
    if (/^ACESSO_/.test(codigo)) return responder(res, 403, { ok: false, erro: codigo });
    if (/^CALENDARIO_GOOGLE_/.test(codigo)) return responder(res, 503, { ok: false, erro: codigo, contaServico: googleServiceAccountEmail() });
    return responder(res, 500, { ok: false, erro: 'AGENDA_INDISPONIVEL' });
  }
}
