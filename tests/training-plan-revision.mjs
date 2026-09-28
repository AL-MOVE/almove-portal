import assert from 'node:assert/strict';
import { trainingPlanRevision } from '../server/dev-crm/training-plan-revision.js';

const legacy = [
  { ordem: 2, exercicio: 'Remada', series: 3, repsMin: 8, repsMax: 12 },
  { ordem: 1, exercicio: 'Agachamento', series: 4, repsMin: 6, repsMax: 8 }
];
const sameLegacyDifferentOrder = [legacy[1], legacy[0]];

assert.match(trainingPlanRevision(legacy), /^legacy-[a-f0-9]{40}$/);
assert.equal(trainingPlanRevision(legacy), trainingPlanRevision(sameLegacyDifferentOrder));
assert.notEqual(trainingPlanRevision(legacy), trainingPlanRevision([{ ...legacy[0], series: 4 }, legacy[1]]));
assert.equal(trainingPlanRevision([{ atualizadoEm: '2026-09-01T10:00:00.000Z' }, { atualizadoEm: '2026-09-02T10:00:00.000Z' }]), '2026-09-02T10:00:00.000Z');
assert.equal(trainingPlanRevision([]), '');

console.log('Revisões de planos validadas.');
