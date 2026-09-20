import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function texto(valor, maximo = 160) { return String(valor || '').trim().slice(0, maximo); }
function visibilidade(valor) { return texto(valor, 16).toUpperCase() === 'PT' ? 'PT' : 'CLIENTE'; }
function dataCurta(valor) {
  const iso = texto(valor, 32).slice(0, 10);
  const data = new Date(iso + 'T12:00:00Z');
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: 'short', year: 'numeric' });
}
function diasRestantes(valor) {
  const iso = texto(valor, 32).slice(0, 10);
  if (!iso) return null;
  const hoje = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(hoje);
  const parte = tipo => partes.find(item => item.type === tipo).value;
  const base = new Date(parte('year') + '-' + parte('month') + '-' + parte('day') + 'T12:00:00Z');
  const fim = new Date(iso + 'T12:00:00Z');
  return Number.isNaN(fim.getTime()) ? null : Math.ceil((fim - base) / 86400000);
}

function listarPlanos(linhas, clienteId) {
  const porPlano = new Map();
  linhas.filter(item => item.idCliente === clienteId && item.nomePlano).forEach(item => {
    const nome = texto(item.nomePlano); const atual = porPlano.get(nome) || { nome, treinos: new Set(), atualizadoEm: '', validade: '', visibilidade: visibilidade(item.visibilidade) };
    if (item.nomeTreino) atual.treinos.add(texto(item.nomeTreino));
    if (texto(item.atualizadoEm) > atual.atualizadoEm) atual.atualizadoEm = texto(item.atualizadoEm, 32);
    if (!atual.validade && item.validade) atual.validade = texto(item.validade, 32);
    porPlano.set(nome, atual);
  });
  return [...porPlano.values()].map(item => ({ nome: item.nome, numTreinos: item.treinos.size, atualizadoEm: dataCurta(item.atualizadoEm), validoAte: dataCurta(item.validade), diasRestantes: diasRestantes(item.validade), visibilidade: item.visibilidade })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}

function listarTreinos(linhas, clienteId, nomePlano) {
  const porTreino = new Map();
  linhas.filter(item => item.idCliente === clienteId && item.nomePlano === nomePlano && item.nomeTreino).forEach(item => {
    const nome = texto(item.nomeTreino); const atual = porTreino.get(nome) || { nome, numExercicios: 0, atualizadoEm: '', visibilidade: visibilidade(item.visibilidade) };
    atual.numExercicios += 1; if (texto(item.atualizadoEm) > atual.atualizadoEm) atual.atualizadoEm = texto(item.atualizadoEm, 32); porTreino.set(nome, atual);
  });
  return [...porTreino.values()].map(item => ({ ...item, atualizadoEm: dataCurta(item.atualizadoEm) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
}

function detalheTreino(linhas, clienteId, nomePlano, nomeTreino) {
  const selecionadas = linhas.filter(item => item.idCliente === clienteId && item.nomePlano === nomePlano && item.nomeTreino === nomeTreino).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  return { exercicios: selecionadas.map(item => ({ exercicio: texto(item.exercicio), series: String(item.series ?? ''), repsMin: String(item.repsMin ?? ''), repsMax: String(item.repsMax ?? ''), rir: item.rir == null ? '' : String(item.rir), notas: texto(item.notas, 1500), tipoPrescricao: texto(item.tipoPrescricao).toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS', descansoSegundos: String(item.descansoSegundos || 60), aquecimento: item.aquecimento === true || String(item.aquecimento).toLowerCase() === 'true', grupoSuperserie: texto(item.grupoSuperserie, 20).toUpperCase() })), visibilidade: selecionadas.length ? visibilidade(selecionadas[0].visibilidade) : 'CLIENTE' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const [planosSnap, clientesSnap] = await Promise.all([db.collection('crmMigrationTrainingPlans').get(), db.collection('crmMigrationClients').get()]);
    const linhas = planosSnap.docs.map(documento => documento.data()); const clientes = new Map(clientesSnap.docs.map(documento => [documento.id, { id: documento.id, ...documento.data() }]));
    const acao = texto(req.query?.action, 24) || 'plans'; const clienteId = texto(req.query?.clientId, 128); const nomePlano = texto(req.query?.plan, 160); const nomeTreino = texto(req.query?.workout, 160);
    if (acao === 'plans') return responder(res, 200, { ok: true, planos: listarPlanos(linhas, clienteId) });
    if (acao === 'workouts') return responder(res, 200, { ok: true, treinos: listarTreinos(linhas, clienteId, nomePlano) });
    if (acao === 'detail') return responder(res, 200, { ok: true, ...detalheTreino(linhas, clienteId, nomePlano, nomeTreino) });
    if (acao === 'library') {
      const nomes = [...new Set(linhas.map(item => texto(item.exercicio)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-PT'));
      return responder(res, 200, { ok: true, exercicios: nomes.map((nome, indice) => ({ id: 'migrado-' + (indice + 1), nome, padraoMovimento: '', grupoMuscular: '', equipamento: '' })), aviso: nomes.length ? '' : 'Ainda não existem exercícios migrados.' });
    }
    if (acao === 'replicable') {
      const planos = [];
      for (const [idCliente, cliente] of clientes) {
        if (cliente.estado !== 'Ativo') continue;
        listarPlanos(linhas, idCliente).forEach(plano => {
          const treinos = listarTreinos(linhas, idCliente, plano.nome); planos.push({ idCliente, cliente: cliente.nome, estadoCliente: cliente.estado, nomePlano: plano.nome, numTreinos: treinos.length, numExercicios: treinos.reduce((soma, treino) => soma + treino.numExercicios, 0), atualizadoEm: plano.atualizadoEm, dataValidade: plano.validoAte });
        });
      }
      return responder(res, 200, { ok: true, planos: planos.sort((a, b) => (a.cliente + a.nomePlano).localeCompare(b.cliente + b.nomePlano, 'pt-PT')) });
    }
    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
