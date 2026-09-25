import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import agenda from '../server/dev-crm/dev-crm-agenda.js';
import avaliacoes from '../server/dev-crm/dev-crm-assessment-schedule.js';
import avaliacoesAvancadas from '../server/dev-crm/dev-crm-assessments.js';
import checkins from '../server/dev-crm/dev-crm-checkins.js';
import acoesCliente from '../server/dev-crm/dev-crm-client-actions.js';
import criarCliente from '../server/dev-crm/dev-crm-client-create.js';
import detalheCliente from '../server/dev-crm/dev-crm-client-detail.js';
import clientes from '../server/dev-crm/dev-crm-clients.js';
import comando from '../server/dev-crm/dev-crm-command.js';
import dashboard from '../server/dev-crm/dev-crm-dashboard.js';
import migracao from '../server/dev-crm/dev-crm-migration.js';
import pagamentos from '../server/dev-crm/dev-crm-payments.js';
import sessaoPt from '../server/dev-crm/dev-crm-pt-session.js';
import recibos from '../server/dev-crm/dev-crm-receipts.js';
import renovacoes from '../server/dev-crm/dev-crm-renewals.js';
import acoesPacotesEspeciais from '../server/dev-crm/dev-crm-special-package-actions.js';
import pacotesEspeciais from '../server/dev-crm/dev-crm-special-packages.js';
import acoesPlanos from '../server/dev-crm/dev-crm-training-plan-actions.js';
import planos from '../server/dev-crm/dev-crm-training-plans.js';
import definicoes from '../server/dev-crm/dev-crm-settings.js';
import sessao from '../server/dev-crm/dev-crm-session.js';
import despesas from '../server/dev-crm/dev-crm-expenses.js';

const ROTAS = Object.freeze({
  agenda, 'assessment-schedule': avaliacoes, assessments: avaliacoesAvancadas, checkins, 'client-actions': acoesCliente, 'client-create': criarCliente,
  'client-detail': detalheCliente, clients: clientes, command: comando, dashboard, migration: migracao, payments: pagamentos,
  'pt-session': sessaoPt, receipts: recibos, renewals: renovacoes, 'special-package-actions': acoesPacotesEspeciais,
  'special-packages': pacotesEspeciais, 'training-plan-actions': acoesPlanos, 'training-plans': planos, settings: definicoes, session: sessao,
  expenses: despesas
});

function responder(res, estado, corpo) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(estado).json(corpo);
}

/** Sonda temporária: só confirma Vercel → Firestore no projeto de desenvolvimento. */
export default async function handler(req, res) {
  const rota = String(req.query?.route || '');
  if (ROTAS[rota]) return ROTAS[rota](req, res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return responder(res, 405, { ok: false, erro: 'Método não permitido' });
  }
  const { projeto } = obterAdminFirebase();
  if (projeto !== 'almove-portal-dev') return responder(res, 404, { ok: false, erro: 'Indisponível' });
  try {
    const identidade = await obterIdentidadeFirebase(req);
    const { db } = obterFirestoreAlmove();
    const contexto = await criarAdaptadorFirestore({ db }).getClientContext(identidade.uid);
    return responder(res, 200, {
      ok: true, ambiente: 'development', email: identidade.email,
      roles: contexto.roles, clientId: contexto.clientId || null
    });
  } catch (erro) {
    const codigo = String(erro?.code || erro?.message || 'FALHA');
    if (/^FIREBASE_/.test(codigo)) return responder(res, 401, { ok: false, erro: codigo });
    if (/^ACESSO_/.test(codigo)) return responder(res, 403, { ok: false, erro: codigo });
    return responder(res, 500, { ok: false, erro: 'FIRESTORE_INDISPONIVEL' });
  }
}
