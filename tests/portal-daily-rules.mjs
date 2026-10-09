import assert from 'node:assert/strict';
import { aplicarEstadoHojeFirestore, importarCheckinLegadoHojeFirestore, obterEstadoHojeFirestore, registarCheckinFirestore, registarProntidaoFirestore } from '../server/portal-today.js';
import { obterHistoricoExercicioFirestore, registarExecucaoTreinoFirestore, registarPosTreinoFirestore, registarSessaoMinimaFirestore } from '../server/portal-training-records.js';

class Snapshot {
  constructor(id, value) { this.id = id; this.exists = value !== undefined; this._value = value; }
  data() { return this._value; }
}
class Ref {
  constructor(db, collection, id) { this.db = db; this.collection = collection; this.id = id; }
  async get() { return new Snapshot(this.id, this.db.read(this.collection, this.id)); }
  async create(value) { if (this.db.read(this.collection, this.id) !== undefined) throw new Error('ALREADY_EXISTS'); this.db.write(this.collection, this.id, value); }
}
class Query {
  constructor(db, collection, filters = []) { this.db = db; this.collection = collection; this.filters = filters; }
  where(field, operator, value) { assert.equal(operator, '=='); return new Query(this.db, this.collection, [...this.filters, [field, value]]); }
  async get() {
    const docs = [...(this.db.store.get(this.collection) || new Map())]
      .filter(([, value]) => this.filters.every(([field, expected]) => value[field] === expected))
      .map(([id, value]) => new Snapshot(id, value));
    return { docs, size: docs.length };
  }
}
class FakeFirestore {
  constructor(seed = {}) { this.store = new Map(Object.entries(seed).map(([name, rows]) => [name, new Map(Object.entries(rows))])); this.counter = 0; }
  read(collection, id) { return this.store.get(collection)?.get(id); }
  write(collection, id, value, merge = false) { if (!this.store.has(collection)) this.store.set(collection, new Map()); const current = this.read(collection, id) || {}; this.store.get(collection).set(id, merge ? { ...current, ...value } : value); }
  collection(name) { const query = new Query(this, name); query.doc = id => new Ref(this, name, id || `auto-${++this.counter}`); return query; }
  async runTransaction(work) { return work({ get: ref => ref.get(), set: (ref, value, options) => this.write(ref.collection, ref.id, value, options?.merge) }); }
  batch() { const changes = []; return { create: (ref, value) => changes.push([ref, value]), commit: async () => { changes.forEach(([ref]) => { if (this.read(ref.collection, ref.id) !== undefined) throw new Error('ALREADY_EXISTS'); }); changes.forEach(([ref, value]) => this.write(ref.collection, ref.id, value)); } }; }
}

const now = new Date('2026-10-08T10:00:00.000Z');
const db = new FakeFirestore({
  crmMigrationTrainingPlans: {
    p1: { idCliente: 'cliente-1', nomePlano: 'PPL', nomeTreino: 'Push', exercicio: 'Supino', visibilidade: 'CLIENTE' }
  }
});

const first = await registarCheckinFirestore(db, 'cliente-1', { sono: 4, stress: 2, cansaco: 4, refeicoes: 3, doms: 1, eventId: 'check-1' }, now);
assert.equal(first.sucesso, true);
assert.equal((await registarCheckinFirestore(db, 'cliente-1', { sono: 4, stress: 2, cansaco: 4, refeicoes: 3, doms: 1, eventId: 'check-1' }, now)).repetido, true, 'Repetir o mesmo pedido deve ser idempotente.');
await assert.rejects(() => registarCheckinFirestore(db, 'cliente-1', { sono: 3, stress: 2, cansaco: 3, refeicoes: 3, doms: 0, eventId: 'check-2' }, now), /CHECKIN_JA_REGISTADO/, 'Um segundo check-in diferente deve ser recusado.');
assert.equal([...db.store.get('crmMigrationCheckins').values()][0].clientId, 'cliente-1', 'O CRM deve conseguir ler o novo check-in pela chave clientId.');

