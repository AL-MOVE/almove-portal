// Service worker do Portal de André Martins.
// A versão sobe com esta atualização visual para que instalações existentes
// recebam o novo index.html em vez de manterem a versão anterior em cache.

const VERSAO_CACHE = 'almove-portal-v68';
const PREFIXO_CACHE_PORTAL = 'almove-portal-';

// O domínio também aloja ferramentas internas. O service worker do cliente
// não lhes deve responder nem guardá-las na cache da PWA do Portal.
const ROTAS_FORA_DO_PORTAL = new Set([
  '/coach-firebase.html',
  '/coach.html',
  '/coach-manifest.json',
  '/coach-sw.js',
  '/dev-crm.html',
  '/dev-migration.html'
]);

const FICHEIROS_ESSENCIAIS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/al-move-mark.png',
  '/icons/icon-192.png',
  '/icons/icon-any-512.png',
  '/icons/icon-maskable-512.png',
  '/js/activity-heatmap.js',
  '/js/exercise-media.js',
  '/js/firebase-config.js',
  '/js/firebase-sdk.js',
  '/js/firebase-auth.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => cache.addAll(FICHEIROS_ESSENCIAIS))
  );
  // Uma atualização fica em espera até o cliente escolher “Atualizar”.
  // Isto evita recarregamentos a meio de um treino ou formulário.
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome.startsWith(PREFIXO_CACHE_PORTAL) && nome !== VERSAO_CACHE)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  if (!evento.request.url.startsWith('http')) return;

  // Dados do Portal nunca são servidos de cache.
  if (evento.request.url.includes('/api/')) return;

  const url = new URL(evento.request.url);
  if (url.origin === self.location.origin && (
    ROTAS_FORA_DO_PORTAL.has(url.pathname) ||
    url.pathname.startsWith('/icons/coach-')
  )) return;
  const pedePaginaNova = evento.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html');

  // A página principal vai sempre primeiro à rede. Assim, F5 recebe o
  // index.html da última implementação; sem rede usa a cópia guardada.
  if (pedePaginaNova) {
    evento.respondWith(
      fetch(new Request(evento.request, { cache: 'no-store' }))
        .then((respostaRede) => {
          if (!respostaRede || !respostaRede.ok || respostaRede.type !== 'basic') return respostaRede;
          const clone = respostaRede.clone();
          caches.open(VERSAO_CACHE).then((cache) => cache.put(evento.request, clone));
          return respostaRede;
        })
        .catch(() => caches.match(evento.request).then((respostaCache) => (
          respostaCache || caches.match('/').then((paginaPrincipal) => paginaPrincipal || caches.match('/index.html'))
        )))
    );
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => (
      respostaCache ||
      fetch(evento.request).then((respostaRede) => {
        if (respostaRede && respostaRede.status === 200 && respostaRede.type === 'basic') {
          const clone = respostaRede.clone();
          caches.open(VERSAO_CACHE).then((cache) => {
            cache.put(evento.request, clone);
          });
        }
        return respostaRede;
      }).catch(() => caches.match(evento.request).then((respostaCache) => respostaCache || Response.error()))
    ))
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'SKIP_WAITING') self.skipWaiting();
});

// Compatível com uma futura subscrição Web Push. O temporizador também usa
// showNotification através deste service worker enquanto existe uma sessão.
self.addEventListener('push', (evento) => {
  let dados = {};
  try { dados = evento.data ? evento.data.json() : {}; } catch (erro) { dados = { body: evento.data ? evento.data.text() : '' }; }
  evento.waitUntil(self.registration.showNotification(dados.title || 'André Martins - Personal Trainer', {
    body: dados.body || 'Tens uma atualização no teu acompanhamento.',
    icon: '/al-move-mark.png',
    badge: '/al-move-mark.png',
    tag: dados.tag || 'almove-aviso',
    data: { url: dados.url || '/' }
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/';
  evento.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    const aberta = janelas.find((janela) => 'focus' in janela);
    if (aberta) { aberta.navigate(destino); return aberta.focus(); }
    return clients.openWindow(destino);
  }));
});
