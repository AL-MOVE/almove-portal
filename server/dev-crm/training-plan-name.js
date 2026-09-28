export function normalizeTrainingPlanName(value) {
  return String(value || '')
    .trim()
    .slice(0, 200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT');
}

export function sameTrainingPlanName(left, right) {
  const normalized = normalizeTrainingPlanName(left);
  return Boolean(normalized && normalized === normalizeTrainingPlanName(right));
}
