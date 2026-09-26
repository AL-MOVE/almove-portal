import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

const PADRAO = Object.freeze({ nome: 'André Martins - Personal Trainer', nif: '', morada: '', contacto: '', horasAvisoCancelamento: 12, diasAvisoDenuncia: 30, fidelizacaoMeses: 3, seguroCompanhia: '', seguroApolice: '', seguroCapital: '', seguroRiscos: '', ralEntidade: '', ralWebsite: '', comarca: '', prazoRespostaReclamacoesDias: 10, assinatura: '', fotoPerfil: '' });
function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo); }
function texto(valor, maximo = 500) { return String(valor || '').trim().slice(0, maximo); }
function nomePerfil(valor) { const nome = texto(valor, 120); return !nome || nome === 'AL MOVE' ? PADRAO.nome : nome; }
function numero(valor, predefinido, minimo, maximo) { const resultado = Number(valor); return Number.isFinite(resultado) ? Math.max(minimo, Math.min(maximo, Math.round(resultado))) : predefinido; }
function imagem(valor) { const resultado = String(valor || ''); if (!resultado) return ''; if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(resultado) || resultado.length > 400000) throw new Error('IMAGEM_PERFIL_INVALIDA'); return resultado; }
function normalizar(dados = {}) { const perfil = { ...PADRAO, nome: nomePerfil(dados.nome), nif: texto(dados.nif, 32), morada: texto(dados.morada, 500), contacto: texto(dados.contacto, 64), horasAvisoCancelamento: numero(dados.horasAvisoCancelamento, 12, 0, 168), diasAvisoDenuncia: numero(dados.diasAvisoDenuncia, 30, 0, 365), fidelizacaoMeses: numero(dados.fidelizacaoMeses, 3, 0, 60), seguroCompanhia: texto(dados.seguroCompanhia, 180), seguroApolice: texto(dados.seguroApolice, 120), seguroCapital: texto(dados.seguroCapital, 120), seguroRiscos: texto(dados.seguroRiscos, 1000), ralEntidade: texto(dados.ralEntidade, 300), ralWebsite: texto(dados.ralWebsite, 500), comarca: texto(dados.comarca, 180), prazoRespostaReclamacoesDias: numero(dados.prazoRespostaReclamacoesDias, 10, 1, 365), assinatura: imagem(dados.assinatura), fotoPerfil: imagem(dados.fotoPerfil) }; if (Buffer.byteLength(JSON.stringify(perfil), 'utf8') > 850000) throw new Error('PERFIL_DEMASIADO_GRANDE'); return perfil; }

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid)); const referencia = db.collection('crmDevelopmentSettings').doc('coach-profile');
    if (req.method === 'GET') { const atual = await referencia.get(); return responder(res, 200, { ok: true, perfil: normalizar(atual.exists ? atual.data() : PADRAO) }); }
    const perfil = normalizar(req.body && typeof req.body === 'object' ? req.body : {}); const agora = new Date(); await db.runTransaction(async transacao => { transacao.set(referencia, { ...perfil, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { action: 'development.settings.profile-updated', actorUid: identidade.uid, createdAt: agora }); }); return responder(res, 200, { ok: true, perfil });
  } catch (erro) { const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo }); }
}
