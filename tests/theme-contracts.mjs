import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [crm, login, coach, portal] = await Promise.all([
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8'),
  readFile(new URL('../dev-crm.html', import.meta.url), 'utf8'),
  readFile(new URL('../coach-mobile.html', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8')
]);

for (const source of [crm, login]) {
  assert.match(source, /almove:crm-theme/, 'A preferência do tema deve ser partilhada pelo CRM e login');
  assert.match(source, /data-theme=.{0,2}light|dataset\.theme/, 'A página deve aplicar o tema antes de apresentar a interface');
  assert.match(source, /meta\[name=["']theme-color["']\]/, 'A cor do navegador deve acompanhar o tema');
}

for (const surface of [crm, coach, portal]) {
  assert.match(surface, /data-theme/);
  assert.match(surface, /meta\[name="theme-color"\]/);
  assert.match(surface, /html\[data-theme="light"\]/);
  assert.match(surface, /aria-pressed/);
}

assert.match(crm, /id="crm-theme-system"/);
assert.match(crm, /id="crm-light-theme-polish"/);
assert.match(crm, /html\[data-theme="light"\] \.coach-app-link/);
assert.match(crm, /html\[data-theme="light"\] \.dashboard-primary-panel/);
assert.match(crm, /html\[data-theme="light"\] :is\(\.payment-method-panel,\.comando-card/);
assert.match(crm, /html\[data-theme="light"\] \.agenda-bloco-hora/);
assert.match(crm, /function definirTemaCRM\(tema\)/);
assert.match(crm, /id="temaOpcaoEscuro"[^>]+aria-pressed="true"/);
assert.match(crm, /id="temaOpcaoClaro"[^>]+aria-pressed="false"/);
assert.match(crm, /role="group" aria-label="Tema visual do CRM"/);
assert.match(login, /html\[data-theme="light"\] main/);

assert.match(coach, /almove:coach-theme/);
assert.match(coach, /function applyCoachTheme\(theme\)/);
assert.match(coach, /data-coach-theme/);
assert.match(coach, /Tema da aplicação/);

assert.match(portal, /almove:portal-theme/);
assert.match(portal, /function definirTemaPortal\(tema\)/);
assert.match(portal, /data-portal-theme/);
assert.match(portal, /Tema visual do Portal do Cliente/);
assert.match(portal, /class="entrada-portal-tema" role="group" aria-label="Tema visual do Portal"/);

console.log('Temas claro e escuro do CRM, App Coach e Portal validados por contrato.');
