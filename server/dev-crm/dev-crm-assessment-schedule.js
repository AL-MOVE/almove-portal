import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function texto(valor, maximo = 500) { return String(valor || '').trim().slice(0, maximo); }
function dataHora(valor) {
  const resultado = texto(valor, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?Z?)?$/.test(resultado) || Number.isNaN(new Date(resultado).getTime())) return '';
  return resultado;
}
function linhaNova() { return Date.now(); }

async function listarPedidos(db) {
  const [pedidosSnap, clientesSnap] = await Promise.all([
    db.collection('crmMigrationAssessmentRequests').get(),
    db.collection('crmMigrationClients').get()
  ]);
  const clientes = new Map(clientesSnap.docs.map(documento => {
    const cliente = documento.data() || {};
    return [documento.id, { nome: texto(cliente.nome, 120) || 'Cliente sem nome', contacto: texto(cliente.contacto, 64) }];
  }));
  return pedidosSnap.docs.map(documento => {
    const pedido = documento.data() || {};
    const cliente = clientes.get(texto(pedido.idCliente, 128)) || { nome: 'Cliente sem nome', contacto: '' };
    return {
      linha: Number(pedido.fonteLinha || documento.id), idCliente: texto(pedido.idCliente, 128), nome: cliente.nome, contacto: cliente.contacto,
      periodo: texto(pedido.periodo, 120), diasDisponiveis: texto(pedido.diasDisponiveis, 300), horaPreferida: texto(pedido.horaPreferida, 40),
      horaAlternativa: texto(pedido.horaAlternativa, 40), objetivo: texto(pedido.objetivo, 500), nota: texto(pedido.nota, 1500),
      estado: texto(pedido.estado, 32) || 'Pendente', criadoEm: texto(pedido.criadoEm, 32), dataMarcada: texto(pedido.dataMarcada, 32), local: texto(pedido.local, 180)
    };
  }).sort((a, b) => (a.estado === 'Pendente' ? 0 : 1) - (b.estado === 'Pendente' ? 0 : 1) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    if (req.method === 'GET') return responder(res, 200, { ok: true, pedidos: await listarPedidos(db) });

    const entrada = req.body && typeof req.body === 'object' ? req.body : {};
    const acao = texto(entrada.action, 40); const quando = dataHora(entrada.dataMarcada); const local = texto(entrada.local, 180) || 'André Martins - Personal Trainer'; const agora = new Date();
    const agenda = db.collection('crmMigrationPortalAgenda');

    if (acao === 'schedule-manual') {
      const clienteId = texto(entrada.idCliente, 128); if (!clienteId || !quando) return responder(res, 400, { ok: false, erro: 'MARCACAO_INVALIDA' });
      const cliente = await db.collection('crmMigrationClients').doc(clienteId).get(); if (!cliente.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' });
      const referencia = agenda.doc(); await db.runTransaction(async transacao => {
        transacao.create(referencia, { fonteLinha: linhaNova(), idCliente: clienteId, dataHora: quando, titulo: 'Avaliação física', local, estado: 'Marcada', origem: 'firebase-development', createdAt: agora });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.assessment.scheduled-manually', actorUid: identidade.uid, clientId: clienteId, agendaId: referencia.id, createdAt: agora });
      });
      return responder(res, 201, { ok: true, sucesso: true, agenda: { idCliente: clienteId, dataMarcada: quando, local } });
    }

    const linha = Number(entrada.linha); if (!Number.isFinite(linha)) return responder(res, 400, { ok: false, erro: 'PEDIDO_INVALIDO' });
    const pedidos = await db.collection('crmMigrationAssessmentRequests').get(); const pedido = pedidos.docs.find(documento => Number(documento.data()?.fonteLinha || documento.id) === linha);
    if (!pedido) return responder(res, 404, { ok: false, erro: 'PEDIDO_NAO_ENCONTRADO' });
    if (texto(pedido.data()?.estado, 32).toLowerCase() !== 'pendente') return responder(res, 409, { ok: false, erro: 'PEDIDO_JA_TRATADO' });
    const clienteId = texto(pedido.data()?.idCliente, 128);

    if (acao === 'reject-request') {
      await db.runTransaction(async transacao => {
        const atual = await transacao.get(pedido.ref); if (texto(atual.data()?.estado, 32).toLowerCase() !== 'pendente') throw new Error('PEDIDO_JA_TRATADO');
        transacao.update(pedido.ref, { estado: 'Recusado', updatedAt: agora, updatedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.assessment.request-rejected', actorUid: identidade.uid, clientId: clienteId, requestId: pedido.id, createdAt: agora });
      });
      return responder(res, 200, { ok: true, sucesso: true, pedidos: await listarPedidos(db) });
    }
    if (acao !== 'schedule-request' || !quando) return responder(res, 400, { ok: false, erro: 'MARCACAO_INVALIDA' });
    const referencia = agenda.doc(); await db.runTransaction(async transacao => {
      const atual = await transacao.get(pedido.ref); if (texto(atual.data()?.estado, 32).toLowerCase() !== 'pendente') throw new Error('PEDIDO_JA_TRATADO');
      transacao.update(pedido.ref, { estado: 'Confirmado', dataMarcada: quando, local, confirmadoEm: agora.toISOString(), updatedAt: agora, updatedBy: identidade.uid });
      transacao.create(referencia, { fonteLinha: linhaNova(), idCliente: clienteId, dataHora: quando, titulo: 'Avaliação física', local, estado: 'Marcada', origem: 'firebase-development', createdAt: agora });
      transacao.create(db.collection('auditLogs').doc(), { action: 'development.assessment.request-scheduled', actorUid: identidade.uid, clientId: clienteId, requestId: pedido.id, agendaId: referencia.id, createdAt: agora });
    });
    return responder(res, 200, { ok: true, sucesso: true, pedidos: await listarPedidos(db) });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
