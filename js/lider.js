// Telas do líder: painel de demandas, nova demanda, acompanhamento e equipe.

import { api } from './api.js';
import { criarMapa, desenharArea, DesenhoDeArea } from './mapa.js';
import {
  SimboloNoMapa, tipoPoste, nomePoste, nomeSituacao, equipamento,
} from './simbolo.js';
import { montarRelatorio } from './relatorio.js';
import {
  RedeNoMapa, TIPOS, SITUACOES, svgLinha, legendaRede, metragemRede, formatarMetros,
} from './rede.js';
import { abrirModal, confirmar, verOficio, seloStatus } from './comum.js';
import {
  $, $$, esc, aviso, dataBR, horaBR, prazoVencido, novoId, nomeArquivoSeguro, mensagemErro, STATUS, diasComPessoa,
} from './util.js';

// Bairros de Manaus (sugestões no campo Bairro; dá para digitar outro)
const BAIRROS_MANAUS = ['Adrianópolis', 'Aleixo', 'Alvorada', 'Armando Mendes', 'Betânia', 'Cachoeirinha', 'Centro', 'Chapada',
  'Cidade de Deus', 'Cidade Nova', 'Colônia Antônio Aleixo', 'Colônia Oliveira Machado', 'Colônia Santo Antônio', 'Colônia Terra Nova',
  'Compensa', 'Coroado', 'Crespo', 'Da Paz', 'Distrito Industrial I', 'Distrito Industrial II', 'Dom Pedro', 'Educandos', 'Flores',
  'Gilberto Mestrinho', 'Glória', 'Japiim', 'Jorge Teixeira', 'Lago Azul', 'Lírio do Vale', 'Mauazinho', 'Monte das Oliveiras',
  'Morro da Liberdade', 'Nossa Senhora Aparecida', 'Nossa Senhora das Graças', 'Nova Cidade', 'Nova Esperança', 'Novo Aleixo',
  'Novo Israel', 'Parque 10 de Novembro', 'Petrópolis', 'Planalto', 'Ponta Negra', 'Praça 14 de Janeiro', 'Presidente Vargas',
  'Puraquequara', 'Raiz', 'Redenção', 'Santa Etelvina', 'Santa Luzia', 'Santo Agostinho', 'Santo Antônio', 'São Francisco',
  'São Geraldo', 'São Jorge', 'São José Operário', 'São Lázaro', 'São Raimundo', 'Tancredo Neves', 'Tarumã', 'Tarumã-Açu',
  'Vila Buriti', 'Vila da Prata', 'Zumbi dos Palmares'];

