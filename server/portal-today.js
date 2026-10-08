import { createHash } from 'node:crypto';

function texto(valor, maximo = 1000) { return String(valor == null ? '' : valor).trim().slice(0, maximo); }
function numero(valor, minimo, maximo) {
  const resultado = Number(valor);
  if (!Number.isFinite(resultado) || resultado < minimo || resultado > maximo) throw new Error('VALOR_INVALIDO');
  return resultado;
}
function idDiario(clienteId, data, tipo) {
  return createHash('sha256').update([tipo, clienteId, data].join('|')).digest('hex');
}
function dataLisboa(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora);
  const parte = tipo => partes.find(item => item.type === tipo)?.value || '';
  return parte('year') + '-' + parte('month') + '-' + parte('day');
}
function mediana(valores) {
  const ordenados = valores.slice().sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}
function estadoProntidao(medianaMs, referenciaMs) {
  if (!referenciaMs) return { desvioPercentual: 0, estado: 'a-criar-referencia' };
  const desvioPercentual = Math.round(((medianaMs - referenciaMs) / referenciaMs) * 100);
  return {
    desvioPercentual,
    estado: desvioPercentual >= 20 ? 'abaixo-do-habitual' : (desvioPercentual <= -15 ? 'acima-do-habitual' : 'dentro-do-habitual')
  };
}

export async function registarCheckinFirestore(db, clienteId, entrada, agora = new Date()) {
  const data = dataLisboa(agora);
  const requestId = texto(entrada?.eventId || entrada?.idempotencyKey, 120);
  if (!requestId) throw new Error('REQUEST_ID_OBRIGATORIO');
  const valores = {
    sono: numero(entrada?.sono, 1, 5),
    stress: numero(entrada?.stress, 1, 5),
    cansaco: numero(entrada?.cansaco, 1, 5),
    refeicoes: numero(entrada?.refeicoes, 1, 5),
    doms: numero(entrada?.doms, 0, 4),
    nota: texto(entrada?.nota, 500)
  };
  const lockRef = db.collection('crmPortalDailyState').doc(idDiario(clienteId, data, 'estado'));
  const checkinRef = db.collection('crmMigrationCheckins').doc(idDiario(clienteId, data, 'checkin'));
  let repetido = false;
  await db.runTransaction(async transacao => {
    const lock = await transacao.get(lockRef);
    const existente = lock.exists ? lock.data() || {} : {};
    if (existente.checkin) {
      if (texto(existente.checkin.requestId, 120) === requestId) { repetido = true; return; }
      throw new Error('CHECKIN_JA_REGISTADO');
    }
    const checkin = { ...valores, requestId, data, dataHora: agora.toISOString() };
    transacao.set(lockRef, { idCliente: clienteId, data, checkin, atualizadoEm: agora }, { merge: true });
    transacao.set(checkinRef, { fonteLinha: null, clientId: clienteId, idCliente: clienteId, ...valores, requestId, dataHora: agora.toISOString(), origem: 'portal-firebase' });
  });
  return { sucesso: true, repetido, tentativasHoje: 1 };
}

export async function importarCheckinLegadoHojeFirestore(db, clienteId, payload, agora = new Date()) {
  const origem = payload?.estadoHoje && typeof payload.estadoHoje === 'object' ? payload.estadoHoje : payload;
  if (!origem?.jaFezCheckinHoje || !origem?.checkinHoje) return false;
  const data = dataLisboa(agora);
  const entrada = origem.checkinHoje;
  const valores = {
    sono: numero(entrada.sono, 1, 5), stress: numero(entrada.stress, 1, 5), cansaco: numero(entrada.cansaco, 1, 5),
    refeicoes: numero(entrada.refeicoes, 1, 5), doms: numero(entrada.doms, 0, 4), nota: texto(entrada.nota, 500)
  };
  const requestId = 'legacy-bootstrap-' + data;
  const lockRef = db.collection('crmPortalDailyState').doc(idDiario(clienteId, data, 'estado'));
  const checkinRef = db.collection('crmMigrationCheckins').doc(idDiario(clienteId, data, 'checkin'));
  let importado = false;
  await db.runTransaction(async transacao => {
    const lock = await transacao.get(lockRef);
    if (lock.exists && lock.data()?.checkin) return;
    const checkin = { ...valores, requestId, data, dataHora: agora.toISOString(), origem: 'apps-script-bridge' };
    transacao.set(lockRef, { idCliente: clienteId, data, checkin, atualizadoEm: agora }, { merge: true });
    transacao.set(checkinRef, { fonteLinha: null, clientId: clienteId, idCliente: clienteId, ...valores, requestId, dataHora: agora.toISOString(), origem: 'apps-script-bridge' });
    importado = true;
  });
  return importado;
}

