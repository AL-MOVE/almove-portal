import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

const FREQUENCIAS = new Set(['1x30', '2x30', '3x30', '1x45', '2x45', '3x45', '1x60', '2x60', '3x60']);
function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo); }
function mesAtual() { const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return partes.find(item => item.type === 'year').value + '-' + partes.find(item => item.type === 'month').value; }
function tituloMes() { return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', month: 'long', year: 'numeric' }).format(new Date()); }
function idSeguro(valor) { return encodeURIComponent(String(valor)); }

function ultimaFrequencia(packs, clienteId, mes) {
  return packs.filter(pack => pack.clientId === clienteId && String(pack.mesAno) < mes).sort((a, b) => String(b.mesAno).localeCompare(String(a.mesAno)))[0] || null;
}

async function candidatos(db) {
  const mes = mesAtual(); const [clientesSnap, packsAtivosSnap, packsHistoricoSnap] = await Promise.all([db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get(), db.collection('crmMigrationPackHistory').get()]);
  const packs = packsAtivosSnap.docs.concat(packsHistoricoSnap.docs).map(documento => documento.data());
  const lista = clientesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(cliente => cliente.estado === 'Ativo' && cliente.suspensoMes !== mes && cliente.cancelarMes !== mes).map(cliente => {
    const temAtual = packs.some(pack => pack.clientId === cliente.id && pack.mesAno === mes); const anterior = ultimaFrequencia(packs, cliente.id, mes);
    return !temAtual && anterior ? { idCliente: cliente.id, nome: cliente.nome, frequenciaAnterior: anterior.frequencia } : null;
  }).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
  return { mesAtual: mes, mesAtualFormatado: tituloMes(), lista };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    if (req.method === 'GET') return responder(res, 200, { ok: true, ...(await candidatos(db)) });
    const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 100) : []; if (!itens.length) return responder(res, 400, { ok: false, erro: 'RENOVACAO_SEM_ITENS' });
    const mes = mesAtual(); const [clientesSnap, packsSnap] = await Promise.all([db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get()]); const clientes = new Map(clientesSnap.docs.map(documento => [documento.id, documento.data()])); const existentes = packsSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })); const agora = new Date(); const lote = db.batch(); let criados = 0;
    for (const item of itens) {
      const clientId = String(item?.idCliente || '').trim(); const frequencia = String(item?.frequencia || '').trim(); if (!clientes.has(clientId) || clientes.get(clientId).estado !== 'Ativo' || !FREQUENCIAS.has(frequencia)) continue; if (existentes.some(pack => pack.clientId === clientId && pack.mesAno === mes)) continue;
      const anterior = ultimaFrequencia(existentes, clientId, mes); const total = Number(frequencia.split('x')[0]) * 4; const duracaoMinutos = Number(frequencia.split('x')[1]); const packId = idSeguro(clientId) + '-' + mes + '-development'; const packRef = db.collection('crmMigrationPacks').doc(packId);
      lote.create(packRef, { clientId, mesAno: mes, frequencia, sessoesTotal: total, sessoesConfirmadas: 0, duracaoMinutos, estadoPagamento: 'Pendente', preco: Number(anterior?.preco || 0), origem: 'firebase-development', createdAt: agora, createdBy: identidade.uid });
      for (let numero = 1; numero <= total; numero += 1) lote.create(db.collection('crmMigrationSessions').doc(packId + '-s' + numero), { clientId, mesAno: mes, numSessao: numero, estado: 'Pendente', dataConfirmada: '', origem: 'firebase-development', createdAt: agora });
      lote.create(db.collection('auditLogs').doc(), { action: 'development.pack.renewed', actorUid: identidade.uid, clientId, packId, createdAt: agora }); criados += 1;
    }
    if (!criados) return responder(res, 200, { ok: true, criados: 0 }); await lote.commit(); return responder(res, 201, { ok: true, criados });
  } catch (erro) { const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo }); }
}
