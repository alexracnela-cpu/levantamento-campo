// Partes usadas pelas duas telas (líder e motoqueiro).

import { api } from './api.js';
import { local } from './store.js';
import { esc, aviso, mensagemErro } from './util.js';

export function abrirModal(html, { largo = false, aoFechar } = {}) {
  const fundo = document.getElementById('modal');
  fundo.innerHTML = `<div class="modal-caixa ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
    <button class="modal-fechar" aria-label="Fechar">×</button>${html}</div>`;
  fundo.classList.add('aberto');
  const fechar = () => {
    fundo.classList.remove('aberto');
    fundo.innerHTML = '';
    aoFechar?.();
  };
  fundo.querySelector('.modal-fechar').onclick = fechar;
  fundo.onclick = (e) => { if (e.target === fundo) fechar(); };
  return { caixa: fundo.querySelector('.modal-caixa'), fechar };
}

export function confirmar(pergunta, textoSim = 'Confirmar') {
  return new Promise((ok) => {
    let respondeu = false;
    const { caixa, fechar } = abrirModal(`<p class="pergunta">${esc(pergunta)}</p>
      <div class="linha-botoes"><button class="btn" data-r="nao">Cancelar</button>
      <button class="btn perigo" data-r="sim">${esc(textoSim)}</button></div>`, {
      aoFechar: () => { if (!respondeu) ok(false); },
    });
    caixa.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => { respondeu = true; fechar(); ok(b.dataset.r === 'sim'); };
    });
  });
}

// Baixa o ofício e guarda no celular, para abrir sem internet.
export async function guardarOficio(tarefa) {
  if (!tarefa?.oficio_path) return null;
  const k = `oficio:${tarefa.id}:${tarefa.oficio_path}`;
  const salvo = await local.cacheLer(k);
  if (salvo) return salvo;
  if (!navigator.onLine) return null;
  const blob = await api.baixarOficio(tarefa.oficio_path);
  const v = { blob, nome: tarefa.oficio_nome || 'oficio', tipo: tarefa.oficio_tipo || blob.type };
  await local.cacheGravar(k, v);
  return v;
}

export async function verOficio(tarefa) {
  if (!tarefa?.oficio_path) { aviso('Esta demanda não tem ofício anexado.'); return; }
  let arq;
  try {
    arq = await guardarOficio(tarefa);
  } catch (e) {
    aviso(`Não consegui abrir o ofício: ${mensagemErro(e)}`, 'erro');
    return;
  }
  if (!arq) { aviso('Ofício ainda não baixado. Abra uma vez com internet.', 'erro'); return; }
  const url = URL.createObjectURL(arq.blob);
  const ehImagem = /^image\//.test(arq.tipo);
  const ehPdf = /pdf/.test(arq.tipo) || /\.pdf$/i.test(arq.nome);
  const corpo = ehImagem
    ? `<img class="oficio-img" src="${url}" alt="Ofício">`
    : ehPdf
      ? `<iframe class="oficio-pdf" src="${url}" title="Ofício"></iframe>`
      : '<p>Formato sem pré-visualização.</p>';
  abrirModal(`<h3>Ofício — ${esc(arq.nome)}</h3>${corpo}
    <div class="linha-botoes"><a class="btn" href="${url}" target="_blank" rel="noopener" download="${esc(arq.nome)}">Abrir em tela cheia / baixar</a></div>`,
  { largo: true, aoFechar: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
}

export function seloStatus(status) {
  const nomes = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' };
  return `<span class="selo selo-${esc(status)}">${nomes[status] || esc(status)}</span>`;
}
