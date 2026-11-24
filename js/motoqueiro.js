// Telas do motoqueiro: lista de demandas e o mapa de campo com o símbolo.

import { api } from './api.js';
import { local } from './store.js';
import { criarMapa, desenharArea, MinhaPosicao } from './mapa.js';
import {
  SimboloNoMapa, limitarTamanho, normalizarRumo, svgSimbolo, TAMANHO_PADRAO,
  TIPOS_POSTE, SITUACOES_LUMINARIA, EQUIPAMENTOS, SEM_POSTE, svgPoste, svgLuminaria,
  tipoPoste, situacaoLuminaria, equipamento, nomePoste, nomeSituacao,
} from './simbolo.js';
import { abrirModal, confirmar, verOficio, guardarOficio, seloStatus } from './comum.js';
import {
  salvarPonto, excluirPonto, adicionarFoto, removerFotoLocal, aoMudarFila, estadoFila, salvarRede, excluirRede,
  finalizarTarefa,
} from './sync.js';
import {
  RedeNoMapa, TIPOS, SITUACOES, CABOS, CORES, svgLinha, formatarMetros, metragemRede, medidaInformada,
} from './rede.js';
import {
  $, $$, esc, aviso, dataBR, prazoVencido, novoId, dentroDoPoligono, comprimirFoto, mensagemErro, diasComPessoa,
  emMetros,
} from './util.js';

// ------------------------------------------------------------------
// Tipo de poste e luminária: o próximo ponto já nasce com a última escolha.
// ------------------------------------------------------------------
const escolhaGuardada = () => {
  const eq = equipamento({ equipamento: localStorage.getItem('rondaluz-equipamento') });
  return {
    equipamento: eq,
    tipo_poste: tipoPoste({ tipo_poste: localStorage.getItem('rondaluz-tipo-poste'), equipamento: eq }),
    luminaria: situacaoLuminaria({ luminaria: localStorage.getItem('rondaluz-luminaria') }),
  };
};
const guardarEscolha = (e) => {
  localStorage.setItem('rondaluz-equipamento', e.equipamento);
  localStorage.setItem('rondaluz-tipo-poste', e.tipo_poste);
  localStorage.setItem('rondaluz-luminaria', e.luminaria);
};

// Desenha os botões de escolha dentro de "caixa" e redesenha a cada toque.
// aoEscolher recebe a escolha completa { equipamento, tipo_poste, luminaria }.
function montarEscolha(caixa, inicial, aoEscolher) {
  const atual = { ...inicial };
  const desenhar = () => {
    const proj = atual.equipamento === 'projetor';
    const postes = [...Object.keys(TIPOS_POSTE), ...(proj ? [SEM_POSTE] : [])];
    caixa.innerHTML = `<div class="seg escolha-eq" role="group" aria-label="Equipamento">
        ${Object.entries(EQUIPAMENTOS).map(([v, nome]) => `<button type="button" data-equipamento="${v}" aria-pressed="${atual.equipamento === v}">${svgLuminaria(atual.luminaria, 16, v)} ${nome}</button>`).join('')}
      </div>
      <div class="escolha-poste ${proj ? 'com-sem-poste' : ''}" role="group" aria-label="Tipo de poste">
        ${postes.map((v) => `<button type="button" data-tipo-poste="${v}" aria-pressed="${atual.tipo_poste === v}">${svgPoste(v, 34)}<span>${nomePoste(v)}</span></button>`).join('')}
      </div>
      <div class="seg escolha-lum" role="group" aria-label="Existente ou novo">
        ${Object.keys(SITUACOES_LUMINARIA).map((v) => `<button type="button" data-luminaria="${v}" aria-pressed="${atual.luminaria === v}">${svgLuminaria(v, 16, atual.equipamento)} ${nomeSituacao({ ...atual, luminaria: v })}</button>`).join('')}
      </div>`;
    const mudar = (campo, valor) => {
      atual[campo] = valor;
      atual.tipo_poste = tipoPoste(atual); // luminária não fica "sem poste"
      desenhar();
      aoEscolher({ ...atual });
    };
    $$('[data-equipamento]', caixa).forEach((b) => { b.onclick = () => mudar('equipamento', b.dataset.equipamento); });
    $$('[data-tipo-poste]', caixa).forEach((b) => { b.onclick = () => mudar('tipo_poste', b.dataset.tipoPoste); });
    $$('[data-luminaria]', caixa).forEach((b) => { b.onclick = () => mudar('luminaria', b.dataset.luminaria); });
  };
  desenhar();
}

