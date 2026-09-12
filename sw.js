// Service worker do Portal AL MOVE.
// Por agora só trata de: (1) tornar a app instalável, (2) guardar o essencial
// em cache para abrir mesmo com rede fraca/sem rede, (3) avisar quando há
// uma versão nova, em vez de mostrar silenciosamente a versão antiga em cache.

const VERSAO_CACHE = 'almove-portal-v2'; // <-- muda este número sempre que fizeres uma alteração importante

const FICHEIROS_ESSENCIAIS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-any-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => cache.addAll(FICHEIROS_ESSENCIAIS))
  );
  self.skipWaiting();
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
  // Só lidamos com pedidos http/https normais. Pedidos de extensões do
  // browser (chrome-extension://), dados embutidos (data:) e afins nunca
  // podem ser guardados em cache — tentar fazê-lo gera um erro.
  if (!evento.request.url.startsWith('http')) {
    return;
  }

  // Nunca guardamos em cache pedidos à nossa API — esses têm de vir sempre
  // frescos do servidor, nunca de uma versão antiga guardada no telemóvel.
  if (evento.request.url.includes('/api/')) {
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      return (
        respostaCache ||
        fetch(evento.request).then((respostaRede) => {
          const clone = respostaRede.clone();
          caches.open(VERSAO_CACHE).then((cache) => {
            // Só guarda respostas normais e bem-sucedidas — evita tentar
            // guardar erros ou respostas opacas de origens estranhas.
            if (respostaRede && respostaRede.status === 200 && respostaRede.type === 'basic') {
              cache.put(evento.request, clone);
            }
          });
          return respostaRede;
        })
      );
    })
  );
});

// Permite que a página peça ao service worker para activar a versão nova
// imediatamente, assim que o utilizador confirmar o aviso de actualização.
self.addEventListener('message', (evento) => {
  if (evento.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
