import assert from 'node:assert/strict';
import { BASE_EXERCISE_LIBRARY, mergeExerciseLibrary } from '../server/dev-crm/exercise-library.js';

assert.ok(BASE_EXERCISE_LIBRARY.length >= 80, 'A biblioteca base deve ser suficientemente abrangente.');

const merged = mergeExerciseLibrary({
  migrated: [
    { nome: 'Agachamento com Barra' },
    { nome: 'Exercício Migrado Único' }
  ],
  custom: [
    { id: 'custom-squat', nome: 'agachamento com barra', grupoMuscular: 'Personalizado', equipamento: 'Rack' },
    { id: 'custom-special', nome: 'Exercício Personalizado', padraoMovimento: 'Teste' }
  ]
});

assert.equal(merged.filter(item => item.nome.toLocaleLowerCase('pt-PT') === 'agachamento com barra').length, 1);
assert.equal(merged.find(item => item.id === 'custom-squat')?.grupoMuscular, 'Personalizado');
assert.equal(merged.find(item => item.id === 'custom-squat')?.equipamento, 'Rack');
assert.ok(merged.some(item => item.nome === 'Exercício Migrado Único'));
assert.ok(merged.some(item => item.nome === 'Exercício Personalizado'));
assert.deepEqual(merged, merged.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT')));

console.log('Biblioteca global de exercícios validada.');
