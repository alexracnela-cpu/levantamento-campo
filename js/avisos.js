// Avisos: popup dentro do app + notificação do sistema (quando a aba está em segundo plano).
//   Motoqueiro: novo levantamento para ele, levantamento devolvido pelo líder.
//   Líder: motoqueiro terminou um levantamento.
// Ao entrar, mostra um resumo do que chegou enquanto a pessoa estava fora.

import { api } from './api.js';
import { esc, dataBR } from './util.js';

let caixa = null;

function container() {
  if (caixa && caixa.isConnected) return caixa;
  caixa = document.getElementById('avisos');
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.id = 'avisos';
    caixa.className = 'avisos-popup';
    caixa.setAttribute('aria-live', 'polite');
    document.body.appendChild(caixa);
  }
  return caixa;
}

export function mostrarPopup({ icone = '🔔', titulo, texto = '', botao = 'Abrir', href, aoAbrir, tipo = 'info' }) {
  const c = container();
  const el = document.createElement('div');
  el.className = `popup-aviso ${tipo}`;
  el.innerHTML = `<div class="pa-icone">${icone}</div>
    <div class="pa-corpo"><b>${esc(titulo)}</b>${texto ? `<span>${esc(texto)}</span>` : ''}
      ${href || aoAbrir ? `<button class="btn primario pa-abrir">${esc(botao)}</button>` : ''}</div>
    <button class="pa-fechar" aria-label="Fechar">×</button>`;
  const fechar = () => { el.classList.add('saindo'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.pa-fechar').onclick = fechar;
  const abrir = el.querySelector('.pa-abrir');
  if (abrir) abrir.onclick = () => { fechar(); if (aoAbrir) aoAbrir(); else if (href) location.hash = href; };
  c.prepend(el);
  while (c.children.length > 4) c.lastElementChild.remove();
  return fechar;
}

// Notificação do sistema (só quando o app não está visível na tela).
async function notificarSistema(titulo, texto, href) {
  try {
    if (!document.hidden || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const opcoes = { body: texto, icon: 'icones/icone-192.png', badge: 'icones/icone-192.png', tag: href || titulo, data: { href } };
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(titulo, opcoes); return; }
    const n = new Notification(titulo, opcoes);
    n.onclick = () => { window.focus(); if (href) location.hash = href; n.close(); };
  } catch { /* sem notificação do sistema: fica só o popup */ }
}

function avisar(dados) {
  mostrarPopup(dados);
  notificarSistema(dados.titulo, dados.texto, dados.href);
}

export function podePedirPermissao() {
  return typeof Notification !== 'undefined' && Notification.permission === 'default';
}

export async function pedirPermissao() {
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

function vistas(uid) {
  try { return new Set(JSON.parse(localStorage.getItem(`rondaluz-vistas-${uid}`) || '[]')); } catch { return new Set(); }
}
function guardarVistas(uid, ids) {
  try { localStorage.setItem(`rondaluz-vistas-${uid}`, JSON.stringify([...ids].slice(-300))); } catch { /* ignora */ }
}

export async function iniciarAvisos(ctx) {
  const eu = ctx.perfil;
  const lider = eu.papel === 'lider';
  const estado = new Map(); // tarefa_id -> { motoqueiro_id, finalizada_em, status }
  let nomes = {};

  if (!navigator.onLine) return () => {};
  try {
    const [tarefas, equipe] = await Promise.all([api.tarefas(), lider ? api.equipe() : Promise.resolve([])]);
    nomes = Object.fromEntries(equipe.map((m) => [m.id, m.nome || m.email]));
    tarefas.forEach((t) => estado.set(t.id, { motoqueiro_id: t.motoqueiro_id, finalizada_em: t.finalizada_em, status: t.status, titulo: t.titulo }));

    // resumo ao entrar
    const minhas = tarefas.filter((t) => t.motoqueiro_id === eu.id && t.status !== 'concluido');
    const jaVistas = vistas(eu.id);
    const novas = minhas.filter((t) => !jaVistas.has(t.id) && !t.finalizada_em && t.criado_por !== eu.id);
    if (novas.length === 1) {
      avisar({ icone: '📋', titulo: 'Novo levantamento para você', texto: `${novas[0].titulo}${novas[0].prazo ? ` · prazo ${dataBR(novas[0].prazo)}` : ''}`, href: `#/campo/${novas[0].id}` });
    } else if (novas.length > 1) {
      avisar({ icone: '📋', titulo: `${novas.length} levantamentos novos para você`, texto: 'Veja em Minhas demandas.', href: '#/minhas', botao: 'Ver' });
    }
    minhas.forEach((t) => jaVistas.add(t.id));
    guardarVistas(eu.id, jaVistas);

    if (lider) {
      const entregues = tarefas.filter((t) => t.finalizada_em && t.status !== 'concluido');
      if (entregues.length === 1) {
        const t = entregues[0];
        avisar({ icone: '✅', tipo: 'ok', titulo: `${nomes[t.motoqueiro_id] || 'Motoqueiro'} terminou`, texto: `${t.titulo} · aguardando sua revisão`, href: `#/tarefa/${t.id}` });
      } else if (entregues.length > 1) {
        avisar({ icone: '✅', tipo: 'ok', titulo: `${entregues.length} levantamentos entregues`, texto: 'Aguardando sua revisão.', href: '#/painel', botao: 'Ver' });
      }
    }
  } catch { /* sem resumo; segue ouvindo */ }

  // ao vivo
  const parar = api.ouvir('avisos', [{ tabela: 'tarefas' }], (_tab, p) => {
    const t = p.new;
    if (!t || !t.id) { if (p.old?.id) estado.delete(p.old.id); return; }
    const antes = estado.get(t.id);
    estado.set(t.id, { motoqueiro_id: t.motoqueiro_id, finalizada_em: t.finalizada_em, status: t.status, titulo: t.titulo });

    if (t.motoqueiro_id === eu.id && (!antes || antes.motoqueiro_id !== eu.id) && t.status !== 'concluido' && t.criado_por !== eu.id) {
      const v = vistas(eu.id); v.add(t.id); guardarVistas(eu.id, v);
      avisar({ icone: '📋', titulo: 'Novo levantamento para você', texto: `${t.titulo}${t.prazo ? ` · prazo ${dataBR(t.prazo)}` : ''}`, href: `#/campo/${t.id}` });
      return;
    }
    if (t.motoqueiro_id === eu.id && antes?.finalizada_em && !t.finalizada_em && t.status !== 'concluido') {
      avisar({ icone: '↩️', tipo: 'alerta', titulo: 'Levantamento devolvido pelo líder', texto: `${t.titulo} · confira e toque em Terminei de novo`, href: `#/campo/${t.id}` });
      return;
    }
    if (lider && t.finalizada_em && !antes?.finalizada_em && t.status !== 'concluido') {
      const quem = nomes[t.motoqueiro_id] || 'O motoqueiro';
      avisar({ icone: '✅', tipo: 'ok', titulo: `${quem} terminou um levantamento`, texto: t.titulo, href: `#/tarefa/${t.id}` });
    }
  });
  return parar;
}
