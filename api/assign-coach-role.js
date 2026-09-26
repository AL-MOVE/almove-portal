import { timingSafeEqual } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { obterAdminFirebase } from './_firebase.js';

const EMAIL_AUTORIZADO = 'martinssony1998@gmail.com';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
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

/** Rota de uso único para a conta expressamente autorizada; removida após sucesso. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  if (!segredoValido(req)) return responder(res, 404, { ok: false });
  try {
    const { auth, app } = obterAdminFirebase();
    const utilizador = await auth.getUserByEmail(EMAIL_AUTORIZADO);
    await getFirestore(app).collection('userAccess').doc(utilizador.uid).set({
      status: 'active', roles: ['coach', 'admin'], updatedAt: new Date()
    }, { merge: true });
    return responder(res, 200, { ok: true });
  } catch (erro) {
    console.error('COACH_ROLE_ASSIGNMENT_FAILED', String(erro?.code || erro?.message || 'UNKNOWN').slice(0, 160));
    return responder(res, 502, { ok: false });
  }
}
