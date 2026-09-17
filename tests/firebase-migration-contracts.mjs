import assert from 'node:assert/strict';
import fs from 'node:fs';

const proxy = fs.readFileSync(new URL('../api/almove.js', import.meta.url), 'utf8');
const firebase = fs.readFileSync(new URL('../api/_firebase.js', import.meta.url), 'utf8');
const appsScript = fs.readFileSync(new URL('../apps-script/Code.js', import.meta.url), 'utf8');
const browserAdapter = fs.readFileSync(new URL('../js/firebase-auth.js', import.meta.url), 'utf8');

assert.match(proxy, /obterAssertacaoFirebasePortal/);
assert.match(firebase, /verifyIdToken\(correspondencia\[1\], true\)/, 'A Vercel tem de verificar tokens revogados.');
assert.match(firebase, /token\.portalRole !== 'client'/, 'Só contas cliente podem entrar no portal.');
assert.match(firebase, /token\.email_verified/, 'O email Firebase tem de ser confirmado.');
assert.match(firebase, /PORTAL_APPS_SCRIPT_HMAC_SECRET/, 'A identidade enviada ao Apps Script tem de ser assinada.');
assert.match(appsScript, /obterClientePorAssertacaoFirebasePortal_/);
assert.match(appsScript, /firebase:/, 'A assertação não pode ser confundida com o token legado.');
assert.match(browserAdapter, /browserLocalPersistence/, 'A sessão Firebase deve sobreviver ao fecho normal da PWA.');
assert.match(browserAdapter, /sendPasswordResetEmail/, 'A recuperação de palavra-passe tem de estar disponível.');
console.log('Contratos de migração Firebase validados.');
