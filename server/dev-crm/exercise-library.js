const exercise = (nome, padraoMovimento, grupoMuscular, equipamento) => ({
  nome,
  padraoMovimento,
  grupoMuscular,
  equipamento
});

export const BASE_EXERCISE_LIBRARY = Object.freeze([
  exercise('Agachamento com Barra', 'Agachamento', 'Quadríceps e glúteos', 'Barra'),
  exercise('Agachamento Frontal', 'Agachamento', 'Quadríceps e core', 'Barra'),
  exercise('Agachamento Goblet', 'Agachamento', 'Quadríceps e glúteos', 'Halter'),
  exercise('Agachamento Hack', 'Agachamento', 'Quadríceps e glúteos', 'Máquina'),
  exercise('Agachamento Búlgaro', 'Unilateral de joelho', 'Quadríceps e glúteos', 'Peso livre'),
  exercise('Afundo com Halteres', 'Unilateral de joelho', 'Quadríceps e glúteos', 'Halteres'),
  exercise('Afundo Reverso', 'Unilateral de joelho', 'Quadríceps e glúteos', 'Peso livre'),
  exercise('Step-Up', 'Unilateral de joelho', 'Quadríceps e glúteos', 'Caixa'),
  exercise('Leg Press', 'Agachamento', 'Quadríceps e glúteos', 'Máquina'),
  exercise('Extensão de Pernas', 'Extensão do joelho', 'Quadríceps', 'Máquina'),
  exercise('Peso Morto Convencional', 'Hinge', 'Cadeia posterior', 'Barra'),
  exercise('Peso Morto Romeno', 'Hinge', 'Posterior da coxa e glúteos', 'Barra'),
  exercise('Peso Morto Sumo', 'Hinge', 'Glúteos e adutores', 'Barra'),
  exercise('Peso Morto com Trap Bar', 'Hinge', 'Cadeia posterior', 'Trap bar'),
  exercise('Good Morning', 'Hinge', 'Posterior da coxa e glúteos', 'Barra'),
  exercise('Hip Thrust com Barra', 'Extensão da anca', 'Glúteos', 'Barra'),
  exercise('Ponte de Glúteos', 'Extensão da anca', 'Glúteos', 'Peso corporal'),
  exercise('Pull-Through na Polia', 'Hinge', 'Glúteos e posterior da coxa', 'Polia'),
  exercise('Extensão Lombar', 'Extensão da anca', 'Cadeia posterior', 'Banco romano'),
  exercise('Flexão de Pernas Deitado', 'Flexão do joelho', 'Posterior da coxa', 'Máquina'),
  exercise('Flexão de Pernas Sentado', 'Flexão do joelho', 'Posterior da coxa', 'Máquina'),
  exercise('Supino com Barra', 'Empurrar horizontal', 'Peitoral e tríceps', 'Barra'),
  exercise('Supino Inclinado com Barra', 'Empurrar horizontal', 'Peitoral superior e tríceps', 'Barra'),
  exercise('Supino com Halteres', 'Empurrar horizontal', 'Peitoral e tríceps', 'Halteres'),
  exercise('Supino Inclinado com Halteres', 'Empurrar horizontal', 'Peitoral superior e tríceps', 'Halteres'),
  exercise('Chest Press na Máquina', 'Empurrar horizontal', 'Peitoral e tríceps', 'Máquina'),
  exercise('Push-Up', 'Empurrar horizontal', 'Peitoral e tríceps', 'Peso corporal'),
  exercise('Fly na Máquina', 'Adução horizontal', 'Peitoral', 'Máquina'),
  exercise('Crossover na Polia', 'Adução horizontal', 'Peitoral', 'Polia'),
  exercise('Pullover na Polia', 'Extensão do ombro', 'Dorsal e serrátil', 'Polia'),
  exercise('Supino com Bola Medicinal', 'Empurrar horizontal', 'Peitoral e tríceps', 'Bola medicinal'),
  exercise('Pull-Up', 'Puxar vertical', 'Dorsal e bíceps', 'Peso corporal'),
  exercise('Chin-Up', 'Puxar vertical', 'Dorsal e bíceps', 'Peso corporal'),
  exercise('Lat Pulldown Aberto', 'Puxar vertical', 'Dorsal e bíceps', 'Polia'),
  exercise('Lat Pulldown Pegada Neutra', 'Puxar vertical', 'Dorsal e bíceps', 'Polia'),
  exercise('Remada com Apoio no Peito', 'Puxar horizontal', 'Costas e bíceps', 'Máquina'),
  exercise('Remada com Barra', 'Puxar horizontal', 'Costas e bíceps', 'Barra'),
  exercise('Remada com Halter', 'Puxar horizontal', 'Costas e bíceps', 'Halter'),
  exercise('Remada Sentada na Polia', 'Puxar horizontal', 'Costas e bíceps', 'Polia'),
  exercise('Remada com Pega D', 'Puxar horizontal', 'Costas e bíceps', 'Polia'),
  exercise('Remada Horizontal na Máquina', 'Puxar horizontal', 'Costas e bíceps', 'Máquina'),
  exercise('Remada Invertida', 'Puxar horizontal', 'Costas e bíceps', 'Peso corporal'),
  exercise('Press Militar com Barra', 'Empurrar vertical', 'Ombros e tríceps', 'Barra'),
  exercise('Press de Ombros com Halteres', 'Empurrar vertical', 'Ombros e tríceps', 'Halteres'),
  exercise('Press Arnold', 'Empurrar vertical', 'Ombros e tríceps', 'Halteres'),
  exercise('Elevação Lateral com Halteres', 'Abdução do ombro', 'Deltoide lateral', 'Halteres'),
  exercise('Elevação Lateral na Polia', 'Abdução do ombro', 'Deltoide lateral', 'Polia'),
  exercise('Elevação Lateral a 45° na Polia (Cable Lateral Raise 45°)', 'Abdução do ombro', 'Deltoide lateral', 'Polia'),
  exercise('Face Pull', 'Puxar horizontal', 'Deltoide posterior e costas', 'Polia'),
  exercise('Reverse Fly', 'Abdução horizontal', 'Deltoide posterior', 'Máquina'),
  exercise('Remada Alta na Polia', 'Puxar vertical', 'Ombros e trapézio', 'Polia'),
  exercise('Encolhimento de Ombros', 'Elevação escapular', 'Trapézio', 'Halteres'),
  exercise('Bíceps Curl com Barra', 'Flexão do cotovelo', 'Bíceps', 'Barra'),
  exercise('Bíceps Curl Alternado com Halteres', 'Flexão do cotovelo', 'Bíceps', 'Halteres'),
  exercise('Bíceps Hammer Curl', 'Flexão do cotovelo', 'Bíceps e braquial', 'Halteres'),
  exercise('Bíceps Curl Inclinado', 'Flexão do cotovelo', 'Bíceps', 'Halteres'),
  exercise('Bíceps Curl Bayesiano', 'Flexão do cotovelo', 'Bíceps', 'Polia'),
  exercise('Bíceps Curl Scott', 'Flexão do cotovelo', 'Bíceps', 'Banco Scott'),
  exercise('Tríceps Pushdown com Corda', 'Extensão do cotovelo', 'Tríceps', 'Polia'),
  exercise('Tríceps Pushdown com Barra', 'Extensão do cotovelo', 'Tríceps', 'Polia'),
  exercise('Extensão de Tríceps Acima da Cabeça', 'Extensão do cotovelo', 'Tríceps', 'Polia'),
  exercise('Tríceps Francês com Halter', 'Extensão do cotovelo', 'Tríceps', 'Halter'),
  exercise('Fundos em Paralelas', 'Empurrar vertical', 'Tríceps e peitoral', 'Peso corporal'),
  exercise('Press Fechado com Barra', 'Empurrar horizontal', 'Tríceps e peitoral', 'Barra'),
  exercise('Prancha', 'Anti-extensão', 'Core', 'Peso corporal'),
  exercise('Prancha Lateral', 'Anti-flexão lateral', 'Core', 'Peso corporal'),
  exercise('Dead Bug', 'Anti-extensão', 'Core', 'Peso corporal'),
  exercise('Bird Dog', 'Estabilidade', 'Core e glúteos', 'Peso corporal'),
  exercise('Pallof Press', 'Anti-rotação', 'Core', 'Polia'),
  exercise('Crunch na Polia', 'Flexão do tronco', 'Abdominais', 'Polia'),
  exercise('Crunch Declinado', 'Flexão do tronco', 'Abdominais', 'Banco'),
  exercise('Elevação de Pernas Suspenso', 'Flexão da anca', 'Abdominais', 'Barra fixa'),
  exercise('Rollout com Roda Abdominal', 'Anti-extensão', 'Core', 'Roda abdominal'),
  exercise('Woodchopper na Polia', 'Rotação', 'Core', 'Polia'),
  exercise('Farmer Walk', 'Transporte', 'Core e preensão', 'Halteres'),
  exercise('Gémeos em Pé', 'Flexão plantar', 'Gémeos', 'Máquina'),
  exercise('Gémeos Sentado', 'Flexão plantar', 'Gémeos', 'Máquina'),
  exercise('Abdução da Anca na Máquina', 'Abdução da anca', 'Glúteo médio', 'Máquina'),
  exercise('Adução da Anca na Máquina', 'Adução da anca', 'Adutores', 'Máquina'),
  exercise('Monster Walk com Banda', 'Abdução da anca', 'Glúteo médio', 'Banda elástica'),
  exercise('Kettlebell Swing', 'Hinge', 'Cadeia posterior', 'Kettlebell'),
  exercise('Sled Push', 'Locomoção', 'Corpo inteiro', 'Trenó'),
  exercise('Battle Ropes', 'Condicionamento', 'Corpo inteiro', 'Cordas'),
  exercise('Bicicleta Ergométrica', 'Condicionamento', 'Cardiorrespiratório', 'Bicicleta'),
  exercise('Remo Ergómetro', 'Condicionamento', 'Corpo inteiro', 'Ergómetro')
]);

