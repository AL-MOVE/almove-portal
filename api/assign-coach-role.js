import { timingSafeEqual } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { obterAdminFirebase } from './_firebase.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(estado).json(corpo);
}

function segredoValido(req) {
  const esperado = String(process.env.COACH_ROLE_ASSIGNMENT_SECRET || '');
  const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (esperado.length < 32 || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  if (!segredoValido(req)) return responder(res, 404, { ok: false });

  const email = String(process.env.COACH_ROLE_ASSIGNMENT_EMAIL || '').trim().toLowerCase();
  if (email !== 'martinssony1998@gmail.com') return responder(res, 503, { ok: false });

  let conta;
  let utilizador;
  try {
    const admin = obterAdminFirebase();
    conta = admin.conta;
    const { auth, app } = admin;
    utilizador = await auth.getUserByEmail(email);
    await getFirestore(app).collection('userAccess').doc(utilizador.uid).set({
      status: 'active', roles: ['coach', 'admin'], updatedAt: new Date()
    }, { merge: true });
    return responder(res, 200, { ok: true });
  } catch (erro) {
    console.error(
      'COACH_ROLE_ASSIGNMENT_FAILED',
      String(erro && (erro.code || erro.message) || 'UNKNOWN').slice(0, 160),
      String(conta?.client_email || 'UNKNOWN').slice(0, 120),
      String(utilizador?.uid || 'UNKNOWN').slice(0, 160)
    );
    return responder(res, 502, { ok: false });
  }
}
