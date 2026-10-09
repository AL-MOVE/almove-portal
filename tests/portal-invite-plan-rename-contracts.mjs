import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, portalAccess, plans, coach] = await Promise.all([
  readFile(new URL('../api/dev-crm.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-portal-access.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/dev-crm/dev-crm-training-plan-actions.js', import.meta.url), 'utf8'),
  readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8')
]);

assert.match(api, /'portal-access': acessoPortal/);
assert.match(portalAccess, /EMAIL_ASSOCIADO_A_VARIOS_CLIENTES/);
assert.match(portalAccess, /AGUARDA_UM_MINUTO_PARA_REENVIAR/);
assert.match(portalAccess, /auth\.createUser\(/);
assert.doesNotMatch(portalAccess, /deleteUser\(/);
assert.match(coach, /AlMoveFirebaseAuth\.enviarRecuperacao\(preparado\.email,preparado\.portalUrl\)/);

assert.match(plans, /acao === 'rename-plan'/);
assert.match(plans, /PLANO_DESTINO_JA_EXISTE/);
assert.match(plans, /crmTrainingPlanVersions/);
assert.match(plans, /nomePlanoOriginal/);
assert.match(coach, /renomearPlanoUI/);
assert.match(coach, /renomearPlano:'rename-plan'/);

assert.match(coach, /sidebar-motion-fix/);
assert.match(coach, /--sidebar-motion-duration: 260ms/);
assert.match(coach, /--sidebar-motion-ease: cubic-bezier\(\.2,\.8,\.2,1\)/);
assert.match(coach, /width: 224px !important/);
assert.match(coach, /transform: translate\(-190px,-50%\)/);
assert.doesNotMatch(coach, /transition: opacity \.16s ease, max-width/);
assert.match(coach, /prefers-reduced-motion/);
assert.match(coach, /id="sidebarMoreToggle"/);
assert.match(coach, /id="sidebarOverflowItems"/);
assert.match(coach, /function toggleMenuLateralMais\(event\)/);
assert.match(coach, /min-width: 1025px\) and \(max-height: 860px/);
assert.match(coach, /sidebar-overflow-items\.open/);

console.log('Convites, renomeação de planos e movimento da sidebar validados por contrato.');
