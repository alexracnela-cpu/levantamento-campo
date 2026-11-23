// Início do app: acesso, rotas e barra do topo.

import { sb, api, configurado } from './api.js';
import { local } from './store.js';
import { iniciarSincronizacao, aoMudarFila, sincronizar, estadoFila } from './sync.js';
import { telaPainel, telaNovaTarefa, telaTarefaLider, telaEquipe } from './lider.js';
import { telaMinhas, telaCampo } from './motoqueiro.js';
import { $, esc, aviso, mensagemErro } from './util.js';
import { iniciarAvisos, podePedirPermissao, pedirPermissao } from './avisos.js';
import { aplicarTema, botaoTema, ligarBotoesTema } from './tema.js';

const tela = document.getElementById('tela');
const topo = document.getElementById('topo');
let ctx = { perfil: null, usuario: null };
let limparTela = null;
let pararAvisos = null;

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
    <a class="marca" href="${INICIO[ctx.perfil.papel]}"><img src="icones/icone.svg" alt=""><span class="nome-marca">Ronda<b>Luz</b></span></a>
    <nav class="menu">
      ${lider ? '<a href="#/painel" data-m="painel">Levantamentos</a><a href="#/equipe" data-m="equipe">Equipe</a><a href="#/minhas" data-m="minhas">Minhas demandas</a>'
    : '<a href="#/minhas" data-m="minhas">Minhas demandas</a>'}
    </nav>
    <button id="b-avisos" class="sinc avisos-btn" title="Receber avisos neste aparelho" hidden>🔔 Ativar avisos</button>
    <button id="sinc" class="sinc" title="Envio de dados"></button>
    ${botaoTema()}
    <div class="usuario"><span>${esc(ctx.perfil.nome || ctx.perfil.email)}</span>
      <small>${lider ? 'Líder' : 'Motoqueiro'}</small></div>
    <button class="btn" id="b-sair">Sair</button>`;
  $('#b-sair', topo).onclick = sair;
  ligarBotoesTema(topo);
  $('#sinc', topo).onclick = () => { sincronizar(); mostrarFila(); };
  const bAvisos = $('#b-avisos', topo);
  bAvisos.hidden = !podePedirPermissao();
  bAvisos.onclick = async () => {
    const r = await pedirPermissao();
    bAvisos.hidden = true;
    aviso(r === 'granted' ? 'Pronto! Você vai receber avisos neste aparelho.' : 'Avisos bloqueados. Dá para liberar nas configurações do navegador.', r === 'granted' ? 'ok' : 'erro');
  };
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
const PIN_FRACO = (p) => /^(.)\1{3}$/.test(p) || '01234567890'.includes(p) || '09876543210'.includes(p)
  || ['1212', '2121', '1122', '2580', '0852', '1010', '6969', '1313', '2020', '2323'].includes(p);

function lembrarModo(m) { try { localStorage.setItem('rondaluz-entrada', m); } catch { /* sem armazenamento */ } }
function modoLembrado() {
  try { return localStorage.getItem('rondaluz-entrada'); } catch { return null; }
}

function telaAcesso(modo) {
  const m = modo || modoLembrado() || 'moto';
  topo.hidden = true;
  tela.innerHTML = `<section class="acesso">
    <div class="acesso-caixa">
      ${botaoTema()}
      <div class="acesso-marca"><img src="icones/icone.svg" alt="" width="88" height="88"><h1 class="nome-marca">Ronda<b>Luz</b></h1><p>Levantamentos de iluminação pública · Manaus</p></div>
      <div class="abas abas-entrada">
        <button class="aba ${m === 'moto' ? 'ativa' : ''}" data-modo="moto">🏍 Motoqueiro</button>
        <button class="aba ${m !== 'moto' ? 'ativa' : ''}" data-modo="lider">💼 Líder</button>
      </div>
      <div id="entrada"></div>
    </div>
  </section>`;
  tela.querySelectorAll('[data-modo]').forEach((b) => {
    b.onclick = () => { lembrarModo(b.dataset.modo); telaAcesso(b.dataset.modo); };
  });
  ligarBotoesTema(tela);
  if (m === 'moto') entradaMotoqueiro($('#entrada', tela));
  else entradaLider($('#entrada', tela), m === 'criar');
}

function entradaLider(caixa, criar) {
  caixa.innerHTML = `<form id="f-acesso" class="formulario">
      ${criar ? '<label>Nome<input name="nome" required autocomplete="name"></label>' : ''}
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <label>Senha<input name="senha" type="password" required minlength="6" autocomplete="${criar ? 'new-password' : 'current-password'}"></label>
      <button class="btn primario largo">${criar ? 'Criar conta' : 'Entrar'}</button>
      <p class="dica">${criar
    ? 'Só é possível criar conta com o e-mail que um líder convidou. <a href="#" id="l-troca">Já tenho conta</a>'
    : 'Recebeu convite de líder por e-mail? <a href="#" id="l-troca">Criar conta</a>'}</p>
    </form>`;
  $('#l-troca', caixa).onclick = (e) => { e.preventDefault(); entradaLider(caixa, !criar); };
  $('#f-acesso', caixa).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const botao = e.target.querySelector('button');
    botao.disabled = true;
    try {
      if (criar) {
        const r = await api.criarConta(f.get('nome').trim(), f.get('email').trim(), f.get('senha'));
        if (!r.session) {
          aviso('Conta criada. Confirme o e-mail (ou desligue "Confirm email" no Supabase) e entre.', 'ok');
          entradaLider(caixa, false);
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

// Motoqueiro: RE (3 números) e PIN (4 números), com teclado grande.
function entradaMotoqueiro(caixa) {
  let fase = 're'; // re | pin | confirmar | criar1 | criar2
  let re = '';
  let pin = '';
  let pinNovo = '';
  let nome = '';
  let ocupado = false;

  const pontos = (n) => `<div class="pin-pontos">${[0, 1, 2, 3].map((i) => `<span class="${i < n ? 'cheio' : ''}"></span>`).join('')}</div>`;
  const teclado = (acao) => `<div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'apagar', '0', 'ok']
    .map((k) => `<button type="button" data-k="${k}" class="${k === 'ok' ? 'tecla-ok' : ''}">${k === 'apagar' ? '⌫' : k === 'ok' ? acao : k}</button>`).join('')}</div>`;
  let erro = '';

  const desenhar = () => {
    let corpo = '';
    if (fase === 're') {
      corpo = `<p class="passo-entrada">Digite seu <b>RE</b></p>
        <div class="re-caixa">${re ? `<b>${re}</b>` : '<span>3 números, ex.: 010</span>'}</div>${teclado('Avançar')}`;
    } else if (fase === 'pin') {
      corpo = `<p class="passo-entrada">Olá, <b>${esc(nome)}</b> · RE ${re}<br>Digite seu <b>PIN</b></p>${pontos(pin.length)}${teclado('Entrar')}
        <button type="button" class="link-voltar" id="e-voltar">Não é você? Trocar RE</button>`;
    } else if (fase === 'confirmar') {
      corpo = `<p class="passo-entrada">RE ${re}</p><p class="pergunta-nome">Você é <b>${esc(nome)}</b>?</p>
        <div class="linha-botoes centro"><button type="button" class="btn" id="e-nao">Não sou eu</button>
        <button type="button" class="btn primario" id="e-sim">Sou eu</button></div>`;
    } else {
      corpo = `<p class="passo-entrada"><b>Crie seu PIN</b><br>${fase === 'criar1' ? 'Passo 1 de 2: escolha 4 números' : 'Passo 2 de 2: digite de novo para confirmar'}</p>
        ${pontos((fase === 'criar1' ? pinNovo : pin).length)}${teclado('OK')}
        <p class="dica centro">Não vale 1234, 0000, 1111 e parecidos. Ninguém mais vê seu PIN.</p>`;
    }
    caixa.innerHTML = `<div class="entrada-moto">${corpo}<p class="erro-entrada">${esc(erro)}</p></div>`;
    caixa.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => tecla(b.dataset.k); });
    if ($('#e-voltar', caixa)) $('#e-voltar', caixa).onclick = () => { fase = 're'; re = ''; pin = ''; erro = ''; desenhar(); };
    if ($('#e-nao', caixa)) $('#e-nao', caixa).onclick = () => { fase = 're'; re = ''; erro = 'Confira o RE. Se estiver certo, procure o líder.'; desenhar(); };
    if ($('#e-sim', caixa)) $('#e-sim', caixa).onclick = () => { fase = 'criar1'; pinNovo = ''; pin = ''; erro = ''; desenhar(); };
  };

  const carregando = (txt) => {
    ocupado = true;
    const ok = caixa.querySelector('.tecla-ok');
    if (ok) ok.textContent = txt;
  };

  async function verRe() {
    if (re.length !== 3) { erro = 'O RE tem 3 números. Ex.: 010'; desenhar(); return; }
    carregando('…');
    try {
      const r = await api.consultarRe(re);
      if (r.estado === 'ativo') { nome = r.nome; fase = 'pin'; pin = ''; erro = ''; } else if (r.estado === 'criar_pin') { nome = r.nome; fase = 'confirmar'; erro = ''; } else if (r.estado === 'sem_acesso') { erro = 'Seu acesso foi removido. Fale com o líder.'; re = ''; } else { erro = 'RE não cadastrado. Peça ao líder para cadastrar você.'; re = ''; }
    } catch (e) { erro = mensagemErro(e); }
    ocupado = false;
    desenhar();
  }

  async function entrar() {
    carregando('…');
    try {
      await api.entrarRe(re, pin);
      lembrarModo('moto');
    } catch (e) {
      erro = mensagemErro(e);
      pin = '';
      ocupado = false;
      desenhar();
    }
  }

  async function salvarPin() {
    carregando('…');
    try {
      await api.criarPinEEntrar(re, pinNovo);
      lembrarModo('moto');
      aviso('PIN criado. Bem-vindo!', 'ok');
    } catch (e) {
      erro = mensagemErro(e);
      fase = 'criar1'; pinNovo = ''; pin = '';
      ocupado = false;
      desenhar();
    }
  }

  function tecla(k) {
    if (ocupado) return;
    erro = '';
    if (fase === 're') {
      if (k === 'apagar') re = re.slice(0, -1);
      else if (k === 'ok') { verRe(); return; } else if (re.length < 3) re += k;
      desenhar();
      if (re.length === 3 && k !== 'apagar') verRe();
      return;
    }
    if (fase === 'pin') {
      if (k === 'apagar') { if (pin) pin = pin.slice(0, -1); else { fase = 're'; re = ''; } } else if (k === 'ok') { if (pin.length === 4) entrar(); return; } else if (pin.length < 4) pin += k;
      desenhar();
      if (pin.length === 4) entrar();
      return;
    }
    if (fase === 'criar1') {
      if (k === 'apagar') pinNovo = pinNovo.slice(0, -1);
      else if (k !== 'ok' && pinNovo.length < 4) pinNovo += k;
      if (pinNovo.length === 4) {
        if (PIN_FRACO(pinNovo)) { erro = 'Esse PIN é fácil de adivinhar. Escolha outro.'; pinNovo = ''; } else { fase = 'criar2'; pin = ''; }
      }
      desenhar();
      return;
    }
    if (fase === 'criar2') {
      if (k === 'apagar') pin = pin.slice(0, -1);
      else if (k !== 'ok' && pin.length < 4) pin += k;
      if (pin.length === 4) {
        if (pin !== pinNovo) { erro = 'Os dois PINs ficaram diferentes. Comece de novo.'; fase = 'criar1'; pinNovo = ''; pin = ''; desenhar(); return; }
        desenhar();
        salvarPin();
        return;
      }
      desenhar();
    }
  }

  desenhar();
}

function telaSemConfiguracao() {
  topo.hidden = true;
  tela.innerHTML = `<section class="acesso"><div class="acesso-caixa">
    <div class="acesso-marca"><img src="icones/icone.svg" alt="" width="96" height="96"><h1 class="nome-marca">Ronda<b>Luz</b></h1></div>
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
  if (perfil.papel === 'bloqueado') {
    topo.hidden = true;
    tela.innerHTML = `<section class="acesso"><div class="acesso-caixa">
      <div class="acesso-marca"><img src="icones/icone.svg" alt="" width="96" height="96"><h1 class="nome-marca">Ronda<b>Luz</b></h1></div>
      <h2>Acesso removido</h2><p>Seu acesso ao RondaLuz foi removido por um líder. Fale com ele se achar que é engano.</p>
      <button class="btn largo" id="b-sair2">Sair</button></div></section>`;
    $('#b-sair2', tela).onclick = () => api.sair();
    return;
  }
  ctx = { perfil, usuario, navegar, recarregar: rotear };
  montarTopo();
  if (pararAvisos) pararAvisos();
  pararAvisos = null;
  iniciarAvisos(ctx).then((f) => { pararAvisos = f; });
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
  aplicarTema();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker:', e));
  }
  if (!configurado || !sb) { telaSemConfiguracao(); return; }

  window.addEventListener('hashchange', rotear);
  aoMudarFila(desenharSinc);

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'SIGNED_OUT' || !sessao) {
      if (pararAvisos) { pararAvisos(); pararAvisos = null; }
      document.querySelectorAll('.popup-aviso').forEach((p) => p.remove());
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
