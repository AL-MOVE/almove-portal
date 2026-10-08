import { createHash } from 'node:crypto';

function texto(valor, maximo = 1000) { return String(valor == null ? '' : valor).trim().slice(0, maximo); }
function chave(valor) { return texto(valor, 240).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').replace(/\s+/g, ' '); }
function numeroEscala(valor, minimo, maximo) {
  const resultado = Number(valor);
  if (!Number.isFinite(resultado) || resultado < minimo || resultado > maximo) throw new Error('VALOR_INVALIDO');
  return resultado;
}
function dataLisboa(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora);
  const parte = tipo => partes.find(item => item.type === tipo)?.value || '';
  return parte('year') + '-' + parte('month') + '-' + parte('day');
}
function idDocumento(...partes) { return createHash('sha256').update(partes.join('|')).digest('hex'); }

async function linhasPlano(db, clienteId, nomePlano, nomeTreino) {
  const snapshot = await db.collection('crmMigrationTrainingPlans').where('idCliente', '==', clienteId).get();
  return snapshot.docs.map(documento => documento.data() || {}).filter(item =>
    chave(item.nomePlano) === chave(nomePlano) && chave(item.nomeTreino) === chave(nomeTreino) && texto(item.visibilidade, 16).toUpperCase() !== 'PT'
  );
}

async function exigirCheckinHoje(db, clienteId, agora) {
  const data = dataLisboa(agora);
  const snapshot = await db.collection('crmPortalDailyState').doc(idDocumento('estado', clienteId, data)).get();
  if (!snapshot.exists || !snapshot.data()?.checkin) throw new Error('CHECKIN_OBRIGATORIO');
  return data;
}

export async function registarExecucaoTreinoFirestore(db, clienteId, entrada, agora = new Date()) {
  const nomePlano = texto(entrada?.nomePlano, 200);
  const nomeTreino = texto(entrada?.nomeTreino, 200);
  const idSessao = texto(entrada?.eventId, 180);
  const inicio = new Date(texto(entrada?.startedAt, 64));
  if (!nomePlano || !nomeTreino || !idSessao || Number.isNaN(inicio.getTime())) throw new Error('TREINO_INVALIDO');
  const data = await exigirCheckinHoje(db, clienteId, agora);
  const prescritos = await linhasPlano(db, clienteId, nomePlano, nomeTreino);
  if (!prescritos.length) throw new Error('TREINO_NAO_PRESCRITO');
  const permitidos = new Set(prescritos.map(item => chave(item.exercicio)));
  const exercicios = (Array.isArray(entrada?.exercicios) ? entrada.exercicios : []).slice(0, 80);
  const linhas = [];
  exercicios.forEach(exercicio => {
    const nome = texto(exercicio?.exercicio, 200);
    if (!nome || !permitidos.has(chave(nome))) throw new Error('EXERCICIO_NAO_PRESCRITO');
    (Array.isArray(exercicio?.series) ? exercicio.series : []).slice(0, 12).forEach((serie, indice) => {
      const reps = texto(serie?.reps, 40); const carga = texto(serie?.carga, 40); const velocidade = texto(serie?.velocidade, 40);
      if (!reps && !carga && !velocidade) return;
      linhas.push({ exercicio: nome, numeroSerie: indice + 1, reps, carga, velocidade, notas: texto(exercicio?.notas, 1000) });
    });
  });
  if (!linhas.length || linhas.length > 500) throw new Error('TREINO_SEM_SERIES');

  const operacaoRef = db.collection('crmPortalTrainingOperations').doc(idDocumento(clienteId, idSessao, 'execucao'));
  const existente = await operacaoRef.get();
  if (existente.exists) return { sucesso: true, repetido: true, idSessao, seriesRegistadas: Number(existente.data()?.seriesRegistadas || linhas.length) };
  const lote = db.batch();
  linhas.forEach((linha, indice) => lote.create(db.collection('crmMigrationTrainingExecutions').doc(idDocumento(clienteId, idSessao, String(indice + 1))), {
    fonteLinha: null, idCliente: clienteId, clientId: clienteId, nomePlano, nomeTreino, data,
    ...linha, timestamp: agora.toISOString(), requestId: idSessao + '-' + (indice + 1), tipoSessao: 'AUTONOMO',
    registadoPor: clienteId, idSessao, origem: 'portal-firebase'
  }));
  lote.create(operacaoRef, { idCliente: clienteId, idSessao, tipo: 'execucao', seriesRegistadas: linhas.length, criadoEm: agora.toISOString() });
  await lote.commit();
  return { sucesso: true, repetido: false, idSessao, seriesRegistadas: linhas.length };
}

