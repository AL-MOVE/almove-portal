import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { consolidarPacksMensais } from './payment-status.js';
import { frequencyFromServiceName, loadServiceCatalog, packShapeForService, priceForService, serviceByCode } from './service-catalog.js';
import { carregarLocais, validarLocalCliente } from './locations.js';
import { normalizeQuickPaymentMethod, normalizeQuickPaymentStatus } from './quick-payment.js';

const MEDIDAS = ['pesoKg', 'alturaCm', 'massaGordaPercent', 'cinturaCm', 'abdomenCm', 'bracoDireitoCm', 'bracoEsquerdoCm', 'pernaDireitaCm', 'pernaEsquerdaCm'];
const ESTADOS_PAGAMENTO = new Set(['Pago', 'Pendente']);

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function mesAtual() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return partes.find(item => item.type === 'year').value + '-' + partes.find(item => item.type === 'month').value;
}
function proximoMes() { const [ano, mes] = mesAtual().split('-').map(Number); const data = new Date(Date.UTC(ano, mes, 1)); return data.getUTCFullYear() + '-' + String(data.getUTCMonth() + 1).padStart(2, '0'); }

function hoje() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return partes.find(item => item.type === 'year').value + '-' + partes.find(item => item.type === 'month').value + '-' + partes.find(item => item.type === 'day').value;
}

