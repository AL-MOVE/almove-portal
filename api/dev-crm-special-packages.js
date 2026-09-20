import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

function hojeLisboa() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const parte = tipo => partes.find(item => item.type === tipo).value;
  return parte('year') + '-' + parte('month') + '-' + parte('day');
}

function textoData(valor) { return String(valor || '').slice(0, 10); }

export default async function handler(req, res) {
  if (req.method !== 'GET') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));

    const [catalogoSnap, pacotesSnap] = await Promise.all([
      db.collection('crmMigrationSpecialPackageCatalog').get(),
      db.collection('crmMigrationSpecialPackages').get()
    ]);
    const catalogo = catalogoSnap.docs.map(documento => {
      const dados = documento.data() || {};
      return {
        linha: Number(dados.fonteLinha) || Number(documento.id) || 0,
        chave: String(dados.chave || ''), nome: String(dados.nome || dados.chave || ''),
        descricao: String(dados.descricao || ''), preco: Number(dados.preco || 0), ativo: dados.ativo !== false
      };
    }).sort((a, b) => a.linha - b.linha);
    const hoje = hojeLisboa();
    const clientes = pacotesSnap.docs.map(documento => {
      const dados = documento.data() || {};
      const dataFim = textoData(dados.dataFim);
      const estado = String(dados.estado || 'Ativo');
      return {
        linha: Number(dados.fonteLinha) || Number(documento.id) || 0,
        nome: String(dados.nome || ''), plano: String(dados.plano || ''), preco: Number(dados.preco || 0),
        dataInicio: textoData(dados.dataInicio), dataFim, estado,
        contacto: String(dados.contacto || ''), notas: String(dados.notas || ''), nif: String(dados.nif || ''),
        historico: estado !== 'Ativo' || (dataFim && dataFim < hoje)
      };
    }).sort((a, b) => a.historico - b.historico || a.nome.localeCompare(b.nome, 'pt-PT'));

    return responder(res, 200, { ok: true, clientes, planos: catalogo.filter(item => item.ativo), catalogo });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo });
  }
}
