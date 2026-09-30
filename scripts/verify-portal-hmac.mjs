import { createHmac } from 'node:crypto';

const APPS_SCRIPT_URL = process.env.PORTAL_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyiOl7KkXMYSFv9lKKVb2sMspvwER2P5IMlpNQcr9csLyEDnzJqvVqisE-XVuAHgeUV/exec';
const secret = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
const testEmail = String(process.env.PORTAL_HMAC_TEST_EMAIL || '').trim().toLowerCase();
if (secret.length < 32) throw new Error('PORTAL_APPS_SCRIPT_HMAC_SECRET_EM_FALTA');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) throw new Error('PORTAL_HMAC_TEST_EMAIL_EM_FALTA');

function assertion(email) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ v: 1, uid: 'phase6-readonly-probe', email, iat: now, exp: now + 180, nonce: crypto.randomUUID() })).toString('base64url');
  return `fb1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

async function probe(email) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST', redirect: 'follow', signal: controller.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' },
      body: JSON.stringify({ fn: 'getBootstrapPortal', token: assertion(email), metodoOriginal: 'GET' })
    });
    const result = await response.json();
    return { status: response.status, ok: result?.ok === true, hasData: result?.dados != null, error: String(result?.erro || '') };
  } finally { clearTimeout(timeout); }
}

const known = await probe(testEmail);
if (known.status !== 200 || !known.ok || !known.hasData) throw new Error('HMAC_OU_CLIENTE_TESTE_NAO_VALIDADO');
const unknown = await probe('phase6-isolation-probe@almove.invalid');
if (unknown.ok || unknown.hasData) throw new Error('ISOLAMENTO_PORTAL_FALHOU');
console.log('HMAC Apps Script ↔ Vercel validado; cliente inexistente recusado sem devolver dados.');
