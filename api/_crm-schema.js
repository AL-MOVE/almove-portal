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
    nif: texto(dados.nif, 32),
    servicoAtual: texto(dados.servicoAtual, 120),
    precoPersonalizado: numero(dados.precoPersonalizado),
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
