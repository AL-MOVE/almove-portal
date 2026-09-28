function text(value) { return String(value ?? '').trim(); }
function normalized(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT'); }
function number(value) { const result = Number(text(value).replace(',', '.')); return Number.isFinite(result) ? result : 0; }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round((Number(value) || 0) * factor) / factor; }
function rir(value) { const raw = text(value).replace(/^rir\s*:/i, ''); if (raw === '') return null; const result = Number(raw.replace(',', '.')); return Number.isFinite(result) && result >= 0 && result <= 10 ? result : null; }
function sessionKey(execution) {
  const direct = text(execution?.idSessao || execution?.sessionId);
  if (direct) return direct;
  const request = text(execution?.requestId);
  return request ? request.replace(/-\d+$/, '') : text(execution?.fonteLinha);
}
function sessionDate(session) { return text(session?.data || session?.timestamp || session?.criadoEm); }
function sessionType(value) { return text(value).toUpperCase() === 'PT' ? 'PT' : 'AUTONOMO'; }
function delta(current, previous) { return round((Number(current) || 0) - (Number(previous) || 0)); }

export function buildTrainingHistory({ sessions = [], executions = [] } = {}) {
  const grouped = new Map();
  sessions.forEach(session => {
    const id = text(session?.idSessao || session?.id);
    if (!id) return;
    grouped.set(id, {
      idSessao: id,
      data: sessionDate(session),
      nomePlano: text(session?.nomePlano || session?.plano),
      nomeTreino: text(session?.nomeTreino || session?.treino),
      tipo: 'PT',
      estado: text(session?.estado) || 'REALIZADA',
      duracaoMin: number(session?.duracaoMin),
      notaGeral: text(session?.notaGeral),
      checkin: session?.checkin || null,
      checkout: session?.checkout || null,
      alteracoesPlano: Array.isArray(session?.alteracoesPlano) ? session.alteracoesPlano : [],
      origem: text(session?.origem) || 'PT presencial',
      executions: []
    });
  });

  executions.forEach(execution => {
    const id = sessionKey(execution);
    if (!id) return;
    const current = grouped.get(id) || {
      idSessao: id,
      data: sessionDate(execution),
      nomePlano: text(execution?.nomePlano || execution?.plano),
      nomeTreino: text(execution?.nomeTreino || execution?.treino),
      tipo: sessionType(execution?.tipoSessao),
      estado: 'REALIZADA',
      duracaoMin: number(execution?.duracaoMin),
      notaGeral: '',
      checkin: null,
      checkout: null,
      alteracoesPlano: [],
      origem: sessionType(execution?.tipoSessao) === 'PT' ? 'PT presencial' : 'Treino autónomo',
      executions: []
    };
    if (!current.data || sessionDate(execution) > current.data) current.data = sessionDate(execution);
    current.executions.push(execution || {});
    grouped.set(id, current);
  });

  const history = [...grouped.values()].map(session => {
    const byExercise = new Map();
    session.executions.slice().sort((a, b) => number(a.numeroSerie) - number(b.numeroSerie)).forEach(execution => {
      const name = text(execution?.exercicio) || 'Exercício';
      const key = normalized(name);
      const item = byExercise.get(key) || {
        nome: name,
        nomeOriginal: text(execution?.exercicioOriginal),
        tipoAlteracao: text(execution?.tipoAlteracao).toUpperCase() || 'ORIGINAL',
        motivoAlteracao: text(execution?.motivoAlteracao),
        notas: text(execution?.notas),
        series: []
      };
      const repetitions = number(execution?.reps);
      const load = number(execution?.carga);
      const recordedRir = execution?.rir === '' || execution?.rir == null ? execution?.velocidade : execution.rir;
      item.series.push({ numero: number(execution?.numeroSerie) || item.series.length + 1, reps: text(execution?.reps), carga: text(execution?.carga), rir: rir(recordedRir), volumeKg: round(repetitions * load) });
      byExercise.set(key, item);
    });
    const exercises = [...byExercise.values()].map(item => {
      const rirValues = item.series.map(series => series.rir).filter(value => value !== null);
      return { ...item, numSeries: item.series.length, totalReps: round(item.series.reduce((sum, series) => sum + number(series.reps), 0)), volumeKg: round(item.series.reduce((sum, series) => sum + series.volumeKg, 0)), cargaMax: round(Math.max(0, ...item.series.map(series => number(series.carga)))), rirMedio: rirValues.length ? round(rirValues.reduce((sum, value) => sum + value, 0) / rirValues.length) : null, recordePessoal: false };
    });
    const rirValues = exercises.flatMap(item => item.series.map(series => series.rir)).filter(value => value !== null);
    return {
      idSessao: session.idSessao,
      data: session.data,
      nomePlano: session.nomePlano,
      nomeTreino: session.nomeTreino,
      plano: session.nomePlano,
      treino: session.nomeTreino,
      tipo: session.tipo,
      estado: session.estado,
      duracaoMin: session.duracaoMin,
      notaGeral: session.notaGeral,
      checkin: session.checkin,
      checkout: session.checkout,
      alteracoesPlano: session.alteracoesPlano,
      origem: session.origem,
      exercicios: exercises,
      numSeries: exercises.reduce((sum, item) => sum + item.numSeries, 0),
      numExercicios: exercises.length,
      totalReps: round(exercises.reduce((sum, item) => sum + item.totalReps, 0)),
      volumeKg: round(exercises.reduce((sum, item) => sum + item.volumeKg, 0)),
      cargaMax: round(Math.max(0, ...exercises.map(item => item.cargaMax))),
      rirMedio: rirValues.length ? round(rirValues.reduce((sum, value) => sum + value, 0) / rirValues.length) : null,
      numAdicionados: exercises.filter(item => item.tipoAlteracao === 'ADICIONADO').length,
      numSubstituidos: exercises.filter(item => item.tipoAlteracao === 'SUBSTITUIDO').length,
      recordesPessoais: [],
      comparacao: null
    };
  }).sort((a, b) => (sessionDate(a) + a.idSessao).localeCompare(sessionDate(b) + b.idSessao));

  const bestLoads = new Map();
  history.forEach((session, sessionIndex) => {
    session.exercicios.forEach(exercise => {
      const key = normalized(exercise.nome);
      const previous = bestLoads.get(key) || 0;
      if (exercise.cargaMax > previous && previous > 0) {
        exercise.recordePessoal = true;
        session.recordesPessoais.push({ exercicio: exercise.nome, cargaKg: exercise.cargaMax, anteriorKg: previous });
      }
      if (exercise.cargaMax > previous) bestLoads.set(key, exercise.cargaMax);
    });
    const workoutKey = normalized(session.nomeTreino);
    const previous = workoutKey ? history.slice(0, sessionIndex).filter(candidate => normalized(candidate.nomeTreino) === workoutKey).at(-1) : null;
    if (previous) session.comparacao = { idSessao: previous.idSessao, data: previous.data, volumeKg: delta(session.volumeKg, previous.volumeKg), totalReps: delta(session.totalReps, previous.totalReps), cargaMax: delta(session.cargaMax, previous.cargaMax), rirMedio: session.rirMedio === null || previous.rirMedio === null ? null : delta(session.rirMedio, previous.rirMedio), duracaoMin: delta(session.duracaoMin, previous.duracaoMin) };
  });

  return history.reverse();
}
