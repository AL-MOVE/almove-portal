import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { obterResumoDespesas } from './dev-crm-expenses.js';
import { carregarLocais, validarLocalCliente } from './locations.js';
import { calcularPagamentosEmAtraso, consolidarPacksMensais, pagamentoEstaConfirmado } from './payment-status.js';
import { erroTemporarioGoogle, registarErroTemporario } from '../../api/_transient-errors.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo); }
function mesAtual() { const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return partes.find(p => p.type === 'year').value + '-' + partes.find(p => p.type === 'month').value; }
function numero(valor) { const resultado = Number(valor); return Number.isFinite(resultado) ? resultado : 0; }

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const [clientesSnap, packsSnap, sessoesSnap, catalogoLocais] = await Promise.all([db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get(), db.collection('crmMigrationSessions').get(), carregarLocais(db)]);
    const clientes = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() })); const clientesPorId = new Map(clientes.map(c => [c.id, c])); const todosPacks = consolidarPacksMensais(packsSnap.docs.map(d => ({ id: d.id, ...d.data() }))); const mesReal = mesAtual(); const pedido = String(req.query?.mes || ''); const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : mesReal;
    const locationFilter = validarLocalCliente(catalogoLocais, req.query?.locationId, { permitirVazio: true, permitirInativo: true });
    const clientesMetricas = locationFilter ? clientes.filter(cliente => String(cliente.localId || '') === locationFilter) : clientes;
    const clientesMetricasPorId = new Map(clientesMetricas.map(cliente => [cliente.id, cliente]));
    const todosPacksMetricas = todosPacks.filter(pack => clientesMetricasPorId.has(pack.clientId));
    const packsTodosMes = todosPacks.filter(p => p.mesAno === mes && clientesPorId.get(p.clientId)?.estado === 'Ativo');
    const packs = todosPacksMetricas.filter(p => p.mesAno === mes && clientesMetricasPorId.get(p.clientId)?.estado === 'Ativo');
    const sessoesTodosMes = sessoesSnap.docs.map(d => d.data()).filter(s => s.mesAno === mes && s.estado === 'Confirmada');
    const sessoes = sessoesTodosMes.filter(s => clientesMetricasPorId.has(s.clientId));
    const confirmadas = new Map(); sessoes.forEach(s => confirmadas.set(s.clientId, (confirmadas.get(s.clientId) || 0) + 1));
    const confirmadasTodos = new Map(); sessoesTodosMes.forEach(s => confirmadasTodos.set(s.clientId, (confirmadasTodos.get(s.clientId) || 0) + 1));
    const packsResumo = packs.map(p => ({ idCliente: p.clientId, frequencia: p.frequencia, sessoesTotal: numero(p.sessoesTotal), sessoesConfirmadas: confirmadas.get(p.clientId) || 0, duracaoMinutos: numero(p.duracaoMinutos), estadoPagamento: p.estadoPagamento, metodoPagamento: p.metodoPagamento || clientesPorId.get(p.clientId)?.metodoPagamento || '', preco: numero(p.preco), precoOrigem: p.precoOrigem || '' }));
    const packsResumoTodos = packsTodosMes.map(p => ({ idCliente: p.clientId, frequencia: p.frequencia, sessoesTotal: numero(p.sessoesTotal), sessoesConfirmadas: confirmadasTodos.get(p.clientId) || 0, duracaoMinutos: numero(p.duracaoMinutos), estadoPagamento: p.estadoPagamento, metodoPagamento: p.metodoPagamento || clientesPorId.get(p.clientId)?.metodoPagamento || '', preco: numero(p.preco), precoOrigem: p.precoOrigem || '' }));
    const total = packsResumo.reduce((a, p) => {
      const pago = pagamentoEstaConfirmado(p.estadoPagamento);
      return { sessoes: a.sessoes + p.sessoesTotal, confirmadas: a.confirmadas + p.sessoesConfirmadas, recebido: a.recebido + (pago ? p.preco : 0), pendente: a.pendente + (pago ? 0 : p.preco), minutos: a.minutos + p.sessoesTotal * p.duracaoMinutos, minutosConfirmados: a.minutosConfirmados + p.sessoesConfirmadas * p.duracaoMinutos, packsPendentes: a.packsPendentes + (pago ? 0 : 1) };
    }, { sessoes: 0, confirmadas: 0, recebido: 0, pendente: 0, minutos: 0, minutosConfirmados: 0, packsPendentes: 0 });
    const despesas = await obterResumoDespesas(db, mes, { locationId: locationFilter, catalogoLocais });
    const clientesEmAtraso = calcularPagamentosEmAtraso({ clientes: clientesMetricas, packs: todosPacksMetricas, mesAno: mes });
    const pagamentosPendentes = packs
      .filter(pack => !pagamentoEstaConfirmado(pack.estadoPagamento))
      .map(pack => {
        const cliente = clientesMetricasPorId.get(pack.clientId) || {};
        return {
          idCliente: pack.clientId,
          nome: cliente.nome || 'Cliente sem nome',
          valorPendente: numero(pack.preco),
          mesReferencia: mes,
          diaPagamento: Number(cliente.diaPagamento) || null,
          metodoPagamento: pack.metodoPagamento || cliente.metodoPagamento || ''
        };
      });
    const receitaPotencial = total.recebido + total.pendente;
    const horasContratadas = total.minutos / 60; const horasRealizadas = total.minutosConfirmados / 60;
    const mesFormatado = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(new Date(mes + '-01T12:00:00'));
    return responder(res, 200, { ok: true, crm: { clientes, locations: catalogoLocais.locais, locationFilter, unassignedClients: clientes.filter(cliente => !cliente.localId).length, packsResumo, packsResumoTodos, pagamentosPendentes, mesAtual: mes, mesVisualizado: mes, mesAtualFormatado: mesFormatado, somenteLeitura: mes !== mesReal, previsao: false, avisoRenovacao: null, clientesEmAtraso, dashboard: { clientesAtivos: clientesMetricas.filter(c => c.estado === 'Ativo').length, totalClientes: clientesMetricas.filter(c => c.estado !== 'Cancelado').length, sessoesConfirmadas: total.confirmadas, sessoesTotal: total.sessoes, horasContratadas: horasContratadas.toFixed(1), horasConfirmadas: horasRealizadas.toFixed(1), taxaConclusao: total.sessoes ? Math.round(total.confirmadas / total.sessoes * 100) : 0, packsAtivos: packsResumo.length, packsPendentes: total.packsPendentes, recebido: total.recebido.toFixed(2), pendente: total.pendente.toFixed(2), receitaPotencial: receitaPotencial.toFixed(2), ticketMedioPack: (packsResumo.length ? receitaPotencial / packsResumo.length : 0).toFixed(2), valorHoraContratada: (horasContratadas ? receitaPotencial / horasContratadas : 0).toFixed(2), valorHoraRealizada: (horasRealizadas ? total.recebido / horasRealizadas : 0).toFixed(2), despesas: despesas.total.toFixed(2), despesasRecorrentes: despesas.recorrentes.toFixed(2), resultadoRecebido: (total.recebido - despesas.total).toFixed(2), lucroEstimado: (receitaPotencial - despesas.total).toFixed(2), receitaPacotesEspeciais: '0.00', clientesEmAtraso: clientesEmAtraso.length } } });
  } catch (erro) { const codigo = String(erro?.code || erro?.message || 'FALHA'); if (erroTemporarioGoogle(erro)) { registarErroTemporario('dev-crm-dashboard', erro); return responder(res, 503, { ok: false, erro: 'SERVICO_TEMPORARIAMENTE_INDISPONIVEL' }); } return responder(res, /^FIREBASE_/.test(codigo) ? 401 : /^CLIENTE_LOCAL_/.test(codigo) ? 400 : 500, { ok: false, erro: codigo }); }
}
