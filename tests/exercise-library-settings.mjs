import assert from 'node:assert/strict';
import { buildExerciseLibraryOptions, normalizeExerciseLibrarySettings } from '../server/dev-crm/exercise-library-settings.js';

const settings = normalizeExerciseLibrarySettings({
  gruposMusculares: ['Costas', 'costas', 'Peito'],
  classificacoes: ['Principal', 'Secundário'],
  metricas: ['Carga e repetições', 'Tempo']
});

assert.deepEqual(settings.gruposMusculares, ['Costas', 'Peito']);
assert.ok(settings.equipamentos.length > 0);
assert.ok(settings.musculos.includes('Grande dorsal'));

const options = buildExerciseLibraryOptions([
  { grupoMuscular: 'Braços', padraoMovimento: 'Flexão do cotovelo', equipamento: 'Polia alta', classificacao: 'Acessório', metricaPrincipal: 'Cadência', musculosPrincipais: ['Braquial'], musculosSecundarios: ['Bíceps'] }
], settings);

assert.ok(options.gruposMusculares.includes('Braços'));
assert.ok(options.padroesMovimento.includes('Flexão do cotovelo'));
assert.ok(options.equipamentos.includes('Polia alta'));
assert.ok(options.classificacoes.includes('Acessório'));
assert.ok(options.metricas.includes('Cadência'));
assert.ok(options.musculos.includes('Braquial'));
assert.equal(options.gruposMusculares.filter(item => item.toLocaleLowerCase('pt-PT') === 'costas').length, 1);

console.log('Definições configuráveis da biblioteca validadas.');
