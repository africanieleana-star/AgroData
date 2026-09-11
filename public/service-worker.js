// -----------------------------------------------------------------------
// SERVICE WORKER de AgroData
// -----------------------------------------------------------------------
// "network-first": siempre intenta traer la versión más nueva del
// servidor primero, y solo si no hay conexión a internet usa la copia
// guardada. Sube el número de versión (CACHE_NAME) cada vez que se
// cambia este archivo, para que el navegador instale la versión nueva
// y borre las cachés viejas solo.
//
// IMPORTANTE: Solo interviene en pedidos GET de este mismo sitio (HTML,
// JS, CSS, imágenes propias). Cualquier otro pedido (POST, o a otros
// dominios como firestore.googleapis.com) se deja pasar directo, sin
// tocar. Esto es necesario porque la API de caché del navegador no
// soporta guardar respuestas de pedidos POST, y Firestore usa POST para
// mantener la conexión en tiempo real: si el service worker intentaba
// meterse ahí, rompía el guardado en la nube (quedaba trabado en
// "Guardando...").
// -----------------------------------------------------------------------

const CACHE_NAME = "agrodata-v3";
const urlsToCache = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  // No espera a que se cierren las pestañas viejas: instala esta versión
  // nueva de una vez.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Solo intervenimos pedidos GET de nuestro propio sitio.
  // Todo lo demás (POST, pedidos a firestore.googleapis.com, etc.)
  // pasa directo sin tocar.
  const esGet = event.request.method === "GET";
  const esMismoOrigen = event.request.url.startsWith(self.location.origin);
  if (!esGet || !esMismoOrigen) {
    return; // deja que el navegador maneje el pedido normalmente
  }

  event.respondWith(
    fetch(event.request)
      .then((respuestaDeRed) => {
        // Si trajo la respuesta de internet con éxito, guarda una copia
        // fresca en caché (por si se necesita sin conexión más adelante)
        // y la devuelve.
        const copia = respuestaDeRed.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuestaDeRed;
      })
      .catch(() => {
        // Sin conexión: como último recurso, usa lo que haya guardado.
        return caches.match(event.request);
      })
  );
});
