import assert from 'node:assert/strict';
import fs from 'node:fs';

const codigo = fs.readFileSync(new URL('../apps-script/Code.js', import.meta.url), 'utf8');
const inicio = codigo.indexOf('function auditarProntidaoMigracaoCRM()');
assert.notEqual(inicio, -1, 'A auditoria de migração tem de existir.');
const bloco = codigo.slice(inicio, codigo.indexOf('\nfunction ', inicio + 10));
assert.match(bloco, /getRange\('A4:Y'/);
assert.match(bloco, /prontoParaCopiaTeste/);
assert.doesNotMatch(bloco, /setValue|setValues|appendRow|deleteRow|clear\(/, 'A auditoria não pode alterar dados.');
console.log('Auditoria de migração CRM validada.');
