import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control', 'no-store, max-age=0'); return res.status(estado).json(corpo); }
function dataLisboa() { const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const parte = tipo => partes.find(item => item.type === tipo).value; return parte('year') + '-' + parte('month') + '-' + parte('day'); }
function rotulo(valor) { const data = new Date(String(valor || '').slice(0, 10) + 'T12:00:00Z'); return Number.isNaN(data.getTime()) ? String(valor || '') : data.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: 'short' }); }

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const clienteId = String(req.query?.clientId || '').trim(); const mes = String(req.query?.mes || '').trim();
    const checkinsSnap = await db.collection('crmMigrationCheckins').get(); const checkins = checkinsSnap.docs.map(documento => documento.data());
    if (clienteId) {
      const lista = checkins.filter(item => item.clientId === clienteId).sort((a, b) => String(b.dataHora || '').localeCompare(String(a.dataHora || '')));
      if (!mes) return responder(res, 200, { ok: true, lista });
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return responder(res, 400, { ok: false, erro: 'MES_INVALIDO' });
      const dias = lista.filter(item => String(item.dataHora || '').slice(0, 7) === mes).sort((a, b) => String(a.dataHora || '').localeCompare(String(b.dataHora || ''))).map(item => ({ ...item, rotulo: rotulo(item.dataHora) }));
      const medias = {}; for (const campo of ['sono', 'stress', 'cansaco', 'refeicoes', 'doms']) medias[campo] = dias.length ? dias.reduce((soma, item) => soma + Number(item[campo] || 0), 0) / dias.length : 0;
      return responder(res, 200, { ok: true, resumo: { total: dias.length, medias, dias } });
    }
    const clientesSnap = await db.collection('crmMigrationClients').get(); const hoje = dataLisboa(); const ultimo = new Map();
    checkins.filter(item => String(item.dataHora || '').slice(0, 10) === hoje).forEach(item => { if (!ultimo.has(item.clientId) || String(item.dataHora) > String(ultimo.get(item.clientId).dataHora)) ultimo.set(item.clientId, item); });
    const ativos = clientesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() })).filter(cliente => cliente.estado === 'Ativo'); const comCheckin = ativos.filter(cliente => ultimo.has(cliente.id)).map(cliente => ({ nome: cliente.nome, ...ultimo.get(cliente.id) }));
    return responder(res, 200, { ok: true, totalAtivos: ativos.length, totalComCheckin: comCheckin.length, comCheckin, semCheckin: ativos.filter(cliente => !ultimo.has(cliente.id)).map(cliente => cliente.nome) });
  } catch (erro) { return responder(res, 500, { ok: false, erro: String(erro.code || erro.message) }); }
}
