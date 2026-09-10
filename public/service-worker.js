// -----------------------------------------------------------------------
// SERVICE WORKER de AgroData
// -----------------------------------------------------------------------
// Antes, este archivo guardaba la página en caché y SIEMPRE la servía
// desde ahí primero ("cache-first"), sin importar si vos publicabas una
// versión nueva. Por eso, cuando actualizabas la app, la gente (incluida
// vos, fuera de modo incógnito) seguía viendo la versión vieja "pegada"
// hasta que el archivo de esa versión vieja dejaba de existir en el
// servidor y aparecía el error 404.
//
// Ahora funciona al revés ("network-first"): siempre intenta traer la
// versión más nueva del servidor primero, y solo si no hay conexión a
// internet usa la copia guardada. Además:
//  - Sube el número de versión del caché (CACHE_NAME) cada vez que se
//    cambia este archivo, así el navegador sabe que hay una versión
//    nueva del Service Worker para instalar.
//  - Al activarse, borra automáticamente las cachés de versiones viejas.
//  - Toma el control de la página enseguida (skipWaiting + clients.claim),
//    para no tener que esperar a que se cierren todas las pestañas.
// -----------------------------------------------------------------------

const CACHE_NAME = "agrodata-v2";
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
