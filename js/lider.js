// Telas do líder: painel de tarefas, nova tarefa, acompanhamento e equipe.

import { api } from './api.js';
import { criarMapa, desenharArea, DesenhoDeArea } from './mapa.js';
import { SimboloNoMapa } from './simbolo.js';
import { montarRelatorio } from './relatorio.js';
import {
  RedeNoMapa, TIPOS, SITUACOES, svgLinha, legendaRede, comprimentoM, formatarMetros,
} from './rede.js';
import { abrirModal, confirmar, verOficio, seloStatus } from './comum.js';
import {
  $, $$, esc, aviso, dataBR, horaBR, prazoVencido, novoId, nomeArquivoSeguro, mensagemErro, STATUS, diasComPessoa,
} from './util.js';

// ------------------------------------------------------------------
// Painel
// ------------------------------------------------------------------
export async function telaPainel(el, _p, ctx) {
  let filtro = sessionStorage.getItem('rondaluz-filtro') || 'todas';
  let filtroMoto = sessionStorage.getItem('rondaluz-filtro-moto') || 'todos';
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina">
      <h1>Levantamentos</h1>
      <a class="btn primario" href="#/nova">+ Nova tarefa</a>
    </div>
    <div class="abas" role="tablist">
      ${[['todas', 'Todas'], ['pendente', 'Pendentes'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluídas']]
    .map(([v, t]) => `<button class="aba" data-f="${v}" role="tab">${t}</button>`).join('')}
    </div>
    <div id="motos" class="filtro-motos" aria-label="Filtrar por motoqueiro"></div>
    <div id="lista" class="lista-tarefas"><p class="vazio">Carregando…</p></div>
  </section>`;

  let tarefas = [];
  let contagem = {};
  let equipe = {};

  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).filter((p) => !p.startsWith('(')).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  const corDe = (id) => {
    const cores = ['#1f63ad', '#2f7d4a', '#8a4fb0', '#c2620a', '#0f7f8c', '#a23b5a', '#4b5fb8'];
    let h = 0;
    for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) % 997;
    return id ? cores[h % cores.length] : '#8a93a6';
  };
  const avatar = (id, nome) => `<span class="avatar" style="background:${corDe(id)}">${esc(iniciais(nome))}</span>`;

  const render = () => {
    $$('.aba', el).forEach((b) => b.classList.toggle('ativa', b.dataset.f === filtro));
    const porStatus = tarefas.filter((t) => filtro === 'todas' || t.status === filtro);

    // filtro por motoqueiro, com quantas tarefas cada um tem no filtro de status atual
    const grupos = new Map();
    porStatus.forEach((t) => { const k = t.motoqueiro_id || 'nenhum'; grupos.set(k, (grupos.get(k) || 0) + 1); });
    if (filtroMoto !== 'todos' && !grupos.has(filtroMoto)) filtroMoto = 'todos';
    const chips = [...grupos.entries()].sort((a, b) => (equipe[a[0]]?.nome || 'zz').localeCompare(equipe[b[0]]?.nome || 'zz'));
    $('#motos', el).innerHTML = `<button class="chip-moto ${filtroMoto === 'todos' ? 'ativo' : ''}" data-m="todos">Todos <small>${porStatus.length}</small></button>`
      + chips.map(([k, n]) => {
        const nome = k === 'nenhum' ? 'Sem motoqueiro' : (equipe[k]?.nome || equipe[k]?.email || '—');
        return `<button class="chip-moto ${filtroMoto === k ? 'ativo' : ''}" data-m="${esc(k)}">${avatar(k === 'nenhum' ? '' : k, nome)}${esc(nome)} <small>${n}</small></button>`;
      }).join('');
    $$('.chip-moto', el).forEach((b) => {
      b.onclick = () => { filtroMoto = b.dataset.m; sessionStorage.setItem('rondaluz-filtro-moto', filtroMoto); render(); };
    });

    const lista = porStatus.filter((t) => filtroMoto === 'todos' || (t.motoqueiro_id || 'nenhum') === filtroMoto);
    $('#lista', el).innerHTML = lista.length ? lista.map((t) => {
      const m = equipe[t.motoqueiro_id];
      const nome = m?.nome || m?.email || 'Sem motoqueiro';
      return `
      <a class="cartao-tarefa" href="#/tarefa/${t.id}">
        <div class="ct-topo">${seloStatus(t.status)}${t.finalizada_em && t.status !== 'concluido' ? '<span class="selo selo-entregue">✓ entregue — revisar</span>' : ''}</div>
        <h3>${esc(t.titulo)}</h3>
        <div class="ct-moto">${avatar(t.motoqueiro_id, nome)}<div><b>${esc(nome)}</b><small>${contagem[t.id] || 0} ponto(s) levantado(s)</small></div>${(() => {
    const d = diasComPessoa(t);
    return d ? `<span class="dias-com ${d.aberta && d.dias >= 7 ? 'muitos' : ''}" title="Desde ${horaBR(d.desde.toISOString())}"><b>${d.dias}</b>${d.dias === 1 ? 'dia' : 'dias'}</span>` : '';
  })()}</div>
        <p class="ct-meta ${prazoVencido(t.prazo, t.status) ? 'vencido' : ''}">Prazo: ${dataBR(t.prazo)}${prazoVencido(t.prazo, t.status) ? ' · atrasada' : ''}</p>
      </a>`;
    }).join('') : '<p class="vazio">Nenhuma tarefa aqui.</p>';
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
    const equipe = (await api.equipe()).filter((m) => m.papel !== 'bloqueado');
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
      <div id="entrega"></div>
      <div class="grade-campos">
        <label>Status<select id="status">${Object.entries(STATUS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label>Prazo<input type="date" id="prazo"></label>
        <p class="largura-total dias-linha" id="dias-com"></p>
        <label class="largura-total">Motoqueiro<select id="motoqueiro"><option value="">— sem motoqueiro —</option>
          ${equipe.filter((m) => m.papel !== 'bloqueado' || m.id === tarefa.motoqueiro_id).map((m) => `<option value="${m.id}">${esc(m.nome || m.email)}${m.papel === 'lider' ? ' (líder)' : ''}</option>`).join('')}</select></label>
      </div>
      <div class="linha-botoes">
        <button class="btn" id="b-oficio" ${tarefa.oficio_path ? '' : 'disabled'}>📄 Ver ofício</button>
        <button class="btn" id="b-enquadrar">Ver área inteira</button>
        <button class="btn primario" id="b-relatorio">📄 Relatório PDF</button>
      </div>
      <h3 class="titulo-secao">Rede desenhada</h3>
      <div id="redes" class="resumo-redes"></div>
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
    const d = diasComPessoa(tarefa);
    const quemTem = equipe.find((m) => m.id === tarefa.motoqueiro_id)?.nome;
    $('#dias-com', el).innerHTML = d ? `📅 Com <b>${esc(quemTem || 'o motoqueiro')}</b> ${d.texto} <span>(desde ${horaBR(d.desde.toISOString())})</span>` : '';
    const caixa = $('#entrega', el);
    if (tarefa.finalizada_em && tarefa.status !== 'concluido') {
      const quem = equipe.find((m) => m.id === tarefa.motoqueiro_id)?.nome || 'O motoqueiro';
      caixa.innerHTML = `<div class="aviso-entrega">
        <b>✓ ${esc(quem)} terminou em ${horaBR(tarefa.finalizada_em)}</b>
        ${tarefa.finalizacao_obs ? `<p>"${esc(tarefa.finalizacao_obs)}"</p>` : ''}
        <div class="linha-botoes"><button class="btn primario" id="b-concluir">Marcar como concluída</button>
        <button class="btn" id="b-devolver">Devolver ao motoqueiro</button></div></div>`;
      $('#b-concluir', caixa).onclick = () => salvarCampo({ status: 'concluido' }, 'Tarefa concluída.').then(preencher);
      $('#b-devolver', caixa).onclick = async () => {
        if (!await confirmar('Devolver a tarefa ao motoqueiro? Ela volta a aparecer como não entregue.', 'Devolver')) return;
        try {
          await api.devolverTarefa(id);
          Object.assign(tarefa, { finalizada_em: null, finalizacao_obs: '' });
          if (tarefa.status === 'concluido') await salvarCampo({ status: 'em_andamento' }, 'Tarefa devolvida.');
          else aviso('Tarefa devolvida ao motoqueiro.', 'ok');
          preencher();
        } catch (e) { aviso(mensagemErro(e), 'erro'); }
      };
    } else if (tarefa.finalizada_em) {
      caixa.innerHTML = `<p class="dica">✓ Entregue pelo motoqueiro em ${horaBR(tarefa.finalizada_em)}${tarefa.finalizacao_obs ? ` — "${esc(tarefa.finalizacao_obs)}"` : ''}</p>`;
    } else caixa.innerHTML = '';
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
  $('#motoqueiro', el).onchange = async (e) => {
    await salvarCampo({ motoqueiro_id: e.target.value || null }, 'Motoqueiro alterado. A contagem de dias recomeça.');
    tarefa.atribuida_em = e.target.value ? new Date().toISOString() : null;
    preencher();
  };
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
  const linhasRede = new Map();
  let redes = [];
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

  const renderRedes = () => {
    const vivas = new Set(redes.map((r) => r.id));
    linhasRede.forEach((l, rid) => { if (!vivas.has(rid)) { l.remover(); linhasRede.delete(rid); } });
    redes.forEach((r) => {
      const l = linhasRede.get(r.id);
      if (l) l.atualizar(r);
      else {
        linhasRede.set(r.id, new RedeNoMapa(mapa, r, {
          aoTocar: (alvo) => { linhasRede.forEach((x) => x.selecionar(x === alvo)); mapa.fitBounds(alvo.linha.getBounds(), { padding: [60, 60], maxZoom: 20 }); },
        }));
      }
    });
    simbolos.forEach((s) => s.grupo.bringToFront());
    const somas = {};
    redes.forEach((r) => { const k = `${r.tipo}|${r.situacao}`; somas[k] = (somas[k] || 0) + comprimentoM(r.pontos); });
    const linhas = Object.entries(somas).map(([k, m]) => {
      const [tipo, sit] = k.split('|');
      return `<li>${svgLinha(tipo, sit)} ${TIPOS[tipo]} ${SITUACOES[sit].toLowerCase()} <b>${formatarMetros(m)}</b></li>`;
    });
    $('#redes', el).innerHTML = linhas.length ? `<ul>${linhas.join('')}</ul>${legendaRede()}` : '<p class="dica">Nenhuma rede desenhada ainda.</p>';
  };

  const render = () => {
    renderRedes();
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
        <div class="lp-topo"><b>${p.plaqueta ? `Plaqueta ${esc(p.plaqueta)}` : `Ponto ${i + 1}`}</b>
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
      [pontos, fotos, redes] = await Promise.all([api.pontos(id), api.fotos(id), api.redes(id).catch(() => [])]);
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

  $('#b-relatorio', el).onclick = async () => {
    const b = $('#b-relatorio', el);
    b.disabled = true;
    b.textContent = 'Gerando…';
    // a aba precisa abrir no clique (senão o navegador bloqueia)
    const janela = typeof window.open === 'function' ? window.open('', '_blank') : null;
    if (janela) janela.document.write('<p style="font:16px Arial;padding:24px;color:#003c78">Gerando o relatório…</p>');
    try {
      const novas = fotos.length ? await api.urlsFotos(fotos.map((f) => f.path)) : {};
      const html = await montarRelatorio({ tarefa, equipe, pontos, fotos, urls: { ...urls, ...novas }, redes });
      if (janela && !janela.closed) {
        janela.document.open();
        janela.document.write(html);
        janela.document.close();
      } else {
        const { caixa } = abrirModal(`<h3>Relatório do levantamento</h3>
          <p class="dica">Use o botão "Imprimir / Salvar PDF" dentro do relatório.</p>
          <iframe class="relatorio-previa" title="Relatório"></iframe>`, { largo: true });
        caixa.querySelector('iframe').srcdoc = html.replace("location.hash.includes('sem-imprimir')", 'true');
      }
    } catch (e) {
      if (janela) janela.close();
      aviso(`Não consegui gerar o relatório: ${mensagemErro(e)}`, 'erro');
    } finally {
      b.disabled = false;
      b.textContent = '📄 Relatório PDF';
    }
  };

  await carregar();
  let t;
  const parar = api.ouvir(`tarefa-${id}`, [
    { tabela: 'pontos', filtro: `tarefa_id=eq.${id}` },
    { tabela: 'fotos', filtro: `tarefa_id=eq.${id}` },
    { tabela: 'redes', filtro: `tarefa_id=eq.${id}` },
    { tabela: 'tarefas', filtro: `id=eq.${id}` },
  ], (tabela, p) => {
    if (tabela === 'tarefas' && p.new && p.new.id) { tarefa = { ...tarefa, ...p.new }; preencher(); return; }
    clearTimeout(t);
    t = setTimeout(carregar, 400);
  });

  return () => { parar(); clearTimeout(t); mapa.remove(); };
}

// ------------------------------------------------------------------
// Equipe: convites, papéis e remoção de acesso
// ------------------------------------------------------------------
export async function telaEquipe(el, _p, ctx) {
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina"><h1>Equipe</h1></div>
    <p class="dica">Só entra quem você cadastrar. Motoqueiros entram com <b>RE + PIN</b>; líderes, com e-mail e senha.</p>
    <div class="grade-cadastro">
      <form id="f-moto" class="cartao-convite">
        <h3>🏍 Cadastrar motoqueiro</h3>
        <div class="linha-convite">
          <input name="nome" required placeholder="Nome completo" autocomplete="off">
          <input name="re" required inputmode="numeric" pattern="[0-9]{3}" maxlength="3" placeholder="RE (3 números)" autocomplete="off">
          <button class="btn primario">Cadastrar</button>
        </div>
        <p class="dica">No primeiro acesso ele digita o RE, confirma o nome e cria o próprio PIN.</p>
      </form>
      <form id="f-convite" class="cartao-convite">
        <h3>💼 Convidar líder</h3>
        <div class="linha-convite">
          <input name="email" type="email" required placeholder="email@exemplo.com" autocomplete="off">
          <button class="btn primario">Convidar</button>
        </div>
        <p class="dica">A pessoa cria a conta em "Líder → Criar conta" usando esse e-mail.</p>
        <input type="hidden" name="papel" value="lider">
      </form>
    </div>
    <div id="convites"></div>
    <h3 class="titulo-secao">Membros</h3>
    <div id="equipe" class="lista-equipe"><p class="vazio">Carregando…</p></div>
  </section>`;

  const NOMES = { lider: 'Líder', motoqueiro: 'Motoqueiro', bloqueado: 'Sem acesso' };
  const CLASSE = { lider: 'selo-lider', motoqueiro: 'selo-moto', bloqueado: 'selo-alerta' };

  const carregar = async () => {
    try {
      const [eq, cv] = await Promise.all([api.equipe(), api.convites()]);
      $('#convites', el).innerHTML = cv.length ? `<h3 class="titulo-secao">Convites aguardando cadastro</h3>
        <div class="lista-equipe">${cv.map((c) => `<div class="membro">
          <div><b>${esc(c.re ? `${c.nome || '—'} · RE ${c.re}` : c.email)}</b><br><span class="email">${c.re ? 'ainda não fez o primeiro acesso' : 'convidado'} · ${horaBR(c.criado_em)}</span></div>
          <span class="selo ${CLASSE[c.papel]}">${NOMES[c.papel]}</span>
          <button class="btn" data-cancelar="${esc(c.email)}">Cancelar convite</button></div>`).join('')}</div>` : '';

      $('#equipe', el).innerHTML = eq.map((m) => {
        const eu = m.id === ctx.perfil.id;
        let botoes = '';
        if (!eu) {
          if (m.papel === 'bloqueado') botoes = `<button class="btn" data-id="${m.id}" data-papel="motoqueiro">Devolver acesso</button>`;
          else {
            botoes = `<button class="btn" data-id="${m.id}" data-papel="${m.papel === 'lider' ? 'motoqueiro' : 'lider'}">
              ${m.papel === 'lider' ? 'Tornar motoqueiro' : 'Promover a líder'}</button>
              ${m.re ? `<button class="btn" data-zerar="${m.id}" data-nome="${esc(m.nome)}">Zerar PIN</button>` : ''}
              <button class="btn perigo" data-id="${m.id}" data-papel="bloqueado" data-nome="${esc(m.nome || m.email)}">Remover acesso</button>`;
          }
        }
        return `<div class="membro ${m.papel === 'bloqueado' ? 'apagado' : ''}">
          <div><b>${esc(m.nome || '—')}</b>${eu ? ' <span class="voce">(você)</span>' : ''}<br><span class="email">${m.re ? `RE ${esc(m.re)} · entra com PIN` : esc(m.email)}</span></div>
          <span class="selo ${CLASSE[m.papel]}">${NOMES[m.papel]}</span>
          <div class="botoes-membro">${botoes}</div>
        </div>`;
      }).join('');

      $$('button[data-id]', el).forEach((b) => {
        b.onclick = async () => {
          if (b.dataset.papel === 'bloqueado'
            && !await confirmar(`Remover o acesso de ${b.dataset.nome}? A pessoa não consegue mais ver nem enviar nada.`, 'Remover acesso')) return;
          b.disabled = true;
          try {
            await api.mudarPapel(b.dataset.id, b.dataset.papel);
            aviso('Equipe atualizada.', 'ok');
            carregar();
          } catch (e) { aviso(mensagemErro(e), 'erro'); b.disabled = false; }
        };
      });
      $$('button[data-zerar]', el).forEach((b) => {
        b.onclick = async () => {
          if (!await confirmar(`Zerar o PIN de ${b.dataset.nome}? No próximo acesso ele cria um PIN novo.`, 'Zerar PIN')) return;
          try { await api.zerarPin(b.dataset.zerar); aviso('PIN zerado. Avise a pessoa para criar outro.', 'ok'); } catch (e) { aviso(mensagemErro(e), 'erro'); }
        };
      });
      $$('button[data-cancelar]', el).forEach((b) => {
        b.onclick = async () => {
          try { await api.cancelarConvite(b.dataset.cancelar); aviso('Convite cancelado.', 'ok'); carregar(); } catch (e) { aviso(mensagemErro(e), 'erro'); }
        };
      });
    } catch (e) {
      $('#equipe', el).innerHTML = `<p class="vazio">${esc(mensagemErro(e))}</p>`;
    }
  };

  $('#f-moto', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const re = String(f.get('re')).trim();
    if (!/^[0-9]{3}$/.test(re)) { aviso('O RE precisa ter 3 números. Ex.: 010', 'erro'); return; }
    try {
      await api.cadastrarMotoqueiro(String(f.get('nome')), re);
      e.target.reset();
      aviso(`Cadastrado. Avise para entrar em ${location.host} com o RE ${re} e criar o PIN.`, 'ok');
      carregar();
    } catch (err) { aviso(mensagemErro(err), 'erro'); }
  };

  $('#f-convite', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email')).trim().toLowerCase();
    try {
      await api.convidar(email, f.get('papel'));
      e.target.reset();
      aviso(`Convite registrado. Avise ${email} para criar a conta em ${location.host}.`, 'ok');
      carregar();
    } catch (err) { aviso(mensagemErro(err), 'erro'); }
  };

  await carregar();
  return null;
}
