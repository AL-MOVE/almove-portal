import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/coach-bootstrap.js', import.meta.url), 'utf8');

assert.match(source, /COACH_BOOTSTRAP_SECRET/, 'A provisão temporária deve exigir um segredo.');
assert.match(source, /COACH_BOOTSTRAP_EMAIL/, 'A provisão deve estar limitada a uma só conta.');
assert.match(source, /roles: \['coach', 'admin'\]/, 'A conta criada deve receber acesso ao CRM.');
assert.match(source, /requestType: 'PASSWORD_RESET'/, 'A provisão deve pedir o email de palavra-passe ao Firebase.');
assert.match(source, /continueUrl: DESTINO_CRM/, 'O email deve regressar ao CRM.');

console.log('Provisão temporária de coach validada.');
