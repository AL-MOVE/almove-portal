// Service worker do Portal AL MOVE.
// A versão sobe com esta atualização visual para que instalações existentes
// recebam o novo index.html em vez de manterem a versão anterior em cache.

const VERSAO_CACHE = 'almove-portal-v60';

const FICHEIROS_ESSENCIAIS = [
  '/manifest.json',
  '/al-move-mark.png',
  '/js/activity-heatmap.js',
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
          .filter((nome) => nome !== VERSAO_CACHE)
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
  const pedePaginaNova = evento.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html');

  // A página principal vai sempre primeiro à rede. Assim, F5 recebe o
  // index.html da última implementação; sem rede usa a cópia guardada.
  if (pedePaginaNova) {
    evento.respondWith(
      fetch(new Request(evento.request, { cache: 'no-store' }))
        .then((respostaRede) => {
          const clone = respostaRede.clone();
          caches.open(VERSAO_CACHE).then((cache) => cache.put(evento.request, clone));
          return respostaRede;
        })
        .catch(() => caches.match(evento.request))
    );
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => (
      respostaCache ||
      fetch(evento.request).then((respostaRede) => {
        const clone = respostaRede.clone();
        caches.open(VERSAO_CACHE).then((cache) => {
          if (respostaRede && respostaRede.status === 200 && respostaRede.type === 'basic') {
            cache.put(evento.request, clone);
          }
        });
        return respostaRede;
      })
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
  evento.waitUntil(self.registration.showNotification(dados.title || 'AL MOVE', {
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
