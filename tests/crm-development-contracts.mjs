import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exigirEquipa, validarNovoCliente } from '../api/_crm-development.js';

assert.deepEqual(validarNovoCliente({ nome: 'Cliente Teste', email: ' TESTE@EXEMPLO.PT ', telefone: '912345678' }), {
  nome: 'Cliente Teste', email: 'teste@exemplo.pt', telefone: '912345678'
});
assert.throws(() => validarNovoCliente({ nome: 'A', email: 'invalido' }), /CLIENTE_INVALIDO_EMAIL/);
assert.throws(() => exigirEquipa({ roles: ['client'] }), /ACESSO_SEM_PERMISSAO_CRM/);
assert.equal(exigirEquipa({ roles: ['coach'] }).roles[0], 'coach');
const endpoint = fs.readFileSync(new URL('../server/dev-crm/dev-crm-clients.js', import.meta.url), 'utf8');
const actions = fs.readFileSync(new URL('../server/dev-crm/dev-crm-client-actions.js', import.meta.url), 'utf8');
const coach = fs.readFileSync(new URL('../coach.html', import.meta.url), 'utf8');
assert.match(endpoint, /crmFirebasePermitido\(\)/);
assert.match(endpoint, /FieldValue\.serverTimestamp/);
assert.match(endpoint, /criarRepositorioClientes/);
assert.match(actions, /set-all-sessions-state/);
assert.match(actions, /development\.sessions\.confirmed-all/);
assert.match(coach, /\/api\/dev-crm-clients/);
assert.match(coach, /ALMOVE_FIREBASE_CONFIG\.obter/);
assert.match(coach, /Área do professor/);
console.log('Contratos CRM Development validados.');
