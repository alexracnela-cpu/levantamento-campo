// Início do app: acesso, rotas e barra do topo.

import { sb, api, configurado } from './api.js';
import { local } from './store.js';
import { iniciarSincronizacao, aoMudarFila, sincronizar, estadoFila } from './sync.js';
import { telaPainel, telaNovaTarefa, telaTarefaLider, telaEquipe } from './lider.js';
import { telaMinhas, telaCampo } from './motoqueiro.js';
import { $, esc, aviso, mensagemErro } from './util.js';

const tela = document.getElementById('tela');
const topo = document.getElementById('topo');
let ctx = { perfil: null, usuario: null };
let limparTela = null;

const ROTAS = {
  lider: [
    [/^#\/painel$/, telaPainel],
    [/^#\/nova$/, telaNovaTarefa],
    [/^#\/tarefa\/([\w-]+)$/, telaTarefaLider, ['id']],
    [/^#\/equipe$/, telaEquipe],
    [/^#\/minhas$/, telaMinhas],
    [/^#\/campo\/([\w-]+)$/, telaCampo, ['id']],
  ],
  motoqueiro: [
    [/^#\/minhas$/, telaMinhas],
    [/^#\/campo\/([\w-]+)$/, telaCampo, ['id']],
  ],
};
const INICIO = { lider: '#/painel', motoqueiro: '#/minhas' };

function navegar(hash) {
  if (location.hash === hash) rotear();
  else location.hash = hash;
}

async function rotear() {
  if (limparTela) { try { limparTela(); } catch { /* ignora */ } limparTela = null; }
  window.scrollTo(0, 0);
  if (!ctx.perfil) return;
  const rotas = ROTAS[ctx.perfil.papel] || ROTAS.motoqueiro;
  const hash = location.hash || INICIO[ctx.perfil.papel];
  for (const [re, fn, nomes = []] of rotas) {
    const m = hash.match(re);
    if (m) {
      const params = Object.fromEntries(nomes.map((n, i) => [n, m[i + 1]]));
      marcarMenu(hash);
      try {
        limparTela = await fn(tela, params, ctx);
      } catch (e) {
        console.error(e);
        tela.innerHTML = `<section class="pagina"><p class="vazio">Erro: ${esc(mensagemErro(e))}</p></section>`;
      }
      return;
    }
  }
  navegar(INICIO[ctx.perfil.papel]);
}

// ------------------------------------------------------------------
// Topo
// ------------------------------------------------------------------
function montarTopo() {
  if (!ctx.perfil) { topo.innerHTML = ''; topo.hidden = true; return; }
  const lider = ctx.perfil.papel === 'lider';
  topo.hidden = false;
  topo.innerHTML = `
    <a class="marca" href="${INICIO[ctx.perfil.papel]}"><img src="icones/icone-64.png" alt=""><span class="nome-marca">Ronda<b>Luz</b></span></a>
    <nav class="menu">
      ${lider ? '<a href="#/painel" data-m="painel">Levantamentos</a><a href="#/equipe" data-m="equipe">Equipe</a><a href="#/minhas" data-m="minhas">Minhas tarefas</a>'
    : '<a href="#/minhas" data-m="minhas">Minhas tarefas</a>'}
    </nav>
    <button id="sinc" class="sinc" title="Envio de dados"></button>
    <div class="usuario"><span>${esc(ctx.perfil.nome || ctx.perfil.email)}</span>
      <small>${lider ? 'Líder' : 'Motoqueiro'}</small></div>
    <button class="btn" id="b-sair">Sair</button>`;
  $('#b-sair', topo).onclick = sair;
  $('#sinc', topo).onclick = () => { sincronizar(); mostrarFila(); };
  estadoFila().then(desenharSinc);
}

function marcarMenu(hash) {
  const chave = hash.split('/')[1];
  topo.querySelectorAll('[data-m]').forEach((a) => {
    a.classList.toggle('ativo', a.dataset.m === chave || (chave === 'nova' && a.dataset.m === 'painel')
      || (chave === 'tarefa' && a.dataset.m === 'painel') || (chave === 'campo' && a.dataset.m === 'minhas'));
  });
}

function desenharSinc(s) {
  const b = document.getElementById('sinc');
  if (!b) return;
  const pend = s.pontos + s.fotos;
  let classe = 'ok';
  let txt = 'Tudo enviado';
  if (!s.online) { classe = 'offline'; txt = pend ? `Sem internet · ${pend} na fila` : 'Sem internet'; } else if (s.enviando) { classe = 'enviando'; txt = 'Enviando…'; } else if (pend) { classe = 'pendente'; txt = `${pend} na fila`; }
  b.className = `sinc ${classe}`;
  b.innerHTML = `<i></i>${txt}`;
}

async function mostrarFila() {
  const s = await estadoFila();
  if (s.erro && s.online) aviso(`Última tentativa de envio falhou: ${s.erro}`, 'erro');
}

// ------------------------------------------------------------------
// Acesso
// ------------------------------------------------------------------
function telaAcesso(modo = 'entrar') {
  topo.hidden = true;
  tela.innerHTML = `<section class="acesso">
    <div class="acesso-caixa">
      <div class="acesso-marca"><img src="icones/icone-192.png" alt="" width="88" height="88"><h1 class="nome-marca">Ronda<b>Luz</b></h1><p>Levantamentos de iluminação pública · Manaus</p></div>
      <div class="abas">
        <button class="aba ${modo === 'entrar' ? 'ativa' : ''}" data-modo="entrar">Entrar</button>
        <button class="aba ${modo === 'criar' ? 'ativa' : ''}" data-modo="criar">Criar conta</button>
      </div>
      <form id="f-acesso" class="formulario">
        ${modo === 'criar' ? '<label>Nome<input name="nome" required autocomplete="name"></label>' : ''}
        <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
        <label>Senha<input name="senha" type="password" required minlength="6" autocomplete="${modo === 'criar' ? 'new-password' : 'current-password'}"></label>
        <button class="btn primario largo">${modo === 'criar' ? 'Criar conta' : 'Entrar'}</button>
        ${modo === 'criar' ? '<p class="dica">A primeira conta criada vira líder. As outras entram como motoqueiro.</p>' : ''}
      </form>
    </div>
  </section>`;
  tela.querySelectorAll('[data-modo]').forEach((b) => { b.onclick = () => telaAcesso(b.dataset.modo); });
  $('#f-acesso', tela).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const botao = e.target.querySelector('button');
    botao.disabled = true;
    try {
      if (modo === 'criar') {
        const r = await api.criarConta(f.get('nome').trim(), f.get('email').trim(), f.get('senha'));
        if (!r.session) {
          aviso('Conta criada. Confirme o e-mail (ou desligue "Confirm email" no Supabase) e entre.', 'ok');
          telaAcesso('entrar');
          return;
        }
      } else {
        await api.entrar(f.get('email').trim(), f.get('senha'));
      }
    } catch (err) {
      aviso(mensagemErro(err), 'erro');
      botao.disabled = false;
    }
  };
}

function telaSemConfiguracao() {
  topo.hidden = true;
  tela.innerHTML = `<section class="acesso"><div class="acesso-caixa">
    <div class="acesso-marca"><img src="icones/icone-192.png" alt="" width="88" height="88"><h1 class="nome-marca">Ronda<b>Luz</b></h1></div>
    <h2>Falta ligar o Supabase</h2>
    <p>Abra o arquivo <code>js/config.js</code> e cole a <b>Project URL</b> e a chave <b>publishable</b>
    (Supabase → botão Connect). Depois rode o <code>supabase/schema.sql</code> no SQL Editor.</p>
  </div></section>`;
}

async function carregarPerfil(usuario) {
  const k = `perfil:${usuario.id}`;
  let perfil = await local.cacheLer(k);
  if (navigator.onLine) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const p = await api.meuPerfil(usuario.id);
        if (p) { perfil = p; await local.cacheGravar(k, p); break; }
      } catch { break; }
      await new Promise((r) => setTimeout(r, 700)); // o gatilho pode levar um instante
    }
  }
  return perfil;
}

async function entrouCom(sessao) {
  const usuario = sessao.user;
  if (ctx.usuario?.id === usuario.id && ctx.perfil) return;
  tela.innerHTML = '<section class="pagina"><p class="vazio">Carregando…</p></section>';
  const perfil = await carregarPerfil(usuario);
  if (!perfil) {
    tela.innerHTML = `<section class="pagina"><p class="vazio">Não encontrei seu perfil. Confira se o arquivo
      <code>supabase/schema.sql</code> foi executado no Supabase antes de criar as contas.</p>
      <button class="btn" id="b-sair2">Sair</button></section>`;
    $('#b-sair2', tela).onclick = sair;
    return;
  }
  ctx = { perfil, usuario, navegar, recarregar: rotear };
  montarTopo();
  rotear();
}

async function sair() {
  const s = await estadoFila();
  if (s.pontos + s.fotos > 0
    && !window.confirm(`Ainda há ${s.pontos + s.fotos} item(ns) não enviados. Se sair agora, eles continuam guardados neste aparelho e sobem quando você entrar de novo. Sair?`)) return;
  if (limparTela) { limparTela(); limparTela = null; }
  await api.sair();
}

// ------------------------------------------------------------------
// Início
// ------------------------------------------------------------------
async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker:', e));
  }
  if (!configurado || !sb) { telaSemConfiguracao(); return; }

  window.addEventListener('hashchange', rotear);
  aoMudarFila(desenharSinc);

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'SIGNED_OUT' || !sessao) {
      ctx = { perfil: null, usuario: null };
      montarTopo();
      telaAcesso();
      return;
    }
    if (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION') {
      setTimeout(() => entrouCom(sessao), 0); // fora do callback, como recomenda o Supabase
    }
  });

  const sessao = await api.sessao();
  if (!sessao) telaAcesso();
  iniciarSincronizacao();
}

iniciar();
