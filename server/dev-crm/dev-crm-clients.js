import { FieldValue } from 'firebase-admin/firestore';
import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { criarRepositorioClientes, exigirEquipa } from '../../api/_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

async function contextoEquipa(req) {
  const { projeto } = obterAdminFirebase();
  if (projeto !== 'almove-portal-dev') {
    const erro = new Error('INDISPONIVEL'); erro.code = 'INDISPONIVEL'; throw erro;
  }
  const identidade = await obterIdentidadeFirebase(req);
  const { db } = obterFirestoreAlmove();
  const contexto = await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid);
  exigirEquipa(contexto);
  return { db, contexto };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return responder(res, 405, { ok: false, erro: 'Método não permitido' });
  }
  try {
    const { db, contexto } = await contextoEquipa(req);
    const repositorio = criarRepositorioClientes({ db, serverTimestamp: FieldValue.serverTimestamp });
    if (req.method === 'GET') return responder(res, 200, { ok: true, clientes: await repositorio.listar() });
    const dados = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    return responder(res, 201, { ok: true, cliente: await repositorio.criar(contexto, dados) });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    if (codigo === 'INDISPONIVEL') return responder(res, 404, { ok: false, erro: codigo });
    if (/^FIREBASE_/.test(codigo)) return responder(res, 401, { ok: false, erro: codigo });
    if (/^ACESSO_/.test(codigo)) return responder(res, 403, { ok: false, erro: codigo });
    if (/^CLIENTE_INVALIDO_/.test(codigo)) return responder(res, 400, { ok: false, erro: codigo });
    if (codigo === 'CLIENTE_EMAIL_JA_EXISTE') return responder(res, 409, { ok: false, erro: codigo });
    return responder(res, 500, { ok: false, erro: 'CRM_INDISPONIVEL' });
  }
}
