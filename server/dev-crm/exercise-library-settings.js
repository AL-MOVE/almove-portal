const DEFAULTS = Object.freeze({
  gruposMusculares: ['Corpo inteiro', 'Core', 'Costas', 'Glúteos', 'Ombros', 'Peito', 'Pernas', 'Braços'],
  padroesMovimento: ['Agachar', 'Empurrar horizontal', 'Empurrar vertical', 'Extensão da anca', 'Isolamento', 'Locomoção', 'Puxar horizontal', 'Puxar vertical', 'Rotação', 'Transportar'],
  equipamentos: ['Barra', 'Banco', 'Bola medicinal', 'Cabo/Polia', 'Elástico', 'Halteres', 'Máquina', 'Peso corporal', 'Rack', 'TRX'],
  musculos: ['Abdominais', 'Adutores', 'Bíceps', 'Deltoide anterior', 'Deltoide lateral', 'Deltoide posterior', 'Eretores da coluna', 'Gémeos', 'Glúteo máximo', 'Glúteo médio', 'Grande dorsal', 'Isquiotibiais', 'Oblíquos', 'Peitoral maior', 'Quadríceps', 'Romboides', 'Serrátil anterior', 'Trapézio', 'Tríceps'],
  classificacoes: ['Principal', 'Secundário', 'Acessório', 'Aquecimento', 'Mobilidade', 'Cardio', 'Recuperação'],
  metricas: ['Carga e repetições', 'Repetições', 'Tempo', 'Distância', 'Calorias', 'Cadência', 'Velocidade', 'Potência', 'Altura']
});

function key(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT');
}

function list(value, fallback = []) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  const unique = new Map();
  values.forEach(item => {
    const clean = String(item || '').trim().slice(0, 100);
    if (clean && !unique.has(key(clean))) unique.set(key(clean), clean);
  });
  const result = [...unique.values()];
  return (result.length ? result : fallback).slice(0, 200).sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

export function normalizeExerciseLibrarySettings(data = {}) {
  return {
    gruposMusculares: list(data.gruposMusculares, DEFAULTS.gruposMusculares),
    padroesMovimento: list(data.padroesMovimento, DEFAULTS.padroesMovimento),
    equipamentos: list(data.equipamentos, DEFAULTS.equipamentos),
    musculos: list(data.musculos, DEFAULTS.musculos),
    classificacoes: list(data.classificacoes, DEFAULTS.classificacoes),
    metricas: list(data.metricas, DEFAULTS.metricas)
  };
}

export function buildExerciseLibraryOptions(exercises = [], settings = {}) {
  const config = normalizeExerciseLibrarySettings(settings);
  const merge = (configured, values) => list([...configured, ...values], configured);
  return {
    gruposMusculares: merge(config.gruposMusculares, exercises.map(item => item.grupoMuscular)),
    padroesMovimento: merge(config.padroesMovimento, exercises.map(item => item.padraoMovimento)),
    equipamentos: merge(config.equipamentos, exercises.map(item => item.equipamento)),
    musculos: merge(config.musculos, exercises.flatMap(item => [...(item.musculosPrincipais || []), ...(item.musculosSecundarios || [])])),
    classificacoes: merge(config.classificacoes, exercises.map(item => item.classificacao)),
    metricas: merge(config.metricas, exercises.map(item => item.metricaPrincipal))
  };
}

export { DEFAULTS as DEFAULT_EXERCISE_LIBRARY_SETTINGS };
