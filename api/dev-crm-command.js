import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function partesLisboa() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  return tipo => partes.find(item => item.type === tipo).value;
}

function dataIso(valor) { return String(valor || '').slice(0, 10); }

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const parte = partesLisboa(); const hoje = parte('year') + '-' + parte('month') + '-' + parte('day'); const mes = hoje.slice(0, 7);
    const [clientesSnap, checkinsSnap, sessoesSnap, planosSnap, packsSnap] = await Promise.all([
      db.collection('crmMigrationClients').get(), db.collection('crmMigrationCheckins').get(), db.collection('crmMigrationSessions').get(),
      db.collection('crmMigrationTrainingPlans').get(), db.collection('crmMigrationPacks').get()
    ]);
    const clientes = clientesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(cliente => cliente.estado === 'Ativo');
    const porId = new Map(clientes.map(cliente => [cliente.id, cliente]));
    const comCheckin = new Set(checkinsSnap.docs.map(documento => documento.data()).filter(item => dataIso(item.dataHora) === hoje).map(item => item.clientId));
    const semCheckin = clientes.filter(cliente => !comCheckin.has(cliente.id)).map(cliente => ({ idCliente: cliente.id, nome: cliente.nome }));
    const ultimaSessao = new Map();
    sessoesSnap.docs.map(documento => documento.data()).filter(item => item.estado === 'Confirmada' && porId.has(item.clientId) && dataIso(item.dataConfirmada)).forEach(item => {
      const data = dataIso(item.dataConfirmada); if (!ultimaSessao.has(item.clientId) || data > ultimaSessao.get(item.clientId)) ultimaSessao.set(item.clientId, data);
    });
    const baseHoje = new Date(hoje + 'T12:00:00Z').getTime();
    const semAtividade = [...ultimaSessao.entries()].map(([idCliente, data]) => ({ idCliente, nome: porId.get(idCliente).nome, diasSemTreino: Math.floor((baseHoje - new Date(data + 'T12:00:00Z').getTime()) / 86400000) }))
      .filter(item => item.diasSemTreino >= 14).sort((a, b) => b.diasSemTreino - a.diasSemTreino);
    const porPlano = new Map();
    planosSnap.docs.map(documento => documento.data()).filter(item => porId.has(item.clientId) && dataIso(item.validade)).forEach(item => {
      const chave = item.clientId + '|' + item.nomePlano; const validade = dataIso(item.validade); if (!porPlano.has(chave) || validade < porPlano.get(chave).validade) porPlano.set(chave, { idCliente: item.clientId, nome: porId.get(item.clientId).nome, plano: item.nomePlano, validade });
    });
    const planosAExpirar = [...porPlano.values()].map(item => ({ ...item, diasRestantes: Math.ceil((new Date(item.validade + 'T12:00:00Z').getTime() - baseHoje) / 86400000) }))
      .filter(item => item.diasRestantes <= 7).sort((a, b) => a.diasRestantes - b.diasRestantes);
    const contratosPendentes = clientes.filter(cliente => cliente.contratoFileId && !cliente.assinaturaAceiteEm).map(cliente => ({ idCliente: cliente.id, nome: cliente.nome }));
    const pendentes = packsSnap.docs.map(documento => documento.data()).filter(pack => pack.mesAno === mes && pack.estadoPagamento !== 'Pago' && porId.has(pack.clientId) && Number(porId.get(pack.clientId).diaPagamento || 0) <= Number(parte('day')))
      .map(pack => ({ idCliente: pack.clientId, nome: porId.get(pack.clientId).nome, valorEmAtraso: Number(pack.preco || 0), mesesEmAtraso: 1 }));
    const centro = { resumo: { clientesAtivos: clientes.length, checkinsHoje: comCheckin.size, semCheckin: semCheckin.length, planosAExpirar: planosAExpirar.length, contratosPendentes: contratosPendentes.length, semAtividade: semAtividade.length }, semCheckin: semCheckin.slice(0, 12), planosAExpirar: planosAExpirar.slice(0, 12), contratosPendentes: contratosPendentes.slice(0, 12), semAtividade: semAtividade.slice(0, 12), geradoEm: parte('hour') + ':' + parte('minute') };
    const itens = [];
    if (pendentes.length) itens.push({ tipo: 'pendente', acao: 'pagamentos', quantidade: pendentes.length, titulo: pendentes.length + (pendentes.length === 1 ? ' pagamento em atraso' : ' pagamentos em atraso'), detalhe: pendentes.slice(0, 2).map(item => item.nome).join(' · ') });
    if (planosAExpirar.length) itens.push({ tipo: 'alerta', acao: 'clientes', quantidade: planosAExpirar.length, titulo: planosAExpirar.length + (planosAExpirar.length === 1 ? ' plano a expirar' : ' planos a expirar'), detalhe: planosAExpirar.slice(0, 2).map(item => item.nome + ' · ' + item.diasRestantes + 'd').join(' · ') });
    if (contratosPendentes.length) itens.push({ tipo: 'alerta', acao: 'clientes', quantidade: contratosPendentes.length, titulo: contratosPendentes.length + (contratosPendentes.length === 1 ? ' contrato por aceitar' : ' contratos por aceitar'), detalhe: contratosPendentes.slice(0, 2).map(item => item.nome).join(' · ') });
    if (semAtividade.length) itens.push({ tipo: 'info', acao: 'clientes', quantidade: semAtividade.length, titulo: semAtividade.length + (semAtividade.length === 1 ? ' cliente sem acompanhamento' : ' clientes sem acompanhamento'), detalhe: semAtividade.slice(0, 2).map(item => item.nome + ' · ' + item.diasSemTreino + ' dias').join(' · ') });
    return responder(res, 200, { ok: true, centro, notificacoes: { total: itens.reduce((soma, item) => soma + item.quantidade, 0), itens, geradoEm: centro.geradoEm } });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
