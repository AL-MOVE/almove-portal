import { createHash } from 'node:crypto';
import { googleAccessToken } from '../../api/_google-cloud.js';

const CALENDARS = Object.freeze([
  { id: process.env.GOOGLE_CALENDAR_PT_ID || 'f2f04fa155f4b2fc6d5689327a98d141402777dde8602a98a7f9fe13907510a2@group.calendar.google.com', tipo: 'PT' },
  { id: process.env.GOOGLE_CALENDAR_ASSESSMENTS_ID || '5980bd62bd116248208664152de1d203a3d20df1cf3d147bd1b9c91cc20dc3dc@group.calendar.google.com', tipo: 'AVALIAÇÃO' }
]);

export function normalizarTituloAgenda(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function palavras(valor) { const texto = normalizarTituloAgenda(valor); return texto ? texto.split(/\s+/).filter(Boolean) : []; }
function contemSequencia(texto, sequencia) {
  if (!sequencia.length || sequencia.length > texto.length) return false;
  for (let i = 0; i <= texto.length - sequencia.length; i += 1) {
    if (sequencia.every((palavra, indice) => texto[i + indice] === palavra)) return true;
  }
  return false;
}

export function reconhecerClienteAgenda(titulo, clientes, aliases = new Map()) {
  const tituloNormalizado = normalizarTituloAgenda(titulo); const tituloPalavras = palavras(titulo);
  if (!tituloPalavras.length) return { cliente: null, motivo: 'Título vazio' };
  const aliasId = aliases.get(tituloNormalizado); const alias = clientes.find(cliente => cliente.id === aliasId);
  if (alias) return { cliente: alias, motivo: '' };
  const fortes = clientes.filter(cliente => {
    const nome = palavras(cliente.nome);
    return contemSequencia(tituloPalavras, nome) || (nome.length >= 2 && contemSequencia(tituloPalavras, [nome[0], nome.at(-1)]));
  });
  if (fortes.length === 1) return { cliente: fortes[0], motivo: '' };
  if (fortes.length > 1) return { cliente: null, motivo: 'Nome ambíguo' };
  const primeiros = clientes.filter(cliente => { const nome = palavras(cliente.nome); return nome[0] && tituloPalavras.includes(nome[0]); });
  if (primeiros.length === 1) return { cliente: primeiros[0], motivo: '' };
  return { cliente: null, motivo: primeiros.length ? 'Primeiro nome ambíguo' : 'Cliente não encontrado no CRM' };
}

export function chaveTituloAgenda(titulo) { return createHash('sha256').update(normalizarTituloAgenda(titulo)).digest('hex'); }
function eventoIgnoradoAutomaticamente(titulo) { return ['ferias', 'ferias andre', 'ferias al move'].includes(normalizarTituloAgenda(titulo)); }
function dataLisboa(valor) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(valor); }
function horaLisboa(valor) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(valor); }

async function carregarConfiguracao(db) {
  const [aliasesSnap, ignoradosSnap] = await Promise.all([
    db.collection('crmCalendarAliases').get(), db.collection('crmCalendarIgnoredTitles').get()
  ]);
  return {
    aliases: new Map(aliasesSnap.docs.map(doc => [normalizarTituloAgenda(doc.data().tituloNormalizado || doc.data().titulo), String(doc.data().clientId || '')])),
    ignorados: new Set(ignoradosSnap.docs.map(doc => normalizarTituloAgenda(doc.data().tituloNormalizado || doc.data().titulo)).filter(Boolean))
  };
}

async function pedirPagina(calendarId, token, timeMin, timeMax, pageToken = '') {
  const query = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin, timeMax, timeZone: 'Europe/Lisbon' });
  if (pageToken) query.set('pageToken', pageToken);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 403 || response.status === 404 ? 'CALENDARIO_GOOGLE_SEM_ACESSO' : `CALENDARIO_GOOGLE_HTTP_${response.status}`);
      error.status = response.status;
      error.diagnostic = String(body?.error?.errors?.[0]?.reason || body?.error?.status || `HTTP_${response.status}`).slice(0, 80);
      throw error;
    }
    return body;
  } finally { clearTimeout(timeout); }
}

async function listarEventos(calendar, token, timeMin, timeMax) {
  const eventos = []; let pagina = '';
  do { const body = await pedirPagina(calendar.id, token, timeMin, timeMax, pagina); eventos.push(...(body.items || [])); pagina = String(body.nextPageToken || ''); } while (pagina);
  return eventos.filter(evento => evento.status !== 'cancelled').map(evento => ({ ...evento, tipoAgenda: calendar.tipo }));
}

export async function carregarAgendaGoogle({ db, clientes, semanaInicio, semanaFim }) {
  const auth = await googleAccessToken(['https://www.googleapis.com/auth/calendar.readonly']);
  const inicioAlargado = new Date(`${semanaInicio}T00:00:00Z`); inicioAlargado.setUTCDate(inicioAlargado.getUTCDate() - 1);
  const fimAlargado = new Date(`${semanaFim}T23:59:59Z`); fimAlargado.setUTCDate(fimAlargado.getUTCDate() + 1);
  const [{ aliases, ignorados }, listas] = await Promise.all([
    carregarConfiguracao(db),
    Promise.all(CALENDARS.map(calendar => listarEventos(calendar, auth.token, inicioAlargado.toISOString(), fimAlargado.toISOString())))
  ]);
  const agora = Date.now();
  return listas.flat().map(evento => {
    const titulo = String(evento.summary || 'Sem título').trim() || 'Sem título';
    const inicioTexto = evento.start?.dateTime || (evento.start?.date ? `${evento.start.date}T12:00:00Z` : '');
    const fimTexto = evento.end?.dateTime || (evento.end?.date ? `${evento.end.date}T12:00:00Z` : inicioTexto);
    const inicio = new Date(inicioTexto); const fim = new Date(fimTexto);
    const dia = evento.start?.date || dataLisboa(inicio); const todoDia = Boolean(evento.start?.date);
    const ignorado = evento.tipoAgenda === 'PT' && (eventoIgnoradoAutomaticamente(titulo) || ignorados.has(normalizarTituloAgenda(titulo)));
    const reconhecimento = evento.tipoAgenda === 'PT' && !ignorado ? reconhecerClienteAgenda(titulo, clientes, aliases) : { cliente: null, motivo: evento.tipoAgenda === 'AVALIAÇÃO' ? 'Avaliação física' : 'Fora do controlo de PT' };
    return {
      id: String(evento.id || ''), tipo: evento.tipoAgenda, titulo, clienteId: reconhecimento.cliente?.id || '', clienteNome: reconhecimento.cliente?.nome || '',
      reconhecido: Boolean(reconhecimento.cliente), ignorado, motivoNaoReconhecido: reconhecimento.motivo || '', dia,
      horaInicio: todoDia ? 'Todo o dia' : horaLisboa(inicio), horaFim: todoDia ? '' : horaLisboa(fim), inicioMs: inicio.getTime() || 0,
      diaSemana: new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long' }).format(inicio), local: String(evento.location || ''),
      situacao: fim.getTime() >= agora ? 'Marcada' : 'Decorrida', origem: 'google-calendar'
    };
  }).filter(evento => evento.dia >= semanaInicio && evento.dia <= semanaFim && !evento.ignorado).sort((a, b) => a.inicioMs - b.inicioMs);
}
