/*
 * Adaptador Firebase Auth. Não é carregado pelo portal enquanto a migração
 * estiver em piloto; por isso não altera o acesso atual por link de email.
 */
(function (global) {
  let auth = null;
  let sdk = null;
  let pronto = null;

  async function configurar(configuracao, aoMudar) {
    if (pronto) return pronto;
    if (!configuracao || !configuracao.apiKey || !configuracao.authDomain || !configuracao.projectId) {
      throw new Error('CONFIGURACAO_FIREBASE_EM_FALTA');
    }
    pronto = Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')
    ]).then(function (modulos) {
      const appSdk = modulos[0];
      sdk = modulos[1];
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(configuracao);
      auth = sdk.getAuth(app);
      return sdk.setPersistence(auth, sdk.browserLocalPersistence).then(function () {
        sdk.onAuthStateChanged(auth, function (utilizador) {
          if (typeof aoMudar === 'function') aoMudar(utilizador || null);
        });
      });
    });
    return pronto;
  }

  function exigirAuth() {
    if (!auth || !sdk) throw new Error('FIREBASE_NAO_INICIALIZADO');
  }

  async function token() {
    exigirAuth();
    if (!auth.currentUser) return '';
    return auth.currentUser.getIdToken();
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

  async function sair() {
    exigirAuth();
    return sdk.signOut(auth);
  }

  global.AlMoveFirebaseAuth = {
    configurar: configurar,
    entrar: entrar,
    criarConta: criarConta,
    enviarRecuperacao: enviarRecuperacao,
    sair: sair,
    token: token,
    utilizador: function () { return auth && auth.currentUser ? auth.currentUser : null; },
    pronto: function () { return pronto || Promise.reject(new Error('FIREBASE_NAO_INICIALIZADO')); }
  };
})(window);
