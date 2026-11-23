// Controle da página de treinamento: modos, sinal do celular, roteiro e reinício.
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const estado = { modo: 'motoqueiro', sinal: true, lider: null, moto: null };

  function lembrar(k, v) { try { localStorage.setItem(`rondaluz-treino-${k}`, v); } catch { /* sem armazenamento */ } }
  function lembrado(k) { try { return localStorage.getItem(`rondaluz-treino-${k}`); } catch { return null; } }

  function definirModo(modo) {
    estado.modo = modo;
    document.body.dataset.modo = modo;
    $$('[data-ir-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.irModo === modo)));
    $$('.roteiro-bloco').forEach((r) => { r.hidden = !(modo === 'ambos' || r.dataset.para === modo); });
    document.body.classList.toggle('sem-roteiro', modo === 'ambos');
    lembrar('modo', modo);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
  }

  function desenharSinal() {
    const b = $('#b-sinal');
    b.classList.toggle('desligado', !estado.sinal);
    b.innerHTML = estado.sinal
      ? '<span class="barras"><i></i><i></i><i></i><i></i></span> Celular com internet'
      : '<span class="barras off"><i></i><i></i><i></i><i></i></span> Celular SEM internet';
    $('#cel-rede').textContent = estado.sinal ? '4G' : 'sem sinal';
    $('#cel-rede').classList.toggle('off', !estado.sinal);
  }

  function alternarSinal() {
    estado.sinal = !estado.sinal;
    if (estado.moto) {
      estado.moto.online = estado.sinal;
      estado.moto.emitir(estado.sinal ? 'online' : 'offline');
    }
    desenharSinal();
  }

  async function recomecar() {
    $('#carregando').hidden = false;
    destruirApp(estado.lider, $('#app-pc'));
    destruirApp(estado.moto, $('#app-cel'));
    await semear();
    estado.sinal = true;
    estado.lider = { uid: UID.lider, online: true, logado: true };
    estado.moto = { uid: UID.joao, online: true, logado: true };
    criarApp($('#app-pc'), estado.lider);
    criarApp($('#app-cel'), estado.moto);
    window.__treino = estado;
    desenharSinal();
    $('#carregando').hidden = true;
  }

  function progresso() {
    $$('.roteiro-bloco').forEach((bloco) => {
      const caixas = [...bloco.querySelectorAll('input[type=checkbox]')];
      const feitas = caixas.filter((c) => c.checked).length;
      bloco.querySelector('.progresso b').textContent = `${feitas}/${caixas.length}`;
      bloco.querySelector('.progresso i').style.width = `${(feitas / caixas.length) * 100}%`;
    });
  }

  function relogio() {
    const d = new Date();
    $('#cel-hora').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $$('[data-ir-modo]').forEach((b) => { b.onclick = () => definirModo(b.dataset.irModo); });
    $('#b-sinal').onclick = alternarSinal;
    $('#b-recomecar').onclick = async () => {
      await recomecar();
      $$('.roteiro input[type=checkbox]').forEach((c) => { c.checked = false; });
      progresso();
    };
    $('#b-roteiro').onclick = () => {
      document.body.classList.toggle('sem-roteiro');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    };
    $$('.roteiro input[type=checkbox]').forEach((c) => { c.onchange = progresso; });
    progresso();
    relogio();
    setInterval(relogio, 20000);
    const modoSalvo = lembrado('modo');
    definirModo(['motoqueiro', 'lider', 'ambos'].includes(modoSalvo) ? modoSalvo : 'motoqueiro');
    if (!window.L) {
      $('#carregando').innerHTML = '<p>Não consegui carregar a biblioteca do mapa. Recarregue a página.</p>';
      return;
    }
    await recomecar();
  });
})();
