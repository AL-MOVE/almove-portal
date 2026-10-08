import { obterAssertacaoFirebasePortal, obterIdentidadeFirebase } from './_firebase.js';
import { obterFirestoreAlmove } from './_firestore.js';
import { enrichPortalPlans } from '../server/portal-exercise-enrichment.js';
import { aplicarPlanosPortal, clienteAtivoComEmail, construirPlanosPortalFirestore, emailNormalizado } from '../server/portal-training-plans.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyiOl7KkXMYSFv9lKKVb2sMspvwER2P5IMlpNQcr9csLyEDnzJqvVqisE-XVuAHgeUV/exec';

const LEITURAS = new Set([
  'getBootstrapPortal', 'getProgressoBootstrapPortal', 'getEstadoPortalHoje', 'getAvaliacaoFisicaPortal',
  'getHistoricoAvaliacoesFisicasPortal', 'getPesosDiariosPortal', 'getPedidoAvaliacaoPortal', 'getAgendaPortal',
  'getPlanoAtivoPortal', 'getResumoInicioPortal', 'getResumoConquistasPortal', 'getMetricasAtividadePortal',
  'getNotificacoesPortal', 'getResumoPassosPortal', 'getResumoOpcoesPortal', 'getDadosPessoaisPortal',
  'getMapaAtividadePortal', 'getPassaporteTecnicoPortal', 'getHistoricoExercicio'
]);

const ESCRITAS = new Set([
  'pedirCodigoAcessoPortal', 'validarCodigoAcessoPortal', 'terminarSessaoPortal',
  'guardarPedidoPrivacidadePortal', 'guardarPedidoAtualizacaoDadosPortal', 'registarCheckin', 'guardarPesoDiarioPortal', 'guardarPedidoAvaliacaoPortal',
  'registarTesteProntidao', 'marcarNotificacoesLidasPortal', 'guardarMetricasAtividadePortal',
  'guardarPassosPortal', 'registarExecucaoTreino', 'registarPosTreino',
  'registarSessaoMinimaPortal'
]);
const PUBLICAS = new Set();

function responder(res, estado, corpo, requestId) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Request-Id', requestId);
  return res.status(estado).json(corpo);
}

function estadoErroAplicacao(erro) {
  const mensagem = String(erro || '');
  if (/^FIREBASE_NAO_CONFIGURADO|^FIREBASE_CREDENCIAL_INVALIDA/.test(mensagem)) return 503;
  if (/^FIREBASE_/.test(mensagem)) return 401;
  if (/SESSAO_INVALIDA|Link inválido|Falta o token|Token inválido/i.test(mensagem)) return 401;
  if (/ACESSO_PROTEGIDO|código/i.test(mensagem)) return 403;
  if (/LIMITE|Aguarda/i.test(mensagem)) return 429;
  if (/duplicado|já existe|limiteAtingido/i.test(mensagem)) return 409;
  if (/inválid|Indica |Não podes|exige POST|Função desconhecida|demasiad/i.test(mensagem)) return 400;
  return 502;
}

async function obterPlanosFirestorePortal(db, identidade) {
  if (!identidade?.email) return [];
  const clientesSnapshot = await db.collection('crmMigrationClients').get();
  const associados = clientesSnapshot.docs.filter(documento => {
    const dados = documento.data() || {};
    return clienteAtivoComEmail(dados) && emailNormalizado(dados.email) === identidade.email;
  });
  // A associação tem de ser inequívoca. Em caso de duplicado, o Apps Script
  // mantém a resposta atual e nunca misturamos dados de dois clientes.
  if (associados.length !== 1) return [];
  const clienteId = associados[0].id;
  const planosSnapshot = await db.collection('crmMigrationTrainingPlans').where('idCliente', '==', clienteId).get();
  return construirPlanosPortalFirestore(planosSnapshot.docs.map(documento => documento.data() || {}), clienteId);
}

async function enriquecerRespostaPortal(fn, json, identidade) {
  if (fn !== 'getPlanoAtivoPortal' || !json?.ok) return json;
  let personalizados = [];
  let planosFirestore = [];
  try {
    const { db } = obterFirestoreAlmove();
    const [bibliotecaSnapshot, planos] = await Promise.all([
      db.collection('crmExerciseLibrary').get(),
      obterPlanosFirestorePortal(db, identidade)
    ]);
    personalizados = bibliotecaSnapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
    planosFirestore = planos;
  } catch {
    // A folha antiga e o catálogo base continuam disponíveis se o Firestore
    // estiver temporariamente indisponível.
  }
  return enrichPortalPlans(aplicarPlanosPortal(json, planosFirestore), personalizados);
}

