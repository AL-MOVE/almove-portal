import { googleAccessToken } from './google-service-account.mjs';

const action = process.argv[2] || 'list';
const allowed = new Set(['list', 'create-daily']);
if (!allowed.has(action)) throw new Error('USO: node scripts/firestore-backups.mjs [list|create-daily]');
const retention = String(process.env.FIRESTORE_BACKUP_RETENTION || '604800s');
if (!/^\d+s$/.test(retention) || Number(retention.slice(0, -1)) < 86400 || Number(retention.slice(0, -1)) > 8467200) throw new Error('FIRESTORE_BACKUP_RETENTION_INVALIDA');

const auth = await googleAccessToken();
const configuredProject = String(process.env.FIREBASE_PROJECT_ID || auth.projectId);
if (configuredProject !== auth.projectId) throw new Error('FIREBASE_PROJECT_ID_NAO_CORRESPONDE');
const parent = `projects/${auth.projectId}/databases/(default)`;
const endpoint = `https://firestore.googleapis.com/v1/${parent}/backupSchedules`;
const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`FIRESTORE_BACKUP_${response.status}_${String(body?.error?.status || 'ERRO')}`);
  return body;
}

const current = await request(endpoint);
const schedules = Array.isArray(current.backupSchedules) ? current.backupSchedules : [];
if (action === 'list') {
  if (!schedules.length) console.log('Não existe um agendamento de backup do Firestore.');
  else schedules.forEach(schedule => console.log(`${schedule.dailyRecurrence ? 'Diário' : 'Semanal'} · retenção ${schedule.retention} · ${schedule.name.split('/').at(-1)}`));
  process.exit(0);
}

if (schedules.some(schedule => schedule.dailyRecurrence)) {
  console.log('O backup diário já está configurado; nenhuma alteração foi feita.');
  process.exit(0);
}
const created = await request(endpoint, { method: 'POST', body: JSON.stringify({ retention, dailyRecurrence: {} }) });
console.log(`Backup diário configurado com retenção ${created.retention || retention}.`);
