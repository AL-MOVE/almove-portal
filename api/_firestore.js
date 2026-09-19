import { getFirestore } from 'firebase-admin/firestore';
import { obterAdminFirebase } from './_firebase.js';

const PAPEIS = new Set(['client', 'coach', 'admin']);

function falha(codigo) {
  const erro = new Error(codigo);
  erro.code = codigo;
  return erro;
}

function texto(valor, maximo, campo) {
  const resultado = String(valor || '').trim();
  if (!resultado || resultado.length > maximo) throw falha('DADOS_INVALIDOS_' + campo);
  return resultado;
}

function inteiro(valor, minimo, maximo, campo) {
  const resultado = Number(valor);
  if (!Number.isInteger(resultado) || resultado < minimo || resultado > maximo) {
    throw falha('DADOS_INVALIDOS_' + campo);
  }
  return resultado;
}

function numeroOpcional(valor, minimo, maximo, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  const resultado = Number(valor);
  if (!Number.isFinite(resultado) || resultado < minimo || resultado > maximo) {
    throw falha('DADOS_INVALIDOS_' + campo);
  }
  return Math.round(resultado * 100) / 100;
}

/**
 * Valida a menor unidade de integridade do treino: uma série. A função é pura
 * para poder ser testada sem Firebase e para a mesma validação viver numa só
 * interface quando o portal passar do Apps Script para Firestore.
 */
export function validarRegistoSerie(entrada) {
  const dados = entrada && typeof entrada === 'object' ? entrada : {};
  return {
    requestId: texto(dados.requestId, 128, 'REQUEST_ID'),
    sessionId: texto(dados.sessionId, 128, 'SESSION_ID'),
    planExerciseId: texto(dados.planExerciseId, 128, 'PLAN_EXERCISE_ID'),
    setNumber: inteiro(dados.setNumber, 1, 20, 'SET_NUMBER'),
    repetitions: inteiro(dados.repetitions, 0, 100, 'REPETITIONS'),
    loadKg: numeroOpcional(dados.loadKg, 0, 2000, 'LOAD_KG'),
    rir: numeroOpcional(dados.rir, 0, 10, 'RIR')
  };
}

/** O browser nunca recebe esta ligação; o Admin SDK só vive na Vercel. */
export function obterFirestoreAlmove() {
  const { projeto, app } = obterAdminFirebase();
  return { projeto, db: getFirestore(app) };
}

/**
 * Adaptador profundo para os primeiros dados migrados. A interface é pequena:
 * contexto autenticado e registo idempotente de uma série. O Apps Script fica
 * intacto até ligarmos esta implementação a uma rota nova.
 */
export function criarAdaptadorFirestore({ db, agora = () => new Date() }) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('FIRESTORE_ADAPTADOR_INVALIDO');
  }

  return Object.freeze({
    async getClientContext(firebaseUid) {
      const uid = texto(firebaseUid, 256, 'FIREBASE_UID');
      const acesso = await db.collection('userAccess').doc(uid).get();
      if (!acesso.exists) throw falha('ACESSO_NAO_ATRIBUIDO');
      const dados = acesso.data() || {};
      if (dados.status !== 'active') throw falha('ACESSO_INATIVO');
      const roles = Array.isArray(dados.roles) ? dados.roles.filter(role => PAPEIS.has(role)) : [];
      if (!roles.length) throw falha('ACESSO_SEM_PAPEL');
      return Object.freeze({
        firebaseUid: uid,
        clientId: dados.clientId ? texto(dados.clientId, 128, 'CLIENT_ID') : '',
        roles: Object.freeze(roles)
      });
    },

    async recordWorkoutSet(contexto, entrada) {
      if (!contexto || !Array.isArray(contexto.roles) || !contexto.roles.includes('client') || !contexto.clientId) {
        throw falha('ACESSO_NEGADO');
      }
      const serie = validarRegistoSerie(entrada);
      const eventoRef = db.collection('workoutSetEvents').doc(serie.requestId);
      const sessaoRef = db.collection('workoutSessions').doc(serie.sessionId);

      return db.runTransaction(async transacao => {
        const existente = await transacao.get(eventoRef);
        if (existente.exists) return { eventId: serie.requestId, repetido: true };

        const sessao = await transacao.get(sessaoRef);
        if (!sessao.exists) throw falha('SESSAO_NAO_ENCONTRADA');
        const dadosSessao = sessao.data() || {};
        if (dadosSessao.clientId !== contexto.clientId || dadosSessao.status !== 'active') {
          throw falha('SESSAO_NAO_AUTORIZADA');
        }

        const planoId = texto(dadosSessao.planId, 128, 'PLAN_ID');
        const exercicioRef = db.collection('trainingPlans').doc(planoId).collection('exercises').doc(serie.planExerciseId);
        const exercicio = await transacao.get(exercicioRef);
        if (!exercicio.exists) throw falha('EXERCICIO_NAO_PRESCRITO');
        const dadosExercicio = exercicio.data() || {};
        if (serie.setNumber > Number(dadosExercicio.targetSets || 0)) throw falha('SERIE_FORA_DO_PLANO');

        const criadoEm = agora();
        transacao.set(eventoRef, {
          ...serie,
          clientId: contexto.clientId,
          firebaseUid: contexto.firebaseUid,
          eventType: 'recorded',
          createdAt: criadoEm
        });
        transacao.update(sessaoRef, { updatedAt: criadoEm });
        return { eventId: serie.requestId, repetido: false };
      });
    }
  });
}
