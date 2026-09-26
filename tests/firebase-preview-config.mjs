import assert from 'node:assert/strict';
import fs from 'node:fs';

const endpoint = fs.readFileSync(new URL('../api/firebase-config.js', import.meta.url), 'utf8');
const browser = fs.readFileSync(new URL('../js/firebase-config.js', import.meta.url), 'utf8');

assert.match(endpoint, /FIREBASE_WEB_CONFIG_JSON/);
assert.match(endpoint, /CAMPOS_PUBLICOS/);
assert.doesNotMatch(endpoint, /private_key|client_email|service_account/i, 'O endpoint não pode expor campos administrativos.');
assert.match(browser, /DOMINIOS_PRODUCAO/);
assert.match(browser, /'portal\.almove\.pt'/);
assert.match(browser, /'crm\.almove\.pt'/);
assert.match(browser, /'coach\.almove\.pt'/);
assert.match(browser, /DOMINIOS_PRODUCAO\.has\(location\.hostname\)/);
assert.match(browser, /CONFIGURACAO_FIREBASE_EM_FALTA/);
console.log('Configuração Firebase de pré-visualização validada.');
