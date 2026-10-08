function texto(valor, maximo = 1000) {
  return String(valor == null ? '' : valor).trim().slice(0, maximo);
}

function chave(valor) {
  return texto(valor, 200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/\s+/g, ' ');
}

function dataIso(valor) {
  if (valor && typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : valor.toISOString();
  const bruto = texto(valor, 64);
  if (!bruto) return '';
  const data = new Date(bruto.length === 10 ? bruto + 'T12:00:00Z' : bruto);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

function dataValidade(valor) {
  const bruto = texto(valor, 32);
  return /^\d{4}-\d{2}-\d{2}/.test(bruto) ? bruto.slice(0, 10) : '';
}

function dataHojeLisboa(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(agora);
  const parte = tipo => partes.find(item => item.type === tipo)?.value || '';
  return parte('year') + '-' + parte('month') + '-' + parte('day');
}

function visivelNoPortal(item) {
  return texto(item?.visibilidade, 16).toUpperCase() !== 'PT';
}

function exercicioPortal(item) {
  return {
    exercicio: texto(item.exercicio, 200),
    series: item.series == null ? '' : String(item.series),
    repsMin: item.repsMin == null ? '' : String(item.repsMin),
    repsMax: item.repsMax == null ? '' : String(item.repsMax),
    rir: item.rir == null ? '' : String(item.rir),
    notas: texto(item.notas, 1500),
    instrucoes: texto(item.instrucoes, 2000),
    imagemUrl: texto(item.urlImagemInicial || item.urlImagem, 1000),
    imagemInicioUrl: texto(item.urlImagemInicial || item.urlImagem, 1000),
    imagemFinalUrl: texto(item.urlImagemFinal, 1000),
    linkVideo: texto(item.urlVideo, 1000),
    tipoPrescricao: texto(item.tipoPrescricao, 16).toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS',
    descansoSegundos: String(item.descansoSegundos || 60),
    aquecimento: item.aquecimento === true || String(item.aquecimento).toLowerCase() === 'true',
    grupoSuperserie: texto(item.grupoSuperserie, 20).toUpperCase()
  };
}

/** Converte as linhas do Firestore no contrato já consumido pelo Portal. */
export function construirPlanosPortalFirestore(linhas, clienteId, agora = new Date()) {
  const planos = new Map();
  (Array.isArray(linhas) ? linhas : [])
    .filter(item => texto(item?.idCliente, 128) === texto(clienteId, 128) && item?.nomePlano && item?.nomeTreino && item?.exercicio && visivelNoPortal(item))
    .forEach(item => {
      const nomePlano = texto(item.nomePlano, 200);
      const nomeTreino = texto(item.nomeTreino, 200);
      const chavePlano = chave(nomePlano);
      const chaveTreino = chave(nomeTreino);
      if (!planos.has(chavePlano)) planos.set(chavePlano, {
        nome: nomePlano, atualizadoEm: '', validoAte: '', expirado: false, treinos: new Map()
      });
      const plano = planos.get(chavePlano);
      const atualizacao = dataIso(item.atualizadoEm);
      if (atualizacao > plano.atualizadoEm) plano.atualizadoEm = atualizacao;
      if (!plano.validoAte) plano.validoAte = dataValidade(item.validade);
      if (!plano.treinos.has(chaveTreino)) plano.treinos.set(chaveTreino, { nome: nomeTreino, linhas: [] });
      plano.treinos.get(chaveTreino).linhas.push(item);
    });

  const hoje = dataHojeLisboa(agora);
  return [...planos.values()].map(plano => ({
    nome: plano.nome,
    atualizadoEm: plano.atualizadoEm,
    validoAte: plano.validoAte,
    expirado: Boolean(plano.validoAte && plano.validoAte < hoje),
    treinos: [...plano.treinos.values()].map(treino => ({
      nome: treino.nome,
      exercicios: treino.linhas
        .slice()
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
        .map(exercicioPortal),
      feitoAntes: false,
      diasDesde: null,
      dataRealizacao: ''
    }))
  })).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm) || a.nome.localeCompare(b.nome, 'pt-PT'));
}

/**
 * O Firestore é a fonte atual de prescrição. A folha antiga mantém planos que
 * ainda não foram migrados e o estado de realização dos treinos.
 */
export function combinarPlanosPortal(planosAntigos, planosFirestore) {
  const resultado = new Map();
  (Array.isArray(planosAntigos) ? planosAntigos : []).forEach(plano => resultado.set(chave(plano?.nome), plano));

  (Array.isArray(planosFirestore) ? planosFirestore : []).forEach(planoNovo => {
    const planoAntigo = resultado.get(chave(planoNovo.nome));
    const estadoTreinos = new Map((Array.isArray(planoAntigo?.treinos) ? planoAntigo.treinos : []).map(treino => [chave(treino?.nome), treino]));
    resultado.set(chave(planoNovo.nome), {
      ...planoNovo,
      treinos: planoNovo.treinos.map(treino => {
        const anterior = estadoTreinos.get(chave(treino.nome));
        return anterior ? {
          ...treino,
          feitoAntes: anterior.feitoAntes === true,
          diasDesde: anterior.diasDesde == null ? null : anterior.diasDesde,
          dataRealizacao: texto(anterior.dataRealizacao, 32)
        } : treino;
      })
    });
  });

  return [...resultado.values()].sort((a, b) => dataIso(b?.atualizadoEm).localeCompare(dataIso(a?.atualizadoEm)) || texto(a?.nome).localeCompare(texto(b?.nome), 'pt-PT'));
}

export function aplicarPlanosPortal(payload, planosFirestore) {
  if (!payload || typeof payload !== 'object') return payload;
  const planosCliente = combinarPlanosPortal(payload.planosCliente, planosFirestore);
  return {
    ...payload,
    temPlanos: planosCliente.length > 0,
    planosCliente,
    planoAtivoNome: planosCliente[0]?.nome || ''
  };
}

export function clienteAtivoComEmail(dados) {
  const estado = texto(dados?.estado || dados?.status, 40).toLowerCase();
  return dados?.ativo !== false && !['inativo', 'inactive', 'arquivado', 'archived'].includes(estado);
}

export function emailNormalizado(valor) {
  return texto(valor, 254).toLowerCase();
}
