import assert from 'node:assert/strict';
import fs from 'node:fs';

const proxy = fs.readFileSync(new URL('../api/almove.js', import.meta.url), 'utf8');
const firebase = fs.readFileSync(new URL('../api/_firebase.js', import.meta.url), 'utf8');
const appsScript = fs.readFileSync(new URL('../apps-script/Code.js', import.meta.url), 'utf8');
const browserAdapter = fs.readFileSync(new URL('../js/firebase-auth.js', import.meta.url), 'utf8');
const browserConfig = fs.readFileSync(new URL('../js/firebase-config.js', import.meta.url), 'utf8');
const browserSdk = fs.readFileSync(new URL('../js/firebase-sdk.js', import.meta.url), 'utf8');

assert.match(proxy, /obterAssertacaoFirebasePortal/);
assert.match(firebase, /verifyIdToken\(correspondencia\[1\], true\)/, 'A Vercel tem de verificar tokens revogados.');
assert.match(firebase, /token\.email_verified/, 'O email Firebase tem de ser confirmado.');
assert.match(firebase, /PORTAL_APPS_SCRIPT_HMAC_SECRET/, 'A identidade enviada ao Apps Script tem de ser assinada.');
assert.match(appsScript, /obterClientePorAssertacaoFirebasePortal_/);
assert.match(appsScript, /obterClientePorEmailPortal_\(email\)/, 'O email Firebase deve corresponder a um único cliente CRM.');
assert.match(appsScript, /firebase:/, 'A assertação não pode ser confundida com o token legado.');
assert.match(browserAdapter, /browserLocalPersistence/, 'A sessão Firebase deve sobreviver ao fecho normal da PWA.');
assert.match(browserAdapter, /sendPasswordResetEmail/, 'A recuperação de palavra-passe tem de estar disponível.');
assert.match(browserAdapter, /sendEmailVerification/, 'A confirmação do email tem de poder ser reenviada.');
assert.match(browserSdk, /ALMOVE_FIREBASE_SDK/, 'O SDK Firebase deve ser servido localmente pelo portal.');
assert.doesNotMatch(browserAdapter, /www\.gstatic\.com/, 'O adaptador não deve depender de imports externos no browser.');
assert.match(browserConfig, /projectId: 'almove-portal'/, 'A app deve apontar para o projeto Firebase correto.');
assert.doesNotMatch(browserConfig, /measurementId|getAnalytics/, 'O portal não deve carregar Analytics para autenticação.');
console.log('Contratos de migração Firebase validados.');