export async function registarProntidaoFirestore(db, clienteId, entrada, agora = new Date()) {
  const data = dataLisboa(agora);
  const requestId = texto(entrada?.eventId || entrada?.idempotencyKey, 120);
  if (!requestId) throw new Error('REQUEST_ID_OBRIGATORIO');
  const tempos = (Array.isArray(entrada?.temposMs) ? entrada.temposMs : []).map(Number).filter(valor => Number.isFinite(valor) && valor >= 120 && valor <= 1500).slice(0, 5);
  if (tempos.length < 3) throw new Error('TESTE_PRONTIDAO_INVALIDO');

  const historico = await db.collection('crmPortalReadinessTests').where('idCliente', '==', clienteId).get();
  const referencias = historico.docs
    .map(documento => documento.data() || {})
    .sort((a, b) => texto(a.criadoEm, 64).localeCompare(texto(b.criadoEm, 64)))
    .map(item => Number(item.medianaMs || 0))
    .filter(Boolean)
    .slice(-10);
  const referenciaMs = referencias.length >= 8 ? mediana(referencias) : 0;
  const medianaMs = mediana(tempos);
  const avaliacao = estadoProntidao(medianaMs, referenciaMs);
  const lockRef = db.collection('crmPortalDailyState').doc(idDiario(clienteId, data, 'estado'));
  const testeRef = db.collection('crmPortalReadinessTests').doc(createHash('sha256').update([clienteId, requestId].join('|')).digest('hex'));
  let resposta = null;
  await db.runTransaction(async transacao => {
    const lock = await transacao.get(lockRef);
    const existente = lock.exists ? lock.data() || {} : {};
    if (!existente.checkin) throw new Error('CHECKIN_OBRIGATORIO');
    const eventos = Array.isArray(existente.prontidaoEventIds) ? existente.prontidaoEventIds : [];
    const tentativasHoje = Math.max(0, Number(existente.prontidaoTentativas || 0));
    if (eventos.includes(requestId)) { resposta = existente.prontidaoMelhor || null; return; }
    if (tentativasHoje >= 2) throw new Error('LIMITE_TESTE_PRONTIDAO');
    const tentativa = { medianaMs, tentativas: tempos.length, temposMs: tempos, referenciaMs, ...avaliacao, eventId: requestId, data, criadoEm: agora.toISOString() };
    const melhorAnterior = existente.prontidaoMelhor;
    const melhor = melhorAnterior && Number(melhorAnterior.medianaMs) <= medianaMs ? melhorAnterior : tentativa;
    const total = tentativasHoje + 1;
    resposta = { ...melhor, tentativasHoje: total, tentativaExtraUsada: total >= 2 };
    transacao.set(testeRef, { idCliente: clienteId, dispositivo: texto(entrada?.dispositivo, 240), ...tentativa, origem: 'portal-firebase' });
    transacao.set(lockRef, { idCliente: clienteId, data, prontidaoTentativas: total, prontidaoEventIds: [...eventos, requestId].slice(-2), prontidaoMelhor: resposta, atualizadoEm: agora }, { merge: true });
  });
  return { ...(resposta || { medianaMs, tentativas: tempos.length, referenciaMs, ...avaliacao }), sincronizado: true };
}

export async function obterEstadoHojeFirestore(db, clienteId, agora = new Date()) {
  const data = dataLisboa(agora);
  const snapshot = await db.collection('crmPortalDailyState').doc(idDiario(clienteId, data, 'estado')).get();
  if (!snapshot.exists) return { jaFezCheckinHoje: false, checkinHoje: null, testeProntidaoHoje: null };
  const estado = snapshot.data() || {};
  const checkin = estado.checkin ? {
    sono: estado.checkin.sono, stress: estado.checkin.stress, cansaco: estado.checkin.cansaco,
    refeicoes: estado.checkin.refeicoes, doms: estado.checkin.doms, nota: estado.checkin.nota || ''
  } : null;
  return {
    jaFezCheckinHoje: Boolean(checkin),
    checkinHoje: checkin,
    testeProntidaoHoje: estado.prontidaoMelhor ? {
      ...estado.prontidaoMelhor,
      tentativasHoje: Number(estado.prontidaoTentativas || 0),
      tentativaExtraUsada: Number(estado.prontidaoTentativas || 0) >= 2,
      synced: true
    } : null
  };
}

export function aplicarEstadoHojeFirestore(payload, estadoFirestore) {
  if (!payload || typeof payload !== 'object' || !estadoFirestore) return payload;
  const destino = payload.estadoHoje && typeof payload.estadoHoje === 'object' ? { ...payload.estadoHoje } : { ...payload };
  if (estadoFirestore.jaFezCheckinHoje) {
    destino.jaFezCheckinHoje = true;
    destino.checkinHoje = estadoFirestore.checkinHoje;
  }
  if (estadoFirestore.testeProntidaoHoje) destino.testeProntidaoHoje = estadoFirestore.testeProntidaoHoje;
  return payload.estadoHoje && typeof payload.estadoHoje === 'object' ? { ...payload, estadoHoje: destino } : destino;
}