function texto(valor, maximo) { return String(valor || '').trim().slice(0, maximo); }
function documentoPackDoMes(documentos, mes) {
  const pack = consolidarPacksMensais(documentos.map(documento => ({ id: documento.id, ...documento.data() }))).find(item => item.mesAno === mes);
  return pack ? documentos.find(documento => documento.id === pack.id) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const dados = req.body && typeof req.body === 'object' ? req.body : {};
    const acao = texto(dados.action, 40); const clienteId = texto(dados.idCliente, 128);
    if (!clienteId) return responder(res, 400, { ok: false, erro: 'CLIENTE_INVALIDO' });
    const cliente = db.collection('crmMigrationClients').doc(clienteId); const clienteSnap = await cliente.get();
    if (!clienteSnap.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' });
    const agora = new Date(); const auditoria = { actorUid: identidade.uid, clientId: clienteId, createdAt: agora };

    if (acao === 'create-pack') {
      const frequencia = texto(dados.frequencia, 16); const estadoPagamento = texto(dados.estadoPagamento, 16);
      if (!ESTADOS_PAGAMENTO.has(estadoPagamento)) return responder(res, 400, { ok: false, erro: 'ESTADO_PAGAMENTO_INVALIDO' });
      const mes = mesAtual();
      const [packsSnap, historicoSnap, catalogo] = await Promise.all([
        db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(),
        db.collection('crmMigrationPackHistory').where('clientId', '==', clienteId).get(),
        loadServiceCatalog(db)
      ]);
      const packs = packsSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }));
      if (consolidarPacksMensais(packs).some(pack => pack.mesAno === mes)) return responder(res, 409, { ok: false, erro: 'PACK_JA_EXISTE' });
      const anteriores = packs.concat(historicoSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })))
        .filter(pack => String(pack.mesAno || '') < mes)
        .sort((a, b) => String(b.mesAno || '').localeCompare(String(a.mesAno || '')));
      const calculo = priceForService({ catalogo: catalogo.servicos, codigo: frequencia, cliente: clienteSnap.data(), packsAnteriores: anteriores });
      const formato = packShapeForService(calculo.servico); const preco = calculo.preco; const total = formato.sessoesTotal; const duracaoMinutos = formato.duracaoMinutos;
      const packId = encodeURIComponent(clienteId) + '-' + mes + '-development'; const pack = db.collection('crmMigrationPacks').doc(packId); const lote = db.batch();
      lote.create(pack, { clientId: clienteId, mesAno: mes, ...formato, sessoesConfirmadas: 0, estadoPagamento, preco, precoOrigem: calculo.origem, origem: 'firebase-development', createdAt: agora, createdBy: identidade.uid, ...(estadoPagamento === 'Pago' ? { pagoEm: agora } : {}) });
      const clienteAtual = clienteSnap.data() || {}; const alterouServico = frequencyFromServiceName(clienteAtual.servicoAtual) !== frequencia; const personalizadoCompativel = clienteAtual.precoPersonalizadoServico === frequencia;
      lote.update(cliente, { servicoAtual: calculo.servico.nome, ...(alterouServico && !personalizadoCompativel ? { precoPersonalizado: null, precoPersonalizadoServico: '' } : {}), updatedAt: agora, updatedBy: identidade.uid });
      for (let numero = 1; numero <= total; numero += 1) lote.create(db.collection('crmMigrationSessions').doc(packId + '-s' + numero), { clientId: clienteId, mesAno: mes, numSessao: numero, estado: 'Pendente', dataConfirmada: '', origem: 'firebase-development', createdAt: agora });
      lote.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.pack.created', packId, frequency: frequencia, total, paymentStatus: estadoPagamento, price: preco, priceSource: calculo.origem });
      await lote.commit();
      return responder(res, 201, { ok: true, idCliente: clienteId, packId });
    }

    if (acao === 'set-status') {
      const estado = texto(dados.novoEstado, 16); if (!['Ativo', 'Pausado', 'Cancelado'].includes(estado)) return responder(res, 400, { ok: false, erro: 'ESTADO_INVALIDO' });
      await db.runTransaction(async transacao => { transacao.update(cliente, { estado, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.status-changed', estado }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'mark-paid') {
      const mes = mesAtual(); const packs = await db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(); const pack = documentoPackDoMes(packs.docs, mes);
      if (!pack) return responder(res, 404, { ok: false, erro: 'PACK_NAO_ENCONTRADO' });
      await db.runTransaction(async transacao => { transacao.update(pack.ref, { estadoPagamento: 'Pago', pagoEm: agora, updatedAt: agora }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.pack.marked-paid', packId: pack.id }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'set-payment-status') {
      const estadoPagamento = normalizeQuickPaymentStatus(dados.estadoPagamento);
      const mes = mesAtual(); const packs = await db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(); const pack = documentoPackDoMes(packs.docs, mes);
      if (!pack) return responder(res, 404, { ok: false, erro: 'PACK_NAO_ENCONTRADO' });
      await db.runTransaction(async transacao => {
        transacao.update(pack.ref, { estadoPagamento, pagoEm: estadoPagamento === 'Pago' ? agora : null, updatedAt: agora, updatedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.pack.payment-status-changed', packId: pack.id, paymentStatus: estadoPagamento });
      });
      return responder(res, 200, { ok: true, idCliente: clienteId, estadoPagamento });
    }
    if (acao === 'set-payment-method') {
      const metodoPagamento = normalizeQuickPaymentMethod(dados.metodoPagamento);
      const mes = mesAtual(); const packs = await db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(); const pack = documentoPackDoMes(packs.docs, mes);
      await db.runTransaction(async transacao => {
        transacao.update(cliente, { metodoPagamento, updatedAt: agora, updatedBy: identidade.uid });
        if (pack) transacao.update(pack.ref, { metodoPagamento, updatedAt: agora, updatedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.payment-method-changed', ...(pack ? { packId: pack.id } : {}), paymentMethod: metodoPagamento });
      });
      return responder(res, 200, { ok: true, idCliente: clienteId, metodoPagamento });
    }
    if (acao === 'toggle-session') {
      const numero = Number(dados.numSessao); if (!Number.isInteger(numero) || numero < 1) return responder(res, 400, { ok: false, erro: 'SESSAO_INVALIDA' });
      const mes = mesAtual(); const sessoes = await db.collection('crmMigrationSessions').where('clientId', '==', clienteId).get(); const sessao = sessoes.docs.find(documento => { const item = documento.data(); return item.mesAno === mes && Number(item.numSessao) === numero; });
      if (!sessao) return responder(res, 404, { ok: false, erro: 'SESSAO_NAO_ENCONTRADA' });
      const data = texto(dados.dataConfirmada, 10); const cancelar = texto(dados.estado, 16) === 'Cancelada'; const confirmar = !!data && !cancelar; if ((confirmar || cancelar) && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return responder(res, 400, { ok: false, erro: 'DATA_INVALIDA' });
      await db.runTransaction(async transacao => { transacao.update(sessao.ref, { estado: cancelar ? 'Cancelada' : (confirmar ? 'Confirmada' : 'Pendente'), dataConfirmada: confirmar || cancelar ? data : '', updatedAt: agora }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: cancelar ? 'development.session.cancelled' : (confirmar ? 'development.session.confirmed' : 'development.session.unconfirmed'), sessionId: sessao.id }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'set-all-sessions-state') {
      const mes = texto(dados.mesAno, 7); const estado = texto(dados.estado, 16);
      if (mes !== mesAtual() || !['Confirmada', 'Pendente'].includes(estado)) return responder(res, 400, { ok: false, erro: 'SESSOES_EM_LOTE_INVALIDAS' });
      const sessoes = await db.collection('crmMigrationSessions').where('clientId', '==', clienteId).get();
      const sessoesDoMes = sessoes.docs.filter(documento => documento.data().mesAno === mes);
      if (!sessoesDoMes.length) return responder(res, 404, { ok: false, erro: 'SESSOES_NAO_ENCONTRADAS' });
      const lote = db.batch(); const dataConfirmada = estado === 'Confirmada' ? hoje() : '';
      sessoesDoMes.forEach(documento => lote.update(documento.ref, { estado, dataConfirmada, updatedAt: agora }));
      lote.create(db.collection('auditLogs').doc(), { ...auditoria, action: estado === 'Confirmada' ? 'development.sessions.confirmed-all' : 'development.sessions.unconfirmed-all', mesAno: mes, total: sessoesDoMes.length });
      await lote.commit();
      return responder(res, 200, { ok: true, idCliente: clienteId, total: sessoesDoMes.length });
    }
    if (acao === 'add-note') {
      const nota = texto(dados.nota, 1500); const tipo = ['Nota', 'Contacto', 'Saúde', 'Decisão'].includes(texto(dados.tipo, 16)) ? texto(dados.tipo, 16) : 'Nota'; if (!nota) return responder(res, 400, { ok: false, erro: 'NOTA_INVALIDA' });
      const referencia = db.collection('crmMigrationNotes').doc(); await db.runTransaction(async transacao => { transacao.create(referencia, { idCliente: clienteId, dataHora: agora.toISOString(), tipo, nota, origem: 'firebase-development' }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.note-created', noteId: referencia.id }); });
      return responder(res, 201, { ok: true, idCliente: clienteId });
    }
    if (acao === 'add-assessment') {
      const medidas = {}; for (const campo of MEDIDAS) { const bruto = dados[campo]; if (bruto === '' || bruto === undefined || bruto === null) { medidas[campo] = null; continue; } const valor = Number(bruto); if (!Number.isFinite(valor) || valor < 0 || valor > 10000) return responder(res, 400, { ok: false, erro: 'AVALIACAO_INVALIDA' }); medidas[campo] = valor; }
      const referencia = db.collection('crmMigrationPhysicalAssessments').doc(); await db.runTransaction(async transacao => { transacao.create(referencia, { clientId: clienteId, atualizadoEm: hoje(), ...medidas, origem: 'firebase-development' }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.assessment.created', assessmentId: referencia.id }); });
      return responder(res, 201, { ok: true, idCliente: clienteId });
    }
    if (acao === 'edit-client') {
      const email = texto(dados.email, 254).toLowerCase(); const diaPagamento = dados.diaPagamento === '' || dados.diaPagamento == null ? null : Number(dados.diaPagamento);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return responder(res, 400, { ok: false, erro: 'EMAIL_INVALIDO' });
      if (diaPagamento !== null && (!Number.isInteger(diaPagamento) || diaPagamento < 1 || diaPagamento > 31)) return responder(res, 400, { ok: false, erro: 'DIA_PAGAMENTO_INVALIDO' });
      const localId = validarLocalCliente(await carregarLocais(db), dados.localId, { permitirVazio: true, permitirInativo: dados.localId === clienteSnap.data()?.localId });
      await db.runTransaction(async transacao => { transacao.update(cliente, { contacto: texto(dados.contacto, 64), servicoAtual: texto(dados.servicoAtual, 120), nif: texto(dados.nif, 32), morada: texto(dados.morada, 500), email, diaPagamento, metodoPagamento: texto(dados.metodoPagamento, 80), localId, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.edited', locationId: localId }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'set-price') {
      const preco = dados.preco === '' || dados.preco == null ? null : Number(dados.preco); if (preco !== null && (!Number.isFinite(preco) || preco < 0 || preco > 100000)) return responder(res, 400, { ok: false, erro: 'PRECO_INVALIDO' });
      const [packs, historico, catalogo] = await Promise.all([db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(), db.collection('crmMigrationPackHistory').where('clientId', '==', clienteId).get(), loadServiceCatalog(db)]); const pack = documentoPackDoMes(packs.docs, mesAtual()); const codigo = texto(pack?.data()?.frequencia || frequencyFromServiceName(clienteSnap.data()?.servicoAtual), 32); if (!codigo) return responder(res, 409, { ok: false, erro: 'SERVICO_CLIENTE_NAO_DEFINIDO' });
      const servico = serviceByCode(catalogo.servicos, codigo, { permitirInativo: !!pack }); const clienteParaCalculo = { ...clienteSnap.data(), precoPersonalizado: preco, precoPersonalizadoServico: preco === null ? '' : codigo }; const anteriores = packs.docs.concat(historico.docs).map(documento => ({ id: documento.id, ...documento.data() })).filter(item => item.id !== pack?.id); const calculo = priceForService({ catalogo: catalogo.servicos, codigo, cliente: clienteParaCalculo, packsAnteriores: anteriores, permitirServicoInativo: !!pack });
      if (pack && pack.data().estadoPagamento === 'Pago' && Number(pack.data().preco) !== calculo.preco && dados.confirmarReprecificacao !== true) return responder(res, 409, { ok: false, erro: 'PACK_PAGO_REQUER_CONFIRMACAO' });
      const lote = db.batch(); lote.update(cliente, { precoPersonalizado: preco, precoPersonalizadoServico: preco === null ? '' : codigo, updatedAt: agora, updatedBy: identidade.uid }); if (pack) lote.update(pack.ref, { preco: calculo.preco, precoOrigem: calculo.origem, servicoId: servico.id, servicoNome: servico.nome, updatedAt: agora }); lote.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.price-changed', customPrice: preco, appliedPrice: calculo.preco, frequency: codigo, priceSource: calculo.origem }); await lote.commit();
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'edit-pack' || acao === 'generate-sessions') {
      const [packs, historico, sessoes, catalogo] = await Promise.all([db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(), db.collection('crmMigrationPackHistory').where('clientId', '==', clienteId).get(), db.collection('crmMigrationSessions').where('clientId', '==', clienteId).get(), loadServiceCatalog(db)]); const pack = documentoPackDoMes(packs.docs, mesAtual()); if (!pack) return responder(res, 404, { ok: false, erro: 'PACK_NAO_ENCONTRADO' }); const atuais = sessoes.docs.filter(documento => documento.data().mesAno === mesAtual()); const lote = db.batch(); let total = Number(pack.data().sessoesTotal || 0); let frequencia = String(pack.data().frequencia || ''); let precoAudit = Number(pack.data().preco || 0); let precoOrigemAudit = String(pack.data().precoOrigem || 'anterior');
      if (acao === 'edit-pack') { frequencia = texto(dados.frequencia, 32); const mudou = frequencia !== String(pack.data().frequencia || ''); const servico = serviceByCode(catalogo.servicos, frequencia, { permitirInativo: !mudou }); const clienteAtual = clienteSnap.data() || {}; const personalizadoCompativel = clienteAtual.precoPersonalizadoServico === frequencia; const clienteParaCalculo = mudou && !personalizadoCompativel ? { ...clienteAtual, precoPersonalizado: null, precoPersonalizadoServico: '' } : clienteAtual; const anteriores = packs.docs.concat(historico.docs).map(documento => ({ id: documento.id, ...documento.data() })).filter(item => item.id !== pack.id); const calculo = priceForService({ catalogo: catalogo.servicos, codigo: frequencia, cliente: clienteParaCalculo, packsAnteriores: anteriores, permitirServicoInativo: !mudou }); if (pack.data().estadoPagamento === 'Pago' && Number(pack.data().preco) !== calculo.preco && dados.confirmarReprecificacao !== true) return responder(res, 409, { ok: false, erro: 'PACK_PAGO_REQUER_CONFIRMACAO' }); const formato = packShapeForService(servico); const desejado = formato.sessoesTotal; const confirmadas = atuais.filter(documento => documento.data().estado === 'Confirmada').length; total = Math.max(desejado, confirmadas); precoAudit = calculo.preco; precoOrigemAudit = calculo.origem; lote.update(pack.ref, { ...formato, sessoesTotal: total, preco: calculo.preco, precoOrigem: calculo.origem, updatedAt: agora }); lote.update(cliente, { servicoAtual: servico.nome, ...(mudou && !personalizadoCompativel ? { precoPersonalizado: null, precoPersonalizadoServico: '' } : {}), updatedAt: agora, updatedBy: identidade.uid }); const pendentesAEliminar = atuais.filter(documento => documento.data().estado !== 'Confirmada' && Number(documento.data().numSessao) > total); pendentesAEliminar.forEach(documento => lote.delete(documento.ref)); }
      const numeros = new Set(atuais.filter(documento => acao !== 'edit-pack' || !(documento.data().estado !== 'Confirmada' && Number(documento.data().numSessao) > total)).map(documento => Number(documento.data().numSessao))); for (let numero = 1; numero <= total; numero += 1) { if (numeros.has(numero)) continue; lote.create(db.collection('crmMigrationSessions').doc(encodeURIComponent(clienteId) + '-' + mesAtual() + '-generated-' + numero), { clientId: clienteId, mesAno: mesAtual(), numSessao: numero, estado: 'Pendente', dataConfirmada: '', origem: 'firebase-development', createdAt: agora }); }
      lote.create(db.collection('auditLogs').doc(), { ...auditoria, action: acao === 'edit-pack' ? 'development.pack.edited' : 'development.sessions.generated', frequency: frequencia, total, ...(acao === 'edit-pack' ? { price: precoAudit, priceSource: precoOrigemAudit } : {}) }); await lote.commit(); return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'set-special-mode') {
      const modo = texto(dados.modo, 16); const dataInicio = texto(dados.dataInicio, 10); const dataFim = texto(dados.dataFim, 10); if (!['Férias', 'Deload'].includes(modo) || !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim) || dataFim < dataInicio) return responder(res, 400, { ok: false, erro: 'MODO_INVALIDO' }); await db.runTransaction(async transacao => { transacao.update(cliente, { modoEspecial: { modo, dataInicio, dataFim, ativo: true }, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.special-mode-set', modo, dataInicio, dataFim }); }); return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'remove-special-mode') {
      await db.runTransaction(async transacao => { transacao.update(cliente, { modoEspecial: null, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.special-mode-removed' }); }); return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (['schedule-suspension', 'clear-suspension', 'schedule-cancellation', 'clear-cancellation'].includes(acao)) {
      const campo = acao.includes('suspension') ? 'suspensoMes' : 'cancelarMes'; const valor = acao.startsWith('schedule-') ? proximoMes() : ''; await db.runTransaction(async transacao => { transacao.update(cliente, { [campo]: valor, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.' + acao, month: valor }); }); return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA'); const pedidoInvalido = /^(SERVICO_|CODIGO_|PRECO_|DURACAO_|SESSOES_|CLIENTE_LOCAL_|ESTADO_PAGAMENTO_|METODO_PAGAMENTO_)/.test(codigo); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : (pedidoInvalido ? 400 : 500), { ok: false, erro: codigo });
  }
}
