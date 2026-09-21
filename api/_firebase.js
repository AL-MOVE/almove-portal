import { createHmac } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const DURACAO_ASSERTACAO_SEGUNDOS = 5 * 60;
const DURACAO_SESSAO_CRM_SEGUNDOS = 55 * 60;
const NOME_COOKIE_SESSAO_CRM = 'almove_crm_dev_token';

function erroFirebase(codigo) {
  const erro = new Error(codigo);
  erro.code = codigo;
  return erro;
}

function base64UrlJson(valor) {
  return Buffer.from(JSON.stringify(valor)).toString('base64url');
}

export function obterAdminFirebase() {
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
  return { projeto, app, auth: getAuth(app) };
}

/** Verifica a identidade Firebase sem a converter numa sessão Apps Script. */
export async function obterIdentidadeFirebase(req) {
  const authorization = String(req.headers.authorization || '');
  const correspondencia = authorization.match(/^Bearer\s+(.+)$/i);
  const credencial = correspondencia ? correspondencia[1] : obterCookie(req, NOME_COOKIE_SESSAO_CRM);
  if (!credencial) throw erroFirebase('FIREBASE_TOKEN_INVALIDO');

  const { projeto, auth } = obterAdminFirebase();
  let token;
  try {
    token = await auth.verifyIdToken(credencial, true);
  } catch {
    throw erroFirebase('FIREBASE_SESSAO_INVALIDA');
  }

  const email = String(token.email || '').trim().toLowerCase();
  if (
    token.aud !== projeto ||
    !token.email_verified ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw erroFirebase('FIREBASE_CONTA_SEM_ACESSO');
  }
  return Object.freeze({ uid: String(token.uid), email, projeto });
}

function obterCookie(req, nome) {
  const cabecalho = String(req.headers.cookie || '');
  const par = cabecalho.split(';').map(valor => valor.trim()).find(valor => valor.startsWith(nome + '='));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : '';
}

/** Sessão HTTP-only para o CRM Development, criada apenas após validar um ID token Firebase. */
export async function criarSessaoCrmDevelopment(req) {
  const authorization = String(req.headers.authorization || '');
  const correspondencia = authorization.match(/^Bearer\s+(.+)$/i);
  if (!correspondencia) throw erroFirebase('FIREBASE_TOKEN_INVALIDO');
  await obterIdentidadeFirebase(req);
  return correspondencia[1];
}

export function cookieSessaoCrmDevelopment(valor, maxAge = DURACAO_SESSAO_CRM_SEGUNDOS) {
  return NOME_COOKIE_SESSAO_CRM + '=' + encodeURIComponent(valor || '') + '; Path=/; Max-Age=' + Math.max(0, Number(maxAge) || 0) + '; HttpOnly; Secure; SameSite=Lax';
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
  if (!String(req.headers.authorization || '')) return '';

  const segredo = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
  if (segredo.length < 32) throw erroFirebase('FIREBASE_NAO_CONFIGURADO');
  const identidade = await obterIdentidadeFirebase(req);
  const agora = Math.floor(Date.now() / 1000);
  return assinarAssertacao({
    v: 1,
    uid: identidade.uid,
    email: identidade.email,
    iat: agora,
    exp: agora + DURACAO_ASSERTACAO_SEGUNDOS,
    nonce: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
  }, segredo);
}

/** Assertação curta para operações internas no ambiente Development. */
export async function obterAssertacaoFirebaseInterna(req, scope) {
  const segredo = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
  if (segredo.length < 32) throw erroFirebase('FIREBASE_NAO_CONFIGURADO');
  const identidade = await obterIdentidadeFirebase(req);
  const agora = Math.floor(Date.now() / 1000);
  return Object.freeze({
    identidade,
    assertacao: assinarAssertacao({
      v: 1, uid: identidade.uid, email: identidade.email, scope: String(scope || ''),
      iat: agora, exp: agora + DURACAO_ASSERTACAO_SEGUNDOS,
      nonce: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
    }, segredo)
  });
}