// ------------------------------------------------------------------
// Painel
// ------------------------------------------------------------------
export async function telaPainel(el, _p, ctx) {
  const lembrar = (k, v) => { try { sessionStorage.setItem(`rondaluz-${k}`, v); } catch { /* sem armazenamento */ } };
  const lembrado = (k, padrao) => { try { return sessionStorage.getItem(`rondaluz-${k}`) || padrao; } catch { return padrao; } };
  let filtro = lembrado('filtro', 'todas');
  let filtroMoto = lembrado('filtro-moto', 'todos');
  let ordem = lembrado('ordem', 'recentes');
  let busca = '';
  const ABAS = [['todas', 'Todas'], ['revisar', 'Para revisar'], ['pendente', 'Pendentes'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluídas']];
  el.innerHTML = `<section class="pagina pagina-larga">
    <div class="cabecalho-pagina">
      <h1>Levantamentos</h1>
      <a class="btn primario" href="#/nova">+ Nova demanda</a>
    </div>
    <div class="abas" role="tablist">
      ${ABAS.map(([v, t]) => `<button class="aba" data-f="${v}" role="tab">${t} <small class="aba-n"></small></button>`).join('')}
    </div>
    <div class="filtros-lista">
      <label class="largo">Buscar<input type="search" id="busca" placeholder="Título, logradouro, bairro, ofício ou motoqueiro" autocomplete="off"></label>
      <label>Motoqueiro<select id="f-moto"></select></label>
      <label>Ordenar por<select id="f-ordem">
        <option value="recentes">Mais recentes</option>
        <option value="prazo">Prazo mais próximo</option>
        <option value="dias">Mais dias com o motoqueiro</option>
        <option value="titulo">Título (A–Z)</option>
      </select></label>
    </div>
    <p class="dica" id="qtd"></p>
    <div id="lista" class="tabela-rolagem"><p class="vazio">Carregando…</p></div>
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
  const nomeDe = (id) => (id ? (equipe[id]?.nome || equipe[id]?.email || '—') : 'Sem motoqueiro');
  const paraRevisar = (t) => !!(t.finalizada_em || t.impedimento) && t.status !== 'concluido';
  const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const passaStatus = (t, f) => f === 'todas' || (f === 'revisar' ? paraRevisar(t) : t.status === f);

  const render = () => {
    $$('.aba', el).forEach((b) => {
      b.classList.toggle('ativa', b.dataset.f === filtro);
      b.querySelector('.aba-n').textContent = tarefas.filter((t) => passaStatus(t, b.dataset.f)).length;
    });
    const porStatus = tarefas.filter((t) => passaStatus(t, filtro));

    // lista de motoqueiros, com quantas demandas cada um tem no status escolhido
    const grupos = new Map();
    porStatus.forEach((t) => { const k = t.motoqueiro_id || 'nenhum'; grupos.set(k, (grupos.get(k) || 0) + 1); });
    if (filtroMoto !== 'todos' && !grupos.has(filtroMoto)) filtroMoto = 'todos';
    const opcoes = [...grupos.entries()].sort((x, y) => nomeDe(x[0] === 'nenhum' ? '' : x[0]).localeCompare(nomeDe(y[0] === 'nenhum' ? '' : y[0])));
    $('#f-moto', el).innerHTML = `<option value="todos">Todos (${porStatus.length})</option>`
      + opcoes.map(([k, n]) => `<option value="${esc(k)}">${esc(nomeDe(k === 'nenhum' ? '' : k))} (${n})</option>`).join('');
    $('#f-moto', el).value = filtroMoto;
    $('#f-ordem', el).value = ordem;

    const termo = semAcento(busca.trim());
    const lista = porStatus
      .filter((t) => filtroMoto === 'todos' || (t.motoqueiro_id || 'nenhum') === filtroMoto)
      .filter((t) => !termo || semAcento(`${t.titulo} ${t.descricao} ${t.oficio_nome} ${t.logradouro} ${t.bairro} ${nomeDe(t.motoqueiro_id)}`).includes(termo));
    const dias = (t) => diasComPessoa(t)?.dias ?? -1;
    const ordenar = {
      recentes: (x, y) => String(y.criado_em || '').localeCompare(String(x.criado_em || '')),
      prazo: (x, y) => String(x.prazo || '9999').localeCompare(String(y.prazo || '9999')),
      dias: (x, y) => dias(y) - dias(x),
      titulo: (x, y) => String(x.titulo || '').localeCompare(String(y.titulo || ''), 'pt-BR'),
    }[ordem] || (() => 0);
    lista.sort(ordenar);

    $('#qtd', el).textContent = `${lista.length} de ${tarefas.length} demanda(s)`;
    $('#lista', el).innerHTML = lista.length ? `<table class="tabela-uso tabela-demandas">
      <thead><tr><th>Status</th><th>Demanda</th><th>Motoqueiro</th><th class="d">Pontos</th><th class="d">Dias</th><th>Prazo</th><th>Criada em</th></tr></thead>
      <tbody class="corpo-dem">${lista.map((t) => {
    const d = diasComPessoa(t);
    const vencido = prazoVencido(t.prazo, t.status);
    return `<tr class="linha-dem" data-href="#/tarefa/${t.id}" tabindex="0">
          <td data-r="Status">${seloStatus(t.status)}${t.impedimento && t.status !== 'concluido' ? '<span class="selo selo-alerta">⛔ não foi possível</span>' : (paraRevisar(t) ? '<span class="selo selo-entregue">✓ revisar</span>' : '')}</td>
          <td data-r="Demanda" class="td-titulo"><a href="#/tarefa/${t.id}"><b>${esc(t.titulo)}</b></a>${t.logradouro || t.bairro ? `<small class="td-end">📍 ${esc([t.logradouro, t.bairro].filter(Boolean).join(' · '))}</small>` : ''}${t.descricao ? `<small>${esc(String(t.descricao).split('\n')[0].slice(0, 90))}</small>` : ''}</td>
          <td data-r="Motoqueiro"><span class="td-moto">${avatar(t.motoqueiro_id, nomeDe(t.motoqueiro_id))}${esc(nomeDe(t.motoqueiro_id))}</span></td>
          <td data-r="Pontos" class="d"><b>${contagem[t.id] || 0}</b></td>
          <td data-r="Dias" class="d">${d ? `<span class="dias-tab ${d.aberta && d.dias >= 7 ? 'muitos' : ''}" title="Desde ${horaBR(d.desde.toISOString())}">${d.dias}</span>` : '—'}</td>
          <td data-r="Prazo" class="${vencido ? 'vencido' : ''}">${dataBR(t.prazo)}${vencido ? '<small>atrasada</small>' : ''}</td>
          <td data-r="Criada em">${horaBR(t.criado_em) || '—'}</td>
        </tr>`;
  }).join('')}</tbody></table>`
      : `<p class="vazio">${termo ? 'Nada encontrado com essa busca.' : 'Nenhuma demanda aqui.'}</p>`;
    $$('tr[data-href]', el).forEach((tr) => {
      tr.onclick = (e) => { if (!e.target.closest('a')) ctx.navegar(tr.dataset.href); };
      tr.onkeydown = (e) => { if (e.key === 'Enter') ctx.navegar(tr.dataset.href); };
    });
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
    b.onclick = () => { filtro = b.dataset.f; lembrar('filtro', filtro); render(); };
  });
  $('#f-moto', el).onchange = (e) => { filtroMoto = e.target.value; lembrar('filtro-moto', filtroMoto); render(); };
  $('#f-ordem', el).onchange = (e) => { ordem = e.target.value; lembrar('ordem', ordem); render(); };
  let tb;
  $('#busca', el).oninput = (e) => { busca = e.target.value; clearTimeout(tb); tb = setTimeout(render, 150); };

  await carregar();
  let t;
  const parar = api.ouvir('painel', [{ tabela: 'tarefas' }, { tabela: 'pontos' }], () => {
    clearTimeout(t);
    t = setTimeout(carregar, 600);
  });
  return () => { parar(); clearTimeout(t); clearTimeout(tb); };
}

// ------------------------------------------------------------------
// Nova demanda
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
      <h2>Nova demanda</h2>
      <form id="form" class="formulario">
        <label>Título<input name="titulo" required maxlength="140" placeholder="Ex.: Levantamento Av. Djalma Batista"></label>
        <div class="grade-campos">
          <label class="largura-total">Logradouro<input name="logradouro" required minlength="3" maxlength="160" placeholder="Ex.: Av. Djalma Batista / Beco 17 de Outubro"></label>
          <label class="largura-total">Bairro<input name="bairro" required minlength="2" maxlength="80" placeholder="Ex.: Japiim" list="bairros-manaus"></label>
          <p class="dica largura-total" id="dica-endereco">Ao desenhar a área, o app sugere o logradouro e o bairro. Confira antes de criar.</p>
        </div>
        <datalist id="bairros-manaus">${BAIRROS_MANAUS.map((b) => `<option value="${b}">`).join('')}</datalist>
        <label>Descrição<textarea name="descricao" rows="3" placeholder="O que o motoqueiro deve levantar"></textarea></label>
        <label>Prazo<input type="date" name="prazo"></label>
        <label>Motoqueiro<select name="motoqueiro_id" required><option value="">Carregando…</option></select></label>
        <label>Ofício ou encaminhamento (PDF ou imagem)<input type="file" name="oficio" accept="application/pdf,image/*"></label>
        <div class="linha-botoes">
          <a class="btn" href="#/painel">Cancelar</a>
          <button class="btn primario" id="b-salvar">Criar demanda</button>
        </div>
      </form>
    </aside>
  </section>`;

  const mapa = criarMapa($('#mapa', el));
  let area = [];
  // sugere logradouro e bairro pelo centro da área (só preenche campo vazio ou ainda sugerido)
  const sugerido = { logradouro: '', bairro: '' };
  let tSug;
  const sugerirEndereco = () => {
    clearTimeout(tSug);
    if (area.length < 3) return;
    tSug = setTimeout(async () => {
      const lat = area.reduce((t, p) => t + p[0], 0) / area.length;
      const lng = area.reduce((t, p) => t + p[1], 0) / area.length;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'pt-BR' } });
        const a = (await r.json())?.address || {};
        const valores = { logradouro: a.road || a.pedestrian || a.footway || '', bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || '' };
        Object.entries(valores).forEach(([campo, v]) => {
          const inp = $(`input[name=${campo}]`, el);
          if (!inp || !v) return;
          if (!inp.value.trim() || inp.value === sugerido[campo]) { inp.value = v; sugerido[campo] = v; }
        });
      } catch { /* sem sugestão: o líder digita */ }
    }, 900);
  };
  const desenho = new DesenhoDeArea(mapa, (v) => {
    area = v;
    sugerirEndereco();
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
    if (!String(f.get('logradouro') || '').trim() || !String(f.get('bairro') || '').trim()) {
      aviso('Preencha o logradouro e o bairro.', 'erro'); return;
    }
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
        logradouro: f.get('logradouro').trim(),
        bairro: f.get('bairro').trim(),
        prazo: f.get('prazo') || null,
        motoqueiro_id: f.get('motoqueiro_id') || null,
        area,
        ...oficio,
      });
      aviso('Demanda criada.', 'ok');
      ctx.navegar(`#/tarefa/${id}`);
    } catch (err) {
      aviso(mensagemErro(err), 'erro');
      botao.disabled = false;
      botao.textContent = 'Criar demanda';
    }
  };

  return () => { clearTimeout(tSug); desenho.destruir(); mapa.remove(); };
}

