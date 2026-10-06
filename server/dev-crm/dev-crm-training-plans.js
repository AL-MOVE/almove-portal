import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { mergeExerciseLibrary } from './exercise-library.js';
import { buildExerciseLibraryOptions, normalizeExerciseLibrarySettings } from './exercise-library-settings.js';
import { trainingPlanRevision } from './training-plan-revision.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function texto(valor, maximo = 160) { return String(valor || '').trim().slice(0, maximo); }
function visibilidade(valor) { return texto(valor, 16).toUpperCase() === 'PT' ? 'PT' : 'CLIENTE'; }
function dataCurta(valor) {
  const iso = texto(valor, 32).slice(0, 10);
  const data = new Date(iso + 'T12:00:00Z');
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: 'short', year: 'numeric' });
}
function diasRestantes(valor) {
  const iso = texto(valor, 32).slice(0, 10);
  if (!iso) return null;
  const hoje = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(hoje);
  const parte = tipo => partes.find(item => item.type === tipo).value;
  const base = new Date(parte('year') + '-' + parte('month') + '-' + parte('day') + 'T12:00:00Z');
  const fim = new Date(iso + 'T12:00:00Z');
  return Number.isNaN(fim.getTime()) ? null : Math.ceil((fim - base) / 86400000);
}

