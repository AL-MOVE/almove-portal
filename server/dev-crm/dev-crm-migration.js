import { obterAssertacaoFirebaseInterna } from '../../api/_firebase.js';
import { crmFirebasePermitido, obterAmbienteCrm } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { normalizarAvaliacaoFisicaLegada, normalizarCheckinLegado, normalizarClienteLegado, normalizarPackLegado, normalizarSessaoLegada } from '../../api/_crm-schema.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgPYkfxZiDgi9-2l8wu0RBKmiG_g_p66VRh-Hp6QOvtMofgiJSdeV19Bxe_mSGuB1I/exec';
const COLECOES_MIGRACAO = Object.freeze({
  clientes: 'crmMigrationClients', packs: 'crmMigrationPacks', packsHistorico: 'crmMigrationPackHistory', sessoes: 'crmMigrationSessions',
  checkins: 'crmMigrationCheckins', avaliacoes: 'crmMigrationPhysicalAssessments', notas: 'crmMigrationNotes', planos: 'crmMigrationTrainingPlans',
  sessoesPt: 'crmMigrationPersonalTrainingSessions', execucoesTreino: 'crmMigrationTrainingExecutions', posTreino: 'crmMigrationPostTraining',
  catalogoPacotesEspeciais: 'crmMigrationSpecialPackageCatalog', pacotesEspeciais: 'crmMigrationSpecialPackages',
  pedidosAvaliacao: 'crmMigrationAssessmentRequests', agendaPortal: 'crmMigrationPortalAgenda'
});

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false }); }
  try {
    if (!crmFirebasePermitido() || obterAmbienteCrm().ambiente !== 'development') return responder(res, 404, { ok: false });
    const { identidade, assertacao } = await obterAssertacaoFirebaseInterna(req, 'crm-migration-development');
    const { db } = obterFirestoreAlmove();
    const contexto = await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid);
    if (!contexto.roles.includes('admin')) return responder(res, 403, { ok: false, erro: 'ACESSO_SEM_PERMISSAO_CRM' });
    const funcao = 'exportarSnapshotMigracaoDevelopment';
    const resposta = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ fn: funcao, token: assertacao }) });
    const corpo = await resposta.text();
    let dados;
    try { dados = JSON.parse(corpo); } catch (erro) { return responder(res, 502, { ok: false, erro: 'ORIGEM_CRM_INDISPONIVEL' }); }
    if (!resposta.ok || !dados.ok) return responder(res, 502, { ok: false, erro: 'ORIGEM_CRM_INDISPONIVEL' });
    if (req.method === 'GET') {
      if (String(req.query?.verify || '') !== '1') return responder(res, 200, { ok: true, resumo: dados.dados });
      const snapshot = dados.dados || {};
      const esperado = { clientes: (snapshot.clientes || []).length, packs: (snapshot.packs || []).length, packsHistorico: (snapshot.packsHistorico || []).length, sessoes: (snapshot.sessoes || []).length, checkins: (snapshot.checkins || []).length, avaliacoes: (snapshot.avaliacoes || []).length, notas: (snapshot.notas || []).length, planos: (snapshot.planos || []).length, sessoesPt: (snapshot.sessoesPt || []).length, execucoesTreino: (snapshot.execucoesTreino || []).length, posTreino: (snapshot.posTreino || []).length, catalogoPacotesEspeciais: (snapshot.catalogoPacotesEspeciais || []).length, pacotesEspeciais: (snapshot.pacotesEspeciais || []).length, pedidosAvaliacao: (snapshot.pedidosAvaliacao || []).length, agendaPortal: (snapshot.agendaPortal || []).length };
      const contagens = await Promise.all(Object.entries(COLECOES_MIGRACAO).map(async ([chave, colecao]) => {
        const referencia = db.collection(colecao);
        const [total, importado, development] = await Promise.all([
          referencia.count().get(),
          referencia.where('migration.source', '==', 'apps-script').count().get(),
          referencia.where('origem', '==', 'firebase-development').count().get()
        ]);
        return [chave, { total: total.data().count, importado: importado.data().count, development: development.data().count }];
      }));
      const destino = Object.fromEntries(contagens.map(([chave, contagem]) => [chave, contagem.total]));
      const importado = Object.fromEntries(contagens.map(([chave, contagem]) => [chave, contagem.importado]));
      const development = Object.fromEntries(contagens.map(([chave, contagem]) => [chave, contagem.development]));
      const paridade = Object.keys(esperado).every(chave => esperado[chave] === importado[chave]);
      const resumo = { clientes: { total: esperado.clientes }, registos: { packsAtivos: esperado.packs, packsHistorico: esperado.packsHistorico, sessoes: esperado.sessoes, checkins: esperado.checkins, avaliacoes: esperado.avaliacoes, notas: esperado.notas, planos: esperado.planos, sessoesPt: esperado.sessoesPt, execucoesTreino: esperado.execucoesTreino, posTreino: esperado.posTreino, catalogoPacotesEspeciais: esperado.catalogoPacotesEspeciais, pacotesEspeciais: esperado.pacotesEspeciais, pedidosAvaliacao: esperado.pedidosAvaliacao, agendaPortal: esperado.agendaPortal } };
      return responder(res, 200, { ok: true, resumo, destino, importado, development, paridade });
    }
    const origem = dados.dados || {};
    const registos = [
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
    const documentosEsperados = new Map();
    registos.forEach(([colecao, id]) => {
      if (!documentosEsperados.has(colecao)) documentosEsperados.set(colecao, new Set());
      documentosEsperados.get(colecao).add(id);
    });
    const colecoesMigradas = [...documentosEsperados.keys()];
    const colecoesComRegistosObsoletos = await Promise.all(colecoesMigradas.map(async colecao => {
      const documentos = await db.collection(colecao).where('migration.source', '==', 'apps-script').get();
      const esperados = documentosEsperados.get(colecao);
      return documentos.docs.filter(documento => !esperados.has(documento.id));
    }));
    const registosObsoletos = colecoesComRegistosObsoletos.flat();
    for (let inicio = 0; inicio < registosObsoletos.length; inicio += 400) {
      const lote = db.batch();
      registosObsoletos.slice(inicio, inicio + 400).forEach(documento => lote.delete(documento.ref));
      await lote.commit();
    }
    const agora = new Date();
    for (let inicio = 0; inicio < registos.length; inicio += 400) {
      const lote = db.batch();
      registos.slice(inicio, inicio + 400).forEach(([colecao, id, valor, linha]) => lote.set(db.collection(colecao).doc(id), { ...valor, migration: { source: 'apps-script', sourceRow: linha, copiedAt: agora, snapshotAt: origem.geradoEm } }));
      await lote.commit();
    }
    await db.collection('crmMigrationRuns').doc('latest').set({ copiedAt: agora, snapshotAt: origem.geradoEm, actorUid: contexto.firebaseUid, removed: registosObsoletos.length, counts: { clients: (origem.clientes || []).length, packs: (origem.packs || []).length, packHistory: (origem.packsHistorico || []).length, sessions: (origem.sessoes || []).length, checkins: (origem.checkins || []).length, assessments: (origem.avaliacoes || []).length, notes: (origem.notas || []).length, trainingPlans: (origem.planos || []).length, specialPackageCatalog: (origem.catalogoPacotesEspeciais || []).length, specialPackages: (origem.pacotesEspeciais || []).length, assessmentRequests: (origem.pedidosAvaliacao || []).length, portalAgenda: (origem.agendaPortal || []).length } });
    return responder(res, 200, { ok: true, copied: registos.length, removed: registosObsoletos.length, resumo: { clientes: (origem.clientes || []).length, packs: (origem.packs || []).length, packsHistorico: (origem.packsHistorico || []).length, sessoes: (origem.sessoes || []).length, checkins: (origem.checkins || []).length, avaliacoes: (origem.avaliacoes || []).length, notas: (origem.notas || []).length, planos: (origem.planos || []).length, catalogoPacotesEspeciais: (origem.catalogoPacotesEspeciais || []).length, pacotesEspeciais: (origem.pacotesEspeciais || []).length, pedidosAvaliacao: (origem.pedidosAvaliacao || []).length, agendaPortal: (origem.agendaPortal || []).length } });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
