import { createHash } from 'node:crypto';

function text(value) { return String(value ?? '').trim(); }

export function trainingPlanRevision(items = []) {
  const updated = items.reduce((latest, item) => {
    const value = text(item?.atualizadoEm);
    return value > latest ? value : latest;
  }, '');
  if (updated) return updated;

  const stable = items.map(item => ({
    ordem: Number(item?.ordem || 0),
    exercicio: text(item?.exercicio),
    series: text(item?.series),
    repsMin: text(item?.repsMin),
    repsMax: text(item?.repsMax),
    rir: text(item?.rir),
    notas: text(item?.notas),
    tipoPrescricao: text(item?.tipoPrescricao),
    descansoSegundos: text(item?.descansoSegundos),
    aquecimento: item?.aquecimento === true || String(item?.aquecimento).toLowerCase() === 'true',
    grupoSuperserie: text(item?.grupoSuperserie)
  })).sort((a, b) => a.ordem - b.ordem || a.exercicio.localeCompare(b.exercicio, 'pt-PT'));
  return stable.length ? 'legacy-' + createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 40) : '';
}
