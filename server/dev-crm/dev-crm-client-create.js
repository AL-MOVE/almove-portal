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

function texto(valor, maximo) { return String(valor || '').trim().slice(0, maximo); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const dados = req.body && typeof req.body === 'object' ? req.body : {};
    const nome = texto(dados.nome, 120);
    if (!nome) return responder(res, 400, { ok: false, erro: 'CLIENTE_INVALIDO_NOME' });
    const estado = ['Ativo', 'Pausado', 'Cancelado'].includes(String(dados.estado || '')) ? String(dados.estado) : 'Ativo';
    const referencia = db.collection('crmMigrationClients').doc(); const agora = new Date();
    await db.runTransaction(async transacao => {
      transacao.create(referencia, {
        fonteLinha: null, nome, estado, contacto: texto(dados.contacto, 32), nif: texto(dados.nif, 20),
        servicoAtual: texto(dados.servicoAtual, 80), notas: '', precoPersonalizado: null, suspensoMes: '', cancelarMes: '',
        contratoFileId: '', morada: '', email: '', assinaturaAceiteEm: '', diaPagamento: null, metodoPagamento: '',
        createdAt: agora, createdBy: identidade.uid, origem: 'firebase-development'
      });
      transacao.create(db.collection('auditLogs').doc(), { action: 'development.client.created', actorUid: identidade.uid, clientId: referencia.id, createdAt: agora });
    });
    return responder(res, 201, { ok: true, idCriado: referencia.id });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
