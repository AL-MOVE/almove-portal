/* ============================================================
   PASSO 1 — cola isto no Code.js, por exemplo logo a seguir à
   função servirPortalCliente_ (ou em qualquer sítio ao nível de
   topo, fora de outras funções).
   ============================================================ */

/**
 * Versão "API" do bloco de planos/treinos que já existe dentro de
 * servirPortalCliente_ — em vez de injetar no template HTML, devolve os
 * dados como JSON simples, para a PWA pedir via fetch.
 */
function getPlanoAtivoPortalApi_(token) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('Link inválido.');

  const listaPlanos = (getListaPlanosCliente(info.idCliente).planos || [])
    .filter(p => p.visibilidade !== 'PT');

  const planosCliente = listaPlanos.map(p => {
    const treinos = getTreinosDoPlano(info.idCliente, p.nome).treinos || [];
    const statusTreinos = getStatusTreinosPlano(info.idCliente, p.nome).treinos || [];
    const statusPorNome = {};
    statusTreinos.forEach(s => { statusPorNome[s.nome] = s; });
    const treinosComExercicios = treinos.map(t => {
      const detalhe = getTreinoDetalhe(info.idCliente, p.nome, t.nome);
      const status = statusPorNome[t.nome] || { feitoAntes: false, diasDesde: null };
      return {
        nome: t.nome,
        exercicios: detalhe.exercicios,
        feitoAntes: status.feitoAntes,
        diasDesde: status.diasDesde
      };
    });
    return {
      nome: p.nome,
      atualizadoEm: p.atualizadoEm,
      validoAte: p.validoAte,
      expirado: p.diasRestantes !== null && p.diasRestantes < 0,
      treinos: treinosComExercicios
    };
  });

  const planoAtivoNome = listaPlanos.length > 0
    ? listaPlanos.slice().sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0].nome
    : '';

  return {
    temPlanos: listaPlanos.length > 0,
    planosCliente: planosCliente,
    planoAtivoNome: planoAtivoNome
  };
}

/* ============================================================
   PASSO 2 — substitui o teu bloco API_FUNCOES_PORTAL (o mesmo
   que já editaste nas vezes anteriores) por este, completo.
   ============================================================ */

const API_FUNCOES_PORTAL = {
  getEstadoPortalHoje: function (token) {
    return getEstadoPortalHoje(token);
  },
  registarCheckin: function (token, corpoPost) {
    return registarCheckin(Object.assign({}, corpoPost, { token: token }));
  },
  registarTesteProntidao: function (token, corpoPost) {
    return registarTesteProntidao(Object.assign({}, corpoPost, { token: token }));
  },
  getPlanoAtivoPortal: function (token) {
    return getPlanoAtivoPortalApi_(token);
  },
  getHistoricoExercicio: function (token, corpoPost) {
    return getHistoricoExercicio(token, corpoPost.nomeExercicio, corpoPost.limite || 3);
  },
  registarExecucaoTreino: function (token, corpoPost) {
    return registarExecucaoTreino(Object.assign({}, corpoPost, { token: token }));
  },
  registarPosTreino: function (token, corpoPost) {
    return registarPosTreino(Object.assign({}, corpoPost, { token: token }));
  }
};
