import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { consolidarPacksMensais } from './payment-status.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function dataLisboa(valor = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(valor);
  const parte = tipo => partes.find(item => item.type === tipo).value;
  return parte('year') + '-' + parte('month') + '-' + parte('day');
}

function adicionarDias(data, dias) {
  const resultado = new Date(data + 'T12:00:00Z');
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
}

function inicioSemana(offset) {
  const hoje = dataLisboa();
  const cursor = new Date(hoje + 'T12:00:00Z');
  const dia = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() - dia + 1 + offset * 7);
  return cursor.toISOString().slice(0, 10);
}

function tituloSemana(inicio) {
  const primeiro = new Date(inicio + 'T12:00:00Z');
  const ultimo = new Date(adicionarDias(inicio, 6) + 'T12:00:00Z');
  const formato = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'long' });
  return formato.format(primeiro) + ' — ' + formato.format(ultimo);
}

function frequenciaEsperada(valor) {
  const resultado = String(valor || '').match(/^(\d+)x/i);
  return resultado ? Number(resultado[1]) : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const modo = String(req.query?.mode || 'semana'); const offsetBruto = Number(req.query?.offset || 0);
    const offset = Number.isFinite(offsetBruto) ? Math.max(-52, Math.min(52, Math.trunc(offsetBruto))) : 0;
    const semanaInicio = inicioSemana(offset);
    const semanaFim = adicionarDias(semanaInicio, 6);
    const mesReferencia = semanaInicio.slice(0, 7);
    const [clientesSnap, packsSnap, sessoesSnap, agendaPortalSnap] = await Promise.all([
      db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get(),
      db.collection('crmMigrationSessions').get(), db.collection('crmMigrationPortalAgenda').get()
    ]);
    const clientes = clientesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }))
      .filter(cliente => cliente.estado === 'Ativo').map(cliente => ({ id: cliente.id, nome: String(cliente.nome || '') }));
    const nomes = new Map(clientes.map(cliente => [cliente.id, cliente.nome]));
    if (modo === 'monthly-pt') { const mes = String(req.query?.mes || dataLisboa().slice(0, 7)); if (!/^\d{4}-\d{2}$/.test(mes)) return responder(res, 400, { ok: false, erro: 'MES_INVALIDO' }); const itens = sessoesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(sessao => sessao.mesAno === mes && nomes.has(sessao.clientId)).map(sessao => ({ idCliente: sessao.clientId, clienteNome: nomes.get(sessao.clientId), numero: Number(sessao.numSessao || 0), estado: String(sessao.estado || 'Pendente'), data: String(sessao.dataConfirmada || '') })).sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, 'pt-PT') || a.numero - b.numero); return responder(res, 200, { ok: true, mes, pendentes: itens.filter(item => item.estado === 'Pendente'), concluidas: itens.filter(item => item.estado === 'Confirmada'), canceladas: itens.filter(item => item.estado === 'Cancelada') }); }
    const packs = new Map(consolidarPacksMensais(packsSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }))).filter(pack => pack.mesAno === mesReferencia).map(pack => [pack.clientId, pack]));
    const sessoes = sessoesSnap.docs.map(documento => documento.data())
      .filter(sessao => sessao.estado === 'Confirmada' && String(sessao.dataConfirmada || '').slice(0, 10) >= semanaInicio && String(sessao.dataConfirmada || '').slice(0, 10) <= semanaFim && nomes.has(sessao.clientId));
    const contagem = new Map();
    sessoes.forEach(sessao => contagem.set(sessao.clientId, (contagem.get(sessao.clientId) || 0) + 1));
    const eventosPt = sessoes.map(sessao => ({
      id: String(sessao.fonteLinha || ''), tipo: 'PT', titulo: nomes.get(sessao.clientId), clienteId: sessao.clientId,
      clienteNome: nomes.get(sessao.clientId), reconhecido: true, ignorado: false, motivoNaoReconhecido: '',
      dia: String(sessao.dataConfirmada || '').slice(0, 10), horaInicio: '—', horaFim: '', inicioMs: 0, diaSemana: ''
    }));
    const eventosAvaliacao = agendaPortalSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }))
      .filter(item => String(item.estado || 'Marcada').toLowerCase() !== 'cancelada' && String(item.dataHora || '').slice(0, 10) >= semanaInicio && String(item.dataHora || '').slice(0, 10) <= semanaFim)
      .map(item => ({ id: item.id, tipo: 'AVALIAÇÃO', titulo: textoTitulo(item.titulo, nomes.get(item.idCliente)), clienteId: item.idCliente,
        clienteNome: nomes.get(item.idCliente) || 'Cliente', reconhecido: nomes.has(item.idCliente), ignorado: false, motivoNaoReconhecido: nomes.has(item.idCliente) ? '' : 'Cliente não encontrado',
        dia: String(item.dataHora || '').slice(0, 10), horaInicio: String(item.dataHora || '').slice(11, 16) || '—', horaFim: '', inicioMs: Date.parse(item.dataHora) || 0, diaSemana: '', local: String(item.local || '') }));
    const avaliacoes = eventosAvaliacao.length;
    const eventos = [...eventosPt, ...eventosAvaliacao].sort((a, b) => a.dia.localeCompare(b.dia) || String(a.horaInicio).localeCompare(String(b.horaInicio)) || a.clienteNome.localeCompare(b.clienteNome, 'pt-PT'));
    const resumoClientes = clientes.map(cliente => {
      const pack = packs.get(cliente.id); const esperado = frequenciaEsperada(pack?.frequencia); const marcadas = contagem.get(cliente.id) || 0;
      return { id: cliente.id, nome: cliente.nome, frequencia: String(pack?.frequencia || ''), esperado, marcadas,
        emFalta: esperado ? Math.max(0, esperado - marcadas) : 0, semFrequencia: !esperado,
        pagamentoPendente: !!pack && String(pack.estadoPagamento || '').toLowerCase() !== 'pago' };
    }).sort((a, b) => b.emFalta - a.emFalta || a.nome.localeCompare(b.nome, 'pt-PT'));
    const comFrequencia = resumoClientes.filter(cliente => !cliente.semFrequencia);
    return responder(res, 200, { ok: true, semanaInicio, semanaFim, tituloSemana: tituloSemana(semanaInicio), mesReferencia,
      clientes: resumoClientes, eventos, porConfirmar: [], resumo: {
        esperadas: comFrequencia.reduce((soma, cliente) => soma + cliente.esperado, 0), marcadas: eventosPt.length,
        emFalta: comFrequencia.reduce((soma, cliente) => soma + cliente.emFalta, 0), avaliacoes, porConfirmar: 0,
        semFrequencia: resumoClientes.filter(cliente => cliente.semFrequencia).length
      } });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}

function textoTitulo(titulo, nomeCliente) {
  const base = String(titulo || 'Avaliação física').trim() || 'Avaliação física';
  return nomeCliente ? base + ' · ' + nomeCliente : base;
}
