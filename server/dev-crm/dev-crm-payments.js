import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return responder(res, 405, { ok: false, erro: 'METODO_NAO_PERMITIDO' });
  }

  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));

    const [clientes, packs] = await Promise.all([
      db.collection('crmMigrationClients').get(),
      db.collection('crmMigrationPacks').get()
    ]);
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const mes = partes.find(item => item.type === 'year').value + '-' + partes.find(item => item.type === 'month').value;
    const nomes = new Map(clientes.docs.map(documento => [documento.id, documento.data().nome]));
    const lista = packs.docs.map(documento => documento.data())
      .filter(pack => pack.mesAno === mes && pack.estadoPagamento !== 'Pago')
      .map(pack => ({ idCliente: pack.clientId, nome: nomes.get(pack.clientId) || pack.clientId, valorEmAtraso: Number(pack.preco || 0), mesesEmAtraso: 1 }));

    return responder(res, 200, { ok: true, clientesEmAtraso: lista, totalEmAtraso: lista.reduce((soma, cliente) => soma + cliente.valorEmAtraso, 0).toFixed(2) });
  } catch (erro) {
    console.error('Falha ao carregar pagamentos Development:', erro && (erro.code || erro.message));
    return responder(res, 500, { ok: false, erro: 'PAGAMENTOS_INDISPONIVEIS' });
  }
}
