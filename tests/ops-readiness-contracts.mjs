import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [router, ops, google, backup, production, appsScript] = await Promise.all([
  readFile(new URL('../api/dev-crm.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-ops.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/_google-cloud.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/firestore-backups.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/verify-production.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps-script/Code.js', import.meta.url), 'utf8')
]);

assert.match(router, /ops: operacoes/);
assert.match(ops, /obterIdentidadeFirebase/);
assert.match(ops, /exigirEquipa/);
assert.match(ops, /PORTAL_APPS_SCRIPT_HMAC_SECRET/);
assert.match(ops, /phase6-isolation-probe@almove\.invalid/);
assert.match(ops, /hmacVerified/);
assert.match(ops, /clientMappingVerified/);
assert.match(ops, /isolationVerified/);
assert.match(ops, /backupSchedules/);
const successResponse = ops.split('return responder(res, 200, ')[1]?.split(');')[0] || '';
assert.ok(successResponse, 'A resposta operacional de sucesso deve estar definida.');
assert.doesNotMatch(successResponse, /\b(secret|known|unknown|testEmail|identity)\b/, 'A resposta operacional não pode devolver segredos, identidades ou dados usados nas sondas.');
assert.match(successResponse, /checks:/);
assert.match(successResponse, /backups/);
assert.match(google, /RSA-SHA256/);
assert.match(google, /oauth2\.googleapis\.com\/token/);
assert.match(backup, /create-daily/);
assert.match(backup, /dailyRecurrence/);
assert.match(production, /portal\.almove\.pt/);
assert.match(production, /crm\.almove\.pt/);
assert.match(production, /coach\.almove\.pt/);
assert.match(production, /authorizedDomains/);
assert.match(appsScript, /function validarAssertacaoFirebasePortal_/);
assert.match(appsScript, /function diagnosticarHmacFirebasePortal_/);
assert.match(appsScript, /diagnosticarCorrespondenciaEmailPortal_/);
assert.match(appsScript, /'getBootstrapPortal', 'diagnosticarHmacFirebasePortal'/);
assert.doesNotMatch(appsScript.match(/function diagnosticarCorrespondenciaEmailPortal_[\s\S]*?\n}/)?.[0] || '', /setValue|appendRow|setValues/, 'O diagnóstico da correspondência não pode alterar a folha CLIENTES.');

console.log('Diagnósticos operacionais e backups validados por contrato.');
