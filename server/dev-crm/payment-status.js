function mesAnterior(mesAno) {
  const [ano, mes] = String(mesAno).split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 2, 1));
  return data.getUTCFullYear() + '-' + String(data.getUTCMonth() + 1).padStart(2, '0');
}

function diaNoMes(mesAno, dia) {
  const [ano, mes] = String(mesAno).split('-').map(Number);
  return Math.min(Number(dia), new Date(Date.UTC(ano, mes, 0)).getUTCDate());
}

function hojeEmLisboa() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((resultado, parte) => {
    resultado[parte.type] = parte.value;
    return resultado;
  }, {});

  return new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), 12));
}

export function pagamentoEstaConfirmado(valor) {
  return String(valor || '').trim().toLocaleLowerCase('pt-PT') === 'pago';
}

function prioridadePack(pack) {
  const criadoNoDevelopment = String(pack?.origem || '') === 'firebase-development' ? 4 : 0;
  const pago = pagamentoEstaConfirmado(pack?.estadoPagamento) ? 2 : 0;
  const atualizado = pack?.updatedAt || pack?.createdAt || null;
  const instante = atualizado && typeof atualizado.toMillis === 'function' ? atualizado.toMillis() : Number(new Date(atualizado || 0)) || 0;
  const linhaOrigem = Number(pack?.migration?.sourceRow ?? pack?.fonteLinha ?? 0) || 0;
  return [criadoNoDevelopment, pago, instante, linhaOrigem, String(pack?.id || '')];
}

function packTemPrioridade(pack, referencia) {
  const [origemPack, pagoPack, dataPack, linhaPack, idPack] = prioridadePack(pack);
  const [origemReferencia, pagoReferencia, dataReferencia, linhaReferencia, idReferencia] = prioridadePack(referencia);
  if (origemPack !== origemReferencia) return origemPack > origemReferencia;
  if (pagoPack !== pagoReferencia) return pagoPack > pagoReferencia;
  if (dataPack !== dataReferencia) return dataPack > dataReferencia;
  if (linhaPack !== linhaReferencia) return linhaPack > linhaReferencia;
  return idPack > idReferencia;
}

/**
 * A aplicação trabalha com um pack ativo por cliente e por mês. Uma cópia
 * legada pode trazer linhas repetidas; neste caso a alteração feita no
 * Development prevalece e, entre espelhos do mesmo tipo, um pagamento já
 * confirmado prevalece sobre um pendente.
 */
export function consolidarPacksMensais(packs = []) {
  const porClienteMes = new Map();
  packs.forEach(pack => {
    if (!pack?.clientId || !pack?.mesAno) return;
    const chave = String(pack.clientId) + '|' + String(pack.mesAno);
    const existente = porClienteMes.get(chave);
    if (!existente || packTemPrioridade(pack, existente)) porClienteMes.set(chave, pack);
  });
  return Array.from(porClienteMes.values());
}

/**
 * Um atraso só existe quando há um dia de cobrança definido e esse dia já
 * passou. Um pack apenas marcado como Pendente continua visível na receita
 * pendente, mas não é indevidamente apresentado como pagamento em atraso.
 */
export function calcularPagamentosEmAtraso({ clientes = [], packs = [], mesAno, hoje } = {}) {
  const dataHoje = hoje instanceof Date && !Number.isNaN(hoje.valueOf()) ? hoje : hojeEmLisboa();
  const anoAtual = dataHoje.getFullYear();
  const mesAtualNumero = dataHoje.getMonth() + 1;
  const mesReferenciaAtual = String(mesAno || '').match(/^\d{4}-(0[1-9]|1[0-2])$/) ? mesAno : anoAtual + '-' + String(mesAtualNumero).padStart(2, '0');
  const mesAnteriorReferencia = mesAnterior(mesReferenciaAtual);
  const packsPorClienteMes = new Map();

  consolidarPacksMensais(packs).forEach(pack => {
    const chave = String(pack.clientId || '') + '|' + String(pack.mesAno || '');
    if (!pack.clientId || (pack.mesAno !== mesReferenciaAtual && pack.mesAno !== mesAnteriorReferencia)) return;
    packsPorClienteMes.set(chave, pack);
  });

  return clientes.reduce((lista, cliente) => {
    if (cliente.estado !== 'Ativo') return lista;
    const diaPagamento = Number(cliente.diaPagamento);
    if (!Number.isInteger(diaPagamento) || diaPagamento < 1 || diaPagamento > 31) return lista;

    const packAtual = packsPorClienteMes.get(String(cliente.id) + '|' + mesReferenciaAtual);
    const packAnterior = packsPorClienteMes.get(String(cliente.id) + '|' + mesAnteriorReferencia);
    const pack = packAtual || packAnterior;
    if (!pack || pagamentoEstaConfirmado(pack.estadoPagamento)) return lista;

    const referenciaDoPack = pack.mesAno;
    const [anoPack, mesPack] = referenciaDoPack.split('-').map(Number);
    const vencimento = diaNoMes(referenciaDoPack, diaPagamento);
    const jaPassouVencimento = anoPack < anoAtual || (anoPack === anoAtual && mesPack < mesAtualNumero) || (anoPack === anoAtual && mesPack === mesAtualNumero && dataHoje.getDate() > vencimento);
    if (!jaPassouVencimento) return lista;

    lista.push({
      idCliente: cliente.id,
      nome: cliente.nome || cliente.id,
      valorEmAtraso: Number(pack.preco || 0),
      mesesEmAtraso: referenciaDoPack === mesReferenciaAtual ? 1 : 2,
      mesReferencia: referenciaDoPack,
      diaPagamento
    });
    return lista;
  }, []);
}