// ------------------------------------------------------------------
// Acompanhamento de uma demanda (tempo real)
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
    el.innerHTML = '<section class="pagina"><p class="vazio">Demanda não encontrada.</p><a class="btn" href="#/painel">Voltar</a></section>';
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
      ${tarefa.arquivada_em ? `<p class="aviso-arquivada">🗄 Fotos e ofício foram baixados no pacote e apagados do servidor em ${horaBR(tarefa.arquivada_em)}. Veja em <a href="#/banco">Banco de dados</a>.</p>` : ''}
      <div class="grade-campos">
        <label>Status<select id="status">${Object.entries(STATUS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label>Prazo<input type="date" id="prazo"></label>
        <label class="largura-total">Logradouro<input id="logradouro" maxlength="160" placeholder="Logradouro"></label>
        <label class="largura-total">Bairro<input id="bairro" maxlength="80" placeholder="Bairro" list="bairros-manaus2"></label>
        <datalist id="bairros-manaus2">${BAIRROS_MANAUS.map((b) => `<option value="${b}">`).join('')}</datalist>
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
      <div class="zona-perigo"><button class="btn perigo" id="b-excluir">Excluir demanda</button></div>
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
    if (document.activeElement !== $('#logradouro', el)) $('#logradouro', el).value = tarefa.logradouro || '';
    if (document.activeElement !== $('#bairro', el)) $('#bairro', el).value = tarefa.bairro || '';
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
      $('#b-concluir', caixa).onclick = () => salvarCampo({ status: 'concluido' }, 'Demanda concluída.').then(preencher);
      $('#b-devolver', caixa).onclick = async () => {
        if (!await confirmar('Devolver a demanda ao motoqueiro? Ela volta a aparecer como não entregue.', 'Devolver')) return;
        try {
          await api.devolverTarefa(id);
          Object.assign(tarefa, { finalizada_em: null, finalizacao_obs: '' });
          if (tarefa.status === 'concluido') await salvarCampo({ status: 'em_andamento' }, 'Demanda devolvida.');
          else aviso('Demanda devolvida ao motoqueiro.', 'ok');
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
  ['logradouro', 'bairro'].forEach((campo) => {
    $(`#${campo}`, el).onchange = (e) => {
      const v = e.target.value.trim();
      if (!v) { aviso(`O ${campo} é obrigatório.`, 'erro'); e.target.value = tarefa[campo] || ''; return; }
      if (v !== (tarefa[campo] || '')) salvarCampo({ [campo]: v }, `${campo === 'bairro' ? 'Bairro' : 'Logradouro'} atualizado.`);
    };
  });
  $('#motoqueiro', el).onchange = async (e) => {
    await salvarCampo({ motoqueiro_id: e.target.value || null }, 'Motoqueiro alterado. A contagem de dias recomeça.');
    tarefa.atribuida_em = e.target.value ? new Date().toISOString() : null;
    preencher();
  };
  $('#b-oficio', el).onclick = () => verOficio(tarefa);
  $('#b-enquadrar', el).onclick = () => poligono && mapa.fitBounds(poligono.getBounds(), { padding: [30, 30] });
  $('#b-excluir', el).onclick = async () => {
    if (!await confirmar(`Excluir a demanda "${tarefa.titulo}" com todos os pontos e fotos? Não dá para desfazer.`, 'Excluir')) return;
    try {
      await api.apagarArquivosTarefa(id, tarefa.oficio_path);
      await api.excluirTarefa(id);
      aviso('Demanda excluída.', 'ok');
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
    redes.forEach((r) => { const k = `${r.tipo}|${r.situacao}`; somas[k] = (somas[k] || 0) + metragemRede(r); });
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
        <div class="lp-meta">${nomePoste(tipoPoste(p))}${p.poste ? ` <b>${esc(p.poste)}</b>` : ''} · <b>${p.qtd_luminarias ?? 1}</b> ${equipamento(p) === 'projetor' ? 'proj.' : 'lum.'} ${nomeSituacao(p).toLowerCase()} · ${String(p.tamanho_m).replace('.', ',')} m · rumo ${Math.round(p.rotacao)}°</div>
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