function key(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT');
}

function idFromName(value) {
  return key(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'exercicio';
}

function clean(item) {
  const source = typeof item === 'string' ? { nome: item } : (item || {});
  const muscleList = value => (Array.isArray(value) ? value : String(value || '').split(','))
    .map(item => String(item || '').trim().slice(0, 80)).filter(Boolean).slice(0, 12);
  return {
    id: String(source.id || '').trim(),
    nome: String(source.nome || source.exercicio || '').trim().slice(0, 200),
    padraoMovimento: String(source.padraoMovimento || '').trim().slice(0, 100),
    grupoMuscular: String(source.grupoMuscular || '').trim().slice(0, 100),
    equipamento: String(source.equipamento || '').trim().slice(0, 100),
    musculosPrincipais: muscleList(source.musculosPrincipais),
    musculosSecundarios: muscleList(source.musculosSecundarios),
    instrucoes: String(source.instrucoes || '').trim().slice(0, 2000)
  };
}

export function mergeExerciseLibrary({ base = BASE_EXERCISE_LIBRARY, migrated = [], custom = [] } = {}) {
  const merged = new Map();
  const add = (raw, overwriteMetadata) => {
    const item = clean(raw);
    const normalized = key(item.nome);
    if (!normalized) return;
    const current = merged.get(normalized);
    if (!current) {
      merged.set(normalized, { ...item, id: item.id || idFromName(item.nome) });
      return;
    }
    merged.set(normalized, {
      id: (overwriteMetadata && item.id) || current.id || item.id || idFromName(item.nome),
      nome: (overwriteMetadata && item.nome) || current.nome,
      padraoMovimento: (overwriteMetadata && item.padraoMovimento) || current.padraoMovimento || item.padraoMovimento,
      grupoMuscular: (overwriteMetadata && item.grupoMuscular) || current.grupoMuscular || item.grupoMuscular,
      equipamento: (overwriteMetadata && item.equipamento) || current.equipamento || item.equipamento,
      musculosPrincipais: (overwriteMetadata && item.musculosPrincipais.length ? item.musculosPrincipais : null) || current.musculosPrincipais || item.musculosPrincipais,
      musculosSecundarios: (overwriteMetadata && item.musculosSecundarios.length ? item.musculosSecundarios : null) || current.musculosSecundarios || item.musculosSecundarios,
      instrucoes: (overwriteMetadata && item.instrucoes) || current.instrucoes || item.instrucoes
    });
  };

  base.forEach(item => add(item, false));
  migrated.forEach(item => add(item, false));
  custom.forEach(item => add(item, true));
  return [...merged.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}
