import { createHmac } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const DURACAO_ASSERTACAO_SEGUNDOS = 5 * 60;

function erroFirebase(codigo) {
  const erro = new Error(codigo);
  erro.code = codigo;
  return erro;
}

function base64UrlJson(valor) {
  return Buffer.from(JSON.stringify(valor)).toString('base64url');
}

function obterAdminFirebase() {
  const projeto = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const bruto = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!projeto || !bruto) throw erroFirebase('FIREBASE_NAO_CONFIGURADO');

  let conta;
  try {
    conta = JSON.parse(bruto);
  } catch {
    throw erroFirebase('FIREBASE_CREDENCIAL_INVALIDA');
  }
  if (!conta.project_id || conta.project_id !== projeto) throw erroFirebase('FIREBASE_CREDENCIAL_INVALIDA');

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(conta), projectId: projeto });
  return { projeto, auth: getAuth(app) };
}

function assinarAssertacao(assertacao, segredo) {
  const corpo = base64UrlJson(assertacao);
  const assinatura = createHmac('sha256', segredo).update(corpo).digest('base64url');
  return 'fb1.' + corpo + '.' + assinatura;
}

/**
 * Só é chamado quando o pedido traz Authorization: Bearer <Firebase ID token>.
 * A verificação inclui revogação, logo terminar sessões no Firebase invalida
 * o acesso ao portal mesmo antes de o token expirar.
 */
export async function obterAssertacaoFirebasePortal(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization) return '';
  const correspondencia = authorization.match(/^Bearer\s+(.+)$/i);
  if (!correspondencia) throw erroFirebase('FIREBASE_TOKEN_INVALIDO');

  const segredo = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
  if (segredo.length < 32) throw erroFirebase('FIREBASE_NAO_CONFIGURADO');

  const { projeto, auth } = obterAdminFirebase();
  let token;
  try {
    token = await auth.verifyIdToken(correspondencia[1], true);
  } catch {
    throw erroFirebase('FIREBASE_SESSAO_INVALIDA');
  }

  const agora = Math.floor(Date.now() / 1000);
  const idCliente = String(token.clientId || '');
  const email = String(token.email || '').trim().toLowerCase();
  if (
    token.aud !== projeto ||
    token.portalRole !== 'client' ||
    !token.email_verified ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(idCliente) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw erroFirebase('FIREBASE_CONTA_SEM_ACESSO');
  }

  return assinarAssertacao({
    v: 1,
    uid: String(token.uid),
    idCliente,
    email,
    iat: agora,
    exp: agora + DURACAO_ASSERTACAO_SEGUNDOS,
    nonce: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
  }, segredo);
}
