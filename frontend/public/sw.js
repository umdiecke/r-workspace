self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("r-workspace-offline").then((cache) =>
      cache.addAll(["/", "/manifest.webmanifest", "/icon-192.svg", "/icon-512.svg"])
    )
  );
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open("r-workspace-offline");
      const cached = await cache.match(event.request);
      return cached || Response.error();
    })
  );
});
