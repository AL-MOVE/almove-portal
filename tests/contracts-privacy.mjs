import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [backend, signingPage] = await Promise.all([
  readFile(new URL('../apps-script/Code.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps-script/Assinar.html', import.meta.url), 'utf8')
]);

assert.doesNotMatch(backend, /pdfFile\.setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK/, 'Um contrato novo nunca pode ficar público por link.');
assert.match(backend, /pdfFile\.setSharing\(DriveApp\.Access\.PRIVATE, DriveApp\.Permission\.VIEW\)/, 'Contratos novos devem ser privados.');
assert.match(backend, /function protegerContratosExistentes_\(\)/, 'Tem de existir uma migração manual para revogar links antigos.');
assert.match(backend, /function protegerContratosExistentes\(\) \{\s*return protegerContratosExistentes_\(\);\s*\}/, 'O editor Apps Script precisa de uma função pública para executar a migração.');
assert.match(backend, /Proteção de contratos concluída/, 'A migração deve deixar uma contagem verificável no registo de execução.');
assert.doesNotMatch(signingPage, /href="<\?= contratoUrl \?>"/, 'A página pública de assinatura não pode expor o link Drive.');
assert.match(signingPage, /PDF do contrato foi enviado em anexo/, 'A assinatura deve indicar onde o cliente encontra o contrato.');

console.log('Privacidade dos contratos validada.');
