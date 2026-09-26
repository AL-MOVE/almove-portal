import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

const CAMPOS = Object.freeze([
  'pesoKg', 'objetivoPesoKg', 'alturaCm', 'massaGordaPercent', 'massaGordaKg', 'massaMagraPercent', 'massaMagraKg', 'massaMuscularKg', 'massaOsseaKg', 'aguaPercent', 'gorduraVisceral', 'taxaMetabolicaBasal', 'idadeMetabolica',
  'cinturaCm', 'ancaCm', 'pescocoCm', 'ombroCm', 'toraxCm', 'abdomenCm', 'bracoDireitoRelaxadoCm', 'bracoEsquerdoRelaxadoCm', 'bracoDireitoContraidoCm', 'bracoEsquerdoContraidoCm', 'antebracoDireitoCm', 'antebracoEsquerdoCm', 'coxaDireitaCm', 'coxaEsquerdaCm', 'pernaDireitaCm', 'pernaEsquerdaCm', 'diametroPulsoCm', 'diametroFemurCm', 'diametroUmeroCm',
  'pregaSubescapularMm', 'pregaTricipitalMm', 'pregaBicipitalMm', 'pregaAxilarMediaMm', 'pregaAbdominalMm', 'pregaSuprailiacaMm', 'pregaPeitoralMm', 'pregaQuadricipitalMm', 'pregaGeminalMm',
  'pressaoSistolicaMmhg', 'pressaoDiastolicaMmhg', 'frequenciaCardiacaRepousoBpm', 'frequenciaCardiacaMaximaBpm', 'vo2Max', 'testeDistanciaM', 'testeDuracaoSeg', 'testeVelocidadeKmh'
]);
const LEGADOS = Object.freeze(['pesoKg', 'alturaCm', 'massaGordaPercent', 'cinturaCm', 'abdomenCm', 'bracoDireitoCm', 'bracoEsquerdoCm', 'pernaDireitaCm', 'pernaEsquerdaCm']);

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}
function texto(valor, maximo = 500) { return String(valor || '').trim().slice(0, maximo); }
function dataHoje() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return partes.find(parte => parte.type === 'year').value + '-' + partes.find(parte => parte.type === 'month').value + '-' + partes.find(parte => parte.type === 'day').value;
}
function dataValida(valor) { const data = texto(valor, 10); return /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(new Date(data + 'T12:00:00').getTime()) ? data : ''; }
function somarDias(data, dias) { const cursor = new Date(data + 'T12:00:00'); cursor.setDate(cursor.getDate() + dias); return cursor.toISOString().slice(0, 10); }
function numero(valor) { if (valor === '' || valor === null || valor === undefined) return null; const resultado = Number(String(valor).replace(',', '.')); if (!Number.isFinite(resultado) || resultado < 0 || resultado > 10000) throw new Error('AVALIACAO_MEDIDA_INVALIDA'); return resultado; }

function normalizarMedidas(entrada) {
  const origem = entrada && typeof entrada === 'object' ? entrada : {};
  const medidas = {};
  for (const campo of CAMPOS) medidas[campo] = numero(origem[campo]);
  // Mantém os campos históricos que já são lidos pelo portal e pela ficha atual.
  medidas.bracoDireitoCm = medidas.bracoDireitoRelaxadoCm;
  medidas.bracoEsquerdoCm = medidas.bracoEsquerdoRelaxadoCm;
  return medidas;
}
function dadosPublicos(documento, clientes) {
  const dados = documento.data() || {};
  const medidas = { ...(dados.medidas || {}) };
  for (const campo of LEGADOS) if (medidas[campo] === undefined) medidas[campo] = dados[campo] ?? null;
  const realizadoEm = dataValida(dados.realizadoEm || dados.atualizadoEm) || '';
  const proximaRevisaoEm = dataValida(dados.proximaRevisaoEm) || (realizadoEm ? somarDias(realizadoEm, 56) : '');
  const hoje = dataHoje();
  const cliente = clientes.get(texto(dados.clientId, 128)) || { nome: 'Cliente sem nome', estado: '' };
  return {
    id: documento.id, clientId: texto(dados.clientId, 128), clienteNome: cliente.nome, clienteEstado: cliente.estado,
    realizadoEm, proximaRevisaoEm, protocolo: texto(dados.protocolo, 80) || 'Não indicado',
    estadoRevisao: !proximaRevisaoEm ? 'Sem revisão' : proximaRevisaoEm < hoje ? 'Revisão em falta' : 'Em dia',
    medidas, totalMedidas: Object.entries(medidas).filter(([campo, valor]) => !['bracoDireitoCm', 'bracoEsquerdoCm'].includes(campo) && valor !== null && valor !== undefined && valor !== '').length,
    notasCliente: texto(dados.notasCliente, 1500), origem: texto(dados.origem, 80) || 'migração'
  };
}

