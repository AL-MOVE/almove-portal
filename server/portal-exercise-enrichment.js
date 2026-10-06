import { mergeExerciseLibrary } from './dev-crm/exercise-library.js';

function key(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/\s+/g, ' ');
}

function exerciseIndex(custom = []) {
  const exercises = mergeExerciseLibrary({ custom });
  const exact = new Map();
  const aliases = new Map();
  const addAlias = (value, exercise) => {
    const normalized = key(value);
    if (!normalized) return;
    if (!aliases.has(normalized)) aliases.set(normalized, exercise);
    else if (aliases.get(normalized)?.id !== exercise.id) aliases.set(normalized, null);
  };

  exercises.forEach(exercise => {
    exact.set(key(exercise.nome), exercise);
    addAlias(exercise.substituiNome, exercise);
    addAlias(exercise.nomeAlternativo, exercise);
    addAlias(exercise.exercicioBase, exercise);
  });
  return { exact, aliases };
}

function enrichExercise(exercise, indexes) {
  if (!exercise || typeof exercise !== 'object') return exercise;
  const normalized = key(exercise.exercicio || exercise.nome);
  const catalog = indexes.exact.get(normalized) || indexes.aliases.get(normalized);
  if (!catalog) return exercise;
  return {
    ...exercise,
    imagemUrl: exercise.imagemUrl || exercise.imageUrl || exercise.imagemInicioUrl || catalog.urlImagemInicial || catalog.urlImagem || '',
    imagemInicioUrl: exercise.imagemInicioUrl || exercise.urlImagemInicial || exercise.imagemUrl || exercise.imageUrl || catalog.urlImagemInicial || catalog.urlImagem || '',
    imagemFinalUrl: exercise.imagemFinalUrl || exercise.urlImagemFinal || catalog.urlImagemFinal || '',
    linkVideo: exercise.linkVideo || exercise.videoUrl || catalog.urlVideo || '',
    instrucoes: exercise.instrucoes || catalog.instrucoes || '',
    contraindicacoes: exercise.contraindicacoes || catalog.contraindicacoes || '',
    grupoMuscular: exercise.grupoMuscular || catalog.grupoMuscular || '',
    equipamento: exercise.equipamento || catalog.equipamento || '',
    padraoMovimento: exercise.padraoMovimento || catalog.padraoMovimento || '',
    musculosPrincipais: Array.isArray(exercise.musculosPrincipais) && exercise.musculosPrincipais.length
      ? exercise.musculosPrincipais
      : catalog.musculosPrincipais || [],
    musculosSecundarios: Array.isArray(exercise.musculosSecundarios) && exercise.musculosSecundarios.length
      ? exercise.musculosSecundarios
      : catalog.musculosSecundarios || []
  };
}

/** Adds safe catalogue media and coaching details to plans returned by Apps Script. */
export function enrichPortalPlans(payload, custom = []) {
  if (!payload || !Array.isArray(payload.planosCliente)) return payload;
  const indexes = exerciseIndex(custom);
  return {
    ...payload,
    planosCliente: payload.planosCliente.map(plan => ({
      ...plan,
      treinos: Array.isArray(plan.treinos) ? plan.treinos.map(workout => ({
        ...workout,
        exercicios: Array.isArray(workout.exercicios)
          ? workout.exercicios.map(exercise => enrichExercise(exercise, indexes))
          : []
      })) : []
    }))
  };
}
