/* ============================================================
   PASSO 1 — cola isto no Code.js, por exemplo logo a seguir à
   função getPlanoAtivoPortalApi_ (ou em qualquer sítio ao nível
   de topo, fora de outras funções).
   ============================================================ */

/**
 * Resumo para o ecrã "Início" do Portal: calendário da semana atual
 * (que dias já têm treino registado), quantos treinos já foram feitos
 * esta semana em relação ao plano ativo, e a sequência de semanas
 * seguidas com pelo menos um treino (streak).
 *
 * Usa a mesma folha EXECUCOES que já alimenta o histórico de
 * exercícios e o relatório mensal — não cria nem depende de nenhuma
 * folha nova.
 */
function getResumoInicioPortal_(idCliente) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioSemana = getMondayDaSemana_(hoje);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 7);

  const diasComTreinoSet = {};   // 'YYYY-MM-DD' -> true, dentro da semana atual
  const diasComTreinoTodos = []; // todas as datas (Date), para calcular o streak

  const execucoes = obterOuCriarSheetExecucoes_();
  if (execucoes.getLastRow() >= 2) {
    execucoes.getRange('A2:D' + execucoes.getLastRow()).getValues().forEach(row => {
      if (!row[0] || String(row[0]) !== String(idCliente) || !row[3]) return;
      const data = new Date(row[3]);
      data.setHours(0, 0, 0, 0);
      diasComTreinoTodos.push(data);
      if (data >= inicioSemana && data < fimSemana) {
        diasComTreinoSet[dataISOPortal_(data)] = true;
      }
    });
  }

  const diasSemana = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    diasSemana.push({
      dataISO: dataISOPortal_(dia),
      diaMes: dia.getDate(),
      feito: !!diasComTreinoSet[dataISOPortal_(dia)],
      hoje: dataISOPortal_(dia) === dataISOPortal_(hoje)
    });
  }

  const treinosFeitosSemana = Object.keys(diasComTreinoSet).length;

  // Quantos treinos diferentes tem o plano ativo (para "1 de 3 treinos").
  let treinosNoPlanoSemana = 0;
  try {
    const listaPlanos = (getListaPlanosCliente(idCliente).planos || []).filter(p => p.visibilidade !== 'PT');
    if (listaPlanos.length > 0) {
      const planoAtivo = listaPlanos.slice().sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0];
      treinosNoPlanoSemana = (getTreinosDoPlano(idCliente, planoAtivo.nome).treinos || []).length;
    }
  } catch (e) {
    treinosNoPlanoSemana = 0;
  }

  const datasOrdenadas = diasComTreinoTodos.sort((a, b) => a - b);

  return {
    diasSemana: diasSemana,
    treinosFeitosSemana: treinosFeitosSemana,
    treinosNoPlanoSemana: treinosNoPlanoSemana,
    streakSemanas: calcularStreakSemanas_(datasOrdenadas)
  };
}

/* ============================================================
   PASSO 2 — acrescenta esta linha dentro do objeto
   API_FUNCOES_PORTAL que já tens no Code.js (junto às outras
   entradas como getEstadoPortalHoje, registarCheckin, etc.):
   ============================================================

  getResumoInicioPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    const resumo = getResumoInicioPortal_(info.idCliente);
    resumo.primeiroNome = String(info.nome || '').trim().split(' ')[0] || '';
    return resumo;
  },

   ============================================================ */