function listarPlanos(linhas, clienteId) {
  const porPlano = new Map();
  linhas.filter(item => item.idCliente === clienteId && item.nomePlano).forEach(item => {
    const nome = texto(item.nomePlano); const atual = porPlano.get(nome) || { nome, treinos: new Set(), atualizadoEm: '', validade: '', visibilidade: visibilidade(item.visibilidade) };
    if (item.nomeTreino) atual.treinos.add(texto(item.nomeTreino));
    if (texto(item.atualizadoEm) > atual.atualizadoEm) atual.atualizadoEm = texto(item.atualizadoEm, 32);
    if (!atual.validade && item.validade) atual.validade = texto(item.validade, 32);
    porPlano.set(nome, atual);
  });
  return [...porPlano.values()].map(item => ({ nome: item.nome, numTreinos: item.treinos.size, atualizadoEm: dataCurta(item.atualizadoEm), validoAte: dataCurta(item.validade), diasRestantes: diasRestantes(item.validade), visibilidade: item.visibilidade })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}

function listarTreinos(linhas, clienteId, nomePlano) {
  const porTreino = new Map();
  linhas.filter(item => item.idCliente === clienteId && item.nomePlano === nomePlano && item.nomeTreino).forEach(item => {
    const nome = texto(item.nomeTreino); const atual = porTreino.get(nome) || { nome, numExercicios: 0, atualizadoEm: '', revision: '', visibilidade: visibilidade(item.visibilidade) };
    atual.numExercicios += 1; if (texto(item.atualizadoEm) > atual.atualizadoEm) atual.atualizadoEm = texto(item.atualizadoEm, 32); porTreino.set(nome, atual);
  });
  return [...porTreino.values()].map(item => ({ ...item, revision: item.atualizadoEm, atualizadoEm: dataCurta(item.atualizadoEm) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}

function detalheTreino(linhas, clienteId, nomePlano, nomeTreino) {
  const selecionadas = linhas.filter(item => item.idCliente === clienteId && item.nomePlano === nomePlano && item.nomeTreino === nomeTreino).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  const revision = trainingPlanRevision(selecionadas);
  return { exercicios: selecionadas.map(item => ({ exercicio: texto(item.exercicio), series: String(item.series ?? ''), repsMin: String(item.repsMin ?? ''), repsMax: String(item.repsMax ?? ''), rir: item.rir == null ? '' : String(item.rir), notas: texto(item.notas, 1500), instrucoes: texto(item.instrucoes, 2000), urlImagem: texto(item.urlImagem, 1000), urlVideo: texto(item.urlVideo, 1000), tipoPrescricao: texto(item.tipoPrescricao).toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS', descansoSegundos: String(item.descansoSegundos || 60), aquecimento: item.aquecimento === true || String(item.aquecimento).toLowerCase() === 'true', grupoSuperserie: texto(item.grupoSuperserie, 20).toUpperCase() })), revision, visibilidade: selecionadas.length ? visibilidade(selecionadas[0].visibilidade) : 'CLIENTE' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const acao = texto(req.query?.action, 24) || 'plans'; const clienteId = texto(req.query?.clientId, 128); const nomePlano = texto(req.query?.plan, 160); const nomeTreino = texto(req.query?.workout, 160);
    const [planosSnap, clientesSnap, bibliotecaSnap, versoesSnap, modelosSnap, bibliotecaConfigSnap] = await Promise.all([
      db.collection('crmMigrationTrainingPlans').get(),
      acao === 'replicable' ? db.collection('crmMigrationClients').get() : Promise.resolve({ docs: [] }),
      acao === 'library' ? db.collection('crmExerciseLibrary').get() : Promise.resolve({ docs: [] }),
      acao === 'versions' && clienteId ? db.collection('crmTrainingPlanVersions').where('idCliente', '==', clienteId).get() : Promise.resolve({ docs: [] }),
      acao === 'replicable' ? db.collection('crmTrainingPlanTemplates').get() : Promise.resolve({ docs: [] }),
      acao === 'library' ? db.collection('crmDevelopmentSettings').doc('exercise-library').get() : Promise.resolve({ exists: false, data: () => ({}) })
    ]);
    const linhas = planosSnap.docs.map(documento => documento.data()); const clientes = new Map(clientesSnap.docs.map(documento => [documento.id, { id: documento.id, ...documento.data() }]));
    if (acao === 'plans') return responder(res, 200, { ok: true, planos: listarPlanos(linhas, clienteId) });
    if (acao === 'workouts') return responder(res, 200, { ok: true, treinos: listarTreinos(linhas, clienteId, nomePlano) });
    if (acao === 'detail') return responder(res, 200, { ok: true, ...detalheTreino(linhas, clienteId, nomePlano, nomeTreino) });
    if (acao === 'library') {
      const migrados = linhas.map(item => ({ nome: texto(item.exercicio) })).filter(item => item.nome);
      const personalizados = bibliotecaSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }));
      const exercicios = mergeExerciseLibrary({ migrated: migrados, custom: personalizados });
      const configuracao = normalizeExerciseLibrarySettings(bibliotecaConfigSnap.exists ? bibliotecaConfigSnap.data() : {});
      return responder(res, 200, { ok: true, exercicios, configuracao, opcoes: buildExerciseLibraryOptions(exercicios, configuracao), total: exercicios.length, aviso: '' });
    }
    if (acao === 'versions') {
      if (!clienteId) return responder(res, 400, { ok: false, erro: 'CLIENTE_OBRIGATORIO' });
      const versoes = versoesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(item => item.idCliente === clienteId && (!nomePlano || item.nomePlano === nomePlano) && (!nomeTreino || item.nomeTreino === nomeTreino)).map(item => ({
        id: item.id,
        nomePlano: texto(item.nomePlano),
        nomeTreino: texto(item.nomeTreino),
        idSessao: texto(item.idSessao, 180),
        criadoEm: texto(item.criadoEm, 64),
        treinador: texto(item.criadoPorEmail || item.criadoPorNome, 160) || 'Treinador',
        origem: texto(item.origem, 40),
        restauradoDeVersaoId: texto(item.restauradoDeVersaoId, 180),
        alteracoes: (Array.isArray(item.alteracoes) ? item.alteracoes : []).slice(0, 120).map(alteracao => ({ label: texto(alteracao?.label, 40), detail: texto(alteracao?.detail, 300) })).filter(alteracao => alteracao.label && alteracao.detail),
        exercicios: (Array.isArray(item.exercicios) ? item.exercicios : []).slice(0, 100)
      })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      return responder(res, 200, { ok: true, versoes });
    }
    if (acao === 'replicable') {
      const planos = [];
      for (const [idCliente, cliente] of clientes) {
        if (cliente.estado !== 'Ativo') continue;
        listarPlanos(linhas, idCliente).forEach(plano => {
          const treinos = listarTreinos(linhas, idCliente, plano.nome); planos.push({ idCliente, cliente: cliente.nome, estadoCliente: cliente.estado, nomePlano: plano.nome, numTreinos: treinos.length, numExercicios: treinos.reduce((soma, treino) => soma + treino.numExercicios, 0), atualizadoEm: plano.atualizadoEm, dataValidade: plano.validoAte });
        });
      }
      modelosSnap.docs.forEach(documento => { const modelo = documento.data() || {}; const exercicios = Array.isArray(modelo.exercicios) ? modelo.exercicios : []; planos.push({ idCliente: 'template:' + documento.id, cliente: 'MODELO REUTILIZÁVEL', estadoCliente: 'Modelo', nomePlano: texto(modelo.nomePlano), numTreinos: 1, numExercicios: exercicios.length, atualizadoEm: dataCurta(modelo.atualizadoEm || modelo.criadoEm), dataValidade: dataCurta(modelo.validade), origemTipo: 'MODELO' }); });
      return responder(res, 200, { ok: true, planos: planos.sort((a, b) => (a.cliente + a.nomePlano).localeCompare(b.cliente + b.nomePlano, 'pt-PT')) });
    }
    if (acao === 'pt-session-plans') {
      const planos = listarPlanos(linhas, clienteId).map(plano => ({
        nome: plano.nome,
        visibilidade: plano.visibilidade,
        treinos: listarTreinos(linhas, clienteId, plano.nome).map(treino => { const detalhe = detalheTreino(linhas, clienteId, plano.nome, treino.nome); return { nome: treino.nome, revision: detalhe.revision, exercicios: detalhe.exercicios }; })
      }));
      return responder(res, 200, { ok: true, planos });
    }
    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
