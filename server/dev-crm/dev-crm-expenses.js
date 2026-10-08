import { FieldValue } from 'firebase-admin/firestore';
import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { carregarLocais, rendaDoLocalNoMes, validarLocalCliente } from './locations.js';
import { CATEGORIAS_DESPESA_PADRAO, carregarOpcoesOperacionais } from './operational-options.js';

export const CATEGORIAS_DESPESA = CATEGORIAS_DESPESA_PADRAO;

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function falha(codigo) { const erro = new Error(codigo); erro.code = codigo; return erro; }
function texto(valor, maximo = 160) { return String(valor ?? '').trim().slice(0, maximo); }
function mesAno(valor) {
  const mes = texto(valor, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw falha('DESPESA_MES_INVALIDO');
  return mes;
}
function valorEuro(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0 || numero > 100000) throw falha('DESPESA_VALOR_INVALIDO');
  return Math.round(numero * 100) / 100;
}

export function validarDespesa(entrada, categoriasPermitidas = CATEGORIAS_DESPESA) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const tipo = texto(dados.tipo, 20);
  const categoria = texto(dados.categoria, 80);
  const descricao = texto(dados.descricao, 160);
  if (!['recorrente', 'avulsa'].includes(tipo)) throw falha('DESPESA_TIPO_INVALIDO');
  if (!categoriasPermitidas.includes(categoria)) throw falha('DESPESA_CATEGORIA_INVALIDA');
  if (!descricao) throw falha('DESPESA_DESCRICAO_INVALIDA');
  return Object.freeze({ tipo, categoria, descricao, valor: valorEuro(dados.valor), mesInicio: mesAno(dados.mesAno), locationId: texto(dados.locationId, 80) });
}

function aplicaNoMes(despesa, mes) {
  if (!despesa || despesa.ativo === false) return false;
  if (despesa.tipo === 'avulsa') return despesa.mesInicio === mes;
  return despesa.tipo === 'recorrente' && despesa.mesInicio <= mes && (!despesa.mesFim || despesa.mesFim >= mes);
}

function exporDespesa(documento) {
  const dados = documento.data() || {};
  return Object.freeze({
    id: documento.id,
    tipo: dados.tipo === 'recorrente' ? 'recorrente' : 'avulsa',
    categoria: String(dados.categoria || 'Outros'),
    descricao: String(dados.descricao || ''),
    valor: Number(dados.valor || 0),
    mesInicio: String(dados.mesInicio || ''),
    mesFim: String(dados.mesFim || ''),
    ativo: dados.ativo !== false,
    locationId: String(dados.locationId || ''),
    virtual: false
  });
}

