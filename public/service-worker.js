// -----------------------------------------------------------------------
// SERVICE WORKER de AgroData
// -----------------------------------------------------------------------
// Sigue siendo "network-first" (siempre intenta traer la versión más
// nueva de la app primero, y solo si no hay internet usa la copia
// guardada). La diferencia clave respecto a la versión anterior:
//
//  - AHORA SOLO INTERVIENE en pedidos GET hacia nuestro propio dominio
//    (los archivos de la app: HTML, JS, CSS, imágenes).
//  - Todo lo demás (Firestore, Firebase Auth, Analytics, o cualquier
//    pedido POST) se deja pasar de largo, SIN TOCARLO.
//
// Por qué importa esto: antes, el Service Worker interceptaba también
// los pedidos que Firestore hace para sincronizar tus datos en la nube.
// Como esos pedidos son POST (no GET), el intento de "cachearlos" fallaba
// en silencio y podía dejar la sincronización trabada en el celular,
// aunque en la PC no se notara. Ahora Firestore maneja su propia
// conexión sin que el Service Worker se meta en el medio.
// -----------------------------------------------------------------------

const CACHE_NAME = "agrodata-v3"; // subido de v2 a v3 para forzar la actualización en todos los dispositivos
const urlsToCache = ["/", "/index.html"];

// Permite que la página le pida al Service Worker nuevo que se active
// de inmediato, sin esperar a que se cierren todas las pestañas/instancias
// de la app abiertas con la versión vieja.
self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "SALTAR_ESPERA") {
    self.skipWaiting();
  }
});

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
  const req = event.request;

  // Chequeamos si el pedido es hacia nuestro propio dominio (mismo origen).
  let mismoOrigen = false;
  try {
    mismoOrigen = new URL(req.url).origin === self.location.origin;
  } catch (e) {
    mismoOrigen = false;
  }

  // Si NO es un GET a nuestro propio dominio (por ejemplo: Firestore,
  // Firebase Auth, Analytics, o cualquier pedido a otro servidor), no
  // hacemos nada y dejamos que el navegador lo maneje directamente.
  // Esto es crítico para que la sincronización con la nube funcione bien
  // en el celular.
  if (req.method !== "GET" || !mismoOrigen) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((respuestaDeRed) => {
        // Si trajo la respuesta de internet con éxito, guarda una copia
        // fresca en caché (por si se necesita sin conexión más adelante)
        // y la devuelve.
        const copia = respuestaDeRed.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
        return respuestaDeRed;
      })
      .catch(() => {
        // Sin conexión: como último recurso, usa lo que haya guardado.
        return caches.match(req);
      })
  );
});
