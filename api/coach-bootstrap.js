import { timingSafeEqual } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { obterAdminFirebase } from './_firebase.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DESTINO_CRM = 'https://crm.almove.pt/dev-crm.html';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(estado).json(corpo);
}

function segredoValido(req) {
  const esperado = String(process.env.COACH_BOOTSTRAP_SECRET || '');
  const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (esperado.length < 32 || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  if (!segredoValido(req)) return responder(res, 404, { ok: false });

  const email = String(process.env.COACH_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const apiKey = String(process.env.FIREBASE_WEB_API_KEY || '').trim();
  if (!EMAIL.test(email) || !apiKey) return responder(res, 503, { ok: false });

  try {
    const { auth, app } = obterAdminFirebase();
    let utilizador;
    try {
      utilizador = await auth.getUserByEmail(email);
      utilizador = await auth.updateUser(utilizador.uid, { emailVerified: true });
    } catch (erro) {
      if (erro.code !== 'auth/user-not-found') throw erro;
      utilizador = await auth.createUser({
        email,
        emailVerified: true,
        password: globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID()
      });
    }

    const agora = new Date();
    await getFirestore(app).collection('userAccess').doc(utilizador.uid).set({
      status: 'active',
      roles: ['coach', 'admin'],
      updatedAt: agora,
      createdAt: agora
    }, { merge: true });

    const respostaFirebase = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email,
        continueUrl: DESTINO_CRM,
        canHandleCodeInApp: false
      })
    });
    if (!respostaFirebase.ok) throw new Error('EMAIL_NAO_ENVIADO');
    return responder(res, 200, { ok: true });
  } catch {
    return responder(res, 502, { ok: false });
  }
}
