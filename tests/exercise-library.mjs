import assert from 'node:assert/strict';
import { BASE_EXERCISE_LIBRARY, mergeExerciseLibrary } from '../server/dev-crm/exercise-library.js';

assert.equal(BASE_EXERCISE_LIBRARY.length, 898, 'O catálogo deve conter todos os exercícios ativos do Excel AL MOVE.');
assert.equal(new Set(BASE_EXERCISE_LIBRARY.map(item => item.id)).size, BASE_EXERCISE_LIBRARY.length, 'Os IDs do catálogo devem ser únicos.');
assert.equal(new Set(BASE_EXERCISE_LIBRARY.map(item => item.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT'))).size, BASE_EXERCISE_LIBRARY.length, 'Os nomes do catálogo devem ser únicos.');
assert.ok(BASE_EXERCISE_LIBRARY.every(item => item.ativo), 'O catálogo publicado só deve conter exercícios ativos.');

const catalogExercise = BASE_EXERCISE_LIBRARY.find(item => item.id === 'EX0001');
assert.equal(catalogExercise?.nomeAlternativo, 'Cable Lateral Raise 45°');
assert.equal(catalogExercise?.exercicioBase, 'Elevação Lateral');
assert.equal(catalogExercise?.nivel, 'Intermédio');
assert.equal(catalogExercise?.categoriaTreino, 'Hipertrofia');
assert.ok(catalogExercise?.instrucoes);
assert.ok(catalogExercise?.contraindicacoes);

const merged = mergeExerciseLibrary({
  migrated: [
    { nome: 'Agachamento com Barra' },
    { nome: 'Exercício Migrado Único' }
  ],
  custom: [
    { id: 'custom-squat', nome: 'agachamento com barra', grupoMuscular: 'Personalizado', equipamento: 'Rack' },
    { id: 'custom-cable-lateral-raise', nome: catalogExercise.nome, grupoMuscular: 'Ombro personalizado' },
    { id: 'custom-special', nome: 'Exercício Personalizado', padraoMovimento: 'Teste', classificacao: 'Secundário', metricaPrincipal: 'Tempo', musculosPrincipais: ['Glúteo máximo', 'Quadríceps'], musculosSecundarios: 'Gémeos, Core', instrucoes: 'Manter o tronco estável.' }
  ]
});

assert.equal(merged.filter(item => item.nome.toLocaleLowerCase('pt-PT') === 'agachamento com barra').length, 1);
assert.equal(merged.find(item => item.id === 'custom-squat')?.grupoMuscular, 'Personalizado');
assert.equal(merged.find(item => item.id === 'custom-squat')?.equipamento, 'Rack');
assert.equal(merged.find(item => item.id === 'custom-cable-lateral-raise')?.nomeAlternativo, catalogExercise.nomeAlternativo, 'Os metadados do catálogo devem sobreviver à personalização parcial.');
assert.equal(merged.find(item => item.id === 'custom-cable-lateral-raise')?.nivel, catalogExercise.nivel);
assert.ok(merged.some(item => item.nome === 'Exercício Migrado Único'));
assert.ok(merged.some(item => item.nome === 'Exercício Personalizado'));
assert.deepEqual(merged.find(item => item.id === 'custom-special')?.musculosPrincipais, ['Glúteo máximo', 'Quadríceps']);
assert.deepEqual(merged.find(item => item.id === 'custom-special')?.musculosSecundarios, ['Gémeos', 'Core']);
assert.equal(merged.find(item => item.id === 'custom-special')?.instrucoes, 'Manter o tronco estável.');
assert.equal(merged.find(item => item.id === 'custom-special')?.classificacao, 'Secundário');
assert.equal(merged.find(item => item.id === 'custom-special')?.metricaPrincipal, 'Tempo');
assert.deepEqual(merged, merged.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT')));

console.log('Biblioteca global de exercícios validada.');
