/* O Coach é instalável sem guardar dados clínicos, alunos ou sessões em cache.
   Toda a autenticação e toda a informação continuam a ser pedidas à rede. */
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(evento) { evento.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(evento) {
  const url = new URL(evento.request.url);
  if (url.pathname.startsWith('/api/')) return;
  evento.respondWith(fetch(evento.request));
});
