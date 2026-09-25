import { FieldValue } from 'firebase-admin/firestore';
import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

export const CATEGORIAS_DESPESA = Object.freeze([
  'Renda do ginásio', 'Software e subscrições', 'Equipamento', 'Marketing', 'Transporte', 'Serviços profissionais', 'Outros'
]);

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

export function validarDespesa(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const tipo = texto(dados.tipo, 20);
  const categoria = texto(dados.categoria, 80);
  const descricao = texto(dados.descricao, 160);
  if (!['recorrente', 'avulsa'].includes(tipo)) throw falha('DESPESA_TIPO_INVALIDO');
  if (!CATEGORIAS_DESPESA.includes(categoria)) throw falha('DESPESA_CATEGORIA_INVALIDA');
  if (!descricao) throw falha('DESPESA_DESCRICAO_INVALIDA');
  return Object.freeze({ tipo, categoria, descricao, valor: valorEuro(dados.valor), mesInicio: mesAno(dados.mesAno) });
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
    ativo: dados.ativo !== false
  });
}

export async function obterResumoDespesas(db, mes) {
  const resultado = await db.collection('crmExpenses').get();
  const despesas = resultado.docs.map(exporDespesa).filter(despesa => aplicaNoMes(despesa, mes));
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
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const mes = mesAno(req.method === 'GET' ? req.query?.mes : req.body?.mesAno);

    if (req.method === 'GET') {
      const resumo = await obterResumoDespesas(db, mes);
      return responder(res, 200, { ok: true, mes, despesas: resumo.despesas, total: resumo.total.toFixed(2), recorrentes: resumo.recorrentes.toFixed(2) });
    }

    const dados = req.body && typeof req.body === 'object' ? req.body : {};
    const acao = texto(dados.action, 24);
    const agora = new Date();

    if (acao === 'create') {
      const despesa = validarDespesa(dados);
      const referencia = db.collection('crmExpenses').doc();
      await db.runTransaction(async transacao => {
        transacao.create(referencia, { ...despesa, mesFim: '', ativo: true, createdAt: FieldValue.serverTimestamp(), createdBy: identidade.uid, origem: 'firebase-development' });
        transacao.create(db.collection('auditLogs').doc(), { action: 'development.expense.created', actorUid: identidade.uid, expenseId: referencia.id, createdAt: agora, tipo: despesa.tipo, categoria: despesa.categoria, valor: despesa.valor });
      });
      const resumo = await obterResumoDespesas(db, mes);
      return responder(res, 201, { ok: true, despesas: resumo.despesas, total: resumo.total.toFixed(2), recorrentes: resumo.recorrentes.toFixed(2) });
    }

    const id = texto(dados.id, 128);
    if (!id) return responder(res, 400, { ok: false, erro: 'DESPESA_ID_INVALIDO' });
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
