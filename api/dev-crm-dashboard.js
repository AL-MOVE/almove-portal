import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo); }
function mesAtual() { const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return partes.find(p => p.type === 'year').value + '-' + partes.find(p => p.type === 'month').value; }

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const [clientesSnap, packsSnap, sessoesSnap] = await Promise.all([db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get(), db.collection('crmMigrationSessions').get()]);
    const clientes = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() })); const clientesPorId = new Map(clientes.map(c => [c.id, c])); const mes = mesAtual();
    const packs = packsSnap.docs.map(d => d.data()).filter(p => p.mesAno === mes && clientesPorId.get(p.clientId)?.estado === 'Ativo');
    const sessoes = sessoesSnap.docs.map(d => d.data()).filter(s => s.mesAno === mes && s.estado === 'Confirmada');
    const confirmadas = new Map(); sessoes.forEach(s => confirmadas.set(s.clientId, (confirmadas.get(s.clientId) || 0) + 1));
    const packsResumo = packs.map(p => ({ idCliente: p.clientId, frequencia: p.frequencia, sessoesTotal: p.sessoesTotal, sessoesConfirmadas: confirmadas.get(p.clientId) || 0, duracaoMinutos: p.duracaoMinutos, estadoPagamento: p.estadoPagamento, preco: p.preco }));
    const total = packsResumo.reduce((a,p) => ({ sessoes: a.sessoes + p.sessoesTotal, confirmadas: a.confirmadas + p.sessoesConfirmadas, recebido: a.recebido + (p.estadoPagamento === 'Pago' ? p.preco : 0), pendente: a.pendente + (p.estadoPagamento === 'Pago' ? 0 : p.preco), minutos: a.minutos + p.sessoesTotal * p.duracaoMinutos, minutosConfirmados: a.minutosConfirmados + p.sessoesConfirmadas * p.duracaoMinutos }), { sessoes:0, confirmadas:0, recebido:0, pendente:0, minutos:0, minutosConfirmados:0 });
    const mesFormatado = new Intl.DateTimeFormat('pt-PT', { month:'long', year:'numeric', timeZone:'Europe/Lisbon' }).format(new Date());
    return responder(res, 200, { ok:true, crm: { clientes, packsResumo, mesAtual:mes, mesAtualFormatado:mesFormatado, avisoRenovacao:null, clientesEmAtraso:[], dashboard:{ clientesAtivos:clientes.filter(c=>c.estado==='Ativo').length, totalClientes:clientes.filter(c=>c.estado!=='Cancelado').length, sessoesConfirmadas:total.confirmadas, sessoesTotal:total.sessoes, horasContratadas:(total.minutos/60).toFixed(1), horasConfirmadas:(total.minutosConfirmados/60).toFixed(1), taxaConclusao:total.sessoes?Math.round(total.confirmadas/total.sessoes*100):0, packsAtivos:packsResumo.length, recebido:total.recebido.toFixed(2), pendente:total.pendente.toFixed(2), receitaPotencial:(total.recebido+total.pendente).toFixed(2), receitaPacotesEspeciais:'0.00', clientesEmAtraso:0 } } });
  } catch (erro) { const codigo=String(erro?.code||erro?.message||'FALHA'); return responder(res, /^FIREBASE_/.test(codigo)?401:500, {ok:false,erro:codigo}); }
}
