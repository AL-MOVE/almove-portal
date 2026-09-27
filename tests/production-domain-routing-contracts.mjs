import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const coachCrm = fs.readFileSync(new URL('../coach-firebase.html', import.meta.url), 'utf8');
const rotaPorHost = host => vercel.redirects.find(item => item.source === '/' && item.has?.some(regra => regra.type === 'host' && regra.value === host));
const reescritaPorHost = host => vercel.rewrites.find(item => item.source === '/' && item.has?.some(regra => regra.type === 'host' && regra.value === host));

assert.equal(rotaPorHost('crm.almove.pt')?.destination, '/coach-firebase.html');
assert.equal(reescritaPorHost('coach.almove.pt')?.destination, '/coach-mobile.html');
assert.equal(rotaPorHost('portal.almove.pt'), undefined, 'O portal do cliente não pode ser reencaminhado para uma interface de equipa.');
assert.equal(rotaPorHost('crm.almove.pt')?.permanent, false, 'A raiz CRM deve poder mudar sem ficar memorizada pelo browser.');
assert.equal(rotaPorHost('coach.almove.pt'), undefined, 'A App Coach deve manter coach.almove.pt visível no navegador.');
assert.match(coachCrm, /App Coach \(mobile\)/, 'O CRM deve ter um atalho para a app Coach móvel.');
assert.match(coachCrm, /https:\/\/coach\.almove\.pt\//, 'Em produção, o atalho deve usar o domínio Coach.');
console.log('Rotas de produção por domínio validadas.');
