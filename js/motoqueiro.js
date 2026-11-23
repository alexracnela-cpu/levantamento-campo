// Telas do motoqueiro: lista de tarefas e o mapa de campo com o símbolo.

import { api } from './api.js';
import { local } from './store.js';
import { criarMapa, desenharArea, MinhaPosicao } from './mapa.js';
import { SimboloNoMapa, limitarTamanho, normalizarRumo, svgSimbolo } from './simbolo.js';
import { abrirModal, confirmar, verOficio, guardarOficio, seloStatus } from './comum.js';
import {
  salvarPonto, excluirPonto, adicionarFoto, removerFotoLocal, aoMudarFila, estadoFila,
} from './sync.js';
import {
  $, $$, esc, aviso, dataBR, prazoVencido, novoId, dentroDoPoligono, comprimirFoto, mensagemErro,
} from './util.js';

// ------------------------------------------------------------------
// Minhas tarefas
// ------------------------------------------------------------------
export async function telaMinhas(el, _p, ctx) {
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina"><h1>Minhas tarefas</h1></div>
    <div id="lista" class="lista-tarefas"><p class="vazio">Carregando…</p></div>
  </section>`;

  const k = `tarefas:${ctx.perfil.id}`;
  const render = (tarefas, offline) => {
    const ordem = { em_andamento: 0, pendente: 1, concluido: 2 };
    tarefas.sort((a, b) => (ordem[a.status] - ordem[b.status]) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
    $('#lista', el).innerHTML = (offline ? '<p class="dica">Sem internet: mostrando a última lista guardada.</p>' : '')
      + (tarefas.length ? tarefas.map((t) => `
      <a class="cartao-tarefa" href="#/campo/${t.id}">
        <div class="ct-topo">${seloStatus(t.status)}</div>
        <h3>${esc(t.titulo)}</h3>
        ${t.descricao ? `<p class="ct-desc">${esc(t.descricao)}</p>` : ''}
        <p class="ct-meta ${prazoVencido(t.prazo, t.status) ? 'vencido' : ''}">Prazo: ${dataBR(t.prazo)}${t.oficio_path ? ' · 📄 ofício' : ''}</p>
      </a>`).join('') : '<p class="vazio">Nenhuma tarefa para você no momento.</p>');
  };

  const guardadas = (await local.cacheLer(k)) || [];
  if (guardadas.length) render([...guardadas], !navigator.onLine);

  if (navigator.onLine) {
    try {
      const tarefas = (await api.tarefas()).filter((t) => t.motoqueiro_id === ctx.perfil.id);
      await local.cacheGravar(k, tarefas);
      render([...tarefas], false);
      // deixa ofícios e pontos prontos para usar sem sinal
      tarefas.filter((t) => t.status !== 'concluido').forEach((t) => {
        local.cacheGravar(`tarefa:${t.id}`, t);
        guardarOficio(t).catch(() => {});
      });
    } catch (e) {
      if (!guardadas.length) $('#lista', el).innerHTML = `<p class="vazio">${esc(mensagemErro(e))}</p>`;
    }
  } else if (!guardadas.length) {
    $('#lista', el).innerHTML = '<p class="vazio">Sem internet e nenhuma tarefa guardada ainda.</p>';
  }

  const parar = navigator.onLine ? api.ouvir('minhas', [{ tabela: 'tarefas' }], () => ctx.recarregar()) : () => {};
  return parar;
}

// ------------------------------------------------------------------
// Campo: mapa com a área, GPS e os símbolos
// ------------------------------------------------------------------
export async function telaCampo(el, { id }, ctx) {
  el.innerHTML = '<section class="pagina"><p class="vazio">Abrindo…</p></section>';

  let tarefa = await local.cacheLer(`tarefa:${id}`);
  if (navigator.onLine) {
    try {
      const t = await api.tarefa(id);
      if (t) { tarefa = t; await local.cacheGravar(`tarefa:${id}`, t); }
    } catch { /* usa a cópia local */ }
  }
  if (!tarefa) {
    el.innerHTML = '<section class="pagina"><p class="vazio">Tarefa não disponível sem internet.</p><a class="btn" href="#/minhas">Voltar</a></section>';
    return null;
  }

  el.innerHTML = `<section class="tela-campo">
    <div id="mapa" class="mapa"></div>
    <div class="campo-topo">
      <a class="btn redondo" href="#/minhas" aria-label="Voltar">←</a>
      <div class="campo-titulo"><b>${esc(tarefa.titulo)}</b><span>${seloStatus(tarefa.status)} <span id="campo-contagem"></span> <span id="campo-sinc" class="chip-sinc"></span></span></div>
      <button class="btn redondo" id="b-oficio" aria-label="Ver ofício" ${tarefa.oficio_path ? '' : 'disabled'}>📄</button>
    </div>
    <div class="campo-acoes">
      <button class="btn redondo grande" id="b-gps" aria-label="Minha posição">◎</button>
      <button class="btn redondo grande" id="b-area" aria-label="Ver área">▢</button>
      <button class="btn primario" id="b-aqui">+ Ponto onde estou</button>
    </div>
    <div class="campo-dica" id="dica">Toque no mapa para marcar um ponto.</div>
    <div id="ficha" class="ficha" hidden></div>
  </section>`;
  document.body.classList.add('modo-campo');

  const mapa = criarMapa($('#mapa', el), { zoom: 16 });
  const poligono = desenharArea(mapa, tarefa.area);
  const enquadrar = () => poligono && mapa.fitBounds(poligono.getBounds(), { padding: [40, 40] });
  enquadrar();

  let seguir = false;
  const gps = new MinhaPosicao(mapa, (pos, erro) => {
    if (erro) {
      $('#dica', el).textContent = erro.code === 1
        ? 'GPS bloqueado: permita a localização para este site.'
        : 'Procurando sinal do GPS…';
      return;
    }
    if (seguir) mapa.setView(pos.latlng, Math.max(mapa.getZoom(), 18));
    const dentro = dentroDoPoligono(pos.latlng[0], pos.latlng[1], tarefa.area);
    $('#dica', el).textContent = dentro
      ? `Você está dentro da área · GPS ±${Math.round(pos.precisao)} m`
      : `Você está FORA da área · GPS ±${Math.round(pos.precisao)} m`;
    $('#dica', el).classList.toggle('alerta', !dentro);
  });
  gps.iniciar();
  $('#b-gps', el).onclick = () => {
    if (!gps.ultima) { aviso('Ainda sem posição do GPS.'); return; }
    seguir = true;
    mapa.setView(gps.ultima.latlng, Math.max(mapa.getZoom(), 18));
  };
  mapa.on('dragstart', () => { seguir = false; });
  $('#b-area', el).onclick = () => { seguir = false; enquadrar(); };
  $('#b-oficio', el).onclick = () => verOficio(tarefa);

  // ---- pontos: servidor + o que ainda está na fila do celular
  const simbolos = new Map();
  let selecionado = null;
  const fotosServidor = new Map(); // ponto_id -> [{id, path, url}]

  const carregarPontos = async () => {
    let lista = (await local.cacheLer(`pontos:${id}`)) || [];
    if (navigator.onLine) {
      try {
        const [srv, fts] = await Promise.all([api.pontos(id), api.fotos(id)]);
        const fila = await local.todos('fila');
        const pendentes = new Map(fila.filter((f) => f.dados.tarefa_id === id).map((f) => [f.id, f]));
        lista = srv.filter((p) => pendentes.get(p.id)?.tipo !== 'excluir').map((p) => (pendentes.get(p.id)?.tipo === 'ponto' ? { ...p, ...pendentes.get(p.id).dados } : p));
        pendentes.forEach((f, pid) => { if (f.tipo === 'ponto' && !lista.some((p) => p.id === pid)) lista.push(f.dados); });
        await local.cacheGravar(`pontos:${id}`, lista);
        const urls = await api.urlsFotos(fts.map((f) => f.path));
        fotosServidor.clear();
        fts.forEach((f) => {
          if (!fotosServidor.has(f.ponto_id)) fotosServidor.set(f.ponto_id, []);
          fotosServidor.get(f.ponto_id).push({ ...f, url: urls[f.path] });
        });
      } catch { /* segue com a cópia local */ }
    }
    return lista;
  };

  const numeroDo = (pid) => [...simbolos.keys()].indexOf(pid) + 1;
  const atualizarResumo = () => {
    $('#campo-contagem', el).textContent = `${simbolos.size} ponto(s)`;
  };

  const criarSimbolo = (p) => {
    const s = new SimboloNoMapa(mapa, p, {
      editavel: true,
      aoTocar: (simb) => selecionar(simb),
      aoMudar: (simb) => preencherNumeros(simb),
      aoSoltar: (simb) => gravar(simb, true),
    });
    simbolos.set(p.id, s);
    return s;
  };

  (await carregarPontos()).forEach(criarSimbolo);
  atualizarResumo();

  const verificarArea = (s, avisar) => {
    const fora = !dentroDoPoligono(s.ponto.lat, s.ponto.lng, tarefa.area);
    const mudou = fora !== !!s.ponto.fora_da_area;
    s.atualizar({ fora_da_area: fora });
    if (fora && (avisar || mudou)) aviso('⚠ Ponto fora da área do levantamento!', 'erro');
    return fora;
  };

  const gravar = async (s, checarArea = false) => {
    if (checarArea) verificarArea(s, false);
    await salvarPonto(s.ponto);
    if (selecionado === s) renderFicha();
  };

  // ---- ficha do ponto (painel de baixo)
  const ficha = $('#ficha', el);
  let urlsLocais = [];

  const preencherNumeros = (s) => {
    if (selecionado !== s) return;
    const t = $('#f-tamanho', ficha);
    const r = $('#f-rumo', ficha);
    if (t && document.activeElement !== t) t.value = s.ponto.tamanho_m;
    if (r && document.activeElement !== r) r.value = Math.round(s.ponto.rotacao);
  };

  const renderFotos = async () => {
    if (!selecionado) return;
    const caixa = $('#f-fotos', ficha);
    if (!caixa) return;
    urlsLocais.forEach((u) => URL.revokeObjectURL(u));
    urlsLocais = [];
    const locais = await local.porPonto(selecionado.ponto.id);
    const idsLocais = new Set(locais.map((f) => f.id));
    const itens = [
      ...locais.map((f) => {
        const u = URL.createObjectURL(f.blob);
        urlsLocais.push(u);
        return { id: f.id, url: u, pendente: !f.enviada };
      }),
      ...(fotosServidor.get(selecionado.ponto.id) || []).filter((f) => !idsLocais.has(f.id) && f.url)
        .map((f) => ({ id: f.id, url: f.url, pendente: false, soServidor: true })),
    ];
    caixa.innerHTML = itens.map((f) => `<div class="foto-item">
        <img src="${f.url}" alt="Foto" data-url="${f.url}">
        ${f.pendente ? '<span class="foto-pendente" title="Aguardando internet">⇡</span>' : ''}
        ${f.soServidor ? '' : `<button class="foto-tirar" data-id="${f.id}" aria-label="Remover foto">×</button>`}
      </div>`).join('') || '<p class="sem-fotos">Nenhuma foto ainda.</p>';
    $$('img', caixa).forEach((img) => { img.onclick = () => abrirModal(`<img class="foto-grande" src="${img.dataset.url}" alt="Foto">`, { largo: true }); });
    $$('.foto-tirar', caixa).forEach((b) => {
      b.onclick = async () => {
        if (!await confirmar('Remover esta foto?', 'Remover')) return;
        await removerFotoLocal(b.dataset.id);
        renderFotos();
      };
    });
  };

  const renderFicha = () => {
    if (!selecionado) { ficha.hidden = true; return; }
    const p = selecionado.ponto;
    ficha.hidden = false;
    ficha.innerHTML = `
      <div class="ficha-alca"></div>
      <div class="ficha-topo">
        <div class="ficha-titulo">${svgSimbolo(18)}<b>Ponto ${numeroDo(p.id)}</b></div>
        ${p.fora_da_area ? '<span class="selo selo-alerta">⚠ fora da área</span>' : ''}
        <button class="btn" id="f-pronto">Pronto</button>
      </div>
      <p class="ficha-dica">Arraste o <b>círculo</b> para mover e a <b>ponta</b> para girar e esticar.</p>
      <div class="ficha-numeros">
        <label>Tamanho (m)
          <div class="passo"><button type="button" data-t="-0.5">−</button>
          <input id="f-tamanho" type="number" inputmode="decimal" step="0.5" min="0.5" max="200" value="${p.tamanho_m}">
          <button type="button" data-t="0.5">+</button></div></label>
        <label>Rumo (°)
          <div class="passo"><button type="button" data-r="-15">⟲</button>
          <input id="f-rumo" type="number" inputmode="numeric" step="1" value="${Math.round(p.rotacao)}">
          <button type="button" data-r="15">⟳</button></div></label>
      </div>
      <label class="ficha-obs">Observações
        <textarea id="f-obs" rows="3" placeholder="Ex.: luminária apagada, braço torto, poste de concreto…">${esc(p.observacoes || '')}</textarea></label>
      <div class="ficha-fotos-cab">
        <b>Fotos</b>
        <label class="btn primario">📷 Tirar foto<input id="f-camera" type="file" accept="image/*" capture="environment" hidden></label>
      </div>
      <div id="f-fotos" class="fotos-grade"></div>
      <div class="linha-botoes"><button class="btn perigo" id="f-excluir">Excluir ponto</button></div>`;

    const s = selecionado;
    $('#f-pronto', ficha).onclick = () => selecionar(null);
    $$('[data-t]', ficha).forEach((b) => {
      b.onclick = () => {
        s.atualizar({ tamanho_m: limitarTamanho(s.ponto.tamanho_m + Number(b.dataset.t)) });
        localStorage.setItem('rondaluz-tamanho', s.ponto.tamanho_m);
        $('#f-tamanho', ficha).value = s.ponto.tamanho_m;
        gravar(s);
      };
    });
    $$('[data-r]', ficha).forEach((b) => {
      b.onclick = () => {
        s.atualizar({ rotacao: normalizarRumo(s.ponto.rotacao + Number(b.dataset.r)) });
        $('#f-rumo', ficha).value = Math.round(s.ponto.rotacao);
        gravar(s);
      };
    });
    $('#f-tamanho', ficha).onchange = (e) => {
      s.atualizar({ tamanho_m: limitarTamanho(e.target.value) });
      localStorage.setItem('rondaluz-tamanho', s.ponto.tamanho_m);
      e.target.value = s.ponto.tamanho_m;
      gravar(s);
    };
    $('#f-rumo', ficha).onchange = (e) => {
      s.atualizar({ rotacao: normalizarRumo(e.target.value) });
      e.target.value = Math.round(s.ponto.rotacao);
      gravar(s);
    };
    let tObs;
    $('#f-obs', ficha).oninput = (e) => {
      s.ponto.observacoes = e.target.value;
      clearTimeout(tObs);
      tObs = setTimeout(() => salvarPonto(s.ponto), 800);
    };
    $('#f-obs', ficha).onblur = () => { clearTimeout(tObs); salvarPonto(s.ponto); };
    $('#f-camera', ficha).onchange = async (e) => {
      const arquivos = [...e.target.files];
      e.target.value = '';
      for (const arq of arquivos) {
        try {
          const blob = await comprimirFoto(arq);
          await adicionarFoto({ id: novoId(), ponto_id: s.ponto.id, tarefa_id: id, blob });
        } catch (err) { aviso(`Foto não salva: ${mensagemErro(err)}`, 'erro'); }
      }
      aviso(navigator.onLine ? 'Foto salva.' : 'Foto guardada no celular. Envia quando tiver internet.', 'ok');
      renderFotos();
    };
    $('#f-excluir', ficha).onclick = async () => {
      if (!await confirmar(`Excluir o ponto ${numeroDo(s.ponto.id)} e as fotos dele?`, 'Excluir')) return;
      await excluirPonto(s.ponto);
      s.remover();
      simbolos.delete(s.ponto.id);
      selecionado = null;
      renderFicha();
      atualizarResumo();
    };
    renderFotos();
  };

  function selecionar(s) {
    if (selecionado && selecionado !== s) {
      selecionado.selecionar(false);
      salvarPonto(selecionado.ponto);
    }
    selecionado = s;
    if (s) s.selecionar(true);
    el.querySelector('.tela-campo').classList.toggle('com-ficha', !!s);
    renderFicha();
  }

  const novoPonto = (lat, lng) => {
    const p = {
      id: novoId(),
      tarefa_id: id,
      lat,
      lng,
      tamanho_m: limitarTamanho(localStorage.getItem('rondaluz-tamanho') || 6),
      rotacao: 90,
      observacoes: '',
      fora_da_area: false,
    };
    const s = criarSimbolo(p);
    verificarArea(s, true);
    salvarPonto(s.ponto);
    atualizarResumo();
    selecionar(s);
  };

  mapa.on('click', (e) => {
    if (selecionado) { selecionar(null); return; }
    novoPonto(e.latlng.lat, e.latlng.lng);
  });
  $('#b-aqui', el).onclick = () => {
    if (!gps.ultima) { aviso('Ainda sem posição do GPS.'); return; }
    if (selecionado) selecionar(null);
    novoPonto(...gps.ultima.latlng);
    mapa.setView(gps.ultima.latlng, Math.max(mapa.getZoom(), 19));
  };

  // quando a fila esvazia, atualiza fotos do servidor (marcadores de pendente somem)
  let fotosPendentes = -1;
  const atualizarSinc = (s) => {
    const pend = s.pontos + s.fotos;
    const chip = $('#campo-sinc', el);
    if (chip) {
      chip.className = `chip-sinc ${!s.online ? 'offline' : pend ? 'pendente' : 'ok'}`;
      chip.textContent = !s.online ? `sem internet${pend ? ` · ${pend} na fila` : ''}` : pend ? `${pend} na fila` : 'enviado';
    }
    if (s.fotos !== fotosPendentes) {
      fotosPendentes = s.fotos;
      if (selecionado) renderFotos();
    }
  };
  const pararFila = aoMudarFila(atualizarSinc);
  estadoFila().then(atualizarSinc);

  return () => {
    if (selecionado) salvarPonto(selecionado.ponto);
    pararFila();
    gps.parar();
    urlsLocais.forEach((u) => URL.revokeObjectURL(u));
    document.body.classList.remove('modo-campo');
    mapa.remove();
  };
}
