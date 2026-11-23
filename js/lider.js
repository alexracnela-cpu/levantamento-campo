// Telas do líder: painel de tarefas, nova tarefa, acompanhamento e equipe.

import { api } from './api.js';
import { criarMapa, desenharArea, DesenhoDeArea } from './mapa.js';
import { SimboloNoMapa } from './simbolo.js';
import { abrirModal, confirmar, verOficio, seloStatus } from './comum.js';
import {
  $, $$, esc, aviso, dataBR, horaBR, prazoVencido, novoId, nomeArquivoSeguro, mensagemErro, STATUS,
} from './util.js';

// ------------------------------------------------------------------
// Painel
// ------------------------------------------------------------------
export async function telaPainel(el, _p, ctx) {
  let filtro = sessionStorage.getItem('rondaluz-filtro') || 'todas';
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina">
      <h1>Levantamentos</h1>
      <a class="btn primario" href="#/nova">+ Nova tarefa</a>
    </div>
    <div class="abas" role="tablist">
      ${[['todas', 'Todas'], ['pendente', 'Pendentes'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluídas']]
    .map(([v, t]) => `<button class="aba" data-f="${v}" role="tab">${t}</button>`).join('')}
    </div>
    <div id="lista" class="lista-tarefas"><p class="vazio">Carregando…</p></div>
  </section>`;

  let tarefas = [];
  let contagem = {};
  let equipe = {};

  const render = () => {
    $$('.aba', el).forEach((b) => b.classList.toggle('ativa', b.dataset.f === filtro));
    const lista = tarefas.filter((t) => filtro === 'todas' || t.status === filtro);
    $('#lista', el).innerHTML = lista.length ? lista.map((t) => `
      <a class="cartao-tarefa" href="#/tarefa/${t.id}">
        <div class="ct-topo">${seloStatus(t.status)}<span class="ct-pontos">${contagem[t.id] || 0} ponto(s)</span></div>
        <h3>${esc(t.titulo)}</h3>
        <p class="ct-meta">Motoqueiro: <b>${esc(equipe[t.motoqueiro_id]?.nome || '— sem motoqueiro —')}</b></p>
        <p class="ct-meta ${prazoVencido(t.prazo, t.status) ? 'vencido' : ''}">Prazo: ${dataBR(t.prazo)}${prazoVencido(t.prazo, t.status) ? ' · atrasada' : ''}</p>
      </a>`).join('') : '<p class="vazio">Nenhuma tarefa aqui ainda.</p>';
  };

  const carregar = async () => {
    try {
      const [t, pts, eq] = await Promise.all([api.tarefas(), api.contarPontos(), api.equipe()]);
      tarefas = t;
      contagem = {};
      pts.forEach((p) => { contagem[p.tarefa_id] = (contagem[p.tarefa_id] || 0) + 1; });
      equipe = Object.fromEntries(eq.map((m) => [m.id, m]));
      render();
    } catch (e) {
      $('#lista', el).innerHTML = `<p class="vazio">Não foi possível carregar: ${esc(mensagemErro(e))}</p>`;
    }
  };

  $$('.aba', el).forEach((b) => {
    b.onclick = () => { filtro = b.dataset.f; sessionStorage.setItem('rondaluz-filtro', filtro); render(); };
  });

  await carregar();
  let t;
  const parar = api.ouvir('painel', [{ tabela: 'tarefas' }, { tabela: 'pontos' }], () => {
    clearTimeout(t);
    t = setTimeout(carregar, 600);
  });
  return () => { parar(); clearTimeout(t); };
}

// ------------------------------------------------------------------
// Nova tarefa
// ------------------------------------------------------------------
export async function telaNovaTarefa(el, _p, ctx) {
  el.innerHTML = `<section class="tela-mapa">
    <div class="mapa-area"><div id="mapa" class="mapa"></div>
      <div class="barra-mapa">
        <form id="busca" class="busca"><input name="q" placeholder="Buscar endereço em Manaus…" autocomplete="off"><button class="btn">Buscar</button></form>
        <div class="ferramentas">
          <button type="button" id="b-desenhar" class="btn primario">✎ Desenhar área</button>
          <button type="button" id="b-desfazer" class="btn">Desfazer</button>
          <button type="button" id="b-limpar" class="btn">Limpar</button>
          <span id="info-area" class="info-area">Toque no mapa para marcar os cantos da área.</span>
        </div>
      </div>
    </div>
    <aside class="painel-lateral">
      <h2>Nova tarefa</h2>
      <form id="form" class="formulario">
        <label>Título<input name="titulo" required maxlength="140" placeholder="Ex.: Levantamento Av. Djalma Batista"></label>
        <label>Descrição<textarea name="descricao" rows="3" placeholder="O que o motoqueiro deve levantar"></textarea></label>
        <label>Prazo<input type="date" name="prazo"></label>
        <label>Motoqueiro<select name="motoqueiro_id" required><option value="">Carregando…</option></select></label>
        <label>Ofício ou encaminhamento (PDF ou imagem)<input type="file" name="oficio" accept="application/pdf,image/*"></label>
        <div class="linha-botoes">
          <a class="btn" href="#/painel">Cancelar</a>
          <button class="btn primario" id="b-salvar">Criar tarefa</button>
        </div>
      </form>
    </aside>
  </section>`;

  const mapa = criarMapa($('#mapa', el));
  let area = [];
  const desenho = new DesenhoDeArea(mapa, (v) => {
    area = v;
    $('#info-area', el).textContent = v.length < 3
      ? `${v.length} canto(s). Faltam ${3 - v.length} para fechar a área.`
      : `Área com ${v.length} cantos. Arraste os números para ajustar.`;
  });
  const botaoDesenhar = $('#b-desenhar', el);
  const alternar = (sim) => {
    desenho.ligar(sim);
    botaoDesenhar.classList.toggle('ligado', sim);
    botaoDesenhar.textContent = sim ? '✓ Terminar desenho' : '✎ Desenhar área';
  };
  alternar(true);
  botaoDesenhar.onclick = () => alternar(!desenho.ativo);
  $('#b-desfazer', el).onclick = () => desenho.desfazer();
  $('#b-limpar', el).onclick = () => desenho.limpar();

  $('#busca', el).onsubmit = async (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&viewbox=-60.25,-2.9,-59.8,-3.2&bounded=1&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
      const [achado] = await r.json();
      if (!achado) { aviso('Endereço não encontrado.'); return; }
      mapa.setView([+achado.lat, +achado.lon], 18);
    } catch { aviso('Busca indisponível agora.', 'erro'); }
  };

  try {
    const equipe = await api.equipe();
    const sel = $('select[name=motoqueiro_id]', el);
    sel.innerHTML = '<option value="">Escolha…</option>' + equipe
      .sort((a, b) => (a.papel === b.papel ? a.nome.localeCompare(b.nome) : a.papel === 'motoqueiro' ? -1 : 1))
      .map((m) => `<option value="${m.id}">${esc(m.nome || m.email)}${m.papel === 'lider' ? ' (líder)' : ''}</option>`).join('');
  } catch (e) { aviso(mensagemErro(e), 'erro'); }

  $('#form', el).onsubmit = async (e) => {
    e.preventDefault();
    if (area.length < 3) { aviso('Desenhe a área no mapa (pelo menos 3 cantos).', 'erro'); return; }
    const f = new FormData(e.target);
    const botao = $('#b-salvar', el);
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
      const id = novoId();
      const arq = f.get('oficio');
      let oficio = {};
      if (arq && arq.size) {
        if (arq.size > 20 * 1024 * 1024) throw new Error('O ofício passa de 20 MB.');
        const nome = nomeArquivoSeguro(arq.name);
        const path = await api.enviarOficio(id, arq, nome);
        oficio = { oficio_path: path, oficio_nome: arq.name, oficio_tipo: arq.type };
      }
      await api.criarTarefa({
        id,
        titulo: f.get('titulo').trim(),
        descricao: f.get('descricao').trim(),
        prazo: f.get('prazo') || null,
        motoqueiro_id: f.get('motoqueiro_id') || null,
        area,
        ...oficio,
      });
      aviso('Tarefa criada.', 'ok');
      ctx.navegar(`#/tarefa/${id}`);
    } catch (err) {
      aviso(mensagemErro(err), 'erro');
      botao.disabled = false;
      botao.textContent = 'Criar tarefa';
    }
  };

  return () => { desenho.destruir(); mapa.remove(); };
}

