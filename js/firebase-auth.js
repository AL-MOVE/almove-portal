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

  // O Firebase devolve códigos seguros para mostrar ao utilizador, mas o
  // portal não deve tratar uma configuração em falta como palavra-passe
  // errada. Mantemos os erros de credenciais indistintos para não confirmar
  // se um email tem ou não conta.
  function codigoErro(erro) {
    return String((erro && erro.code) || '').trim().toLowerCase();
  }

  function mensagemErroEntrada(erro) {
    switch (codigoErro(erro)) {
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Email ou palavra-passe inválidos. Se necessário, recupera a palavra-passe.';
      case 'auth/user-disabled':
        return 'Esta conta não pode entrar neste momento. Contacta o teu treinador.';
      case 'auth/operation-not-allowed':
        return 'O acesso por email e palavra-passe ainda não está ativo. Contacta o teu treinador.';
      case 'auth/invalid-api-key':
      case 'auth/app-not-authorized':
      case 'auth/unauthorized-domain':
        return 'A configuração de acesso do portal ainda não está concluída. Contacta o teu treinador.';
      case 'auth/network-request-failed':
        return 'Não foi possível contactar o Firebase. Confirma a ligação à internet e tenta novamente.';
      case 'auth/too-many-requests':
        return 'O Firebase bloqueou temporariamente novas tentativas neste dispositivo. Aguarda alguns minutos antes de voltares a tentar.';
      default:
        return 'Não foi possível entrar agora. Tenta novamente dentro de momentos.';
    }
  }

  function mensagemErroRecuperacao(erro) {
    switch (codigoErro(erro)) {
      case 'auth/invalid-email':
        return 'Confirma o email antes de pedir a recuperação.';
      case 'auth/operation-not-allowed':
        return 'A recuperação por email ainda não está ativa. Contacta o teu treinador.';
      case 'auth/unauthorized-continue-uri':
      case 'auth/invalid-continue-uri':
      case 'auth/unauthorized-domain':
        return 'A configuração de recuperação do portal ainda não está concluída. Contacta o teu treinador.';
      case 'auth/network-request-failed':
        return 'Não foi possível contactar o Firebase. Confirma a ligação à internet e tenta novamente.';
      case 'auth/too-many-requests':
        return 'O Firebase bloqueou temporariamente novos pedidos neste dispositivo. Aguarda alguns minutos antes de voltares a tentar.';
      default:
        return 'Não foi possível pedir a recuperação agora. Tenta novamente dentro de momentos.';
    }
  }

  global.AlMoveFirebaseAuth = {
    configurar: configurar,
    entrar: entrar,
    criarConta: criarConta,
    enviarRecuperacao: enviarRecuperacao,
    reenviarConfirmacao: reenviarConfirmacao,
    sair: sair,
    token: token,
    mensagemErroEntrada: mensagemErroEntrada,
    mensagemErroRecuperacao: mensagemErroRecuperacao,
    utilizador: function () { return auth && auth.currentUser ? auth.currentUser : null; },
    pronto: function () { return pronto || Promise.reject(new Error('FIREBASE_NAO_INICIALIZADO')); }
  };
})(window);
