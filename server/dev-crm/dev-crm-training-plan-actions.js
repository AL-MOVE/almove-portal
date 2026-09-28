import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { createHash } from 'node:crypto';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { trainingPlanRevision } from './training-plan-revision.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo); }
function texto(valor, maximo = 160) { return String(valor || '').trim().slice(0, maximo); }
function visibilidade(valor) { return texto(valor, 16).toUpperCase() === 'PT' ? 'PT' : 'CLIENTE'; }
function iso(valor) { const resultado = texto(valor, 32); return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(resultado) ? resultado : ''; }
function numero(valor, minimo, maximo, padrao = 0) { const resultado = Number(valor); return Number.isFinite(resultado) && resultado >= minimo && resultado <= maximo ? resultado : padrao; }
function corresponde(documento, clienteId, plano, treino = null) { const item = documento.data(); return item.idCliente === clienteId && item.nomePlano === plano && (treino === null || item.nomeTreino === treino); }
function cabecaId(clienteId, plano, treino) { return createHash('sha256').update([clienteId, plano, treino].join('\u0000')).digest('hex').slice(0, 48); }
function revisaoDocumentos(documentos) { return trainingPlanRevision(documentos.map(documento => documento.data())); }
function revisaoAtualPlano(cabecaSnap, documentos) { const cabeca = texto(cabecaSnap?.data()?.revision, 64); const conteudo = revisaoDocumentos(documentos); return cabeca > conteudo ? cabeca : conteudo; }
function exercicioGuardado(item, ordem = 0) { return { ordem, exercicio: texto(item?.exercicio, 200), series: numero(item?.series, 0, 20), repsMin: numero(item?.repsMin, 0, 100), repsMax: numero(item?.repsMax, 0, 100), rir: item?.rir === '' || item?.rir == null ? null : numero(item.rir, 0, 10), notas: texto(item?.notas, 1500), tipoPrescricao: texto(item?.tipoPrescricao, 16).toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS', descansoSegundos: numero(item?.descansoSegundos, 0, 3600, 60), aquecimento: item?.aquecimento === true || String(item?.aquecimento).toLowerCase() === 'true', grupoSuperserie: texto(item?.grupoSuperserie, 20).toUpperCase() }; }
function conflitoFirestore(erro) { const codigo = String(erro?.code || ''); const mensagem = String(erro?.message || ''); return codigo === '6' || codigo === '9' || /ALREADY_EXISTS|FAILED_PRECONDITION|precondition/i.test(codigo + ' ' + mensagem); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const entrada = req.body && typeof req.body === 'object' ? req.body : {}; const acao = texto(entrada.action, 40); const colecao = db.collection('crmMigrationTrainingPlans'); const snapshot = await colecao.get(); const agora = new Date();
    const auditar = (lote, nome, extra = {}) => lote.create(db.collection('auditLogs').doc(), { action: nome, actorUid: identidade.uid, createdAt: agora, ...extra });
    if (acao === 'save-workout' || acao === 'save-workout-version') {
      const clienteId = texto(entrada.idCliente, 128); const plano = texto(entrada.nomePlano); const treino = texto(entrada.nomeTreino); const treinoOriginal = texto(entrada.nomeTreinoOriginal) || treino; const exercicios = Array.isArray(entrada.exercicios) ? entrada.exercicios.slice(0, 100) : [];
      if (!clienteId || !plano || !treino || !exercicios.length) return responder(res, 400, { ok: false, erro: 'TREINO_INVALIDO' });
      const cliente = await db.collection('crmMigrationClients').doc(clienteId).get(); if (!cliente.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' });
      const destinoExistente = treinoOriginal !== treino && snapshot.docs.some(documento => corresponde(documento, clienteId, plano, treino));
      if (destinoExistente) return responder(res, 409, { ok: false, erro: 'TREINO_DESTINO_JA_EXISTE' });
      const anteriores = snapshot.docs.filter(documento => corresponde(documento, clienteId, plano, treinoOriginal)); const planoExistente = snapshot.docs.find(documento => corresponde(documento, clienteId, plano)); const validade = iso(entrada.dataValidade) || texto(planoExistente?.data()?.validade, 32); const acesso = entrada.visibilidade ? visibilidade(entrada.visibilidade) : visibilidade(planoExistente?.data()?.visibilidade); const lote = db.batch(); let versaoId = '';
      const cabecaRef = db.collection('crmTrainingPlanHeads').doc(cabecaId(clienteId, plano, treinoOriginal || treino)); const cabecaDestinoRef = treinoOriginal !== treino ? db.collection('crmTrainingPlanHeads').doc(cabecaId(clienteId, plano, treino)) : null; const [cabecaSnap, cabecaDestinoSnap] = await Promise.all([cabecaRef.get(), cabecaDestinoRef ? cabecaDestinoRef.get() : Promise.resolve(null)]); const revisaoAtual = revisaoAtualPlano(cabecaSnap, anteriores); const revisaoEsperada = texto(entrada.expectedRevision, 64);
      if (cabecaDestinoSnap?.exists) return responder(res, 409, { ok: false, erro: 'TREINO_DESTINO_JA_EXISTE' });
      const sessaoId = texto(entrada.idSessao, 180); const versaoRef = acao === 'save-workout-version' ? db.collection('crmTrainingPlanVersions').doc(encodeURIComponent(sessaoId)) : null;
      if (acao === 'save-workout-version' && !sessaoId) return responder(res, 400, { ok: false, erro: 'SESSAO_OBRIGATORIA_PARA_VERSAO' });
      if (versaoRef) { const versaoExistente = await versaoRef.get(); if (versaoExistente.exists) { const dados = versaoExistente.data() || {}; if (dados.idCliente !== clienteId || dados.nomePlano !== plano || dados.nomeTreino !== treinoOriginal) return responder(res, 409, { ok: false, erro: 'SESSAO_JA_UTILIZADA' }); return responder(res, 200, { ok: true, repetido: true, versaoId: versaoRef.id, revision: revisaoAtual }); } }
      if (anteriores.length && (!revisaoEsperada || revisaoEsperada !== revisaoAtual)) return responder(res, 409, { ok: false, erro: 'PLANO_ALTERADO', revision: revisaoAtual });
      const novaRevisao = agora.toISOString();
      if (anteriores.length) {
        const arquivoRef = versaoRef || db.collection('crmTrainingPlanVersions').doc(); versaoId = arquivoRef.id; const alteracoesRecebidas = (Array.isArray(entrada.alteracoes) ? entrada.alteracoes : []).slice(0, 120).map(item => ({ label: texto(item?.label, 40), detail: texto(item?.detail, 300) })).filter(item => item.label && item.detail); const alteracoes = alteracoesRecebidas.length ? alteracoesRecebidas : [{ label: 'Edição no CRM', detail: 'Versão guardada automaticamente antes da alteração.' }];
        const exerciciosAnteriores = anteriores.map(documento => exercicioGuardado(documento.data(), numero(documento.data()?.ordem, 0, 200))).sort((a, b) => a.ordem - b.ordem);
        lote.create(arquivoRef, { idCliente: clienteId, nomePlano: plano, nomeTreino: treinoOriginal, idSessao: sessaoId, exercicios: exerciciosAnteriores, alteracoes, criadoEm: agora.toISOString(), criadoPor: identidade.uid, criadoPorEmail: identidade.email, origem: acao === 'save-workout-version' ? 'coach-mobile' : 'crm' });
      }
      anteriores.forEach(documento => lote.delete(documento.ref));
      exercicios.forEach((exercicio, indice) => { const referencia = colecao.doc(); lote.create(referencia, { fonteLinha: null, idCliente: clienteId, nomePlano: plano, nomeTreino: treino, ...exercicioGuardado(exercicio, indice + 1), atualizadoEm: novaRevisao, validade, visibilidade: acesso, versaoAnteriorId: versaoId || null, origem: 'firebase-development' }); });
      const cabecaDados = { idCliente: clienteId, nomePlano: plano, nomeTreino: treino, revision: novaRevisao, atualizadoEm: agora, atualizadoPor: identidade.uid, atualizadoPorEmail: identidade.email };
      if (cabecaSnap.exists) lote.update(cabecaRef, cabecaDados, { lastUpdateTime: cabecaSnap.updateTime }); else lote.create(cabecaRef, cabecaDados);
      if (cabecaDestinoRef) lote.create(cabecaDestinoRef, { ...cabecaDados, renomeadoDe: treinoOriginal });
      auditar(lote, acao === 'save-workout-version' ? 'development.training-workout.versioned' : 'development.training-workout.saved', { clientId: clienteId, planName: plano, workoutName: treino, versionId: versaoId, previousRevision: revisaoAtual, revision: novaRevisao }); await lote.commit(); return responder(res, 200, { ok: true, versaoId: versaoId || null, revision: novaRevisao });
    }
    if (acao === 'restore-workout-version') {
      const clienteId = texto(entrada.idCliente, 128); const plano = texto(entrada.nomePlano); const treino = texto(entrada.nomeTreino); const versaoId = texto(entrada.versaoId, 180); const revisaoEsperada = texto(entrada.expectedRevision, 64);
      if (!clienteId || !plano || !treino || !versaoId || !revisaoEsperada) return responder(res, 400, { ok: false, erro: 'RESTAURO_INVALIDO' });
      const versaoSnap = await db.collection('crmTrainingPlanVersions').doc(versaoId).get(); if (!versaoSnap.exists) return responder(res, 404, { ok: false, erro: 'VERSAO_NAO_ENCONTRADA' }); const versao = versaoSnap.data() || {};
      if (versao.idCliente !== clienteId || versao.nomePlano !== plano || versao.nomeTreino !== treino) return responder(res, 403, { ok: false, erro: 'VERSAO_NAO_AUTORIZADA' });
      const exerciciosRestaurados = Array.isArray(versao.exercicios) ? versao.exercicios.slice(0, 100) : []; if (!exerciciosRestaurados.length) return responder(res, 400, { ok: false, erro: 'VERSAO_SEM_EXERCICIOS' });
      const atuais = snapshot.docs.filter(documento => corresponde(documento, clienteId, plano, treino)); if (!atuais.length) return responder(res, 404, { ok: false, erro: 'TREINO_NAO_ENCONTRADO' });
      const cabecaRef = db.collection('crmTrainingPlanHeads').doc(cabecaId(clienteId, plano, treino)); const cabecaSnap = await cabecaRef.get(); const revisaoAtual = revisaoAtualPlano(cabecaSnap, atuais); if (revisaoEsperada !== revisaoAtual) return responder(res, 409, { ok: false, erro: 'PLANO_ALTERADO', revision: revisaoAtual });
      const atualPrimeiro = atuais[0].data() || {}; const novaRevisao = agora.toISOString(); const lote = db.batch(); const copiaAtualRef = db.collection('crmTrainingPlanVersions').doc();
      const exerciciosAtuais = atuais.map(documento => exercicioGuardado(documento.data(), numero(documento.data()?.ordem, 0, 200))).sort((a, b) => a.ordem - b.ordem);
      lote.create(copiaAtualRef, { idCliente: clienteId, nomePlano: plano, nomeTreino: treino, idSessao: '', exercicios: exerciciosAtuais, alteracoes: [{ label: 'Restauro', detail: 'Plano guardado automaticamente antes de restaurar outra versão.' }], criadoEm: agora.toISOString(), criadoPor: identidade.uid, criadoPorEmail: identidade.email, origem: 'coach-mobile-restore', restauradoDeVersaoId: versaoId });
      atuais.forEach(documento => lote.delete(documento.ref));
      exerciciosRestaurados.forEach((exercicio, indice) => lote.create(colecao.doc(), { fonteLinha: null, idCliente: clienteId, nomePlano: plano, nomeTreino: treino, ...exercicioGuardado(exercicio, indice + 1), atualizadoEm: novaRevisao, validade: texto(atualPrimeiro.validade, 32), visibilidade: visibilidade(atualPrimeiro.visibilidade), versaoAnteriorId: copiaAtualRef.id, origem: 'firebase-development-restore' }));
      const cabecaDados = { idCliente: clienteId, nomePlano: plano, nomeTreino: treino, revision: novaRevisao, atualizadoEm: agora, atualizadoPor: identidade.uid, atualizadoPorEmail: identidade.email };
      if (cabecaSnap.exists) lote.update(cabecaRef, cabecaDados, { lastUpdateTime: cabecaSnap.updateTime }); else lote.create(cabecaRef, cabecaDados);
      auditar(lote, 'development.training-workout.restored', { clientId: clienteId, planName: plano, workoutName: treino, restoredVersionId: versaoId, recoveryVersionId: copiaAtualRef.id, previousRevision: revisaoAtual, revision: novaRevisao }); await lote.commit();
      return responder(res, 200, { ok: true, revision: novaRevisao, recoveryVersionId: copiaAtualRef.id });
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
  } catch (erro) { if (conflitoFirestore(erro)) return responder(res, 409, { ok: false, erro: 'PLANO_ALTERADO' }); const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo }); }
}
