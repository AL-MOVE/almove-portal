import { obterAssertacaoFirebaseInterna, obterAdminFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiOl7KkXMYSFv9lKKVb2sMspvwER2P5IMlpNQcr9csLyEDnzJqvVqisE-XVuAHgeUV/exec';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return responder(res, 405, { ok: false }); }
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const { identidade, assertacao } = await obterAssertacaoFirebaseInterna(req, 'crm-migration-development');
    const { db } = obterFirestoreAlmove();
    const contexto = await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid);
    if (!contexto.roles.includes('admin')) return responder(res, 403, { ok: false, erro: 'ACESSO_SEM_PERMISSAO_CRM' });
    const resposta = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ fn: 'getResumoMigracaoDevelopment', token: assertacao }) });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.ok) return responder(res, 502, { ok: false, erro: 'ORIGEM_CRM_INDISPONIVEL' });
    return responder(res, 200, { ok: true, resumo: dados.dados });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
