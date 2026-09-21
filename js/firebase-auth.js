/*
 * Adaptador Firebase Auth. Não é carregado pelo portal enquanto a migração
 * estiver em piloto; por isso não altera o acesso atual por link de email.
 */
(function (global) {
  let auth = null;
  let sdk = null;
  let pronto = null;
  const CHAVE_TOKEN_SESSAO = 'almove.crm.id-token';

  function lerTokenSessao() {
    try { return global.sessionStorage.getItem(CHAVE_TOKEN_SESSAO) || ''; } catch { return ''; }
  }

  function guardarTokenSessao(valor) {
    try {
      if (valor) global.sessionStorage.setItem(CHAVE_TOKEN_SESSAO, valor);
      else global.sessionStorage.removeItem(CHAVE_TOKEN_SESSAO);
    } catch { /* O login normal continua quando o navegador não permite sessionStorage. */ }
  }

  async function configurar(configuracao, aoMudar) {
    if (pronto) return pronto.then(function () { return auth && auth.currentUser ? auth.currentUser : null; });
    if (!configuracao || !configuracao.apiKey || !configuracao.authDomain || !configuracao.projectId) {
      throw new Error('CONFIGURACAO_FIREBASE_EM_FALTA');
    }
    pronto = Promise.resolve().then(function () {
      sdk = global.ALMOVE_FIREBASE_SDK;
      if (!sdk || !sdk.initializeApp || !sdk.getAuth) throw new Error('FIREBASE_SDK_EM_FALTA');
      const app = sdk.getApps().length ? sdk.getApp() : sdk.initializeApp(configuracao);
      auth = sdk.getAuth(app);
      return sdk.setPersistence(auth, sdk.browserLocalPersistence).then(function () {
        return new Promise(function (resolver) {
          sdk.onAuthStateChanged(auth, function (utilizador) {
            if (typeof aoMudar === 'function') aoMudar(utilizador || null);
            resolver(utilizador || null);
          });
        });
      });
    });
    return pronto;
  }

  function exigirAuth() {
    if (!auth || !sdk) throw new Error('FIREBASE_NAO_INICIALIZADO');
  }

  async function token(atualizar) {
    exigirAuth();
    if (!auth.currentUser) return lerTokenSessao();
    const atual = await auth.currentUser.getIdToken(Boolean(atualizar));
    guardarTokenSessao(atual);
    return atual;
  }

  async function entrar(email, palavraPasse) {
    exigirAuth();
    const resultado = await sdk.signInWithEmailAndPassword(auth, String(email || '').trim(), String(palavraPasse || ''));
    return resultado.user;
  }

  async function criarConta(email, palavraPasse) {
    exigirAuth();
    const resultado = await sdk.createUserWithEmailAndPassword(auth, String(email || '').trim(), String(palavraPasse || ''));
    await sdk.sendEmailVerification(resultado.user);
    return resultado.user;
  }

  async function enviarRecuperacao(email, continuarUrl) {
    exigirAuth();
    const opcoes = continuarUrl ? { url: continuarUrl, handleCodeInApp: false } : undefined;
    return sdk.sendPasswordResetEmail(auth, String(email || '').trim(), opcoes);
  }

  async function reenviarConfirmacao(continuarUrl) {
    exigirAuth();
    if (!auth.currentUser) throw new Error('FIREBASE_SESSAO_AUSENTE');
    const opcoes = continuarUrl ? { url: continuarUrl, handleCodeInApp: false } : undefined;
    return sdk.sendEmailVerification(auth.currentUser, opcoes);
  }

  async function sair() {
    exigirAuth();
    guardarTokenSessao('');
    return sdk.signOut(auth);
  }

  global.AlMoveFirebaseAuth = {
    configurar: configurar,
    entrar: entrar,
    criarConta: criarConta,
    enviarRecuperacao: enviarRecuperacao,
    reenviarConfirmacao: reenviarConfirmacao,
    sair: sair,
    token: token,
    utilizador: function () { return auth && auth.currentUser ? auth.currentUser : null; },
    pronto: function () { return pronto || Promise.reject(new Error('FIREBASE_NAO_INICIALIZADO')); }
  };
})(window);