// ------------------------------------------------------------------
// Acompanhamento de uma tarefa (tempo real)
// ------------------------------------------------------------------
export async function telaTarefaLider(el, { id }, ctx) {
  el.innerHTML = '<section class="pagina"><p class="vazio">Carregando…</p></section>';
  let tarefa;
  let equipe;
  try {
    [tarefa, equipe] = await Promise.all([api.tarefa(id), api.equipe()]);
  } catch (e) {
    el.innerHTML = `<section class="pagina"><p class="vazio">${esc(mensagemErro(e))}</p></section>`;
    return null;
  }
  if (!tarefa) {
    el.innerHTML = '<section class="pagina"><p class="vazio">Tarefa não encontrada.</p><a class="btn" href="#/painel">Voltar</a></section>';
    return null;
  }

  el.innerHTML = `<section class="tela-mapa">
    <div class="mapa-area"><div id="mapa" class="mapa"></div>
      <div class="legenda-ao-vivo"><span class="pulso"></span> ao vivo</div>
    </div>
    <aside class="painel-lateral">
      <a class="voltar" href="#/painel">← Levantamentos</a>
      <h2 id="titulo"></h2>
      <p id="descricao" class="descricao"></p>
      <div class="grade-campos">
        <label>Status<select id="status">${Object.entries(STATUS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label>Prazo<input type="date" id="prazo"></label>
        <label class="largura-total">Motoqueiro<select id="motoqueiro"><option value="">— sem motoqueiro —</option>
          ${equipe.map((m) => `<option value="${m.id}">${esc(m.nome || m.email)}${m.papel === 'lider' ? ' (líder)' : ''}</option>`).join('')}</select></label>
      </div>
      <div class="linha-botoes">
        <button class="btn" id="b-oficio" ${tarefa.oficio_path ? '' : 'disabled'}>📄 Ver ofício</button>
        <button class="btn" id="b-enquadrar">Ver área inteira</button>
      </div>
      <h3 class="titulo-secao">Pontos levantados <span id="n-pontos" class="contador">0</span></h3>
      <ol id="pontos" class="lista-pontos"></ol>
      <div class="zona-perigo"><button class="btn perigo" id="b-excluir">Excluir tarefa</button></div>
    </aside>
  </section>`;

  const mapa = criarMapa($('#mapa', el));
  const poligono = desenharArea(mapa, tarefa.area);
  if (poligono) mapa.fitBounds(poligono.getBounds(), { padding: [30, 30] });

  const preencher = () => {
    $('#titulo', el).textContent = tarefa.titulo;
    $('#descricao', el).textContent = tarefa.descricao || '';
    $('#status', el).value = tarefa.status;
    $('#prazo', el).value = tarefa.prazo || '';
    $('#motoqueiro', el).value = tarefa.motoqueiro_id || '';
  };
  preencher();

  const salvarCampo = async (campos, msg) => {
    try {
      await api.alterarTarefa(id, campos);
      Object.assign(tarefa, campos);
      aviso(msg, 'ok');
    } catch (e) { aviso(mensagemErro(e), 'erro'); preencher(); }
  };
  $('#status', el).onchange = (e) => salvarCampo({ status: e.target.value }, 'Status atualizado.');
  $('#prazo', el).onchange = (e) => salvarCampo({ prazo: e.target.value || null }, 'Prazo atualizado.');
  $('#motoqueiro', el).onchange = (e) => salvarCampo({ motoqueiro_id: e.target.value || null }, 'Motoqueiro alterado.');
  $('#b-oficio', el).onclick = () => verOficio(tarefa);
  $('#b-enquadrar', el).onclick = () => poligono && mapa.fitBounds(poligono.getBounds(), { padding: [30, 30] });
  $('#b-excluir', el).onclick = async () => {
    if (!await confirmar(`Excluir a tarefa "${tarefa.titulo}" com todos os pontos e fotos? Não dá para desfazer.`, 'Excluir')) return;
    try {
      await api.apagarArquivosTarefa(id, tarefa.oficio_path);
      await api.excluirTarefa(id);
      aviso('Tarefa excluída.', 'ok');
      ctx.navegar('#/painel');
    } catch (e) { aviso(mensagemErro(e), 'erro'); }
  };

  const simbolos = new Map();
  let pontos = [];
  let fotos = [];
  let urls = {};
  let idsConhecidos = null;

  const focar = (pid) => {
    const s = simbolos.get(pid);
    if (!s) return;
    simbolos.forEach((x) => x.selecionar(x === s));
    mapa.setView(s.latlng, Math.max(mapa.getZoom(), 19));
    $$('.lista-pontos li', el).forEach((li) => li.classList.toggle('ativo', li.dataset.id === pid));
    el.querySelector(`.lista-pontos li[data-id="${pid}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const render = () => {
    const vivos = new Set(pontos.map((p) => p.id));
    simbolos.forEach((s, pid) => { if (!vivos.has(pid)) { s.remover(); simbolos.delete(pid); } });
    pontos.forEach((p) => {
      const s = simbolos.get(p.id);
      if (s) s.atualizar(p);
      else simbolos.set(p.id, new SimboloNoMapa(mapa, p, { aoTocar: () => focar(p.id) }));
    });
    $('#n-pontos', el).textContent = pontos.length;
    $('#pontos', el).innerHTML = pontos.length ? pontos.map((p, i) => {
      const fs = fotos.filter((f) => f.ponto_id === p.id);
      return `<li data-id="${p.id}">
        <div class="lp-topo"><b>Ponto ${i + 1}</b>
          ${p.fora_da_area ? '<span class="selo selo-alerta">fora da área</span>' : ''}
          <span class="lp-hora">${horaBR(p.criado_em)}</span></div>
        <div class="lp-meta">${p.tamanho_m} m · rumo ${Math.round(p.rotacao)}°</div>
        ${p.observacoes ? `<p class="lp-obs">${esc(p.observacoes)}</p>` : ''}
        ${fs.length ? `<div class="miniaturas">${fs.map((f) => (urls[f.path]
    ? `<img src="${urls[f.path]}" data-grande="${urls[f.path]}" alt="Foto do ponto ${i + 1}" loading="lazy">`
    : '<span class="mini-vazia">foto</span>')).join('')}</div>` : ''}
      </li>`;
    }).join('') : '<li class="vazio">Nenhum ponto ainda. Eles aparecem aqui assim que o motoqueiro enviar.</li>';
    $$('.lista-pontos li[data-id]', el).forEach((li) => {
      li.onclick = (e) => {
        if (e.target.dataset.grande) {
          abrirModal(`<img class="foto-grande" src="${e.target.dataset.grande}" alt="Foto">`, { largo: true });
          return;
        }
        focar(li.dataset.id);
      };
    });
  };

  const carregar = async () => {
    try {
      [pontos, fotos] = await Promise.all([api.pontos(id), api.fotos(id)]);
      const faltando = fotos.map((f) => f.path).filter((p) => !urls[p]);
      if (faltando.length) Object.assign(urls, await api.urlsFotos(faltando));
      if (idsConhecidos) {
        const novos = pontos.filter((p) => !idsConhecidos.has(p.id));
        if (novos.length) aviso(`${novos.length} ponto(s) novo(s) chegaram.`, 'ok');
      }
      idsConhecidos = new Set(pontos.map((p) => p.id));
      render();
    } catch (e) { aviso(mensagemErro(e), 'erro'); }
  };

  await carregar();
  let t;
  const parar = api.ouvir(`tarefa-${id}`, [
    { tabela: 'pontos', filtro: `tarefa_id=eq.${id}` },
    { tabela: 'fotos', filtro: `tarefa_id=eq.${id}` },
    { tabela: 'tarefas', filtro: `id=eq.${id}` },
  ], (tabela, p) => {
    if (tabela === 'tarefas' && p.new && p.new.id) { tarefa = { ...tarefa, ...p.new }; preencher(); return; }
    clearTimeout(t);
    t = setTimeout(carregar, 400);
  });

  return () => { parar(); clearTimeout(t); mapa.remove(); };
}

// ------------------------------------------------------------------
// Equipe
// ------------------------------------------------------------------
export async function telaEquipe(el, _p, ctx) {
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina"><h1>Equipe</h1></div>
    <p class="dica">Quem cria conta entra como motoqueiro. Aqui você promove alguém a líder (ou volta a motoqueiro).</p>
    <div id="equipe" class="lista-equipe"><p class="vazio">Carregando…</p></div>
  </section>`;

  const carregar = async () => {
    try {
      const eq = await api.equipe();
      $('#equipe', el).innerHTML = eq.map((m) => `
        <div class="membro">
          <div><b>${esc(m.nome || '—')}</b>${m.id === ctx.perfil.id ? ' <span class="voce">(você)</span>' : ''}<br><span class="email">${esc(m.email)}</span></div>
          <span class="selo ${m.papel === 'lider' ? 'selo-lider' : 'selo-moto'}">${m.papel === 'lider' ? 'Líder' : 'Motoqueiro'}</span>
          ${m.id === ctx.perfil.id ? '<span></span>'
    : `<button class="btn" data-id="${m.id}" data-papel="${m.papel === 'lider' ? 'motoqueiro' : 'lider'}">
            ${m.papel === 'lider' ? 'Tornar motoqueiro' : 'Promover a líder'}</button>`}
        </div>`).join('');
      $$('button[data-id]', el).forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            await api.mudarPapel(b.dataset.id, b.dataset.papel);
            aviso('Papel atualizado.', 'ok');
            carregar();
          } catch (e) { aviso(mensagemErro(e), 'erro'); b.disabled = false; }
        };
      });
    } catch (e) {
      $('#equipe', el).innerHTML = `<p class="vazio">${esc(mensagemErro(e))}</p>`;
    }
  };
  await carregar();
  return null;
}