export default async function handler(req, res) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return responder(res, 405, { ok: false, erro: 'Método não permitido' }, requestId);
  }

  let fn = '';
  let token = '';
  let dados = {};
  let identidadePortal = null;
  if (req.method === 'GET') {
    fn = String(req.query.fn || '');
    token = String(req.headers['x-almove-session'] || '');
    try { dados = req.query.data ? JSON.parse(String(req.query.data).slice(0, 8000)) : {}; }
    catch { return responder(res, 400, { ok: false, erro: 'Dados inválidos' }, requestId); }
    if (!LEITURAS.has(fn)) return responder(res, 405, { ok: false, erro: 'GET permite apenas leituras' }, requestId);
  } else {
    const comprimento = Number(req.headers['content-length'] || 0);
    if (comprimento > 180000) return responder(res, 413, { ok: false, erro: 'Pedido demasiado grande' }, requestId);
    try { dados = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
    catch { return responder(res, 400, { ok: false, erro: 'JSON inválido' }, requestId); }
    fn = String(dados.fn || '');
    token = String(dados.token || '');
    if (comprimento > 50000) return responder(res, 413, { ok: false, erro: 'Pedido demasiado grande' }, requestId);
    if (!ESCRITAS.has(fn)) return responder(res, 405, { ok: false, erro: 'POST permite apenas gravações' }, requestId);
  }

  // O token Firebase nunca segue para o Apps Script. A Vercel valida-o e
  // troca-o por uma autorização HMAC curta, assinada apenas no servidor.
  if (!PUBLICAS.has(fn) && req.headers.authorization) {
    try {
      identidadePortal = await obterIdentidadeFirebase(req);
      token = await obterAssertacaoFirebasePortal(req, identidadePortal);
    } catch (erro) {
      return responder(res, estadoErroAplicacao(erro.code || erro.message), {
        ok: false,
        erro: 'Sessão Firebase inválida ou expirada',
        codigo: 'FIREBASE_SESSAO_INVALIDA'
      }, requestId);
    }
  }

  const limiteToken = token.startsWith('fb1.') ? 1200 : 200;
  if (!/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(fn) || (!PUBLICAS.has(fn) && !token) || token.length > limiteToken) {
    return responder(res, 400, { ok: false, erro: 'Pedido inválido' }, requestId);
  }

  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 27000);
  try {
    let url = APPS_SCRIPT_URL;
    const opcoes = { redirect: 'follow', signal: controlador.signal, headers: { Accept: 'application/json' } };
    // O browser mantém semântica GET/POST perante a Vercel. Entre a Vercel e
    // o Apps Script usamos sempre POST para a sessão nunca aparecer no URL,
    // em históricos de proxy ou em ferramentas de observabilidade.
    opcoes.method = 'POST';
    opcoes.headers['Content-Type'] = 'text/plain;charset=utf-8';
    opcoes.body = JSON.stringify({ ...dados, fn, token, metodoOriginal: req.method });
    const resposta = await fetch(url, opcoes);
    const texto = await resposta.text();
    let json;
    try { json = JSON.parse(texto); }
    catch { return responder(res, 502, { ok: false, erro: 'Resposta inválida do serviço de dados' }, requestId); }
    if (!resposta.ok) return responder(res, 502, json, requestId);
    if (json && json.ok === false) {
      // Uma identidade Firebase já foi validada pela Vercel. Se o Apps Script
      // não conseguir associar a asserção a um único cliente, isso é um
      // problema de autorização/associação e não uma sessão Firebase expirada.
      // Distinguir os dois casos impede o Portal de terminar uma sessão válida
      // e entrar num ciclo de login.
      if (token.startsWith('fb1.') && /SESSAO_INVALIDA|Link inválido|Falta o token|Token inválido/i.test(String(json.erro || ''))) {
        return responder(res, 403, {
          ok: false,
          erro: 'Esta conta ainda não está associada a um único aluno ativo.',
          codigo: 'PORTAL_CLIENTE_NAO_ASSOCIADO'
        }, requestId);
      }
      return responder(res, estadoErroAplicacao(json.erro), json, requestId);
    }
    return responder(res, 200, await enriquecerRespostaPortal(fn, json, identidadePortal), requestId);
  } catch (erro) {
    const mensagem = erro && erro.name === 'AbortError' ? 'O serviço de dados excedeu o tempo limite' : 'Não foi possível contactar o serviço de dados';
    return responder(res, 504, { ok: false, erro: mensagem }, requestId);
  } finally {
    clearTimeout(timeout);
  }
}