const readiness1 = await registarProntidaoFirestore(db, 'cliente-1', { temposMs: [300, 310, 320, 330, 340], eventId: 'ready-1' }, now);
const readiness2 = await registarProntidaoFirestore(db, 'cliente-1', { temposMs: [280, 290, 300, 310, 320], eventId: 'ready-2' }, now);
assert.equal(readiness1.tentativasHoje, 1);
assert.equal(readiness2.tentativasHoje, 2);
await assert.rejects(() => registarProntidaoFirestore(db, 'cliente-1', { temposMs: [250, 260, 270], eventId: 'ready-3' }, now), /LIMITE_TESTE_PRONTIDAO/, 'A terceira tentativa deve ser recusada no servidor.');
await assert.rejects(() => registarProntidaoFirestore(new FakeFirestore(), 'sem-checkin', { temposMs: [250, 260, 270], eventId: 'ready-x' }, now), /CHECKIN_OBRIGATORIO/);

const legacyDb = new FakeFirestore();
assert.equal(await importarCheckinLegadoHojeFirestore(legacyDb, 'cliente-legado', { estadoHoje: { jaFezCheckinHoje: true, checkinHoje: { sono: 4, stress: 2, cansaco: 3, refeicoes: 4, doms: 1, nota: '' } } }, now), true);
assert.equal((await obterEstadoHojeFirestore(legacyDb, 'cliente-legado', now)).jaFezCheckinHoje, true, 'O check-in feito antes da publicação deve ser transportado para o bloqueio diário.');
assert.equal(await importarCheckinLegadoHojeFirestore(legacyDb, 'cliente-legado', { estadoHoje: { jaFezCheckinHoje: true, checkinHoje: { sono: 4, stress: 2, cansaco: 3, refeicoes: 4, doms: 1 } } }, now), false, 'A ponte de transição deve ser idempotente.');

const state = await obterEstadoHojeFirestore(db, 'cliente-1', now);
assert.equal(state.jaFezCheckinHoje, true);
assert.equal(state.testeProntidaoHoje.tentativasHoje, 2);
assert.equal(aplicarEstadoHojeFirestore({ estadoHoje: { legado: true } }, state).estadoHoje.jaFezCheckinHoje, true);

const execution = await registarExecucaoTreinoFirestore(db, 'cliente-1', { nomePlano: 'PPL', nomeTreino: 'Push', eventId: 'workout-1', startedAt: now.toISOString(), exercicios: [{ exercicio: 'Supino', series: [{ reps: '10', carga: '40', velocidade: 'rir:2' }] }] }, now);
assert.equal(execution.seriesRegistadas, 1);
assert.equal([...db.store.get('crmMigrationTrainingExecutions').values()].find(item => item.idSessao === 'workout-1').tipoSessao, 'AUTONOMO');
assert.match((await obterHistoricoExercicioFirestore(db, 'cliente-1', { nomeExercicio: 'Supino', limite: 3 })).sessoes[0].resumo, /40 kg · 10 reps · rir:2/);
assert.equal((await registarExecucaoTreinoFirestore(db, 'cliente-1', { nomePlano: 'PPL', nomeTreino: 'Push', eventId: 'workout-1', startedAt: now.toISOString(), exercicios: [{ exercicio: 'Supino', series: [{ reps: '10', carga: '40' }] }] }, now)).repetido, true);
await assert.rejects(() => registarExecucaoTreinoFirestore(db, 'cliente-1', { nomePlano: 'PPL', nomeTreino: 'Push', eventId: 'workout-2', startedAt: now.toISOString(), exercicios: [{ exercicio: 'Exercício alheio', series: [{ reps: '10', carga: '40' }] }] }, now), /EXERCICIO_NAO_PRESCRITO/);

assert.equal((await registarPosTreinoFirestore(db, 'cliente-1', { nomePlano: 'PPL', nomeTreino: 'Push', energia: 4, esforco: 3, dificuldade: 2, eventId: 'post-1' }, now)).sucesso, true);
assert.equal((await registarPosTreinoFirestore(db, 'cliente-1', { nomePlano: 'PPL', nomeTreino: 'Push', energia: 4, esforco: 3, dificuldade: 2, eventId: 'post-1' }, now)).repetido, true, 'O pós-treino repetido deve ser idempotente.');
assert.equal((await registarSessaoMinimaFirestore(db, 'cliente-1', { minutos: 12, rpe: 4, eventId: 'minimum-1' }, now)).sucesso, true);
assert.equal((await registarSessaoMinimaFirestore(db, 'cliente-1', { minutos: 12, rpe: 4, eventId: 'minimum-1' }, now)).repetido, true, 'A sessão mínima repetida deve ser idempotente.');

console.log('Regras diárias e registos autónomos diretos no Firestore validados.');
