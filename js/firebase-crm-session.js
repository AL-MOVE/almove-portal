/* Sessão do CRM: o browser só avança depois de Firebase e Vercel confirmarem
 * uma conta da equipa. A base de dados continua inacessível diretamente. */
(function (global) {
  const DESTINO_PADRAO = '/coach-firebase.html';

  function destinoSeguro(valor) {
    const destino = String(valor || '');
    return /^\/[^/]/.test(destino) ? destino : DESTINO_PADRAO;
  }

  function erro(codigo) {
    const resultado = new Error(codigo);
    resultado.code = codigo;
    return resultado;
  }

  async function obterContexto() {
    const configuracao = await global.ALMOVE_FIREBASE_CONFIG.obter();
    const utilizador = await global.AlMoveFirebaseAuth.configurar(configuracao);
    if (!utilizador) return null;
    if (!utilizador.emailVerified) {
      await global.AlMoveFirebaseAuth.sair();
      throw erro('EMAIL_NAO_CONFIRMADO');
    }

    const token = await global.AlMoveFirebaseAuth.token(true);
    const resposta = await fetch('/api/dev-crm', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      credentials: 'same-origin'
    });
    let dados = null;
    try { dados = await resposta.json(); } catch { throw erro('RESPOSTA_SESSAO_INVALIDA'); }
    if (!resposta.ok || !dados || !dados.ok) throw erro((dados && dados.erro) || 'ACESSO_RECUSADO');
    const roles = Array.isArray(dados.roles) ? dados.roles : [];
    if (!roles.includes('coach') && !roles.includes('admin')) throw erro('ACESSO_SEM_PERMISSAO_CRM');
    return Object.freeze({ email: String(dados.email || utilizador.email || ''), roles: Object.freeze(roles) });
  }

  async function exigirCoach(destino) {
    const contexto = await obterContexto();
    if (contexto) return contexto;
    const proximo = destinoSeguro(destino || global.location.pathname);
    global.location.replace('/dev-crm.html?next=' + encodeURIComponent(proximo));
    return null;
  }

  global.AlMoveSessaoCRM = Object.freeze({
    destinoSeguro: destinoSeguro,
    obterContexto: obterContexto,
    exigirCoach: exigirCoach,
    sair: function () { return global.AlMoveFirebaseAuth.sair(); }
  });
})(window);
