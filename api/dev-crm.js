import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

/** Sonda temporária: só confirma Vercel → Firestore no projeto de desenvolvimento. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return responder(res, 405, { ok: false, erro: 'Método não permitido' });
  }
  const { projeto } = obterAdminFirebase();
  if (projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false, erro: 'Indisponível' });
  try {
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    const contexto = await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid);
    return responder(res, 200, {
      ok: true, ambiente: 'development', email: identidade.email,
      roles: contexto.roles, clientId: contexto.clientId || null
    });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    if (/^FIREBASE_/.test(codigo)) return responder(res, 401, { ok: false, erro: codigo });
    if (/^ACESSO_/.test(codigo)) return responder(res, 403, { ok: false, erro: codigo });
    return responder(res, 500, { ok: false, erro: 'FIRESTORE_INDISPONIVEL' });
  }
}
