const DEFAULT_ROWS = [
  ['1x30', 'PT - 1x30 min', 'pt', 'Personal Training', 4, 30, 79, 60],
  ['2x30', 'PT - 2x30 min', 'pt', 'Personal Training', 8, 30, 159, 60],
  ['3x30', 'PT - 3x30 min', 'pt', 'Personal Training', 12, 30, 215, 60],
  ['1x45', 'PT - 1x45 min', 'pt', 'Personal Training', 4, 45, 119, 60],
  ['2x45', 'PT - 2x45 min', 'pt', 'Personal Training', 8, 45, 225, 60],
  ['3x45', 'PT - 3x45 min', 'pt', 'Personal Training', 12, 45, 315, 60],
  ['1x60', 'PT - 1x60 min', 'pt', 'Personal Training', 4, 60, 149, 60],
  ['2x60', 'PT - 2x60 min', 'pt', 'Personal Training', 8, 60, 285, 60],
  ['3x60', 'PT - 3x60 min', 'pt', 'Personal Training', 12, 60, 415, 60]
];

const SPECIAL_PACKAGE_CODES = new Set(['basic', 'standard', 'plus-1', 'plus-2', 'plus-max', 'plus1', 'plus2', 'plusmax']);

export const DEFAULT_SERVICE_CATALOG = Object.freeze(DEFAULT_ROWS.map(([codigo, nome, categoria, descricao, sessoesPorMes, duracaoMinutos, preco, validadeDias], ordem) => Object.freeze({
  id: codigo,
  codigo,
  nome,
  categoria,
  descricao,
  sessoesPorMes,
  duracaoMinutos,
  preco,
  validadeDias,
  ativo: true,
  ordem
})));

function texto(valor, maximo) {
  return String(valor ?? '').trim().slice(0, maximo);
}

function inteiro(valor, minimo, maximo, erro) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) throw new Error(erro);
  return numero;
}

function preco(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 100000) throw new Error('PRECO_SERVICO_INVALIDO');
  return Math.round(numero * 100) / 100;
}

function idSeguro(valor, codigo) {
  const id = texto(valor, 80) || codigo;
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id)) throw new Error('ID_SERVICO_INVALIDO');
  return id;
}

export function normalizeService(input = {}, ordem = 0) {
  const codigo = texto(input.codigo, 32);
  const nome = texto(input.nome, 120);
  if (!codigo || !/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(codigo)) throw new Error('CODIGO_SERVICO_INVALIDO');
  if (!nome) throw new Error('NOME_SERVICO_INVALIDO');
  const categoriaRecebida = texto(input.categoria, 20).toLowerCase();
  const categoria = SPECIAL_PACKAGE_CODES.has(codigo.toLowerCase()) || ['digital', 'pacote_especial'].includes(categoriaRecebida)
    ? 'pacote_especial'
    : (['pt', 'outro'].includes(categoriaRecebida) ? categoriaRecebida : (/^pt\b/i.test(nome) ? 'pt' : 'outro'));
  return {
    id: idSeguro(input.id, codigo),
    codigo,
    nome,
    categoria,
    descricao: texto(input.descricao, 250),
    sessoesPorMes: inteiro(input.sessoesPorMes ?? (Number(input.sessoesPorSemana) * 4), 0, 100, 'SESSOES_SERVICO_INVALIDAS'),
    duracaoMinutos: inteiro(input.duracaoMinutos, 0, 300, 'DURACAO_SERVICO_INVALIDA'),
    preco: preco(input.preco),
    validadeDias: inteiro(input.validadeDias ?? 60, 1, 730, 'VALIDADE_SERVICO_INVALIDA'),
    ativo: input.ativo !== false,
    ordem: Number.isInteger(Number(input.ordem)) ? Number(input.ordem) : ordem
  };
}

export function normalizeServiceCatalog(input) {
  const origem = Array.isArray(input) ? input : input?.servicos;
  const rows = Array.isArray(origem) && origem.length ? origem : DEFAULT_SERVICE_CATALOG;
  if (rows.length > 100) throw new Error('DEMASIADOS_SERVICOS');
  const servicos = rows.map(normalizeService).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-PT'));
  const ids = new Set();
  const codigos = new Set();
  for (const servico of servicos) {
    const id = servico.id.toLowerCase();
    const codigo = servico.codigo.toLowerCase();
    if (ids.has(id)) throw new Error('ID_SERVICO_DUPLICADO');
    if (codigos.has(codigo)) throw new Error('CODIGO_SERVICO_DUPLICADO');
    ids.add(id);
    codigos.add(codigo);
  }
  return servicos;
}

export function serviceByCode(catalogo, codigo, { permitirInativo = false } = {}) {
  const chave = texto(codigo, 32).toLowerCase();
  const servico = normalizeServiceCatalog(catalogo).find(item => item.codigo.toLowerCase() === chave);
  if (!servico || (!permitirInativo && !servico.ativo)) throw new Error('SERVICO_INDISPONIVEL');
  if (servico.categoria === 'pacote_especial' && !permitirInativo) throw new Error('SERVICO_RESERVADO_PACOTE_ESPECIAL');
  return servico;
}

export function frequencyFromServiceName(nome) {
  return texto(nome, 120).match(/(\d+x\d+)/i)?.[1] || '';
}

export function priceForService({ catalogo, codigo, cliente = {}, packsAnteriores = [], permitirLegado = true, permitirServicoInativo = false }) {
  const servico = serviceByCode(catalogo, codigo, { permitirInativo: permitirServicoInativo });
  const personalizado = cliente.precoPersonalizado === '' || cliente.precoPersonalizado == null ? null : Number(cliente.precoPersonalizado);
  const codigoPersonalizado = texto(cliente.precoPersonalizadoServico, 32);
  if (Number.isFinite(personalizado) && codigoPersonalizado === servico.codigo) {
    return { preco: Math.round(personalizado * 100) / 100, origem: 'personalizado', servico };
  }
  if (servico.preco !== null) return { preco: servico.preco, origem: 'catalogo', servico };
  if (permitirLegado) {
    const anterior = packsAnteriores
      .filter(pack => texto(pack.frequencia, 32) === servico.codigo && Number.isFinite(Number(pack.preco)))
      .sort((a, b) => String(b.mesAno || '').localeCompare(String(a.mesAno || '')))[0];
    if (anterior) return { preco: Math.round(Number(anterior.preco) * 100) / 100, origem: 'historico-mesma-frequencia', servico };
  }
  throw new Error('SERVICO_SEM_PRECO');
}

export function packShapeForService(servico) {
  return {
    frequencia: servico.codigo,
    sessoesTotal: servico.sessoesPorMes,
    duracaoMinutos: servico.duracaoMinutos,
    servicoId: servico.id,
    servicoNome: servico.nome
  };
}

export async function loadServiceCatalog(db) {
  const snapshot = await db.collection('crmDevelopmentSettings').doc('service-catalog').get();
  const dados = snapshot.exists ? snapshot.data() : {};
  return {
    servicos: normalizeServiceCatalog(dados?.servicos),
    revision: Number.isInteger(Number(dados?.revision)) ? Number(dados.revision) : 0,
    configured: snapshot.exists
  };
}
