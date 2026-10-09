import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [coach, login] = await Promise.all([
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8'),
  readFile(new URL('../dev-crm.html', import.meta.url), 'utf8')
]);

for (const source of [coach, login]) {
  assert.match(source, /almove:crm-theme/, 'A preferência do tema deve ser partilhada pelo CRM e login');
  assert.match(source, /data-theme=.{0,2}light|dataset\.theme/, 'A página deve aplicar o tema antes de apresentar a interface');
  assert.match(source, /meta\[name=["']theme-color["']\]/, 'A cor do navegador deve acompanhar o tema');
}

assert.match(coach, /id="crm-theme-system"/);
assert.match(coach, /id="crm-light-theme-polish"/);
assert.match(coach, /html\[data-theme="light"\]/);
assert.match(coach, /html\[data-theme="light"\] \.coach-app-link/);
assert.match(coach, /html\[data-theme="light"\] \.dashboard-primary-panel/);
assert.match(coach, /html\[data-theme="light"\] :is\(\.payment-method-panel,\.comando-card/);
assert.match(coach, /html\[data-theme="light"\] \.agenda-bloco-hora/);
assert.match(coach, /function definirTemaCRM\(tema\)/);
assert.match(coach, /id="temaOpcaoEscuro"[^>]+aria-pressed="true"/);
assert.match(coach, /id="temaOpcaoClaro"[^>]+aria-pressed="false"/);
assert.match(coach, /role="group" aria-label="Tema visual do CRM"/);
assert.match(login, /html\[data-theme="light"\] main/);

console.log('Temas claro e escuro do CRM validados por contrato.');
