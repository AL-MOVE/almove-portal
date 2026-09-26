import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo); }
function texto(valor, maximo = 160) { return String(valor || '').trim().slice(0, maximo); }
function visibilidade(valor) { return texto(valor, 16).toUpperCase() === 'PT' ? 'PT' : 'CLIENTE'; }
function iso(valor) { const resultado = texto(valor, 32); return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(resultado) ? resultado : ''; }
function numero(valor, minimo, maximo, padrao = 0) { const resultado = Number(valor); return Number.isFinite(resultado) && resultado >= minimo && resultado <= maximo ? resultado : padrao; }
function corresponde(documento, clienteId, plano, treino = null) { const item = documento.data(); return item.idCliente === clienteId && item.nomePlano === plano && (treino === null || item.nomeTreino === treino); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const entrada = req.body && typeof req.body === 'object' ? req.body : {}; const acao = texto(entrada.action, 40); const colecao = db.collection('crmMigrationTrainingPlans'); const snapshot = await colecao.get(); const agora = new Date();
    const auditar = (lote, nome, extra = {}) => lote.create(db.collection('auditLogs').doc(), { action: nome, actorUid: identidade.uid, createdAt: agora, ...extra });
    if (acao === 'save-workout') {
      const clienteId = texto(entrada.idCliente, 128); const plano = texto(entrada.nomePlano); const treino = texto(entrada.nomeTreino); const treinoOriginal = texto(entrada.nomeTreinoOriginal) || treino; const exercicios = Array.isArray(entrada.exercicios) ? entrada.exercicios.slice(0, 100) : [];
      if (!clienteId || !plano || !treino || !exercicios.length) return responder(res, 400, { ok: false, erro: 'TREINO_INVALIDO' });
      const cliente = await db.collection('crmMigrationClients').doc(clienteId).get(); if (!cliente.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' });
      const planoExistente = snapshot.docs.find(documento => corresponde(documento, clienteId, plano)); const validade = iso(entrada.dataValidade) || texto(planoExistente?.data()?.validade, 32); const acesso = entrada.visibilidade ? visibilidade(entrada.visibilidade) : visibilidade(planoExistente?.data()?.visibilidade); const lote = db.batch();
      snapshot.docs.filter(documento => corresponde(documento, clienteId, plano, treinoOriginal) || (treinoOriginal !== treino && corresponde(documento, clienteId, plano, treino))).forEach(documento => lote.delete(documento.ref));
      exercicios.forEach((exercicio, indice) => { const referencia = colecao.doc(); lote.create(referencia, { fonteLinha: null, idCliente: clienteId, nomePlano: plano, nomeTreino: treino, ordem: indice + 1, exercicio: texto(exercicio?.exercicio, 200), series: numero(exercicio?.series, 0, 20), repsMin: numero(exercicio?.repsMin, 0, 100), repsMax: numero(exercicio?.repsMax, 0, 100), rir: exercicio?.rir === '' || exercicio?.rir == null ? null : numero(exercicio.rir, 0, 10), notas: texto(exercicio?.notas, 1500), atualizadoEm: agora.toISOString(), validade, visibilidade: acesso, tipoPrescricao: texto(exercicio?.tipoPrescricao, 16).toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS', descansoSegundos: numero(exercicio?.descansoSegundos, 0, 3600, 60), aquecimento: exercicio?.aquecimento === true || String(exercicio?.aquecimento).toLowerCase() === 'true', grupoSuperserie: texto(exercicio?.grupoSuperserie, 20).toUpperCase(), origem: 'firebase-development' }); });
      auditar(lote, 'development.training-workout.saved', { clientId: clienteId, planName: plano, workoutName: treino }); await lote.commit(); return responder(res, 200, { ok: true });
    }
    if (acao === 'delete-workout' || acao === 'delete-plan' || acao === 'renew-validity' || acao === 'set-visibility') {
      const clienteId = texto(entrada.idCliente, 128); const plano = texto(entrada.nomePlano); const treino = acao === 'delete-workout' ? texto(entrada.nomeTreino) : null; const documentos = snapshot.docs.filter(documento => corresponde(documento, clienteId, plano, treino)); if (!clienteId || !plano || !documentos.length) return responder(res, 404, { ok: false, erro: 'PLANO_NAO_ENCONTRADO' }); const lote = db.batch();
      if (acao === 'delete-workout' || acao === 'delete-plan') documentos.forEach(documento => lote.delete(documento.ref));
      if (acao === 'renew-validity') { const validade = iso(entrada.dataValidade); if (!validade) return responder(res, 400, { ok: false, erro: 'DATA_INVALIDA' }); documentos.forEach(documento => lote.update(documento.ref, { validade, atualizadoEm: agora.toISOString() })); }
      if (acao === 'set-visibility') { const acesso = visibilidade(entrada.visibilidade); documentos.forEach(documento => lote.update(documento.ref, { visibilidade: acesso, atualizadoEm: agora.toISOString() })); }
      auditar(lote, 'development.training-plan.' + acao, { clientId: clienteId, planName: plano, workoutName: treino || '' }); await lote.commit(); return responder(res, 200, { ok: true });
    }
    if (acao === 'replicate-plan') {
      const origemId = texto(entrada.origemIdCliente, 128); const origemPlano = texto(entrada.origemNomePlano); const destinoId = texto(entrada.destinoIdCliente, 128); const destinoPlano = texto(entrada.destinoNomePlano); const validade = iso(entrada.dataValidade); if (!origemId || !origemPlano || !destinoId || !destinoPlano || !validade) return responder(res, 400, { ok: false, erro: 'REPLICACAO_INVALIDA' });
      const origem = snapshot.docs.filter(documento => corresponde(documento, origemId, origemPlano)); if (!origem.length || snapshot.docs.some(documento => corresponde(documento, destinoId, destinoPlano))) return responder(res, 409, { ok: false, erro: origem.length ? 'PLANO_DESTINO_JA_EXISTE' : 'PLANO_ORIGEM_NAO_ENCONTRADO' }); const cliente = await db.collection('crmMigrationClients').doc(destinoId).get(); if (!cliente.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' }); const lote = db.batch();
      origem.forEach(documento => { const item = documento.data(); lote.create(colecao.doc(), { ...item, fonteLinha: null, idCliente: destinoId, nomePlano: destinoPlano, atualizadoEm: agora.toISOString(), validade, origem: 'firebase-development' }); }); auditar(lote, 'development.training-plan.replicated', { sourceClientId: origemId, clientId: destinoId, sourcePlanName: origemPlano, planName: destinoPlano }); await lote.commit(); return responder(res, 201, { ok: true });
    }
    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) { const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo }); }
}
