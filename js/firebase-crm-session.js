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

  function esperar(milisegundos) {
    return new Promise(function (resolver) { global.setTimeout(resolver, milisegundos); });
  }

  function podeRepetir(resposta) {
    return resposta && [429, 500, 502, 503, 504].includes(Number(resposta.status));
  }

  async function pedidoComRetentativa(url, opcoes, configuracao) {
    const definicoes = configuracao || {};
    const pedido = opcoes || {};
    const metodo = String(pedido.method || 'GET').toUpperCase();
    const idempotente = metodo === 'GET' || metodo === 'HEAD' || Boolean(definicoes.permitirEscrita);
    const total = idempotente ? 3 : 1;
    let ultimoErro = null;
    for (let tentativa = 0; tentativa < total; tentativa += 1) {
      try {
        const resposta = await global.fetch(url, pedido);
        if (!podeRepetir(resposta) || tentativa === total - 1) return resposta;
      } catch (erroPedido) {
        ultimoErro = erroPedido;
        if (tentativa === total - 1) throw erroPedido;
      }
      await esperar(tentativa === 0 ? 350 : 900);
    }
    throw ultimoErro || erro('SERVICO_TEMPORARIAMENTE_INDISPONIVEL');
  }

  async function obterContexto() {
    const configuracao = await global.ALMOVE_FIREBASE_CONFIG.obter();
    const utilizador = await global.AlMoveFirebaseAuth.configurar(configuracao);
    if (utilizador && !utilizador.emailVerified) {
      await global.AlMoveFirebaseAuth.sair();
      throw erro('EMAIL_NAO_CONFIRMADO');
    }

    const token = await global.AlMoveFirebaseAuth.token(true);
    const resposta = await pedidoComRetentativa('/api/dev-crm', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
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

  async function criarSessaoServidor() {
    const token = await global.AlMoveFirebaseAuth.token(true);
    if (!token) throw erro('FIREBASE_TOKEN_INVALIDO');
    const resposta = await pedidoComRetentativa('/api/dev-crm-session', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, credentials: 'same-origin', cache: 'no-store'
    }, { permitirEscrita: true });
    if (!resposta.ok) {
      let dados = null; try { dados = await resposta.json(); } catch { /* resposta inválida */ }
      throw erro((dados && dados.erro) || 'SESSAO_NAO_CRIADA');
    }
  }

  async function sair() {
    try { await fetch('/api/dev-crm-session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }); }
    finally { return global.AlMoveFirebaseAuth.sair(); }
  }

  global.AlMoveSessaoCRM = Object.freeze({
    destinoSeguro: destinoSeguro,
    obterContexto: obterContexto,
    exigirCoach: exigirCoach,
    criarSessaoServidor: criarSessaoServidor,
    pedido: pedidoComRetentativa,
    sair: sair
  });
})(window);
