import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validarRegistoSerie } from '../api/_firestore.js';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const validada = validarRegistoSerie({
  requestId: 'event-1', sessionId: 'session-1', planExerciseId: 'exercise-1',
  setNumber: 1, repetitions: 10, loadKg: 42.5, rir: 2
});

assert.deepEqual(validada, {
  requestId: 'event-1', sessionId: 'session-1', planExerciseId: 'exercise-1',
  setNumber: 1, repetitions: 10, loadKg: 42.5, rir: 2
});
assert.throws(() => validarRegistoSerie({}), /DADOS_INVALIDOS_REQUEST_ID/);
assert.throws(() => validarRegistoSerie({ requestId: 'a', sessionId: 'b', planExerciseId: 'c', setNumber: 21, repetitions: 1 }), /DADOS_INVALIDOS_SET_NUMBER/);
assert.match(rules, /allow read, write: if false;/, 'O browser não pode aceder diretamente ao Firestore.');

console.log('Fundação Firestore sem custo validada.');
