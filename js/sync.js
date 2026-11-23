// Fila de envio: pontos e fotos ficam no celular e sobem sozinhos quando há internet.

import { sb } from './api.js';
import { local } from './store.js';

const ouvintes = new Set();
let rodando = false;
let ultimoErro = null;

export function aoMudarFila(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

async function avisar() {
  const s = await estadoFila();
  ouvintes.forEach((fn) => fn(s));
}

export async function estadoFila() {
  const fila = await local.todos('fila');
  const fotos = (await local.todos('fotos')).filter((f) => !f.enviada);
  return { pontos: fila.length, fotos: fotos.length, online: navigator.onLine, enviando: rodando, erro: ultimoErro };
}

// ---- operações chamadas pelas telas

export async function salvarPonto(ponto) {
  const registro = {
    id: ponto.id,
    tarefa_id: ponto.tarefa_id,
    lat: ponto.lat,
    lng: ponto.lng,
    tamanho_m: ponto.tamanho_m,
    rotacao: ponto.rotacao,
    plaqueta: (ponto.plaqueta || '').trim(),
    poste: (ponto.poste || '').trim(),
    qtd_luminarias: Number.isFinite(ponto.qtd_luminarias) ? ponto.qtd_luminarias : 1,
    observacoes: ponto.observacoes || '',
    fora_da_area: !!ponto.fora_da_area,
  };
  await local.gravar('fila', { id: ponto.id, tipo: 'ponto', dados: registro, em: Date.now() });
  await guardarPontoLocal(registro);
  await avisar();
  sincronizar();
}

export async function excluirPonto(ponto) {
  await local.gravar('fila', { id: ponto.id, tipo: 'excluir', dados: { id: ponto.id, tarefa_id: ponto.tarefa_id }, em: Date.now() });
  const fotos = await local.porPonto(ponto.id);
  for (const f of fotos) await local.apagar('fotos', f.id);
  const lista = (await local.cacheLer(`pontos:${ponto.tarefa_id}`)) || [];
  await local.cacheGravar(`pontos:${ponto.tarefa_id}`, lista.filter((p) => p.id !== ponto.id));
  await avisar();
  sincronizar();
}

export async function salvarRede(rede) {
  const registro = {
    id: rede.id,
    tarefa_id: rede.tarefa_id,
    tipo: rede.tipo,
    situacao: rede.situacao,
    pontos: rede.pontos,
    observacoes: rede.observacoes || '',
  };
  // só envia a metragem digitada quando ela existe no registro (coluna nova: comprimento_informado)
  if ('comprimento_informado' in rede) registro.comprimento_informado = rede.comprimento_informado ?? null;
  await local.gravar('fila', { id: rede.id, tipo: 'rede', dados: registro, em: Date.now() });
  const k = `redes:${rede.tarefa_id}`;
  const lista = (await local.cacheLer(k)) || [];
  const i = lista.findIndex((x) => x.id === rede.id);
  if (i >= 0) lista[i] = { ...lista[i], ...registro };
  else lista.push(registro);
  await local.cacheGravar(k, lista);
  await avisar();
  sincronizar();
}

export async function excluirRede(rede) {
  await local.gravar('fila', { id: rede.id, tipo: 'excluir_rede', dados: { id: rede.id, tarefa_id: rede.tarefa_id }, em: Date.now() });
  const k = `redes:${rede.tarefa_id}`;
  const lista = (await local.cacheLer(k)) || [];
  await local.cacheGravar(k, lista.filter((r) => r.id !== rede.id));
  await avisar();
  sincronizar();
}

// O motoqueiro avisa que terminou. Vai para o fim da fila: só sobe depois dos pontos.
export async function finalizarTarefa(tarefaId, obs) {
  await local.gravar('fila', { id: `finalizar:${tarefaId}`, tipo: 'finalizar', dados: { tarefa_id: tarefaId, obs: obs || '' }, em: Date.now() });
  await avisar();
  sincronizar();
}

const tarefasIniciadas = new Set();

export async function adicionarFoto(foto) {
  // foto = { id, ponto_id, tarefa_id, blob }
  await local.gravar('fotos', { ...foto, enviada: false, em: Date.now() });
  await avisar();
  sincronizar();
}

export async function removerFotoLocal(id) {
  const f = await local.pegar('fotos', id);
  if (!f) return;
  if (f.enviada && sb) {
    try {
      await sb.from('fotos').delete().eq('id', id);
      await sb.storage.from('fotos').remove([f.path]);
    } catch { /* tenta de novo depois não é crítico */ }
  }
  await local.apagar('fotos', id);
  await avisar();
}

async function guardarPontoLocal(p) {
  const k = `pontos:${p.tarefa_id}`;
  const lista = (await local.cacheLer(k)) || [];
  const i = lista.findIndex((x) => x.id === p.id);
  if (i >= 0) lista[i] = { ...lista[i], ...p };
  else lista.push(p);
  await local.cacheGravar(k, lista);
}

// ---- envio

export async function sincronizar() {
  if (rodando || !sb || !navigator.onLine) { avisar(); return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  rodando = true;
  ultimoErro = null;
  avisar();
  try {
    const fila = (await local.todos('fila')).sort((a, b) => a.em - b.em);
    for (const item of fila) {
      if (item.tipo === 'ponto') {
        const { error } = await sb.from('pontos').upsert(item.dados, { onConflict: 'id' });
        if (error) throw error;
        if (!tarefasIniciadas.has(item.dados.tarefa_id)) {
          tarefasIniciadas.add(item.dados.tarefa_id);
          await sb.rpc('iniciar_tarefa', { t: item.dados.tarefa_id }); // pendente -> em andamento
        }
      } else if (item.tipo === 'finalizar') {
        const { error } = await sb.rpc('finalizar_tarefa', { t: item.dados.tarefa_id, obs: item.dados.obs });
        if (error) throw error;
      } else if (item.tipo === 'rede') {
        const { error } = await sb.from('redes').upsert(item.dados, { onConflict: 'id' });
        if (error) throw error;
      } else if (item.tipo === 'excluir_rede') {
        const { error } = await sb.from('redes').delete().eq('id', item.id);
        if (error) throw error;
      } else if (item.tipo === 'excluir') {
        const { data: fotos } = await sb.from('fotos').select('path').eq('ponto_id', item.id);
        if (fotos?.length) await sb.storage.from('fotos').remove(fotos.map((f) => f.path));
        const { error } = await sb.from('pontos').delete().eq('id', item.id);
        if (error) throw error;
      }
      // só apaga da fila se ninguém alterou o ponto enquanto enviava
      const atual = await local.pegar('fila', item.id);
      if (atual && atual.em === item.em) await local.apagar('fila', item.id);
    }

    const fotos = (await local.todos('fotos')).filter((f) => !f.enviada);
    for (const f of fotos) {
      const pendentePonto = await local.pegar('fila', f.ponto_id);
      if (pendentePonto) continue; // espera o ponto subir primeiro
      const path = `${f.tarefa_id}/${f.ponto_id}/${f.id}.jpg`;
      const up = await sb.storage.from('fotos').upload(path, f.blob, { upsert: true, contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await sb.from('fotos').upsert({ id: f.id, ponto_id: f.ponto_id, tarefa_id: f.tarefa_id, path }, { onConflict: 'id' });
      if (error) throw error;
      // mantém a miniatura local, marcada como enviada
      await local.gravar('fotos', { ...f, enviada: true, path });
    }
  } catch (e) {
    ultimoErro = e?.message || String(e);
    console.warn('Falha ao enviar, nova tentativa em breve:', e);
  } finally {
    rodando = false;
    avisar();
  }
}

export function iniciarSincronizacao() {
  window.addEventListener('online', () => sincronizar());
  window.addEventListener('offline', () => avisar());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  setInterval(() => sincronizar(), 30000);
  sincronizar();
}
