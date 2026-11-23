// Service worker do RondaLuz: app funciona sem internet e guarda os pedaços de mapa já vistos.
// Ao mudar qualquer arquivo do app, aumente a VERSAO para os celulares baixarem a nova.

const VERSAO = 'v6';
const APP = `rondaluz-app-${VERSAO}`;
const MAPAS = 'rondaluz-mapas';
const MAX_PEDACOS = 4000;

const ARQUIVOS = [
  './',
  './index.html',
  './css/app.css',
  './manifest.webmanifest',
  './icones/icone-64.png',
  './icones/icone.svg',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './js/config.js',
  './js/app.js',
  './js/api.js',
  './js/comum.js',
  './js/lider.js',
  './js/mapa.js',
  './js/motoqueiro.js',
  './js/simbolo.js',
  './js/store.js',
  './js/sync.js',
  './js/util.js',
];
const EXTERNOS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

const ehMapa = (url) => /tile\.openstreetmap\.org|server\.arcgisonline\.com/.test(url.hostname);
const ehExternoFixo = (url) => /unpkg\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(ARQUIVOS);
    await Promise.all(EXTERNOS.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('rondaluz-app-') && n !== APP).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function aparar() {
  const c = await caches.open(MAPAS);
  const chaves = await c.keys();
  if (chaves.length > MAX_PEDACOS) {
    await Promise.all(chaves.slice(0, chaves.length - MAX_PEDACOS).map((k) => c.delete(k)));
  }
}

let contador = 0;
async function pedacoDeMapa(req) {
  const c = await caches.open(MAPAS);
  const salvo = await c.match(req);
  if (salvo) return salvo;
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      await c.put(req, resp.clone());
      if (++contador % 200 === 0) aparar();
    }
    return resp;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function primeiroRede(req) {
  const c = await caches.open(APP);
  try {
    const resp = await fetch(req);
    if (resp.ok) c.put(req, resp.clone());
    return resp;
  } catch {
    const salvo = await c.match(req) || await c.match(req, { ignoreSearch: true });
    if (salvo) return salvo;
    if (req.mode === 'navigate') return c.match('./index.html');
    return new Response('', { status: 504 });
  }
}

async function primeiroCache(req) {
  const c = await caches.open(APP);
  const salvo = await c.match(req);
  if (salvo) return salvo;
  const resp = await fetch(req);
  if (resp.ok || resp.type === 'opaque') c.put(req, resp.clone());
  return resp;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (ehMapa(url)) { e.respondWith(pedacoDeMapa(req)); return; }
  if (ehExternoFixo(url)) { e.respondWith(primeiroCache(req)); return; }
  if (url.origin === self.location.origin) { e.respondWith(primeiroRede(req)); }
  // Supabase e demais: direto pela rede (a fila do app cuida do modo offline)
});
