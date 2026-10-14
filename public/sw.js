// Eureka Thumb service worker: makes the app installable and keeps it usable
// offline. Thumbnails are drawn in the browser, so with the page, scripts and
// self-hosted fonts (all under /_next/static) cached the whole tool works without a connection (the AI step falls
// back to the built-in keyword extractor).
const VERSION = "eureka-thumb-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") (await caches.open(VERSION)).put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(VERSION)).put(request, res.clone());
    return res;
  } catch {
    return (await caches.match(request)) || (await caches.match("/")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // always live
    if (request.mode === "navigate") return event.respondWith(networkFirst(request));
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      return event.respondWith(cacheFirst(request));
    }
    return event.respondWith(networkFirst(request));
  }
});
