import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function mesAtual() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date());
  const parte = tipo => partes.find(item => item.type === tipo).value;
  return parte('year') + '-' + parte('month');
}

function tituloMes() {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon', month: 'long', year: 'numeric'
  }).format(new Date());
}

function chaveRecibo(mes, clienteId, packId) {
  return encodeURIComponent(mes + '|' + clienteId + '|' + packId);
}

async function listar(db) {
  const mes = mesAtual();
  const [clientesSnap, packsSnap, emitidosSnap] = await Promise.all([
    db.collection('crmMigrationClients').get(),
    db.collection('crmMigrationPacks').get(),
    db.collection('crmDevelopmentReceipts').where('mesAno', '==', mes).get()
  ]);
  const nomes = new Map(clientesSnap.docs.map(documento => [documento.id, String(documento.data().nome || '')]));
  const emitidos = new Set(emitidosSnap.docs.map(documento => String(documento.data().chave || documento.id)));
  const lista = packsSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }))
    .filter(pack => pack.mesAno === mes && pack.estadoPagamento === 'Pago')
    .map(pack => {
      const chave = chaveRecibo(mes, pack.clientId, pack.id);
      return {
        idCliente: String(pack.clientId), nome: nomes.get(pack.clientId) || 'Cliente sem nome',
        frequencia: String(pack.frequencia || ''), preco: Number(pack.preco || 0),
        dataPagamento: '', chave, emitido: emitidos.has(chave)
      };
    })
    .filter(item => !item.emitido)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
  return { mesAtual: mes, mesAtualFormatado: tituloMes(), lista };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));

    if (req.method === 'GET') return responder(res, 200, { ok: true, ...(await listar(db)) });
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const clienteId = String(corpo.idCliente || '').trim();
    if (corpo.action !== 'mark-issued' || !clienteId || clienteId.length > 128) {
      return responder(res, 400, { ok: false, erro: 'DADOS_INVALIDOS' });
    }

    const mes = mesAtual();
    const packsSnap = await db.collection('crmMigrationPacks').get();
    const packDoc = packsSnap.docs.find(documento => {
      const pack = documento.data() || {};
      return String(pack.clientId) === clienteId && pack.mesAno === mes && pack.estadoPagamento === 'Pago';
    });
    if (!packDoc) return responder(res, 404, { ok: false, erro: 'RECIBO_NAO_ENCONTRADO' });
    const chave = chaveRecibo(mes, clienteId, packDoc.id);
    const agora = new Date();
    await db.runTransaction(async transacao => {
      const recibo = db.collection('crmDevelopmentReceipts').doc(chave);
      const existente = await transacao.get(recibo);
      if (!existente.exists) {
        transacao.create(recibo, { chave, mesAno: mes, clientId: clienteId, packId: packDoc.id, emittedAt: agora, emittedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.receipt.marked-issued', actorUid: identidade.uid, clientId: clienteId, receiptKey: chave, createdAt: agora });
      }
    });
    return responder(res, 200, { ok: true, ...(await listar(db)) });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
