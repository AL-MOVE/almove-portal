import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { normalizeExerciseLibrarySettings } from './exercise-library-settings.js';
import { loadServiceCatalog, normalizeServiceCatalog } from './service-catalog.js';
import { carregarLocais, mesLisboa, normalizarLocais } from './locations.js';
import { erroTemporarioGoogle, registarErroTemporario } from '../../api/_transient-errors.js';

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
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid)); const referencia = db.collection('crmDevelopmentSettings').doc('coach-profile'); const bibliotecaRef = db.collection('crmDevelopmentSettings').doc('exercise-library'); const servicosRef = db.collection('crmDevelopmentSettings').doc('service-catalog'); const locaisRef = db.collection('crmDevelopmentSettings').doc('locations');
    if (req.method === 'GET') { const [atual, bibliotecaSnap, catalogo, locais] = await Promise.all([referencia.get(), bibliotecaRef.get(), loadServiceCatalog(db), carregarLocais(db)]); return responder(res, 200, { ok: true, perfil: normalizar(atual.exists ? atual.data() : PADRAO), biblioteca: normalizeExerciseLibrarySettings(bibliotecaSnap.exists ? bibliotecaSnap.data() : {}), catalogo, locais }); }
    if (req.body?.action === 'save-exercise-library-settings') { const biblioteca = normalizeExerciseLibrarySettings(req.body.biblioteca || {}); const agora = new Date(); await db.runTransaction(async transacao => { transacao.set(bibliotecaRef, { ...biblioteca, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { action: 'development.settings.exercise-library-updated', actorUid: identidade.uid, createdAt: agora }); }); return responder(res, 200, { ok: true, biblioteca }); }
    if (req.body?.action === 'save-service-catalog') {
      const enviados = normalizeServiceCatalog(req.body.catalogo?.servicos || []);
      const revisaoEsperada = Number(req.body.catalogo?.revision || 0);
      const agora = new Date();
      let catalogoGuardado;
      await db.runTransaction(async transacao => {
        const atual = await transacao.get(servicosRef);
        const dadosAtuais = atual.exists ? atual.data() : {};
        const revisaoAtual = Number(dadosAtuais?.revision || 0);
        if (revisaoEsperada !== revisaoAtual) throw new Error('CATALOGO_SERVICOS_CONFLITO');
        const anteriores = normalizeServiceCatalog(dadosAtuais?.servicos);
        const idsEnviados = new Set(enviados.map(item => item.id));
        const preservados = anteriores.filter(item => !idsEnviados.has(item.id)).map(item => ({ ...item, ativo: false }));
        const servicos = normalizeServiceCatalog(enviados.concat(preservados));
        const revision = revisaoAtual + 1;
        catalogoGuardado = { servicos, revision, configured: true };
        transacao.set(servicosRef, { servicos, revision, updatedAt: agora, updatedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.settings.service-catalog-updated', actorUid: identidade.uid, createdAt: agora, revision, services: servicos.map(item => ({ id: item.id, code: item.codigo, category: item.categoria, active: item.ativo, price: item.preco })) });
      });
      return responder(res, 200, { ok: true, catalogo: catalogoGuardado });
    }
    if (req.body?.action === 'save-locations') {
      const revisaoEsperada = Number(req.body.locais?.revision || 0);
      const agora = new Date(); let catalogoGuardado;
      await db.runTransaction(async transacao => {
        const atual = await transacao.get(locaisRef);
        const dadosAtuais = atual.exists ? atual.data() : {};
        const revisaoAtual = Number(dadosAtuais?.revision || 0);
        if (revisaoEsperada !== revisaoAtual) throw new Error('LOCAIS_CONFLITO');
        const anteriores = Array.isArray(dadosAtuais?.locais) ? dadosAtuais.locais : [];
        const locais = normalizarLocais(req.body.locais?.locais || [], { mes: mesLisboa(), anteriores });
        const revision = revisaoAtual + 1;
        catalogoGuardado = { locais, revision, configured: true };
        transacao.set(locaisRef, { locais, revision, updatedAt: agora, updatedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.settings.locations-updated', actorUid: identidade.uid, createdAt: agora, revision, locations: locais.map(item => ({ id: item.id, name: item.nome, type: item.tipo, active: item.ativo, monthlyRent: item.rendaMensal })) });
      });
      return responder(res, 200, { ok: true, locais: catalogoGuardado });
    }
    const perfil = normalizar(req.body && typeof req.body === 'object' ? req.body : {}); const agora = new Date(); await db.runTransaction(async transacao => { transacao.set(referencia, { ...perfil, updatedAt: agora, updatedBy: identidade.uid }); transacao.create(db.collection('auditLogs').doc(), { action: 'development.settings.profile-updated', actorUid: identidade.uid, createdAt: agora }); }); return responder(res, 200, { ok: true, perfil });
  } catch (erro) { const codigo = String(erro?.code || erro?.message || 'FALHA'); if (erroTemporarioGoogle(erro)) { registarErroTemporario('dev-crm-settings', erro); return responder(res, 503, { ok: false, erro: 'SERVICO_TEMPORARIAMENTE_INDISPONIVEL' }); } const estado = /^FIREBASE_/.test(codigo) ? 401 : (['CATALOGO_SERVICOS_CONFLITO', 'LOCAIS_CONFLITO'].includes(codigo) ? 409 : (/^(CODIGO_|ID_|NOME_|PRECO_|SESSOES_|DURACAO_|VALIDADE_|DEMASIADOS_|LOCAL|LOCAIS_)/.test(codigo) ? 400 : 500)); return responder(res, estado, { ok: false, erro: codigo }); }
}
