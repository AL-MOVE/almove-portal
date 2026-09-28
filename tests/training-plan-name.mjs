import assert from 'node:assert/strict';
import { normalizeTrainingPlanName, sameTrainingPlanName } from '../server/dev-crm/training-plan-name.js';

assert.equal(normalizeTrainingPlanName('  Hipertrofia Outubro  '), 'hipertrofia outubro');
assert.equal(normalizeTrainingPlanName('FORÇA'), 'forca');
assert.equal(sameTrainingPlanName('Força', ' forca '), true);
assert.equal(sameTrainingPlanName('Plano A', 'Plano B'), false);
assert.equal(sameTrainingPlanName('', ''), false);

console.log('Nomes de planos normalizados e comparados.');
