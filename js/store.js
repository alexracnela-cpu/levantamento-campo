// Guarda local no celular (IndexedDB): fila de envio, fotos e cópias para uso offline.

const NOME = 'rondaluz';
const VERSAO = 1;
let dbPromise;

function abrir() {
  if (!dbPromise) {
    dbPromise = new Promise((ok, falha) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fotos')) {
          const s = db.createObjectStore('fotos', { keyPath: 'id' });
          s.createIndex('ponto_id', 'ponto_id');
        }
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'k' });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let resultado;
    Promise.resolve(fn(s)).then((r) => { resultado = r; });
    t.oncomplete = () => ok(resultado);
    t.onerror = () => falha(t.error);
    t.onabort = () => falha(t.error);
  });
}

const req2p = (req) => new Promise((ok, falha) => {
  req.onsuccess = () => ok(req.result);
  req.onerror = () => falha(req.error);
});

export const local = {
  pegar: (store, id) => tx(store, 'readonly', (s) => req2p(s.get(id))),
  todos: (store) => tx(store, 'readonly', (s) => req2p(s.getAll())),
  gravar: (store, valor) => tx(store, 'readwrite', (s) => req2p(s.put(valor))),
  apagar: (store, id) => tx(store, 'readwrite', (s) => req2p(s.delete(id))),
  porPonto: (pontoId) => tx('fotos', 'readonly', (s) => req2p(s.index('ponto_id').getAll(pontoId))),

  async cacheLer(k) {
    const r = await this.pegar('cache', k);
    return r ? r.v : undefined;
  },
  cacheGravar(k, v) {
    return this.gravar('cache', { k, v, em: Date.now() });
  },
  async limparTudo() {
    for (const s of ['fila', 'fotos', 'cache']) await tx(s, 'readwrite', (st) => req2p(st.clear()));
  },
};
