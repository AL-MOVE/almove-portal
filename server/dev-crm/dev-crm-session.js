import { cookieSessaoCrmDevelopment, criarSessaoCrmDevelopment } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { obterIdentidadeFirebase } from '../../api/_firebase.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(estado).json(corpo);
}

export default async function handler(req, res) {
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
  } catch (erro) {
    return responder(res, 503, { ok: false, erro: String(erro.code || erro.message || 'FIREBASE_INDISPONIVEL') });
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieSessaoCrmDevelopment('', 0));
    return responder(res, 200, { ok: true });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return responder(res, 405, { ok: false, erro: 'METODO_NAO_PERMITIDO' });
  }
  try {
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const sessao = await criarSessaoCrmDevelopment(req);
    res.setHeader('Set-Cookie', cookieSessaoCrmDevelopment(sessao));
    return responder(res, 200, { ok: true });
  } catch (erro) {
    return responder(res, /^ACESSO_/.test(String(erro.code || erro.message || '')) ? 403 : 401, { ok: false, erro: String(erro.code || erro.message || 'ACESSO_RECUSADO') });
  }
}
