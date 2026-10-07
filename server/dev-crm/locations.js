const TIPOS_LOCAL = new Set(['presencial', 'online']);

function mesLisboa() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return partes.find(parte => parte.type === 'year').value + '-' + partes.find(parte => parte.type === 'month').value;
}

function mesAnterior(mes) {
  const [ano, numeroMes] = String(mes).split('-').map(Number);
  const data = new Date(Date.UTC(ano, numeroMes - 2, 1));
  return data.getUTCFullYear() + '-' + String(data.getUTCMonth() + 1).padStart(2, '0');
}

function texto(valor, maximo = 120) { return String(valor ?? '').trim().slice(0, maximo); }
function falha(codigo) { const erro = new Error(codigo); erro.code = codigo; return erro; }
function slug(valor) {
  return texto(valor, 120).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}
function valorEuro(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 100000) throw falha('LOCAL_RENDA_INVALIDA');
  return Math.round(numero * 100) / 100;
}
function periodoRenda(entrada = {}) {
  const inicio = texto(entrada.inicio, 7);
  const fim = texto(entrada.fim, 7);
  const valor = valorEuro(entrada.valor);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(inicio) || (fim && !/^\d{4}-(0[1-9]|1[0-2])$/.test(fim)) || (fim && fim < inicio)) throw falha('LOCAL_RENDA_PERIODO_INVALIDO');
  return { valor, inicio, fim };
}

export function locaisPadrao(mes = mesLisboa()) {
  return [
    { id: 'lfitness', nome: 'LFitness', tipo: 'presencial', rendaMensal: 375, rendaHistorico: [{ valor: 375, inicio: mes, fim: '' }], ativo: true, ordem: 0 },
    { id: 'pn-gym', nome: 'PN Gym', tipo: 'presencial', rendaMensal: 0, rendaHistorico: [], ativo: true, ordem: 1 },
    { id: 'online', nome: 'Online', tipo: 'online', rendaMensal: 0, rendaHistorico: [], ativo: true, ordem: 2 }
  ];
}

export function normalizarLocais(entrada, { mes = mesLisboa(), anteriores = [] } = {}) {
  if (!Array.isArray(entrada) || entrada.length > 50) throw falha('LOCAIS_INVALIDOS');
  const anterioresPorId = new Map((anteriores || []).map(item => [String(item.id), item]));
  const ids = new Set(); const nomes = new Set();
  const locais = entrada.map((item, ordem) => {
    const nome = texto(item?.nome, 120);
    const id = texto(item?.id, 80) || slug(nome);
    const tipo = TIPOS_LOCAL.has(String(item?.tipo || '')) ? String(item.tipo) : 'presencial';
    const ativo = item?.ativo !== false;
    const rendaMensal = tipo === 'online' ? 0 : valorEuro(item?.rendaMensal || 0);
    if (!nome || !id || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw falha('LOCAL_INVALIDO');
    if (ids.has(id)) throw falha('LOCAL_ID_DUPLICADO');
    const chaveNome = nome.toLocaleLowerCase('pt-PT');
    if (nomes.has(chaveNome)) throw falha('LOCAL_NOME_DUPLICADO');
    ids.add(id); nomes.add(chaveNome);

    const anterior = anterioresPorId.get(id) || {};
    let rendaHistorico = Array.isArray(anterior.rendaHistorico) ? anterior.rendaHistorico.map(periodoRenda) : [];
    const aberto = rendaHistorico.find(periodo => !periodo.fim);
    const valorAnterior = aberto ? aberto.valor : 0;
    const deveTerRenda = ativo && tipo === 'presencial' && rendaMensal > 0;
    if (aberto && (!deveTerRenda || valorAnterior !== rendaMensal)) {
      if (aberto.inicio >= mes) rendaHistorico = rendaHistorico.filter(periodo => periodo !== aberto);
      else aberto.fim = mesAnterior(mes);
    }
    const abertoAtual = rendaHistorico.find(periodo => !periodo.fim);
    if (deveTerRenda && (!abertoAtual || abertoAtual.valor !== rendaMensal)) {
      const atualNoMes = rendaHistorico.find(periodo => periodo.inicio === mes);
      if (atualNoMes) { atualNoMes.valor = rendaMensal; atualNoMes.fim = ''; }
      else rendaHistorico.push({ valor: rendaMensal, inicio: mes, fim: '' });
    }
    rendaHistorico.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return { id, nome, tipo, rendaMensal, rendaHistorico, ativo, ordem };
  });

  // Locais já usados permanecem arquivados para que clientes e histórico financeiro
  // nunca fiquem com uma referência impossível de interpretar.
  for (const anterior of anteriores || []) {
    if (ids.has(String(anterior.id))) continue;
    const preservado = normalizarLocais([{ ...anterior, ativo: false, rendaMensal: 0 }], { mes, anteriores: [anterior] })[0];
    preservado.ordem = locais.length;
    locais.push(preservado);
  }
  return locais;
}

export async function carregarLocais(db) {
  const snap = await db.collection('crmDevelopmentSettings').doc('locations').get();
  if (!snap.exists) return Object.freeze({ locais: Object.freeze(locaisPadrao()), revision: 0, configured: false });
  const dados = snap.data() || {};
  const base = Array.isArray(dados.locais) ? dados.locais : locaisPadrao();
  const locais = base.map((item, ordem) => ({
    id: texto(item.id, 80), nome: texto(item.nome, 120), tipo: TIPOS_LOCAL.has(item.tipo) ? item.tipo : 'presencial',
    rendaMensal: Number(item.rendaMensal || 0), rendaHistorico: Array.isArray(item.rendaHistorico) ? item.rendaHistorico.map(periodoRenda) : [],
    ativo: item.ativo !== false, ordem: Number.isFinite(Number(item.ordem)) ? Number(item.ordem) : ordem
  })).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-PT'));
  return Object.freeze({ locais: Object.freeze(locais), revision: Number(dados.revision || 0), configured: true });
}

export function validarLocalCliente(catalogo, id, { permitirVazio = true, permitirInativo = false } = {}) {
  const valor = texto(id, 80);
  if (!valor && permitirVazio) return '';
  const local = (catalogo?.locais || []).find(item => item.id === valor);
  if (!local || (!permitirInativo && local.ativo === false)) throw falha('CLIENTE_LOCAL_INVALIDO');
  return local.id;
}

export function rendaDoLocalNoMes(local, mes) {
  const periodo = (local?.rendaHistorico || []).find(item => item.inicio <= mes && (!item.fim || item.fim >= mes));
  return periodo ? Number(periodo.valor || 0) : 0;
}

export function localPorId(catalogo, id) { return (catalogo?.locais || []).find(item => item.id === id) || null; }
export { mesLisboa };
