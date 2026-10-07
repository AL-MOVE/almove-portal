import { createHash, randomBytes } from 'node:crypto';
import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PORTAL_URL = 'https://portal.almove.pt/';
const INTERVALO_CONVITE_MS = 60 * 1000;

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function texto(valor, maximo = 254) { return String(valor || '').trim().slice(0, maximo); }
function emailNormalizado(valor) { return texto(valor).toLowerCase(); }
function ativo(dados) {
  const estado = texto(dados?.estado || dados?.status, 40).toLowerCase();
  return dados?.ativo !== false && !['inativo', 'inactive', 'arquivado', 'archived'].includes(estado);
}
function instante(valor) {
  if (valor && typeof valor.toDate === 'function') return valor.toDate().getTime();
  const data = new Date(valor || 0).getTime();
  return Number.isFinite(data) ? data : 0;
}
function codigoEstado(codigo) {
  if (/^FIREBASE_/.test(codigo)) return 401;
  if (/^ACESSO_/.test(codigo)) return 403;
  if (codigo === 'CLIENTE_NAO_ENCONTRADO') return 404;
  if (codigo === 'AGUARDA_UM_MINUTO_PARA_REENVIAR' || codigo === 'EMAIL_ASSOCIADO_A_VARIOS_CLIENTES') return 409;
  if (/^CLIENTE_/.test(codigo)) return 400;
  return 500;
}

async function contexto(req) {
  const identidade = await obterIdentidadeFirebase(req);
  const { db } = obterFirestoreAlmove();
  exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
  return { identidade, db };
}

async function obterClienteUnico(db, clientId) {
  const [clienteSnap, clientesSnap] = await Promise.all([
    db.collection('crmMigrationClients').doc(clientId).get(),
    db.collection('crmMigrationClients').get()
  ]);
  if (!clienteSnap.exists) throw new Error('CLIENTE_NAO_ENCONTRADO');
  const cliente = clienteSnap.data() || {};
  const email = emailNormalizado(cliente.email);
  if (!EMAIL.test(email)) throw new Error('CLIENTE_SEM_EMAIL_VALIDO');
  const associados = clientesSnap.docs.filter(documento => ativo(documento.data()) && emailNormalizado(documento.data()?.email) === email);
  if (associados.length !== 1 || associados[0].id !== clientId) throw new Error('EMAIL_ASSOCIADO_A_VARIOS_CLIENTES');
  return { cliente, email };
}

export default async function handler(req, res) {
  if (!crmFirebasePermitido()) return responder(res, 404, { ok: false, erro: 'INDISPONIVEL' });
  if (!['GET', 'POST'].includes(req.method)) return responder(res, 405, { ok: false, erro: 'METODO_NAO_PERMITIDO' });
  try {
    const { identidade, db } = await contexto(req);
    const entrada = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    const action = texto(entrada.action || req.query?.action, 40) || 'history';
    const clientId = texto(entrada.idCliente || req.query?.clientId, 128);
    if (!clientId) return responder(res, 400, { ok: false, erro: 'CLIENTE_INVALIDO' });

    if (action === 'portal-url') return responder(res, 200, { ok: true, link: PORTAL_URL });

    if (action === 'history') {
      const snapshot = await db.collection('crmPortalAccessLogs').where('clientId', '==', clientId).get();
      const historico = snapshot.docs.map(documento => documento.data() || {}).sort((a, b) => instante(b.createdAt) - instante(a.createdAt)).slice(0, 30).map(item => ({
        dataHora: item.createdAt?.toDate?.().toISOString?.() || texto(item.createdAt, 40),
        evento: texto(item.event, 80),
        detalhe: texto(item.detail, 300)
      }));
      return responder(res, 200, { ok: true, historico });
    }

    const { cliente, email } = await obterClienteUnico(db, clientId);
    const { auth } = obterAdminFirebase();

    if (action === 'prepare-invite') {
      const limiteRef = db.collection('crmPortalInviteRateLimits').doc(createHash('sha256').update(email).digest('hex'));
      const limite = await limiteRef.get();
      if (limite.exists && Date.now() - instante(limite.data()?.lastRequestedAt) < INTERVALO_CONVITE_MS) throw new Error('AGUARDA_UM_MINUTO_PARA_REENVIAR');
      let utilizador;
      try { utilizador = await auth.getUserByEmail(email); }
      catch (erro) { if (erro.code !== 'auth/user-not-found') throw erro; }
      if (utilizador?.disabled) throw new Error('CONTA_PORTAL_DESATIVADA');
      if (!utilizador) {
        utilizador = await auth.createUser({ email, emailVerified: true, password: randomBytes(32).toString('base64url'), displayName: texto(cliente.nome, 120) || undefined });
      } else if (!utilizador.emailVerified) {
        utilizador = await auth.updateUser(utilizador.uid, { emailVerified: true });
      }
      const lote = db.batch();
      lote.set(limiteRef, { clientId, email, lastRequestedAt: new Date(), requestedBy: identidade.uid }, { merge: true });
      lote.create(db.collection('crmPortalAccessLogs').doc(), { clientId, email, event: 'CONVITE_FIREBASE_PREPARADO', detail: 'Convite preparado para envio pelo Firebase Authentication.', createdAt: new Date(), actorUid: identidade.uid });
      lote.create(db.collection('auditLogs').doc(), { action: 'development.portal-invite.prepared', actorUid: identidade.uid, clientId, targetUid: utilizador.uid, createdAt: new Date() });
      await lote.commit();
      return responder(res, 200, { ok: true, email, portalUrl: PORTAL_URL });
    }

    if (action === 'confirm-invite') {
      await db.collection('crmPortalAccessLogs').add({ clientId, email, event: 'CONVITE_FIREBASE_ENVIADO', detail: 'Email para definir a palavra-passe enviado pelo Firebase Authentication.', createdAt: new Date(), actorUid: identidade.uid });
      return responder(res, 200, { ok: true, email });
    }

    if (action === 'revoke-sessions') {
      const utilizador = await auth.getUserByEmail(email);
      await auth.revokeRefreshTokens(utilizador.uid);
      await db.collection('crmPortalAccessLogs').add({ clientId, email, event: 'SESSOES_REVOGADAS', detail: 'As sessões anteriores do Portal foram terminadas.', createdAt: new Date(), actorUid: identidade.uid });
      return responder(res, 200, { ok: true, link: PORTAL_URL, criadoEm: new Date().toISOString(), acesso: 'Envia um novo convite para o cliente definir a palavra-passe.' });
    }

    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, codigoEstado(codigo), { ok: false, erro: codigo });
  }
}
