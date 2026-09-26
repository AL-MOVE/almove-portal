import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/assign-coach-role.js', import.meta.url), 'utf8');
assert.match(source, /COACH_ROLE_ASSIGNMENT_SECRET/, 'A atribuição temporária requer segredo.');
assert.match(source, /COACH_ROLE_ASSIGNMENT_EMAIL/, 'A atribuição fica limitada ao email autorizado.');
assert.match(source, /email !== 'martinssony1998@gmail\.com'/, 'O alvo autorizado é fixo.');
assert.match(source, /roles: \['coach', 'admin'\]/, 'A conta recebe as funções autorizadas.');
console.log('Atribuição temporária de funções de coach validada.');
