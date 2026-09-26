import assert from 'node:assert/strict';
import fs from 'node:fs';

const crm = fs.readFileSync(new URL('../dev-crm.html', import.meta.url), 'utf8');

assert.match(crm, /A enviar a ligação de recuperação…/, 'A recuperação deve comunicar progresso imediatamente.');
assert.match(crm, /mensagemErroRecuperacao\(erro\)/, 'O CRM deve mostrar a causa de falhas de recuperação.');
assert.match(crm, /Se esta conta existir, receberás uma ligação/, 'A recuperação não pode revelar se um email tem conta.');
assert.match(crm, /recuperar\.setAttribute\('aria-busy', 'true'\)/, 'O link deve impedir pedidos repetidos durante o envio.');
assert.match(crm, /Cloud Datastore User/, 'O CRM deve explicar o bloqueio de permissão Firestore.');
assert.match(crm, /FIRESTORE_INDISPONIVEL/, 'O CRM deve reconhecer a falha de Firestore.');

console.log('Feedback de recuperação do CRM validado.');
