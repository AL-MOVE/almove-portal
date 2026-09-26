import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/firebase-auth.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'firebase-auth.js' });
const auth = context.window.AlMoveFirebaseAuth;

assert.match(auth.mensagemErroEntrada({ code: 'auth/invalid-credential' }), /Email ou palavra-passe inválidos/);
assert.match(auth.mensagemErroEntrada({ code: 'auth/operation-not-allowed' }), /email e palavra-passe ainda não está ativo/);
assert.match(auth.mensagemErroEntrada(new Error('FIREBASE_NAO_CONFIGURADO')), /configuração de acesso/);
assert.match(auth.mensagemErroEntrada({ code: 'auth/invalid-email' }), /formato do email/);
assert.doesNotMatch(auth.mensagemErroEntrada({ code: 'auth/invalid-credential' }), /conta não pode entrar/);
assert.match(auth.mensagemErroRecuperacao({ code: 'auth/unauthorized-continue-uri' }), /configuração de recuperação/);
assert.match(auth.mensagemErroRecuperacao({ code: 'auth/network-request-failed' }), /ligação à internet/);
assert.match(auth.mensagemErroRecuperacao(new Error('CONFIGURACAO_FIREBASE_EM_FALTA')), /configuração de recuperação/);
assert.match(auth.mensagemErroRecuperacao({ code: 'auth/user-not-found' }), /Não foi possível pedir a recuperação/);

console.log('Mensagens de erro Firebase validadas.');
