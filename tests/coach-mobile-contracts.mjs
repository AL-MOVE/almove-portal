import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, manifestText, worker, ptSessionEndpoint, agendaEndpoint] = await Promise.all([
  readFile(new URL('../coach-mobile.html', import.meta.url), 'utf8'),
  readFile(new URL('../coach-mobile-manifest.json', import.meta.url), 'utf8'),
  readFile(new URL('../coach-mobile-sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-pt-session.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-agenda.js', import.meta.url), 'utf8')
]);
const manifest = JSON.parse(manifestText);
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(script => script.trim());

assert.match(page, /coach-mobile-manifest\.json/);
assert.match(page, /AlMoveSessaoCRM\.obterContexto/);
assert.match(page, /\/api\/dev-crm-dashboard/);
assert.match(page, /\/api\/dev-crm-agenda/);
assert.match(page, /\/api\/dev-crm-client-detail/);
assert.match(page, /\/api\/dev-crm-training-plans/);
assert.match(page, /\/api\/dev-crm-training-plan-actions/);
assert.match(page, /\/api\/dev-crm-pt-session/);
assert.match(page, /checkinSono/);
assert.match(page, /checkoutEnergia/);
assert.match(page, /savePlanOriginal/);
assert.match(page, /exercicioOriginal/);
assert.match(page, /Máximo 6 séries/);
assert.match(page, /Abandonar sessão/);
assert.match(page, /confirm-sheet/);
assert.match(page, /captureSessionInputs/);
assert.match(page, /session\.form/);
assert.match(page, /A sessão foi guardada, mas o plano original não foi atualizado/);
assert.match(page, /rir:/);
assert.doesNotMatch(page, /data-velocidade/);
assert.match(page, /coachExerciseLibrary/);
assert.match(page, /sessionVolume/);
assert.match(page, /monthly-pt/);
assert.match(page, /PT contigo/);
assert.match(page, /Autónomo \/ portal/);
assert.match(page, /plan\.visibilidade === 'PT'/);
assert.match(page, /min-width:0/);
assert.match(ptSessionEndpoint, /nomeOriginal/);
assert.match(ptSessionEndpoint, /series\.slice\(0, 6\)/);
assert.match(agendaEndpoint, /modo === 'monthly-pt'/);
assert.match(page, /navigator\.serviceWorker\.register\('\/coach-mobile-sw\.js'/);
assert.equal(manifest.start_url, '/coach-mobile.html?source=pwa');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.orientation, 'portrait-primary');
assert.ok(manifest.icons.some(icon => icon.sizes === '192x192') && manifest.icons.some(icon => icon.sizes === '512x512'));
assert.match(worker, /almove-coach-mobile-shell-v1/);
assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.doesNotMatch(worker, /cache\.put\([^\n]*\/api\//);
scripts.forEach((script, index) => new Function(script));
console.log('Contratos da App Coach mobile validados.');
