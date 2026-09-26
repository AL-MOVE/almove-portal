import assert from 'node:assert/strict';
import fs from 'node:fs';
import { obterAmbienteCrm } from '../api/_crm-environment.js';

assert.deepEqual(obterAmbienteCrm({}), { ambiente: 'development', projetoPermitido: 'almove-portal-dev' });
assert.deepEqual(obterAmbienteCrm({ ALMOVE_CRM_ENV: 'development', ALMOVE_CRM_PROJECT_ID: 'outro' }), { ambiente: 'development', projetoPermitido: 'almove-portal-dev' });
assert.deepEqual(obterAmbienteCrm({ ALMOVE_CRM_ENV: 'production' }), { ambiente: 'production', projetoPermitido: '' });
assert.deepEqual(obterAmbienteCrm({ ALMOVE_CRM_ENV: 'production', ALMOVE_CRM_PROJECT_ID: 'almove-portal' }), { ambiente: 'production', projetoPermitido: 'almove-portal' });
assert.deepEqual(obterAmbienteCrm({ ALMOVE_CRM_ENV: 'preview', ALMOVE_CRM_PROJECT_ID: 'qualquer' }), { ambiente: '', projetoPermitido: '' });
const endpoints = fs.readdirSync(new URL('../server/dev-crm/', import.meta.url)).filter(nome => /^dev-crm-.*\.js$/.test(nome));
for (const endpoint of endpoints) {
  const codigo = fs.readFileSync(new URL('../server/dev-crm/' + endpoint, import.meta.url), 'utf8');
  assert.match(codigo, /crmFirebasePermitido/, endpoint + ' tem de validar o projeto Firebase permitido.');
}
console.log('Contratos de ambiente CRM validados.');