// ------------------------------------------------------------------
// Minhas demandas
// ------------------------------------------------------------------
export async function telaMinhas(el, _p, ctx) {
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina"><h1>Minhas demandas</h1></div>
    <div id="lista" class="lista-tarefas"><p class="vazio">Carregando…</p></div>
  </section>`;

  const k = `tarefas:${ctx.perfil.id}`;
  const render = (tarefas, offline) => {
    const ordem = { em_andamento: 0, pendente: 1, concluido: 2 };
    tarefas.sort((a, b) => (ordem[a.status] - ordem[b.status]) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
    $('#lista', el).innerHTML = (offline ? '<p class="dica">Sem internet: mostrando a última lista guardada.</p>' : '')
      + (tarefas.length ? tarefas.map((t) => `
      <a class="cartao-tarefa" href="#/campo/${t.id}">
        <div class="ct-topo">${seloStatus(t.status)}${t.finalizada_em ? ' <span class="selo selo-entregue">✓ entregue</span>' : ''}</div>
        <h3>${esc(t.titulo)}</h3>
        ${t.descricao ? `<p class="ct-desc">${esc(t.descricao)}</p>` : ''}
        <p class="ct-meta ${prazoVencido(t.prazo, t.status) ? 'vencido' : ''}">Prazo: ${dataBR(t.prazo)}${t.oficio_path ? ' · 📄 ofício' : ''}</p>
        ${(() => { const d = diasComPessoa(t); return d ? `<p class="ct-meta">📅 Com você ${d.texto}</p>` : ''; })()}
      </a>`).join('') : '<p class="vazio">Nenhuma demanda para você no momento.</p>');
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
    $('#lista', el).innerHTML = '<p class="vazio">Sem internet e nenhuma demanda guardada ainda.</p>';
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
    el.innerHTML = '<section class="pagina"><p class="vazio">Demanda não disponível sem internet.</p><a class="btn" href="#/minhas">Voltar</a></section>';
    return null;
  }

  el.innerHTML = `<section class="tela-campo">
    <div id="mapa" class="mapa"></div>
    <div class="campo-topo">
      <a class="btn redondo" href="#/minhas" aria-label="Voltar">←</a>
      <div class="campo-titulo"><b>${esc(tarefa.titulo)}</b><span>${seloStatus(tarefa.status)} <span id="campo-entregue" class="selo selo-entregue" ${tarefa.finalizada_em ? '' : 'hidden'}>✓ entregue</span> <span id="campo-contagem"></span> <span id="campo-sinc" class="chip-sinc"></span></span></div>
      <button class="btn redondo" id="b-oficio" aria-label="Ver ofício" ${tarefa.oficio_path ? '' : 'disabled'}>📄</button>
    </div>
    <div class="campo-acoes">
      <button class="btn redondo grande" id="b-gps" aria-label="Minha posição">◎</button>
      <button class="btn redondo grande" id="b-area" aria-label="Ver área">▢</button>
      <button class="btn" id="b-terminei">✓ Terminei</button>
      <button class="btn" id="b-rede">〰 Desenhar rede</button>
      <button class="btn primario" id="b-aqui">+ Ponto onde estou</button>
    </div>
    <div class="campo-esq">
      <button class="chip-proximo" id="b-proximo" aria-label="Escolher poste e luminária do próximo ponto"></button>
      <div class="campo-dica" id="dica">Toque no mapa para marcar um ponto.</div>
    </div>
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

  // Motoqueiro só marca ponto e rede até 100 m de onde está (pelo GPS). Líder não tem limite.
  const LIMITE_M = 100;
  const comLimite = ctx.perfil.papel !== 'lider';
  const pertoDeMim = (lat, lng) => {
    if (!comLimite) return true;
    if (!gps.ultima) { aviso('Esperando o sinal do GPS. Só dá para marcar perto de onde você está.', 'erro'); return false; }
    const [e, n] = emMetros(gps.ultima.latlng[0], gps.ultima.latlng[1], lat, lng);
    const d = Math.hypot(e, n);
    if (d > LIMITE_M) {
      aviso(`Você está a ${Math.round(d)} m deste lugar. Só dá para marcar até ${LIMITE_M} m de onde você está.`, 'erro');
      return false;
    }
    return true;
  };
  $('#b-gps', el).onclick = () => {
    if (!gps.ultima) { aviso('Ainda sem posição do GPS.'); return; }
    seguir = true;
    mapa.setView(gps.ultima.latlng, Math.max(mapa.getZoom(), 18));
  };
  mapa.on('dragstart', () => { seguir = false; });
  $('#b-area', el).onclick = () => { seguir = false; enquadrar(); };
  $('#b-oficio', el).onclick = () => verOficio(tarefa);

  // ---- poste e luminária do próximo ponto
  const desenharProximo = () => {
    const e = escolhaGuardada();
    $('#b-proximo', el).innerHTML = `<small>Próximo ponto</small>${svgPoste(e.tipo_poste, 22)}<b>${nomePoste(e.tipo_poste)}</b>
      ${svgLuminaria(e.luminaria, 12, e.equipamento)}<b>${EQUIPAMENTOS[e.equipamento]} ${nomeSituacao(e).toLowerCase()}</b><span class="chip-trocar">trocar</span>`;
  };
  desenharProximo();
  $('#b-proximo', el).onclick = () => {
    const { caixa, fechar } = abrirModal(`<h3>Próximo ponto</h3>
      <p class="dica">Escolha antes de tocar no mapa. Fica marcado para os próximos pontos.</p>
      <div id="m-escolha"></div>
      <div class="linha-botoes"><button class="btn primario" id="m-ok">OK</button></div>`);
    montarEscolha($('#m-escolha', caixa), escolhaGuardada(), (e) => { guardarEscolha(e); desenharProximo(); });
    $('#m-ok', caixa).onclick = fechar;
  };

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

  // ---- rede: servidor + fila do celular
  const redes = new Map();
  let redeSel = null;
  let desenhando = false;
  let pontosAntes = [];

  const carregarRedes = async () => {
    let lista = (await local.cacheLer(`redes:${id}`)) || [];
    if (navigator.onLine) {
      try {
        const srv = await api.redes(id);
        const fila = await local.todos('fila');
        const pend = new Map(fila.filter((f) => f.dados.tarefa_id === id && (f.tipo === 'rede' || f.tipo === 'excluir_rede')).map((f) => [f.id, f]));
        lista = srv.filter((r) => pend.get(r.id)?.tipo !== 'excluir_rede')
          .map((r) => (pend.get(r.id)?.tipo === 'rede' ? { ...r, ...pend.get(r.id).dados } : r));
        pend.forEach((f, rid) => { if (f.tipo === 'rede' && !lista.some((r) => r.id === rid)) lista.push(f.dados); });
        await local.cacheGravar(`redes:${id}`, lista);
      } catch { /* segue com a cópia local */ }
    }
    return lista;
  };

  const numeroDo = (pid) => [...simbolos.keys()].indexOf(pid) + 1;
  const atualizarResumo = () => {
    const metros = [...redes.values()].reduce((t, r) => t + metragemRede(r.rede), 0);
    $('#campo-contagem', el).textContent = `${simbolos.size} ponto(s)${redes.size ? ` · ${formatarMetros(metros)} de rede` : ''}`;
  };

  const pontosBons = new Map(); // rede id -> pontos aceitos (para desfazer arrasto longe demais)
  const guardarPontosBons = (rd) => pontosBons.set(rd.rede.id, rd.rede.pontos.map((p) => [...p]));
  const criarRede = (r) => {
    const rd = new RedeNoMapa(mapa, r, {
      editavel: true,
      aoTocar: (alvo, ll) => {
        if (desenhando) { adicionarVertice([ll.lat, ll.lng]); return; }
        selecionarRede(alvo);
      },
      aoTocarVertice: (alvo, i, ll) => {
        // desenhando: tocar num ponto antigo continua o cabo até ele; fora disso, escolhe o ponto a ajustar
        if (desenhando && alvo === redeSel && i !== alvo.rede.pontos.length - 1) { adicionarVertice([ll.lat, ll.lng]); return; }
        alvo.verticeAtivo = i;
        if (alvo !== redeSel) { selecionarRede(alvo); return; }
        alvo.desenhar();
        renderFicha();
      },
      aoMudar: (alvo) => {
        // ponto do cabo arrastado para longe demais: volta para onde estava
        const antes = pontosBons.get(alvo.rede.id) || [];
        const longe = alvo.rede.pontos.some((p, i) => (!antes[i] || antes[i][0] !== p[0] || antes[i][1] !== p[1]) && !pertoDeMim(p[0], p[1]));
        if (longe) {
          alvo.rede.pontos = antes.slice(0, alvo.rede.pontos.length).map((p) => [...p]);
          alvo.desenhar();
          return;
        }
        guardarPontosBons(alvo);
        salvarRede(alvo.rede); atualizarResumo(); if (redeSel === alvo) renderFicha();
      },
    });
    redes.set(r.id, rd);
    guardarPontosBons(rd);
    return rd;
  };
  (await carregarRedes()).forEach(criarRede);

  const posicaoBoa = new Map(); // ponto id -> última posição aceita
  const criarSimbolo = (p) => {
    const s = new SimboloNoMapa(mapa, p, {
      editavel: true,
      aoTocar: (simb) => {
        if (desenhando) { adicionarVertice(simb.latlng); return; } // encaixa a rede no centro do poste
        selecionar(simb);
      },
      aoMudar: (simb) => preencherNumeros(simb),
      aoSoltar: (simb) => {
        const antes = posicaoBoa.get(simb.ponto.id);
        const moveu = !antes || antes[0] !== simb.ponto.lat || antes[1] !== simb.ponto.lng;
        if (moveu && !pertoDeMim(simb.ponto.lat, simb.ponto.lng)) {
          simb.atualizar({ lat: antes[0], lng: antes[1] }); // volta para onde estava
          preencherNumeros(simb);
          return;
        }
        posicaoBoa.set(simb.ponto.id, [simb.ponto.lat, simb.ponto.lng]);
        gravar(simb, true);
      },
    });
    simbolos.set(p.id, s);
    posicaoBoa.set(p.id, [p.lat, p.lng]);
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

  const renderFichaRede = () => {
    const rd = redeSel;
    const r = rd.rede;
    ficha.hidden = false;
    const dica = desenhando
      ? (r.pontos.length
        ? 'Toque no próximo poste ou ponto do mapa. Tocar num poste encaixa a rede no centro dele.'
        : 'Toque no poste (ou ponto do mapa) onde a rede começa.')
      : 'Arraste os quadradinhos para ajustar o traçado.';
    const informada = medidaInformada(r);
    const doMapa = rd.comprimento;
    ficha.innerHTML = `
      <div class="ficha-alca"></div>
      <div class="ficha-topo">
        <div class="ficha-titulo">${svgLinha(r.tipo, r.situacao, 40)}<b>${desenhando ? 'Nova rede' : 'Rede'}</b></div>
        <label class="medida-rede ${informada ? 'informada' : ''}" title="Metragem do cabo (toque para digitar a medida real)">
          <input id="r-metros" type="number" inputmode="decimal" step="0.1" min="0" max="99999"
            value="${informada ?? Math.round(doMapa)}" aria-label="Metragem da rede em metros"> m
        </label>
        <button class="btn primario" id="r-pronto">${desenhando ? 'Concluir' : 'Pronto'}</button>
      </div>
      ${informada ? `<p class="ficha-dica medida-mapa">✎ Medida digitada · no mapa: ${formatarMetros(doMapa)} <button type="button" class="link" id="r-usar-mapa">usar a do mapa</button></p>` : ''}
      <p class="ficha-dica">${dica}</p>
      <div class="seg" role="group" aria-label="Tipo de rede">
        ${Object.entries(TIPOS).map(([v, t]) => `<button type="button" data-tipo="${v}" aria-pressed="${r.tipo === v}">${svgLinha(v, r.situacao, 28)} ${t}</button>`).join('')}
      </div>
      <div class="seg" role="group" aria-label="Situação da rede">
        ${Object.entries(SITUACOES).map(([v, t]) => `<button type="button" data-situacao="${v}" aria-pressed="${r.situacao === v}"><i style="background:${CORES[v]}"></i> ${t}</button>`).join('')}
      </div>
      <div class="cabos" role="group" aria-label="Tipo de rede">
        <span class="cabos-rotulo">Tipo de rede${r.cabo ? '' : ' <small>(escolha um)</small>'}</span>
        ${Object.entries(CABOS).map(([v, t]) => `<button type="button" data-cabo="${v}" aria-pressed="${r.cabo === v}">${t}</button>`).join('')}
      </div>
      <div class="linha-botoes">
        ${desenhando
    ? `<button class="btn" id="r-desfazer" ${r.pontos.length ? '' : 'disabled'}>↶ Desfazer</button><button class="btn" id="r-cancelar">Cancelar</button>`
    : '<button class="btn" id="r-continuar">+ Continuar desenhando</button><button class="btn perigo" id="r-excluir">Excluir rede</button>'}
      </div>`;
    const salvarSeValida = () => { if (rd.rede.pontos.length >= 2) salvarRede(rd.rede); atualizarResumo(); };
    $('#r-metros', ficha).onchange = (e) => {
      const v = Number(String(e.target.value).replace(',', '.'));
      // vazio, zero ou igual ao do mapa = volta a valer a medida do mapa
      const manual = Number.isFinite(v) && v > 0 && Math.abs(v - Math.round(rd.comprimento)) >= 0.05 ? Math.round(v * 10) / 10 : null;
      rd.atualizar({ comprimento_informado: manual });
      salvarSeValida();
      renderFicha();
    };
    $('#r-metros', ficha).onfocus = (e) => e.target.select();
    const usarMapa = $('#r-usar-mapa', ficha);
    if (usarMapa) usarMapa.onclick = () => { rd.atualizar({ comprimento_informado: null }); salvarSeValida(); renderFicha(); };
    $$('[data-tipo]', ficha).forEach((b) => {
      b.onclick = () => { rd.atualizar({ tipo: b.dataset.tipo }); localStorage.setItem('rondaluz-rede-tipo', b.dataset.tipo); salvarSeValida(); renderFicha(); };
    });
    $$('[data-cabo]', ficha).forEach((b) => {
      b.onclick = () => { rd.atualizar({ cabo: b.dataset.cabo }); localStorage.setItem('rondaluz-rede-cabo', b.dataset.cabo); salvarSeValida(); renderFicha(); };
    });
    $$('[data-situacao]', ficha).forEach((b) => {
      b.onclick = () => { rd.atualizar({ situacao: b.dataset.situacao }); localStorage.setItem('rondaluz-rede-situacao', b.dataset.situacao); salvarSeValida(); renderFicha(); };
    });
    $('#r-pronto', ficha).onclick = () => (desenhando ? concluirRede() : selecionarRede(null));
    if (desenhando) {
      $('#r-desfazer', ficha).onclick = () => { rd.desfazer(); salvarSeValida(); renderFicha(); };
      $('#r-cancelar', ficha).onclick = () => {
        desenhando = false;
        if (pontosAntes.length >= 2) { rd.atualizar({ pontos: pontosAntes }); salvarRede(rd.rede); selecionarRede(null); } else { apagarRede(rd); }
        atualizarResumo();
      };
    } else {
      $('#r-continuar', ficha).onclick = () => { pontosAntes = rd.rede.pontos.map((p) => [...p]); desenhando = true; selecionarRede(rd); };
      $('#r-excluir', ficha).onclick = async () => {
        if (!await confirmar(`Excluir esta rede (${formatarMetros(metragemRede(rd.rede))})?`, 'Excluir')) return;
        apagarRede(rd);
      };
    }
  };

  const renderFicha = () => {
    if (redeSel) { renderFichaRede(); return; }
    if (!selecionado) { ficha.hidden = true; return; }
    const p = selecionado.ponto;
    ficha.hidden = false;
    ficha.innerHTML = `
      <div class="ficha-alca"></div>
      <div class="ficha-topo">
        <label class="ficha-titulo" title="Número da plaqueta"><span id="f-icone">${svgSimbolo(18, p)}</span>
          <input id="f-plaqueta" class="ficha-plaqueta" maxlength="30" autocomplete="off" autocapitalize="characters"
            placeholder="Ponto ${numeroDo(p.id)} · nº plaqueta" value="${esc(p.plaqueta || '')}" aria-label="Número da plaqueta"></label>
        ${p.fora_da_area ? '<span class="selo selo-alerta">⚠ fora da área</span>' : ''}
        <button class="btn" id="f-pronto">Pronto</button>
      </div>
      <p class="ficha-dica">Arraste o <b>círculo</b> para mover e a <b>ponta</b> para girar e esticar.</p>
      <div class="ficha-numeros">
        <label>Tamanho (m)
          <div class="passo"><button type="button" data-t="-0.1">−</button>
          <input id="f-tamanho" type="number" inputmode="decimal" step="0.1" min="0.5" max="200" value="${p.tamanho_m}">
          <button type="button" data-t="0.1">+</button></div></label>
        <label>Rumo (°)
          <div class="passo"><button type="button" data-r="-15">⟲</button>
          <input id="f-rumo" type="number" inputmode="numeric" step="1" value="${Math.round(p.rotacao)}">
          <button type="button" data-r="15">⟳</button></div></label>
      </div>
      <div class="ficha-escolha"></div>
      <div class="ficha-poste">
        <div class="poste-topo">
          <label for="f-poste" id="f-poste-rotulo">Poste <small>altura/esforço · ex.: 11/300</small></label>
          <div class="qtd-lum">
            <span id="f-qtd-rotulo">Luminárias</span>
            <div class="passo passo-qtd"><button type="button" data-q="-1" aria-label="Menos uma luminária">−</button>
            <input id="f-qtd" type="number" inputmode="numeric" min="0" max="4" step="1" value="${Math.min(4, p.qtd_luminarias ?? 1)}" aria-label="Quantidade de luminárias">
            <button type="button" data-q="1" aria-label="Mais uma luminária">+</button></div>
          </div>
        </div>
        <div class="poste-linha" id="f-poste-linha">
          <input id="f-poste" type="text" inputmode="decimal" maxlength="20" autocomplete="off" placeholder="11/300" value="${esc(p.poste || '')}">
          <button type="button" id="f-barra" aria-label="Inserir barra">/</button>
        </div>
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
    const campoQtd = $('#f-qtd', ficha);
    const guardarQtd = (v) => {
      const n = Math.max(0, Math.min(4, Math.round(Number(v) || 0))); // no máximo 4 por ponto
      if (Number(v) > 4) aviso('No máximo 4 luminárias por ponto.');
      s.atualizar({ qtd_luminarias: n }); // redesenha o símbolo com os braços
      campoQtd.value = n;
      salvarPonto(s.ponto);
    };
    campoQtd.onchange = () => guardarQtd(campoQtd.value);
    $$('[data-q]', ficha).forEach((b) => { b.onclick = () => guardarQtd((s.ponto.qtd_luminarias ?? 1) + Number(b.dataset.q)); });
    const campoPoste = $('#f-poste', ficha);
    let tPoste;
    const guardarPoste = (imediato) => {
      s.ponto.poste = campoPoste.value.trim();
      clearTimeout(tPoste);
      if (imediato) salvarPonto(s.ponto); else tPoste = setTimeout(() => salvarPonto(s.ponto), 800);
    };
    campoPoste.oninput = () => guardarPoste(false);
    campoPoste.onblur = () => guardarPoste(true);
    campoPoste.onkeydown = (e) => { if (e.key === 'Enter') campoPoste.blur(); };
    const barra = $('#f-barra', ficha);
    barra.onpointerdown = (e) => e.preventDefault(); // não tira o foco (o teclado continua aberto)
    barra.onclick = () => {
      const ini = campoPoste.selectionStart ?? campoPoste.value.length;
      const fim = campoPoste.selectionEnd ?? campoPoste.value.length;
      campoPoste.setRangeText('/', ini, fim, 'end');
      campoPoste.focus();
      guardarPoste(false);
    };
    const ajustarRotulos = () => {
      const proj = equipamento(s.ponto) === 'projetor';
      $('#f-qtd-rotulo', ficha).textContent = proj ? 'Projetores' : 'Luminárias';
      const semPoste = tipoPoste(s.ponto) === SEM_POSTE;
      $('#f-poste-rotulo', ficha).style.visibility = semPoste ? 'hidden' : '';
      $('#f-poste-linha', ficha).hidden = semPoste;
    };
    montarEscolha($('.ficha-escolha', ficha), {
      equipamento: equipamento(p), tipo_poste: tipoPoste(p), luminaria: situacaoLuminaria(p),
    }, (e) => {
      s.atualizar(e); // redesenha o símbolo no mapa
      guardarEscolha(e); // e vale para os próximos pontos
      desenharProximo();
      $('#f-icone', ficha).innerHTML = svgSimbolo(18, s.ponto);
      ajustarRotulos();
      salvarPonto(s.ponto);
    });
    ajustarRotulos();
    let tPlaq;
    $('#f-plaqueta', ficha).oninput = (e) => {
      s.ponto.plaqueta = e.target.value;
      clearTimeout(tPlaq);
      tPlaq = setTimeout(() => salvarPonto(s.ponto), 800);
    };
    $('#f-plaqueta', ficha).onblur = () => { clearTimeout(tPlaq); salvarPonto(s.ponto); };
    $('#f-plaqueta', ficha).onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
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
      const nome = s.ponto.plaqueta ? `a plaqueta ${s.ponto.plaqueta}` : `o ponto ${numeroDo(s.ponto.id)}`;
      if (!await confirmar(`Excluir ${nome} e as fotos dele?`, 'Excluir')) return;
      await excluirPonto(s.ponto);
      s.remover();
      simbolos.delete(s.ponto.id);
      selecionado = null;
      renderFicha();
      atualizarResumo();
    };
    renderFotos();
  };

  function apagarRede(rd) {
    excluirRede(rd.rede);
    rd.remover();
    redes.delete(rd.rede.id);
    redeSel = null;
    desenhando = false;
    mapa.getContainer().classList.remove('desenhando');
    el.querySelector('.tela-campo').classList.toggle('com-ficha', !!selecionado);
    renderFicha();
    atualizarResumo();
  }

  function selecionarRede(rd) {
    if (redeSel && redeSel !== rd) redeSel.selecionar(false);
    if (rd && selecionado) { selecionado.selecionar(false); salvarPonto(selecionado.ponto); selecionado = null; }
    redeSel = rd;
    if (rd) rd.selecionar(true);
    if (!rd) desenhando = false;
    if (rd && !desenhando && rd.rede.pontos.length) {
      // deixa o ponto que as setas movem visível acima da ficha
      const ll = L.latLng(rd.rede.pontos[rd.indiceAtivo]);
      if (mapa.getZoom() < 20) mapa.setView(ll, 20, { animate: false });
      const y = mapa.latLngToContainerPoint(ll).y;
      const alvo = mapa.getSize().y * 0.25;
      if (Math.abs(y - alvo) > 20) mapa.panBy([0, y - alvo], { animate: true });
    }
    mapa.getContainer().classList.toggle('desenhando', desenhando && !!rd);
    el.querySelector('.tela-campo').classList.toggle('com-ficha', !!(rd || selecionado));
    renderFicha();
  }

  function adicionarVertice(ll) {
    if (!redeSel) return;
    if (!pertoDeMim(ll[0], ll[1])) return;
    redeSel.adicionarVertice(ll);
    guardarPontosBons(redeSel);
    if (redeSel.rede.pontos.length >= 2) salvarRede(redeSel.rede);
    atualizarResumo();
    renderFicha();
  }

  function iniciarRede() {
    selecionar(null);
    const r = {
      id: novoId(),
      tarefa_id: id,
      tipo: localStorage.getItem('rondaluz-rede-tipo') || 'secundaria',
      situacao: localStorage.getItem('rondaluz-rede-situacao') || 'existente',
      ...(CABOS[localStorage.getItem('rondaluz-rede-cabo')] ? { cabo: localStorage.getItem('rondaluz-rede-cabo') } : {}),
      pontos: [],
      observacoes: '',
    };
    pontosAntes = [];
    desenhando = true;
    selecionarRede(criarRede(r));
  }

  function concluirRede() {
    const rd = redeSel;
    desenhando = false;
    if (rd.rede.pontos.length < 2) {
      aviso('A rede precisa de pelo menos 2 pontos. Desenho descartado.');
      apagarRede(rd);
      return;
    }
    salvarRede(rd.rede);
    aviso(`Rede salva: ${formatarMetros(metragemRede(rd.rede))}.`, 'ok');
    selecionarRede(null);
    atualizarResumo();
  }

  function selecionar(s) {
    if (s && redeSel) { redeSel.selecionar(false); redeSel = null; desenhando = false; }
    if (selecionado && selecionado !== s) {
      selecionado.selecionar(false);
      salvarPonto(selecionado.ponto);
    }
    selecionado = s;
    if (s) s.selecionar(true);
    el.querySelector('.tela-campo').classList.toggle('com-ficha', !!s);
    renderFicha();
    if (s) {
      // garante que o ponto fique visível acima da ficha, perto o bastante para mexer
      if (mapa.getZoom() < 22) mapa.setView(s.latlng, 22, { animate: false });
      const alto = mapa.getSize().y;
      const y = mapa.latLngToContainerPoint(s.latlng).y;
      const alvo = alto * 0.25;
      if (Math.abs(y - alvo) > 20) mapa.panBy([0, y - alvo], { animate: true });
    }
  }

  const novoPonto = (lat, lng) => {
    const p = {
      id: novoId(),
      tarefa_id: id,
      lat,
      lng,
      tamanho_m: limitarTamanho(localStorage.getItem('rondaluz-tamanho') || TAMANHO_PADRAO),
      rotacao: 90,
      plaqueta: '',
      poste: '',
      ...escolhaGuardada(),
      qtd_luminarias: 1,
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
    if (desenhando) { adicionarVertice([e.latlng.lat, e.latlng.lng]); return; }
    if (redeSel) { selecionarRede(null); return; }
    if (selecionado) { selecionar(null); return; }
    if (!pertoDeMim(e.latlng.lat, e.latlng.lng)) return;
    novoPonto(e.latlng.lat, e.latlng.lng);
  });
  $('#b-rede', el).onclick = () => iniciarRede();
  $('#b-terminei', el).onclick = () => {
    const metros = [...redes.values()].reduce((t, r) => t + metragemRede(r.rede), 0);
    const semPlaqueta = [...simbolos.values()].filter((s) => !s.ponto.plaqueta).length;
    const { caixa, fechar } = abrirModal(`<h3>Terminar o levantamento?</h3>
      <p>O líder vai ser avisado de que você terminou <b>${esc(tarefa.titulo)}</b>.</p>
      <ul class="resumo-entrega">
        <li><b>${simbolos.size}</b> ponto(s)${semPlaqueta ? ` · <span class="alerta-texto">${semPlaqueta} sem plaqueta</span>` : ''}</li>
        <li><b>${formatarMetros(metros)}</b> de rede desenhada</li>
      </ul>
      <label>Observação final (opcional)<textarea id="m-obs" rows="3" placeholder="Ex.: rua sem saída no fim do trecho, 2 postes sem acesso…"></textarea></label>
      <div class="linha-botoes"><button class="btn" id="m-nao">Voltar</button><button class="btn primario" id="m-sim">✓ Terminei</button></div>`);
    $('#m-nao', caixa).onclick = fechar;
    $('#m-sim', caixa).onclick = async () => {
      const obs = $('#m-obs', caixa).value.trim();
      fechar();
      if (selecionado) selecionar(null);
      if (redeSel) selecionarRede(null);
      await finalizarTarefa(id, obs);
      tarefa.finalizada_em = new Date().toISOString();
      tarefa.finalizacao_obs = obs;
      await local.cacheGravar(`tarefa:${id}`, tarefa);
      $('#campo-entregue', el).hidden = false;
      aviso(navigator.onLine ? 'Pronto! O líder foi avisado.' : 'Guardado. O líder é avisado quando a internet voltar.', 'ok');
    };
  };
  $('#b-aqui', el).onclick = () => {
    if (!gps.ultima) { aviso('Ainda sem posição do GPS.'); return; }
    if (selecionado) selecionar(null);
    novoPonto(...gps.ultima.latlng);
    mapa.setView(gps.ultima.latlng, Math.max(mapa.getZoom(), 21));
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
    if (redeSel && redeSel.rede.pontos.length >= 2) salvarRede(redeSel.rede);
    pararFila();
    gps.parar();
    urlsLocais.forEach((u) => URL.revokeObjectURL(u));
    document.body.classList.remove('modo-campo');
    mapa.remove();
  };
}
