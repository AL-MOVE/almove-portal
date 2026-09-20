const ESTADOS_CLIENTE = new Set(['Ativo', 'Pausado', 'Cancelado']);
const ESTADOS_PAGAMENTO = new Set(['Pago', 'Pendente']);

function texto(valor, maximo = 500) {
  return String(valor ?? '').trim().slice(0, maximo);
}
function numero(valor, predefinido = null) {
  if (valor === '' || valor === null || valor === undefined) return predefinido;
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : predefinido;
}
function mesAno(valor) {
  const resultado = texto(valor, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(resultado)) throw new Error('MIGRACAO_MES_INVALIDO');
  return resultado;
}
function mesAnoOpcional(valor) {
  if (valor === '' || valor === null || valor === undefined) return '';
  return mesAno(valor);
}

function dataISO(valor, campo) {
  const resultado = texto(valor, 32);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(resultado)) {
    throw new Error('MIGRACAO_' + campo + '_INVALIDA');
  }
  return resultado;
}

/**
 * Espelho do cliente atual. Não tenta interpretar ou apagar campos do CRM
 * existente; a importação guarda-os com o mesmo ID estável.
 */
export function normalizarClienteLegado(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const id = texto(dados.id, 128);
  const nome = texto(dados.nome, 120);
  if (!id || !nome) throw new Error('MIGRACAO_CLIENTE_INVALIDO');
  const estadoOriginal = texto(dados.estado, 32) || 'Ativo';
  return Object.freeze({
    id,
    nome,
    estado: ESTADOS_CLIENTE.has(estadoOriginal) ? estadoOriginal : 'Pausado',
    contacto: texto(dados.contacto, 64),
    email: texto(dados.email, 254),
    nif: texto(dados.nif, 32),
    morada: texto(dados.morada, 500),
    servicoAtual: texto(dados.servicoAtual, 120),
    precoPersonalizado: numero(dados.precoPersonalizado),
    suspensoMes: mesAnoOpcional(dados.suspensoMes),
    cancelarMes: mesAnoOpcional(dados.cancelarMes),
    contratoFileId: texto(dados.contratoFileId, 256),
    assinaturaAceiteEm: texto(dados.assinaturaAceiteEm, 32),
    diaPagamento: numero(dados.diaPagamento),
    metodoPagamento: texto(dados.metodoPagamento, 80),
    notas: texto(dados.notas, 5000)
  });
}

/** Pack mensal que alimenta dashboard, renovação, recibos e pagamentos. */
export function normalizarPackLegado(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const clientId = texto(dados.idCliente, 128);
  if (!clientId) throw new Error('MIGRACAO_PACK_SEM_CLIENTE');
  const total = numero(dados.sessoesTotal, 0);
  const confirmadas = numero(dados.sessoesConfirmadas, 0);
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(confirmadas) || confirmadas < 0 || confirmadas > total) {
    throw new Error('MIGRACAO_PACK_SESSOES_INVALIDAS');
  }
  const estadoOriginal = texto(dados.estadoPagamento, 32) || 'Pendente';
  return Object.freeze({
    clientId,
    mesAno: mesAno(dados.mesAno),
    frequencia: texto(dados.frequencia, 64),
    sessoesTotal: total,
    sessoesConfirmadas: confirmadas,
    duracaoMinutos: numero(dados.duracaoMinutos, 0),
    estadoPagamento: ESTADOS_PAGAMENTO.has(estadoOriginal) ? estadoOriginal : 'Pendente',
    preco: numero(dados.preco, 0)
  });
}

/** Sessão do CRM preservada com o número e mês originais. */
export function normalizarSessaoLegada(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const clientId = texto(dados.idCliente, 128);
  const numeroSessao = numero(dados.numSessao);
  const estado = texto(dados.estado, 32) || 'Pendente';
  if (!clientId || !Number.isInteger(numeroSessao) || numeroSessao < 1 || !['Pendente', 'Confirmada'].includes(estado)) {
    throw new Error('MIGRACAO_SESSAO_INVALIDA');
  }
  const dataConfirmada = texto(dados.dataConfirmada, 32);
  if (estado === 'Confirmada' && !dataConfirmada) throw new Error('MIGRACAO_SESSAO_SEM_DATA');
  return Object.freeze({
    clientId,
    mesAno: mesAno(dados.mesAno),
    numSessao: numeroSessao,
    estado,
    dataConfirmada: dataConfirmada ? dataISO(dataConfirmada, 'DATA_SESSAO') : ''
  });
}

/** Check-in de bem-estar, sem inferir diagnóstico ou alterar pontuações. */
export function normalizarCheckinLegado(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const clientId = texto(dados.idCliente, 128);
  if (!clientId) throw new Error('MIGRACAO_CHECKIN_SEM_CLIENTE');
  const escala = campo => {
    const valor = numero(dados[campo]);
    const minimo = campo === 'doms' ? 0 : 1;
    const maximo = campo === 'doms' ? 4 : 5;
    if (!Number.isInteger(valor) || valor < minimo || valor > maximo) throw new Error('MIGRACAO_CHECKIN_INVALIDO');
    return valor;
  };
  return Object.freeze({
    clientId,
    dataHora: dataISO(dados.dataHora, 'DATA_CHECKIN'),
    sono: escala('sono'), stress: escala('stress'), cansaco: escala('cansaco'),
    refeicoes: escala('refeicoes'), doms: escala('doms'), nota: texto(dados.nota, 2000)
  });
}

/** Avaliação física: mantém os valores medidos sem os reinterpretar. */
export function normalizarAvaliacaoFisicaLegada(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const clientId = texto(dados.idCliente, 128);
  if (!clientId) throw new Error('MIGRACAO_AVALIACAO_SEM_CLIENTE');
  const medidas = {};
  for (const campo of ['pesoKg', 'alturaCm', 'massaGordaPercent', 'cinturaCm', 'abdomenCm', 'bracoDireitoCm', 'bracoEsquerdoCm', 'pernaDireitaCm', 'pernaEsquerdaCm']) {
    const valor = numero(dados[campo]);
    if (valor !== null && valor < 0) throw new Error('MIGRACAO_AVALIACAO_INVALIDA');
    medidas[campo] = valor;
  }
  return Object.freeze({ clientId, atualizadoEm: dataISO(dados.atualizadoEm, 'DATA_AVALIACAO'), ...medidas });
}
