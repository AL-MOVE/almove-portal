import { obterAssertacaoFirebaseInterna, obterAdminFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { normalizarAvaliacaoFisicaLegada, normalizarCheckinLegado, normalizarClienteLegado, normalizarPackLegado, normalizarSessaoLegada } from './_crm-schema.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxf1aalZZPPVVdoqc58wQQdqPrmgXWm5wHFRvwAcIL8NdIMRrucuEqPHdACrxQ_Ta7i/exec';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false }); }
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const { identidade, assertacao } = await obterAssertacaoFirebaseInterna(req, 'crm-migration-development');
    const { db } = obterFirestoreAlmove();
    const contexto = await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid);
    if (!contexto.roles.includes('admin')) return responder(res, 403, { ok: false, erro: 'ACESSO_SEM_PERMISSAO_CRM' });
    const funcao = req.method === 'POST' ? 'exportarSnapshotMigracaoDevelopment' : 'getResumoMigracaoDevelopment';
    const resposta = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ fn: funcao, token: assertacao }) });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.ok) return responder(res, 502, { ok: false, erro: 'ORIGEM_CRM_INDISPONIVEL' });
    if (req.method === 'GET') {
      if (String(req.query?.verify || '') !== '1') return responder(res, 200, { ok: true, resumo: dados.dados });
      const origem = dados.dados || {};
      const esperado = { clientes: Number(origem.clientes?.total || 0), packs: Number(origem.registos?.packsAtivos || 0), sessoes: Number(origem.registos?.sessoes || 0), checkins: Number(origem.registos?.checkins || 0), avaliacoes: Number(origem.registos?.avaliacoes || 0), notas: Number(origem.registos?.notas || 0), planos: Number(origem.registos?.planos || 0) };
      const [clientes, packs, sessoes, checkins, avaliacoes, notas, planos] = await Promise.all([
        db.collection('crmMigrationClients').count().get(), db.collection('crmMigrationPacks').count().get(), db.collection('crmMigrationSessions').count().get(), db.collection('crmMigrationCheckins').count().get(), db.collection('crmMigrationPhysicalAssessments').count().get(), db.collection('crmMigrationNotes').count().get(), db.collection('crmMigrationTrainingPlans').count().get()
      ]);
      const destino = { clientes: clientes.data().count, packs: packs.data().count, sessoes: sessoes.data().count, checkins: checkins.data().count, avaliacoes: avaliacoes.data().count, notas: notas.data().count, planos: planos.data().count };
      const paridade = Object.keys(esperado).every(chave => esperado[chave] === destino[chave]);
      return responder(res, 200, { ok: true, resumo: origem, destino, paridade });
    }
    const origem = dados.dados || {};
    const registos = [
      ...(origem.clientes || []).map(item => ['crmMigrationClients', String(item.id), normalizarClienteLegado(item), item.fonteLinha]),
      ...(origem.packs || []).map(item => ['crmMigrationPacks', `${item.idCliente}-${item.mesAno}-${item.fonteLinha}`, normalizarPackLegado(item), item.fonteLinha]),
      ...(origem.sessoes || []).map(item => ['crmMigrationSessions', `${item.idCliente}-${item.mesAno}-${item.numSessao}-${item.fonteLinha}`, normalizarSessaoLegada(item), item.fonteLinha]),
      ...(origem.checkins || []).map(item => ['crmMigrationCheckins', String(item.fonteLinha), normalizarCheckinLegado(item), item.fonteLinha]),
      ...(origem.avaliacoes || []).map(item => ['crmMigrationPhysicalAssessments', String(item.fonteLinha), normalizarAvaliacaoFisicaLegada(item), item.fonteLinha]),
      ...(origem.notas || []).map(item => ['crmMigrationNotes', String(item.fonteLinha), item, item.fonteLinha]),
      ...(origem.planos || []).map(item => ['crmMigrationTrainingPlans', String(item.fonteLinha), item, item.fonteLinha])
    ];
    const agora = new Date();
    for (let inicio = 0; inicio < registos.length; inicio += 400) {
      const lote = db.batch();
      registos.slice(inicio, inicio + 400).forEach(([colecao, id, valor, linha]) => lote.set(db.collection(colecao).doc(id), { ...valor, migration: { source: 'apps-script', sourceRow: linha, copiedAt: agora, snapshotAt: origem.geradoEm } }));
      await lote.commit();
    }
    await db.collection('crmMigrationRuns').doc('latest').set({ copiedAt: agora, snapshotAt: origem.geradoEm, actorUid: contexto.firebaseUid, counts: { clients: (origem.clientes || []).length, packs: (origem.packs || []).length, sessions: (origem.sessoes || []).length, checkins: (origem.checkins || []).length, assessments: (origem.avaliacoes || []).length, notes: (origem.notas || []).length, trainingPlans: (origem.planos || []).length } });
    return responder(res, 200, { ok: true, copied: registos.length, resumo: { clientes: (origem.clientes || []).length, packs: (origem.packs || []).length, sessoes: (origem.sessoes || []).length, checkins: (origem.checkins || []).length, avaliacoes: (origem.avaliacoes || []).length, notas: (origem.notas || []).length, planos: (origem.planos || []).length } });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
