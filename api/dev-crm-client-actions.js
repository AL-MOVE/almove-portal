import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

const MEDIDAS = ['pesoKg', 'alturaCm', 'massaGordaPercent', 'cinturaCm', 'abdomenCm', 'bracoDireitoCm', 'bracoEsquerdoCm', 'pernaDireitaCm', 'pernaEsquerdaCm'];

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

function hoje() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return partes.find(item => item.type === 'year').value + '-' + partes.find(item => item.type === 'month').value + '-' + partes.find(item => item.type === 'day').value;
}

function texto(valor, maximo) { return String(valor || '').trim().slice(0, maximo); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const dados = req.body && typeof req.body === 'object' ? req.body : {};
    const acao = texto(dados.action, 40); const clienteId = texto(dados.idCliente, 128);
    if (!clienteId) return responder(res, 400, { ok: false, erro: 'CLIENTE_INVALIDO' });
    const cliente = db.collection('crmMigrationClients').doc(clienteId); const clienteSnap = await cliente.get();
    if (!clienteSnap.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' });
    const agora = new Date(); const auditoria = { actorUid: identidade.uid, clientId: clienteId, createdAt: agora };

    if (acao === 'set-status') {
      const estado = texto(dados.novoEstado, 16); if (!['Ativo', 'Pausado', 'Cancelado'].includes(estado)) return responder(res, 400, { ok: false, erro: 'ESTADO_INVALIDO' });
      await db.runTransaction(async transacao => { transacao.update(cliente, { estado, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.client.status-changed', estado }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'mark-paid') {
      const mes = mesAtual(); const packs = await db.collection('crmMigrationPacks').where('clientId', '==', clienteId).get(); const pack = packs.docs.find(documento => documento.data().mesAno === mes);
      if (!pack) return responder(res, 404, { ok: false, erro: 'PACK_NAO_ENCONTRADO' });
      await db.runTransaction(async transacao => { transacao.update(pack.ref, { estadoPagamento: 'Pago', pagoEm: agora, updatedAt: agora }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: 'development.pack.marked-paid', packId: pack.id }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
    }
    if (acao === 'toggle-session') {
      const numero = Number(dados.numSessao); if (!Number.isInteger(numero) || numero < 1) return responder(res, 400, { ok: false, erro: 'SESSAO_INVALIDA' });
      const mes = mesAtual(); const sessoes = await db.collection('crmMigrationSessions').where('clientId', '==', clienteId).get(); const sessao = sessoes.docs.find(documento => { const item = documento.data(); return item.mesAno === mes && Number(item.numSessao) === numero; });
      if (!sessao) return responder(res, 404, { ok: false, erro: 'SESSAO_NAO_ENCONTRADA' });
      const data = texto(dados.dataConfirmada, 10); const confirmar = !!data; if (confirmar && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return responder(res, 400, { ok: false, erro: 'DATA_INVALIDA' });
      await db.runTransaction(async transacao => { transacao.update(sessao.ref, { estado: confirmar ? 'Confirmada' : 'Pendente', dataConfirmada: confirmar ? data : '', updatedAt: agora }); transacao.create(db.collection('auditLogs').doc(), { ...auditoria, action: confirmar ? 'development.session.confirmed' : 'development.session.unconfirmed', sessionId: sessao.id }); });
      return responder(res, 200, { ok: true, idCliente: clienteId });
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
    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
