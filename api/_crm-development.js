import { createHash } from 'node:crypto';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function falha(codigo) {
  const erro = new Error(codigo);
  erro.code = codigo;
  return erro;
}

function texto(valor, campo, maximo, obrigatorio = true) {
  const resultado = String(valor || '').trim();
  if ((!resultado && obrigatorio) || resultado.length > maximo) throw falha('CLIENTE_INVALIDO_' + campo);
  return resultado;
}

export function validarNovoCliente(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  const nome = texto(dados.nome, 'NOME', 120);
  const email = texto(dados.email, 'EMAIL', 254).toLowerCase();
  if (!EMAIL.test(email)) throw falha('CLIENTE_INVALIDO_EMAIL');
  const telefone = texto(dados.telefone, 'TELEFONE', 32, false);
  return Object.freeze({ nome, email, telefone });
}

export function exigirEquipa(contexto) {
  const roles = Array.isArray(contexto?.roles) ? contexto.roles : [];
  if (!roles.includes('admin') && !roles.includes('coach')) throw falha('ACESSO_SEM_PERMISSAO_CRM');
  return contexto;
}

function indiceEmail(email) {
  return createHash('sha256').update(email).digest('hex');
}

/** Repositório pequeno: a UI não conhece coleções, índices nem transações. */
export function criarRepositorioClientes({ db, serverTimestamp }) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function' || typeof serverTimestamp !== 'function') {
    throw new TypeError('CRM_REPOSITORIO_INVALIDO');
  }
  return Object.freeze({
    async listar() {
      const resultado = await db.collection('clients').orderBy('createdAt', 'desc').limit(100).get();
      return resultado.docs.map(documento => {
        const dados = documento.data() || {};
        return Object.freeze({
          id: documento.id,
          nome: String(dados.nome || ''),
          email: String(dados.email || ''),
          telefone: String(dados.telefone || ''),
          estado: String(dados.estado || 'active')
        });
      });
    },
    async criar(contexto, entrada) {
      exigirEquipa(contexto);
      const cliente = validarNovoCliente(entrada);
      const resultado = await db.runTransaction(async transacao => {
        const indice = db.collection('clientEmailIndex').doc(indiceEmail(cliente.email));
        const existente = await transacao.get(indice);
        if (existente.exists) throw falha('CLIENTE_EMAIL_JA_EXISTE');
        const referencia = db.collection('clients').doc();
        const agora = serverTimestamp();
        transacao.create(referencia, {
          nome: cliente.nome, email: cliente.email, telefone: cliente.telefone,
          estado: 'active', createdAt: agora, createdBy: contexto.firebaseUid
        });
        transacao.create(indice, { clientId: referencia.id, createdAt: agora });
        transacao.create(db.collection('auditLogs').doc(), {
          action: 'client.created', actorUid: contexto.firebaseUid, clientId: referencia.id, createdAt: agora
        });
        return { id: referencia.id, ...cliente, estado: 'active' };
      });
      return Object.freeze(resultado);
    }
  });
}
