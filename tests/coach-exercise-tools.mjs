import assert from 'node:assert/strict';

await import('../js/coach-exercise-tools.js');
const tools = globalThis.AlMoveCoachExerciseTools;
const library = [
  { nome: 'Remada com Barra', padraoMovimento: 'Puxar horizontal', grupoMuscular: 'Costas e bíceps', equipamento: 'Barra' },
  { nome: 'Remada Sentada na Polia', padraoMovimento: 'Puxar horizontal', grupoMuscular: 'Costas e bíceps', equipamento: 'Polia' },
  { nome: 'Face Pull', padraoMovimento: 'Puxar horizontal', grupoMuscular: 'Deltoide posterior', equipamento: 'Polia' },
  { nome: 'Supino com Barra', padraoMovimento: 'Empurrar horizontal', grupoMuscular: 'Peitoral e tríceps', equipamento: 'Barra' }
];

assert.equal(tools.normalize(' FORÇA '), 'forca');
assert.equal(tools.search(library, 'remada')[0].nome, 'Remada com Barra');
assert.equal(tools.search(library, 'polia').length, 2);
assert.deepEqual(tools.search(library, 'r'), []);
assert.deepEqual(tools.suggest(library, 'Remada com Barra', '', 5).map(item => item.nome), ['Remada Sentada na Polia', 'Face Pull']);
assert.deepEqual(tools.suggest(library, 'Exercício desconhecido', '', 5), []);

delete globalThis.AlMoveCoachExerciseTools;
console.log('Pesquisa e sugestões de exercícios validadas.');
