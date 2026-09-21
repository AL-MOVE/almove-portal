import { obterAdminFirebase, obterIdentidadeFirebase } from '../../api/_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(estado).json(corpo);
}
function texto(valor, maximo) { return String(valor || '').trim().slice(0, maximo); }
function preco(valor) { const numero = Number(valor); return Number.isFinite(numero) && numero >= 0 && numero <= 100000 ? Math.round(numero * 100) / 100 : null; }
function data(valor) { const resultado = texto(valor, 10); return /^\d{4}-\d{2}-\d{2}$/.test(resultado) ? resultado : ''; }
function linhaNova() { return Date.now(); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false });
  try {
    if (obterAdminFirebase().projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false });
    const identidade = await obterIdentidadeFirebase(req); const { db } = obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid));
    const dados = req.body && typeof req.body === 'object' ? req.body : {}; const acao = texto(dados.action, 40); const agora = new Date();
    const auditar = (transacao, acaoAuditoria, extra = {}) => transacao.create(db.collection('auditLogs').doc(), { action: acaoAuditoria, actorUid: identidade.uid, createdAt: agora, ...extra });
    if (acao === 'create-package') {
      const nome = texto(dados.nome, 120); const plano = texto(dados.plano, 100); const inicio = data(dados.dataInicio); const fim = data(dados.dataFim); if (!nome || !plano || !inicio || !fim || fim <= inicio) return responder(res, 400, { ok: false, erro: 'PACOTE_INVALIDO' });
      const catalogo = await db.collection('crmMigrationSpecialPackageCatalog').get(); const produto = catalogo.docs.map(documento => documento.data()).find(item => item.chave === plano && item.ativo !== false); if (!produto) return responder(res, 400, { ok: false, erro: 'PLANO_INVALIDO' });
      const referencia = db.collection('crmMigrationSpecialPackages').doc(); const fonteLinha = linhaNova(); await db.runTransaction(async transacao => { transacao.create(referencia, { fonteLinha, nome, plano, preco: Number(produto.preco || 0), dataInicio: inicio, dataFim: fim, estado: 'Ativo', contacto: texto(dados.contacto, 64), nif: texto(dados.nif, 32), notas: texto(dados.notas, 1500), origem: 'firebase-development' }); auditar(transacao, 'development.special-package.created', { specialPackageId: referencia.id }); });
      return responder(res, 201, { ok: true });
    }
    if (acao === 'set-package-state') {
      const linha = Number(dados.linha); const estado = texto(dados.estado, 16); if (!Number.isFinite(linha) || !['Ativo', 'Cancelado'].includes(estado)) return responder(res, 400, { ok: false, erro: 'PACOTE_INVALIDO' });
      const pacotes = await db.collection('crmMigrationSpecialPackages').get(); const pacote = pacotes.docs.find(documento => Number(documento.data().fonteLinha) === linha); if (!pacote) return responder(res, 404, { ok: false, erro: 'PACOTE_NAO_ENCONTRADO' });
      await db.runTransaction(async transacao => { transacao.update(pacote.ref, { estado, updatedAt: agora, updatedBy: identidade.uid }); auditar(transacao, 'development.special-package.state-changed', { specialPackageId: pacote.id, estado }); }); return responder(res, 200, { ok: true });
    }
    if (acao === 'save-product') {
      const nome = texto(dados.nome, 120); const descricao = texto(dados.descricao, 250); const valor = preco(dados.preco); const linha = Number(dados.linha); if (!nome || valor === null) return responder(res, 400, { ok: false, erro: 'PRODUTO_INVALIDO' });
      const catalogo = db.collection('crmMigrationSpecialPackageCatalog'); let existente = null; if (Number.isFinite(linha) && linha > 0) { const itens = await catalogo.get(); existente = itens.docs.find(documento => Number(documento.data().fonteLinha) === linha); }
      await db.runTransaction(async transacao => { if (existente) { transacao.update(existente.ref, { nome, descricao, preco: valor, updatedAt: agora, updatedBy: identidade.uid }); auditar(transacao, 'development.special-product.updated', { specialProductId: existente.id }); } else { const referencia = catalogo.doc(); const chave = 'especial-' + linhaNova(); transacao.create(referencia, { fonteLinha: linhaNova(), chave, nome, descricao, preco: valor, ativo: true, origem: 'firebase-development' }); auditar(transacao, 'development.special-product.created', { specialProductId: referencia.id }); } });
      return responder(res, 200, { ok: true });
    }
    return responder(res, 400, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (erro) { const codigo = String(erro?.code || erro?.message || 'FALHA'); return responder(res, /^FIREBASE_/.test(codigo) ? 401 : 500, { ok: false, erro: codigo }); }
}