export async function obterResumoDespesas(db, mes, { locationId = '', catalogoLocais = null } = {}) {
  const resultado = await db.collection('crmExpenses').get();
  let despesas = resultado.docs.map(exporDespesa).filter(despesa => aplicaNoMes(despesa, mes));
  const catalogo = catalogoLocais || await carregarLocais(db);
  const legadasUsadas = new Set();
  const rendasVirtuais = [];
  for (const local of catalogo.locais || []) {
    const valor = rendaDoLocalNoMes(local, mes);
    if (!(valor > 0)) continue;
    const explicita = despesas.find(despesa => despesa.locationId === local.id && despesa.categoria === 'Renda do ginásio');
    if (explicita) continue;
    const legadas = despesas.filter(despesa => !despesa.locationId && despesa.categoria === 'Renda do ginásio' && Number(despesa.valor) === valor && !legadasUsadas.has(despesa.id));
    if (legadas.length === 1) {
      const alvo = legadas[0]; legadasUsadas.add(alvo.id);
      despesas = despesas.map(despesa => despesa.id === alvo.id ? Object.freeze({ ...despesa, locationId: local.id, localInferido: true }) : despesa);
      continue;
    }
    rendasVirtuais.push(Object.freeze({ id: 'location-rent:' + local.id + ':' + mes, tipo: 'recorrente', categoria: 'Renda do ginásio', descricao: 'Renda · ' + local.nome, valor, mesInicio: mes, mesFim: '', ativo: true, locationId: local.id, virtual: true }));
  }
  despesas = despesas.concat(rendasVirtuais);
  if (locationId) despesas = despesas.filter(despesa => despesa.locationId === locationId);
  const total = despesas.reduce((soma, despesa) => soma + despesa.valor, 0);
  const recorrentes = despesas.filter(despesa => despesa.tipo === 'recorrente').reduce((soma, despesa) => soma + despesa.valor, 0);
  return Object.freeze({
    despesas: Object.freeze(despesas.sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-PT') || a.descricao.localeCompare(b.descricao, 'pt-PT'))),
    total: Math.round(total * 100) / 100,
    recorrentes: Math.round(recorrentes * 100) / 100
  });
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return responder(res, 405, { ok: false, erro: 'METODO_NAO_PERMITIDO' });
    }
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const mes = mesAno(req.method === 'GET' ? req.query?.mes : req.body?.mesAno);

    if (req.method === 'GET') {
      const catalogoLocais = await carregarLocais(db);
      const filtroLocal = validarLocalCliente(catalogoLocais, req.query?.locationId, { permitirVazio: true, permitirInativo: true });
      const resumo = await obterResumoDespesas(db, mes, { locationId: filtroLocal, catalogoLocais });
      return responder(res, 200, { ok: true, mes, despesas: resumo.despesas, total: resumo.total.toFixed(2), recorrentes: resumo.recorrentes.toFixed(2) });
    }

    const dados = req.body && typeof req.body === 'object' ? req.body : {};
    const acao = texto(dados.action, 24);
    const agora = new Date();

    if (acao === 'create') {
      const [catalogoLocais, opcoesOperacionais] = await Promise.all([carregarLocais(db), carregarOpcoesOperacionais(db)]);
      const base = validarDespesa(dados, opcoesOperacionais.categoriasDespesa);
      const locationId = validarLocalCliente(catalogoLocais, base.locationId, { permitirVazio: true });
      if (base.categoria === 'Renda do ginásio' && !locationId) throw falha('DESPESA_LOCAL_OBRIGATORIO');
      const localDaRenda = base.categoria === 'Renda do ginásio' ? (catalogoLocais.locais || []).find(local => local.id === locationId) : null;
      if (localDaRenda && rendaDoLocalNoMes(localDaRenda, base.mesInicio) > 0) throw falha('DESPESA_RENDA_GERIDA_NAS_DEFINICOES');
      const despesa = { ...base, locationId };
      const referencia = db.collection('crmExpenses').doc();
      await db.runTransaction(async transacao => {
        transacao.create(referencia, { ...despesa, mesFim: '', ativo: true, createdAt: FieldValue.serverTimestamp(), createdBy: identidade.uid, origem: 'firebase-development' });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.expense.created', actorUid: identidade.uid, expenseId: referencia.id, createdAt: agora, tipo: despesa.tipo, categoria: despesa.categoria, valor: despesa.valor });
      });
      const resumo = await obterResumoDespesas(db, mes, { catalogoLocais });
      return responder(res, 201, { ok: true, despesas: resumo.despesas, total: resumo.total.toFixed(2), recorrentes: resumo.recorrentes.toFixed(2) });
    }

    const id = texto(dados.id, 128);
    if (!id) return responder(res, 400, { ok: false, erro: 'DESPESA_ID_INVALIDO' });
    if (id.startsWith('location-rent:')) return responder(res, 400, { ok: false, erro: 'DESPESA_GERIDA_NAS_DEFINICOES' });
    const referencia = db.collection('crmExpenses').doc(id);
    const existente = await referencia.get();
    if (!existente.exists) return responder(res, 404, { ok: false, erro: 'DESPESA_NAO_ENCONTRADA' });

    if (acao === 'finish') {
      const despesa = exporDespesa(existente);
      if (despesa.tipo !== 'recorrente') return responder(res, 400, { ok: false, erro: 'DESPESA_NAO_RECORRENTE' });
      if (mes < despesa.mesInicio) return responder(res, 400, { ok: false, erro: 'DESPESA_MES_NAO_CORRESPONDE' });
      await db.runTransaction(async transacao => {
        transacao.update(referencia, { mesFim: mes, updatedAt: FieldValue.serverTimestamp(), updatedBy: identidade.uid });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.expense.finished', actorUid: identidade.uid, expenseId: id, createdAt: agora, mesFim: mes });
      });
    } else if (acao === 'delete') {
      const despesa = exporDespesa(existente);
      if (despesa.tipo !== 'avulsa' || despesa.mesInicio !== mes) return responder(res, 400, { ok: false, erro: 'DESPESA_NAO_APAGAVEL' });
      await db.runTransaction(async transacao => {
        transacao.delete(referencia);
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.expense.deleted', actorUid: identidade.uid, expenseId: id, createdAt: agora });
      });
    } else {
      return responder(res, 400, { ok: false, erro: 'DESPESA_ACAO_INVALIDA' });
    }

    const resumo = await obterResumoDespesas(db, mes);
    return responder(res, 200, { ok: true, despesas: resumo.despesas, total: resumo.total.toFixed(2), recorrentes: resumo.recorrentes.toFixed(2) });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    const estado = /^FIREBASE_/.test(codigo) ? 401 : /^ACESSO_/.test(codigo) ? 403 : /^DESPESA_/.test(codigo) ? 400 : 500;
    return responder(res, estado, { ok: false, erro: codigo });
  }
}
