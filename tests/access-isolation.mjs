import assert from 'node:assert/strict';
import { criarAdaptadorFirestore } from '../api/_firestore.js';
import { exigirEquipa } from '../api/_crm-development.js';

function accessDatabase(accessByUid, sessionClientId = 'client-b') {
  const writes = [];
  const ref = (path, data) => ({ path, data, async get() { return { exists: Boolean(data), data: () => data || {} }; }, collection(name) { return ref(`${path}/${name}`); }, doc(id) { return ref(`${path}/${id}`); } });
  const db = {
    collection(name) {
      return { doc(id) {
        if (name === 'userAccess') return ref(`${name}/${id}`, accessByUid[id]);
        if (name === 'workoutSessions') return ref(`${name}/${id}`, { clientId: sessionClientId, status: 'active', planId: 'plan-1' });
        if (name === 'trainingPlans') return ref(`${name}/${id}`);
        return ref(`${name}/${id}`);
      } };
    },
    async runTransaction(operation) {
      const transaction = {
        async get(reference) {
          if (reference.path.startsWith('workoutSetEvents/')) return { exists: false };
          if (reference.path.startsWith('trainingPlans/plan-1/exercises/')) return { exists: true, data: () => ({ targetSets: 3 }) };
          return { exists: Boolean(reference.data), data: () => reference.data || {} };
        },
        set(reference, value) { writes.push({ type: 'set', path: reference.path, value }); },
        update(reference, value) { writes.push({ type: 'update', path: reference.path, value }); }
      };
      return operation(transaction);
    }
  };
  return { db, writes };
}

const source = accessDatabase({
  coach: { status: 'active', roles: ['coach'] },
  admin: { status: 'active', roles: ['admin'] },
  client: { status: 'active', roles: ['client'], clientId: 'client-a' },
  inactive: { status: 'inactive', roles: ['coach'] },
  unknown: { status: 'active', roles: ['owner'] }
});
const adapter = criarAdaptadorFirestore({ db: source.db, agora: () => new Date('2026-09-28T12:00:00Z') });
const coach = await adapter.getClientContext('coach'); const admin = await adapter.getClientContext('admin'); const client = await adapter.getClientContext('client');
assert.doesNotThrow(() => exigirEquipa(coach)); assert.doesNotThrow(() => exigirEquipa(admin));
assert.throws(() => exigirEquipa(client), /ACESSO_SEM_PERMISSAO_CRM/);
await assert.rejects(() => adapter.getClientContext('inactive'), /ACESSO_INATIVO/);
await assert.rejects(() => adapter.getClientContext('unknown'), /ACESSO_SEM_PAPEL/);

await assert.rejects(() => adapter.recordWorkoutSet(client, { requestId: 'event-1', sessionId: 'session-1', planExerciseId: 'exercise-1', setNumber: 1, repetitions: 10, loadKg: 30, rir: 2 }), /SESSAO_NAO_AUTORIZADA/);
assert.equal(source.writes.length, 0, 'Um aluno não pode escrever numa sessão de outro aluno.');

const own = accessDatabase({ client: { status: 'active', roles: ['client'], clientId: 'client-a' } }, 'client-a');
const ownAdapter = criarAdaptadorFirestore({ db: own.db, agora: () => new Date('2026-09-28T12:00:00Z') });
const ownClient = await ownAdapter.getClientContext('client');
const recorded = await ownAdapter.recordWorkoutSet(ownClient, { requestId: 'event-2', sessionId: 'session-2', planExerciseId: 'exercise-1', setNumber: 1, repetitions: 10, loadKg: 30, rir: 2 });
assert.equal(recorded.repetido, false); assert.equal(own.writes[0].value.clientId, 'client-a'); assert.equal(own.writes[0].value.firebaseUid, 'client');

console.log('Papéis e isolamento entre alunos validados.');
