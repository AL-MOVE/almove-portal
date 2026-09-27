import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { obterAdminFirebase } from './_firebase.js';
import { normalizarAvaliacaoFisicaLegada, normalizarCheckinLegado, normalizarClienteLegado, normalizarPackLegado, normalizarSessaoLegada } from './_crm-schema.js';

const EMAIL_AUTORIZADO = 'martinssony1998@gmail.com';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgPYkfxZiDgi9-2l8wu0RBKmiG_g_p66VRh-Hp6QOvtMofgiJSdeV19Bxe_mSGuB1I/exec';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(estado).json(corpo);
}

function segredoValido(req) {
  const esperado = String(process.env.CRM_DATA_MIGRATION_SECRET || '');
  const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (esperado.length < 32 || !recebido) return false;
  const a = Buffer.from(esperado); const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assinarSnapshot(uid, email) {
  const segredo = String(process.env.PORTAL_APPS_SCRIPT_HMAC_SECRET || '');
  if (segredo.length < 32) throw new Error('FIREBASE_NAO_CONFIGURADO');
  const agora = Math.floor(Date.now() / 1000);
  const corpo = Buffer.from(JSON.stringify({ v: 1, uid, email, scope: 'crm-migration-development', iat: agora, exp: agora + 300, nonce: randomUUID() })).toString('base64url');
  return 'fb1.' + corpo + '.' + createHmac('sha256', segredo).update(corpo).digest('base64url');
}

async function obterSnapshot(uid) {
  const token = assinarSnapshot(uid, EMAIL_AUTORIZADO);
  const resposta = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ fn: 'exportarSnapshotMigracaoDevelopment', token }) });
  const corpo = await resposta.text();
  let dados;
  try { dados = JSON.parse(corpo); } catch { throw new Error('ORIGEM_CRM_INDISPONIVEL'); }
  if (!resposta.ok || !dados?.ok || !dados?.dados) throw new Error('ORIGEM_CRM_INDISPONIVEL');
  return dados.dados;
}

function registosDoSnapshot(origem) {
  return [
    ...(origem.clientes || []).map(item => ['crmMigrationClients', String(item.id), normalizarClienteLegado(item), item.fonteLinha]),
    ...(origem.packs || []).map(item => ['crmMigrationPacks', `${item.idCliente}-${item.mesAno}-${item.fonteLinha}`, normalizarPackLegado(item), item.fonteLinha]),
    ...(origem.packsHistorico || []).map(item => ['crmMigrationPackHistory', `${item.idCliente}-${item.mesAno}-${item.fonteLinha}`, normalizarPackLegado(item), item.fonteLinha]),
    ...(origem.sessoes || []).map(item => ['crmMigrationSessions', `${item.idCliente}-${item.mesAno}-${item.numSessao}-${item.fonteLinha}`, normalizarSessaoLegada(item), item.fonteLinha]),
    ...(origem.checkins || []).map(item => ['crmMigrationCheckins', String(item.fonteLinha), normalizarCheckinLegado(item), item.fonteLinha]),
    ...(origem.avaliacoes || []).map(item => ['crmMigrationPhysicalAssessments', String(item.fonteLinha), normalizarAvaliacaoFisicaLegada(item), item.fonteLinha]),
    ...(origem.notas || []).map(item => ['crmMigrationNotes', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.planos || []).map(item => ['crmMigrationTrainingPlans', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.sessoesPt || []).map(item => ['crmMigrationPersonalTrainingSessions', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.execucoesTreino || []).map(item => ['crmMigrationTrainingExecutions', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.posTreino || []).map(item => ['crmMigrationPostTraining', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.catalogoPacotesEspeciais || []).map(item => ['crmMigrationSpecialPackageCatalog', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.pacotesEspeciais || []).map(item => ['crmMigrationSpecialPackages', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.pedidosAvaliacao || []).map(item => ['crmMigrationAssessmentRequests', String(item.fonteLinha), item, item.fonteLinha]),
    ...(origem.agendaPortal || []).map(item => ['crmMigrationPortalAgenda', String(item.fonteLinha), item, item.fonteLinha])
  ];
}

/** Cópia única de Apps Script para Firestore, eliminada após validação. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  if (!segredoValido(req)) return responder(res, 404, { ok: false });
  try {
    const { auth, app } = obterAdminFirebase();
    const utilizador = await auth.getUserByEmail(EMAIL_AUTORIZADO);
    const origem = await obterSnapshot(utilizador.uid);
    const registos = registosDoSnapshot(origem);
    if (String(req.query?.dryRun || '') === '1') return responder(res, 200, { ok: true, dryRun: true, documents: registos.length, clients: (origem.clientes || []).length });
    const db = getFirestore(app); const agora = new Date();
    for (let inicio = 0; inicio < registos.length; inicio += 400) {
      const lote = db.batch();
      registos.slice(inicio, inicio + 400).forEach(([colecao, id, valor, linha]) => lote.set(db.collection(colecao).doc(id), { ...valor, migration: { source: 'apps-script', sourceRow: linha, copiedAt: agora, snapshotAt: origem.geradoEm } }));
      await lote.commit();
    }
    await db.collection('crmMigrationRuns').doc('latest').set({ copiedAt: agora, snapshotAt: origem.geradoEm, actorUid: utilizador.uid, counts: { documents: registos.length, clients: (origem.clientes || []).length } });
    return responder(res, 200, { ok: true, documents: registos.length, clients: (origem.clientes || []).length });
  } catch (erro) {
    console.error('CRM_DATA_MIGRATION_FAILED', String(erro?.code || erro?.message || 'UNKNOWN').slice(0, 160));
    return responder(res, 502, { ok: false });
  }
}
