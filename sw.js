// Offline app shell: serve from cache, refresh in background. API calls are never cached.
const V = "ma-v3";
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/logo.png", "/emblem.png",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  let u; try { u = new URL(r.url); } catch (_) { return; }
  // ignore browser-extension / non-http requests and the API
  if (r.method !== "GET" || !/^https?:$/.test(u.protocol) || u.pathname.startsWith("/api/")) return;
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(r);
    const net = fetch(r).then((res) => { if (res.ok || res.type === "opaque") c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (r.mode === "navigate" ? c.match("/index.html") : Response.error());
  }));
});
