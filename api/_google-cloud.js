import { createSign } from 'node:crypto';

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function serviceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_EM_FALTA');
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_INVALIDO'); }
  if (!value.client_email || !value.private_key || !value.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT_INCOMPLETO');
  return value;
}

/** Identificador público usado para partilhar recursos Google com a conta técnica. */
export function googleServiceAccountEmail() { return serviceAccount().client_email; }

export async function googleAccessToken(scopes = ['https://www.googleapis.com/auth/cloud-platform']) {
  const account = serviceAccount(); const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({ iss: account.client_email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key).toString('base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`GOOGLE_OAUTH_FALHOU_${response.status}`);
  return Object.freeze({ token: body.access_token, projectId: account.project_id });
}