async function contextoDaEquipa(req) {
  if (!crmFirebasePermitido()) throw new Error('AMBIENTE_INDISPONIVEL');
  const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove();
  exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
  return { db, identidade };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return responder(res, 405, { ok: false });
  try {
    const { db, identidade } = await contextoDaEquipa(req);
    if (req.method === 'GET') {
      const clientId = texto(req.query?.clientId, 128);
      const [avaliacoesSnap, clientesSnap] = await Promise.all([
        clientId ? db.collection('crmMigrationPhysicalAssessments').where('clientId', '==', clientId).get() : db.collection('crmMigrationPhysicalAssessments').get(),
        db.collection('crmMigrationClients').get()
      ]);
      const clientes = new Map(clientesSnap.docs.map(documento => [documento.id, { nome: texto(documento.data()?.nome, 120) || 'Cliente sem nome', estado: texto(documento.data()?.estado, 32) }]));
      const avaliacoes = avaliacoesSnap.docs.map(documento => dadosPublicos(documento, clientes)).sort((a, b) => String(b.realizadoEm).localeCompare(String(a.realizadoEm)) || String(b.id).localeCompare(String(a.id)));
      const hoje = dataHoje();
      return responder(res, 200, { ok: true, avaliacoes, resumo: { total: avaliacoes.length, revisaoEmFalta: avaliacoes.filter(item => item.proximaRevisaoEm && item.proximaRevisaoEm < hoje).length, proximas: avaliacoes.filter(item => item.proximaRevisaoEm >= hoje && item.proximaRevisaoEm <= somarDias(hoje, 14)).length } });
    }

    const entrada = req.body && typeof req.body === 'object' ? req.body : {};
    const clientId = texto(entrada.idCliente, 128); const requestId = texto(entrada.requestId, 120);
    if (!clientId || !requestId) return responder(res, 400, { ok: false, erro: 'AVALIACAO_IDENTIFICACAO_EM_FALTA' });
    const cliente = db.collection('crmMigrationClients').doc(clientId); const clienteSnap = await cliente.get();
    if (!clienteSnap.exists) return responder(res, 404, { ok: false, erro: 'CLIENTE_NAO_ENCONTRADO' });
    const realizadoEm = dataValida(entrada.realizadoEm) || dataHoje(); const revisaoDias = Number(entrada.revisaoDias || 56);
    if (!Number.isInteger(revisaoDias) || revisaoDias < 7 || revisaoDias > 365) return responder(res, 400, { ok: false, erro: 'REVISAO_INVALIDA' });
    const medidas = normalizarMedidas(entrada.medidas);
    if (!Object.values(medidas).some(valor => valor !== null)) return responder(res, 400, { ok: false, erro: 'AVALIACAO_SEM_MEDIDAS' });
    const pedido = db.collection('crmMigrationAssessmentWriteRequests').doc(requestId); const referencia = db.collection('crmMigrationPhysicalAssessments').doc(); const agora = new Date();
    const resultado = await db.runTransaction(async transacao => {
      const repetido = await transacao.get(pedido);
      if (repetido.exists) return { id: texto(repetido.data()?.assessmentId, 128), repetida: true };
      const dados = { clientId, realizadoEm, atualizadoEm: realizadoEm, proximaRevisaoEm: somarDias(realizadoEm, revisaoDias), protocolo: texto(entrada.protocolo, 80), notasPrivadas: texto(entrada.notasPrivadas, 3000), notasCliente: texto(entrada.notasCliente, 1500), medidas, origem: 'firebase-development', criadoEm: agora, criadoPor: identidade.uid };
      for (const campo of LEGADOS) dados[campo] = medidas[campo] ?? null;
      transacao.create(referencia, dados);
      transacao.create(pedido, { assessmentId: referencia.id, clientId, createdAt: agora });
      transacao.create(db.collection('auditLogs').doc(), { action: 'development.assessment.created-v2', actorUid: identidade.uid, clientId, assessmentId: referencia.id, requestId, createdAt: agora });
      return { id: referencia.id, repetida: false };
    });
    return responder(res, resultado.repetida ? 200 : 201, { ok: true, avaliacaoId: resultado.id, repetida: resultado.repetida });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : /^ACESSO_/.test(codigo) ? 403 : /^(AVALIACAO_|REVISAO_|CLIENTE_)/.test(codigo) ? 400 : 500, { ok: false, erro: codigo });
  }
}