export async function registarPosTreinoFirestore(db, clienteId, entrada, agora = new Date()) {
  const requestId = texto(entrada?.eventId, 180);
  if (!requestId) throw new Error('REQUEST_ID_OBRIGATORIO');
  await exigirCheckinHoje(db, clienteId, agora);
  const ref = db.collection('crmMigrationPostTraining').doc(idDocumento(clienteId, requestId, 'pos'));
  const existente = await ref.get();
  if (existente.exists) return { sucesso: true, repetido: true };
  await ref.create({ fonteLinha: null, idCliente: clienteId, clientId: clienteId, nomePlano: texto(entrada?.nomePlano, 200), nomeTreino: texto(entrada?.nomeTreino, 200), energia: numeroEscala(entrada?.energia, 1, 5), esforco: numeroEscala(entrada?.esforco, 1, 5), dificuldade: numeroEscala(entrada?.dificuldade, 1, 5), nota: texto(entrada?.nota, 500), requestId, dataHora: agora.toISOString(), origem: 'portal-firebase' });
  return { sucesso: true, repetido: false };
}

export async function registarSessaoMinimaFirestore(db, clienteId, entrada, agora = new Date()) {
  const requestId = texto(entrada?.eventId, 180);
  const minutos = Number(entrada?.minutos);
  if (!requestId || ![12, 20].includes(minutos)) throw new Error('SESSAO_MINIMA_INVALIDA');
  const data = await exigirCheckinHoje(db, clienteId, agora);
  const ref = db.collection('crmMigrationTrainingExecutions').doc(idDocumento(clienteId, requestId, 'minima'));
  const existente = await ref.get();
  if (existente.exists) return { sucesso: true, repetido: true, idSessao: requestId };
  await ref.create({ fonteLinha: null, idCliente: clienteId, clientId: clienteId, nomePlano: 'Sessão mínima', nomeTreino: minutos + ' minutos', data, exercicio: 'Sessão mínima', numeroSerie: 1, reps: String(minutos), carga: '', rir: '', velocidade: 'rpe:' + numeroEscala(entrada?.rpe, 1, 10), notas: '', timestamp: agora.toISOString(), duracaoMin: minutos, requestId, tipoSessao: 'AUTONOMO', registadoPor: clienteId, idSessao: requestId, origem: 'portal-firebase' });
  return { sucesso: true, repetido: false, idSessao: requestId };
}

export async function obterHistoricoExercicioFirestore(db, clienteId, entrada) {
  const nome = texto(entrada?.nomeExercicio, 200);
  const limite = Math.max(1, Math.min(12, Number(entrada?.limite) || 3));
  if (!nome) throw new Error('EXERCICIO_OBRIGATORIO');
  const snapshot = await db.collection('crmMigrationTrainingExecutions').where('idCliente', '==', clienteId).get();
  const sessoes = new Map();
  snapshot.docs.map(documento => documento.data() || {}).filter(item => chave(item.exercicio) === chave(nome)).forEach(item => {
    const id = texto(item.idSessao || item.requestId, 180).replace(/-\d+$/, '');
    if (!id) return;
    const atual = sessoes.get(id) || { data: texto(item.data || item.timestamp, 32).slice(0, 10), series: [] };
    atual.series.push({ numero: Number(item.numeroSerie || 0), reps: texto(item.reps, 30), carga: texto(item.carga, 30), intensidade: texto(item.rir || item.velocidade, 30) });
    sessoes.set(id, atual);
  });
  return {
    sessoes: [...sessoes.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, limite).map(sessao => ({
      data: sessao.data,
      resumo: sessao.series.sort((a, b) => a.numero - b.numero).map(serie => {
        const carga = serie.carga ? serie.carga + ' kg' : '';
        const reps = serie.reps ? serie.reps + ' reps' : '';
        return [carga, reps, serie.intensidade].filter(Boolean).join(' · ');
      }).join(' / ')
    }))
  };
}
