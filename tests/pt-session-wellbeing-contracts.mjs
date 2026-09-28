import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [coach, endpoint, detalhe, historico] = await Promise.all([
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-pt-session.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-client-detail.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/training-history.js', import.meta.url), 'utf8')
]);

for (const campo of [
  'sessaoPTCheckinSono', 'sessaoPTCheckinStress', 'sessaoPTCheckinEnergia', 'sessaoPTCheckinRefeicoes', 'sessaoPTCheckinDoms',
  'sessaoPTCheckoutEnergia', 'sessaoPTCheckoutEsforco', 'sessaoPTCheckoutDificuldade'
]) assert.match(coach, new RegExp(campo));

assert.match(coach, /lerBemEstarSessaoPT/);
assert.match(coach, /checkin:sessao\.checkin\|\|null,checkout:sessao\.checkout\|\|null/);
assert.doesNotMatch(coach, /Como instalar/);
assert.doesNotMatch(coach, /btnInstalarCoach/);
assert.match(endpoint, /CHECKIN_PT/);
assert.match(endpoint, /CHECKOUT_PT/);
assert.match(endpoint, /checkin, checkout/);
assert.match(detalhe, /buildTrainingHistory/);
assert.match(historico, /checkin: session\?\.checkin \|\| null/);
assert.match(historico, /checkout: session\?\.checkout \|\| null/);

console.log('Contratos de bem-estar nas sessões PT validados.');
