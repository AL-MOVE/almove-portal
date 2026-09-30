import { createHmac } from 'node:crypto';
import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { googleAccessToken } from '../../api/_google-cloud.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiOl7KkXMYSFv9lKKVb2sMspvwER2P5IMlpNQcr9csLyEDnzJqvVqisE-XVuAHgeUV/exec';

function responder(res, status, body) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(status).json(body); }
function signedAssertion(email, secret) { const now = Math.floor(Date.now() / 1000); const body = Buffer.from(JSON.stringify({ v: 1, uid: 'phase6-readonly-probe', email, iat: now, exp: now + 180, nonce: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) })).toString('base64url'); return `fb1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`; }
async function portalProbe(email, secret, fn = 'getBootstrapPortal') {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', signal: controller.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ fn, token: signedAssertion(email, secret), metodoOriginal: 'GET' }) });
    const result = await response.json().catch(() => ({}));
    return { transport: response.ok, accepted: result?.ok === true, hasData: result?.dados != null, signatureValid: result?.dados?.assinaturaValida === true, matches: Number(result?.dados?.correspondencias || 0), identifierPresent: result?.dados?.identificadorPresente === true };
  } finally { clearTimeout(timeout); }
}
async function backupStatus(projectId) {
  try {
    const auth = await googleAccessToken(); if (auth.projectId !== projectId) return { reachable: false, error: 'PROJECT_MISMATCH', dailyConfigured: false, schedules: [] };
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/backupSchedules`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({})); if (!response.ok) return { reachable: false, error: String(body?.error?.status || `HTTP_${response.status}`), dailyConfigured: false, schedules: [] };
    const schedules = (body.backupSchedules || []).map(item => ({ recurrence: item.dailyRecurrence ? 'daily' : 'weekly', retention: String(item.retention || '') }));
    return { reachable: true, error: '', dailyConfigured: schedules.some(item => item.recurrence === 'daily'), schedules };
  } catch (error) { return { reachable: false, error: String(error?.message || 'BACKUP_STATUS_FAILED').slice(0, 80), dailyConfigured: false, schedules: [] }; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identity = await obterIdentidadeFirebase(req); const { db, projeto } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identity.uid));
    const testEmail = String(req.query?.clientEmail || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) return responder(res, 400, { ok: false, error: 'TEST_EMAIL_REQUIRED' });
    const secret = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
    const hmacConfigured = secret.length >= 32;
    const [diagnostic, known, unknown, backups] = await Promise.all([hmacConfigured ? portalProbe(testEmail, secret, 'diagnosticarHmacFirebasePortal') : null, hmacConfigured ? portalProbe(testEmail, secret) : null, hmacConfigured ? portalProbe('phase6-isolation-probe@almove.invalid', secret) : null, backupStatus(projeto)]);
    const hmacVerified = Boolean(diagnostic?.transport && diagnostic.accepted && diagnostic.signatureValid);
    const clientMappingVerified = Boolean(diagnostic?.matches === 1 && diagnostic.identifierPresent && known?.transport && known.accepted && known.hasData);
    const isolationVerified = Boolean(unknown?.transport && !unknown.accepted && !unknown.hasData);
    return responder(res, 200, { ok: hmacVerified && clientMappingVerified && isolationVerified, checks: { firebase: true, role: true, hmacConfigured, hmacVerified, clientMappingVerified, isolationVerified }, backups });
  } catch (error) {
    const code = String(error?.code || error?.message || 'OPS_FAILED');
    return responder(res, /^FIREBASE_/.test(code) ? 401 : /^ACESSO_/.test(code) ? 403 : 500, { ok: false, error: /^FIREBASE_|^ACESSO_/.test(code) ? code : 'OPS_FAILED' });
  }
}
