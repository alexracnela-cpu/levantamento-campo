// Versão de treinamento do armazenamento local: tudo em memória.
const S = { fila: new Map(), fotos: new Map(), cache: new Map() };
const copia = (v) => (v === undefined ? v : structuredClone(v));

export const local = {
  pegar: async (store, id) => copia(S[store].get(id)),
  todos: async (store) => [...S[store].values()].map(copia),
  gravar: async (store, valor) => { S[store].set(store === 'cache' ? valor.k : valor.id, copia(valor)); },
  apagar: async (store, id) => { S[store].delete(id); },
  porPonto: async (pontoId) => [...S.fotos.values()].filter((f) => f.ponto_id === pontoId).map(copia),
  async cacheLer(k) {
    const r = S.cache.get(k);
    return r ? copia(r.v) : undefined;
  },
  cacheGravar(k, v) {
    return this.gravar('cache', { k, v, em: Date.now() });
  },
  async limparTudo() { Object.values(S).forEach((m) => m.clear()); },
};
