import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coach = await readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8');

assert.match(coach, /id="crm-motion-system"/);
assert.match(coach, /--crm-motion-standard: 240ms/);
assert.match(coach, /--crm-ease-out: cubic-bezier\(\.2,\.8,\.2,1\)/);
assert.match(coach, /sidebar-more-toggle[\s\S]*?min-width: 44px !important/);
assert.match(coach, /sidebar-overflow-items\.open[\s\S]*?visibility: visible/);
assert.match(coach, /aria-label="Abrir mais opções"/);
assert.match(coach, /function atualizarAcessibilidadeMenuLateralMais\(\)/);
assert.match(coach, /aria-hidden="false"/);
assert.match(coach, /crm-dialog-in/);
assert.match(coach, /crm-sheet-in/);
assert.match(coach, /prefers-reduced-motion: reduce/);

console.log('Movimento do CRM e controlo compacto da sidebar validados por contrato.');
