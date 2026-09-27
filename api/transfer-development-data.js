import { timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { obterIdentidadeFirebase, obterAdminFirebase } from './_firebase.js';
import { obterFirestoreAlmove } from './_firestore.js';

const SOURCE_PROJECT = 'almove-portal-dev';
const TARGET_PROJECT = 'almove-portal';
const EMAIL_AUTORIZADO = 'martinssony1998@gmail.com';
const TARGET_URL = 'https://crm.almove.pt/api/transfer-development-data';
const EXCLUIDAS = new Set(['userAccess', 'auditLogs', 'crmMigrationRuns']);
const EXTRAS = new Set(['workoutSetEvents', 'workoutSessions', 'trainingPlans', 'clients', 'clientEmailIndex']);

function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); return res.status(estado).json(corpo); }
function segredoValido(recebido) {
  const esperado = String(process.env.CRM_DEV_TO_PROD_TRANSFER_SECRET || '');
  if (esperado.length < 32 || !recebido) return false;
  const a = Buffer.from(esperado); const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}
function colecaoPermitida(nome) { return !EXCLUIDAS.has(nome) && (nome.startsWith('crm') || EXTRAS.has(nome)); }
function codificar(valor) {
  if (valor instanceof Timestamp) return { __almoveType: 'timestamp', seconds: valor.seconds, nanoseconds: valor.nanoseconds };
  if (Array.isArray(valor)) return valor.map(codificar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, codificar(item)]));
  return valor;
}
function descodificar(valor) {
  if (Array.isArray(valor)) return valor.map(descodificar);
  if (!valor || typeof valor !== 'object') return valor;
  if (valor.__almoveType === 'timestamp' && Number.isInteger(valor.seconds) && Number.isInteger(valor.nanoseconds)) return new Timestamp(valor.seconds, valor.nanoseconds);
  return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, descodificar(item)]));
}
async function recolherDocumentos(referencia, documentos) {
  const dados = referencia.data();
  documentos.push({ path: referencia.ref.path, data: codificar(dados) });
  const subcolecoes = await referencia.ref.listCollections();
  for (const subcolecao of subcolecoes) {
    const filhos = await subcolecao.get();
    for (const filho of filhos.docs) await recolherDocumentos(filho, documentos);
  }
}
async function transferirFonte(req) {
  const identidade = await obterIdentidadeFirebase(req);
  if (identidade.email !== EMAIL_AUTORIZADO) throw new Error('ACESSO_RECUSADO');
  const { db } = obterFirestoreAlmove();
  const colecoes = await db.listCollections();
  const documentos = [];
  for (const colecao of colecoes.filter(item => colecaoPermitida(item.id))) {
    const snapshot = await colecao.get();
    for (const documento of snapshot.docs) await recolherDocumentos(documento, documentos);
  }
  for (let inicio = 0; inicio < documentos.length; inicio += 100) {
    const resposta = await fetch(TARGET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ALMOVE-TRANSFER': String(process.env.CRM_DEV_TO_PROD_TRANSFER_SECRET || '') }, body: JSON.stringify({ documents: documentos.slice(inicio, inicio + 100) }) });
    if (!resposta.ok) throw new Error('DESTINO_INDISPONIVEL');
  }
  return { documents: documentos.length, collections: [...new Set(documentos.map(item => item.path.split('/')[0]))].length };
}
async function receberDestino(req) {
  if (!segredoValido(String(req.headers['x-almove-transfer'] || ''))) throw new Error('ACESSO_RECUSADO');
  const documentos = Array.isArray(req.body?.documents) ? req.body.documents : [];
  if (!documentos.length || documentos.length > 100) throw new Error('DADOS_INVALIDOS');
  const { db } = obterFirestoreAlmove(); const lote = db.batch();
  for (const item of documentos) {
    const caminho = String(item?.path || ''); const partes = caminho.split('/');
    if (partes.length < 2 || partes.length % 2 || !colecaoPermitida(partes[0]) || partes.some(parte => !/^[A-Za-z0-9_.@%=-]{1,256}$/.test(parte))) throw new Error('DADOS_INVALIDOS');
    lote.set(db.doc(caminho), descodificar(item.data));
  }
  await lote.commit();
  return { documents: documentos.length };
}

/** Ponte de uso único entre os dois projetos Firebase; removida depois da cópia. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    const { projeto } = obterAdminFirebase();
    if (projeto === SOURCE_PROJECT) return responder(res, 200, { ok: true, ...(await transferirFonte(req)) });
    if (projeto === TARGET_PROJECT) return responder(res, 200, { ok: true, ...(await receberDestino(req)) });
    return responder(res, 404, { ok: false });
  } catch (erro) {
    console.error('CRM_DEVELOPMENT_TRANSFER_FAILED', String(erro?.code || erro?.message || 'UNKNOWN').slice(0, 160));
    return responder(res, 502, { ok: false });
  }
}
