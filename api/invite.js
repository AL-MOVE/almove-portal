import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { obterAdminFirebase } from './_firebase.js';

const PORTAL_URL = 'https://portal.almove.pt/';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(estado).json(corpo);
}

function assinaturaValida(corpo) {
  const segredo = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
  const email = String(corpo.email || '').trim().toLowerCase();
  const cliente = String(corpo.clientId || '').trim();
  const instante = Number(corpo.timestamp || 0);
  const recebida = String(corpo.assinatura || '');
  if (!segredo || !cliente || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isFinite(instante) || Math.abs(Date.now() - instante) > 5 * 60 * 1000) return false;
  const esperada = createHmac('sha256', segredo).update(`${cliente}\n${email}\n${instante}`).digest('base64url');
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!assinaturaValida(corpo)) return responder(res, 401, { ok: false });

  try {
    const email = String(corpo.email).trim().toLowerCase();
    const { auth } = obterAdminFirebase();
    let utilizador;
    try { utilizador = await auth.getUserByEmail(email); }
    catch (erro) {
      if (erro.code !== 'auth/user-not-found') throw erro;
    }

    // Uma conta pendente pode ter sido criada por uma tentativa incompleta.
    // É substituída por credenciais aleatórias; só quem receber este email
    // consegue escolher a nova palavra-passe.
    if (utilizador && !utilizador.emailVerified) {
      await auth.deleteUser(utilizador.uid);
      utilizador = null;
    }
    if (!utilizador) {
      utilizador = await auth.createUser({
        email,
        emailVerified: true,
        password: randomBytes(32).toString('base64url')
      });
    }
    const link = await auth.generatePasswordResetLink(email, { url: PORTAL_URL, handleCodeInApp: false });
    return responder(res, 200, { ok: true, link });
  } catch {
    return responder(res, 502, { ok: false });
  }
}
