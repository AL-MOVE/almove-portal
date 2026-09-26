import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { calcularPagamentosEmAtraso } from './payment-status.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function mesAtual() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return partes.find(item => item.type === 'year').value + '-' + partes.find(item => item.type === 'month').value;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return responder(res, 405, { ok: false, erro: 'METODO_NAO_PERMITIDO' });
  }
  try {
    if (!crmFirebasePermitido()) return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const [clientesSnap, packsSnap] = await Promise.all([db.collection('crmMigrationClients').get(), db.collection('crmMigrationPacks').get()]);
    const clientes = clientesSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }));
    const packs = packsSnap.docs.map(documento => ({ id: documento.id, ...documento.data() }));
    const lista = calcularPagamentosEmAtraso({ clientes, packs, mesAno: mesAtual() });
    return responder(res, 200, { ok: true, clientesEmAtraso: lista, totalEmAtraso: lista.reduce((soma, cliente) => soma + cliente.valorEmAtraso, 0).toFixed(2) });
  } catch (erro) {
    console.error('Falha ao carregar pagamentos Development:', erro && (erro.code || erro.message));
    return responder(res, 500, { ok: false, erro: 'PAGAMENTOS_INDISPONIVEIS' });
  }
}
