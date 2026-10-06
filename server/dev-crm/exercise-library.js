import { ALMOVE_EXERCISE_CATALOG } from './exercise-catalog-almove.js';

export const BASE_EXERCISE_LIBRARY = ALMOVE_EXERCISE_CATALOG;

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
  const muscleList = value => (Array.isArray(value) ? value : String(value || '').split(/[,;]/))
    .map(item => String(item || '').trim().slice(0, 80)).filter(Boolean).slice(0, 12);
  const string = (field, maximum = 100) => String(source[field] || '').trim().slice(0, maximum);
  return {
    id: string('id'),
    nome: String(source.nome || source.exercicio || '').trim().slice(0, 200),
    substituiNome: string('substituiNome', 200),
    nomeAlternativo: string('nomeAlternativo', 200),
    exercicioBase: string('exercicioBase', 200),
    variacao: string('variacao', 300),
    padraoMovimento: string('padraoMovimento'),
    grupoMuscular: string('grupoMuscular'),
    equipamento: string('equipamento'),
    classificacao: string('classificacao'),
    metricaPrincipal: string('metricaPrincipal'),
    musculosPrincipais: muscleList(source.musculosPrincipais),
    musculosSecundarios: muscleList(source.musculosSecundarios),
    cadeiaCinetica: string('cadeiaCinetica'),
    tipoContracao: string('tipoContracao'),
    lateralidade: string('lateralidade'),
    nivel: string('nivel'),
    planoMovimento: string('planoMovimento'),
    categoriaTreino: string('categoriaTreino'),
    urlImagem: string('urlImagem', 1000),
    urlImagemInicial: string('urlImagemInicial', 1000) || string('urlImagem', 1000),
    urlImagemFinal: string('urlImagemFinal', 1000),
    urlVideo: string('urlVideo', 1000),
    instrucoes: string('instrucoes', 2000),
    contraindicacoes: string('contraindicacoes', 2000),
    ativo: source.ativo !== false && String(source.ativo).toLowerCase() !== 'false',
    origem: string('origem')
  };
}

export function mergeExerciseLibrary({ base = BASE_EXERCISE_LIBRARY, migrated = [], custom = [] } = {}) {
  const merged = new Map();
  const add = (raw, overwriteMetadata) => {
    const source = typeof raw === 'string' ? { nome: raw } : (raw || {});
    const item = clean(raw);
    const normalized = key(item.nome);
    if (!normalized) return;
    const current = merged.get(normalized);
    if (!current) {
      merged.set(normalized, { ...item, id: item.id || idFromName(item.nome) });
      return;
    }
    const provided = field => Object.prototype.hasOwnProperty.call(source, field);
    const value = field => (overwriteMetadata && provided(field)) ? item[field] : (current[field] || item[field]);
    const list = field => (overwriteMetadata && provided(field)) ? item[field] : (current[field] || item[field]);
    merged.set(normalized, {
      id: (overwriteMetadata && item.id) || current.id || item.id || idFromName(item.nome),
      nome: (overwriteMetadata && item.nome) || current.nome,
      substituiNome: value('substituiNome'),
      nomeAlternativo: value('nomeAlternativo'),
      exercicioBase: value('exercicioBase'),
      variacao: value('variacao'),
      padraoMovimento: value('padraoMovimento'),
      grupoMuscular: value('grupoMuscular'),
      equipamento: value('equipamento'),
      classificacao: value('classificacao'),
      metricaPrincipal: value('metricaPrincipal'),
      musculosPrincipais: list('musculosPrincipais'),
      musculosSecundarios: list('musculosSecundarios'),
      cadeiaCinetica: value('cadeiaCinetica'),
      tipoContracao: value('tipoContracao'),
      lateralidade: value('lateralidade'),
      nivel: value('nivel'),
      planoMovimento: value('planoMovimento'),
      categoriaTreino: value('categoriaTreino'),
      urlImagem: value('urlImagem'),
      urlImagemInicial: value('urlImagemInicial'),
      urlImagemFinal: value('urlImagemFinal'),
      urlVideo: value('urlVideo'),
      instrucoes: value('instrucoes'),
      contraindicacoes: value('contraindicacoes'),
      ativo: overwriteMetadata ? item.ativo : current.ativo !== false && item.ativo !== false,
      origem: value('origem')
    });
  };

  base.forEach(item => add(item, false));
  migrated.forEach(item => add(item, false));
  custom.forEach(raw => {
    const item = clean(raw);
    const previous = key(item.substituiNome);
    const current = key(item.nome);
    if (previous && previous !== current) merged.delete(previous);
    add(raw, true);
  });
  return [...merged.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}
