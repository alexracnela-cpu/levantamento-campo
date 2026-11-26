// Tela "Banco de dados" do líder: quanto espaço o app usa no Supabase,
// pacote (.zip) de cada demanda com relatório, fotos, ofício e planilhas,
// e limpeza das fotos/ofício (ou da demanda inteira) depois de baixar.

import { api } from './api.js';
import { montarRelatorio } from './relatorio.js';
import { nomeEstrutura, areaM2, perimetroM } from './estrutura.js';
import { tipoPoste, nomePoste, equipamento, EQUIPAMENTOS, nomeSituacao } from './simbolo.js';
import { comprimentoM, medidaInformada, TIPOS, SITUACOES, nomeCabo } from './rede.js';
import { abrirModal, confirmar, seloStatus } from './comum.js';
import { Zip, baixarBlob } from './zip.js';
import {
  $, $$, esc, aviso, horaBR, mensagemErro, nomeArquivoSeguro,
} from './util.js';

// Limites do plano gratuito do Supabase (por projeto).
export const LIMITES = { banco: 500 * 1024 ** 2, arquivos: 1024 ** 3 };
const CHAVE_PACOTES = 'rondaluz-pacotes';

export function formatarBytes(b) {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} GB`;
}

// Pacotes já baixados neste computador: { [tarefaId]: { em, arquivos, bytes } }
function pacotesBaixados() {
  try { return JSON.parse(localStorage.getItem(CHAVE_PACOTES) || '{}'); } catch { return {}; }
}
function guardarPacote(id, info) {
  const p = pacotesBaixados();
  p[id] = info;
  try { localStorage.setItem(CHAVE_PACOTES, JSON.stringify(p)); } catch { /* sem armazenamento */ }
}

const dia = (iso) => String(iso || '').slice(0, 10);
const nomePasta = (t) => `${dia(t.criado_em)} ${String(t.titulo || 'demanda').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 70)}`;

function csv(linhas) {
  const cel = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" e BOM: o Excel em português abre direto com acentos certos
  return `﻿${linhas.map((l) => l.map(cel).join(';')).join('\r\n')}\r\n`;
}
const num = (v, casas = 2) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(casas).replace('.', ','));

// Baixa vários arquivos ao mesmo tempo (no máximo `n` de cada vez).
async function emParalelo(itens, n, fn) {
  let i = 0;
  const trabalhar = async () => {
    while (i < itens.length) {
      const k = i++;
      await fn(itens[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhar));
}

// ------------------------------------------------------------------
// Pacote de uma ou mais demandas
// ------------------------------------------------------------------
async function adicionarDemanda(zip, tarefa, equipe, progresso) {
  const pasta = nomePasta(tarefa);
  const [pontos, fotos, redes, arquivos, estruturas] = await Promise.all([
    api.pontos(tarefa.id), api.fotos(tarefa.id), api.redes(tarefa.id).catch(() => []), api.arquivosDaTarefa(tarefa.id),
    api.estruturas(tarefa.id).catch(() => []),
  ]);

  // nome de cada foto no pacote: ponto-03_plaqueta-1234_foto-1.jpg
  const ordem = new Map(pontos.map((p, i) => [p.id, i]));
  const contaFoto = {};
  const nomeFoto = new Map();
  fotos.forEach((f) => {
    const i = ordem.get(f.ponto_id);
    const p = pontos[i];
    contaFoto[f.ponto_id] = (contaFoto[f.ponto_id] || 0) + 1;
    const base = i === undefined ? 'sem-ponto' : `ponto-${String(i + 1).padStart(2, '0')}${p.plaqueta ? `_plaqueta-${nomeArquivoSeguro(p.plaqueta)}` : ''}`;
    nomeFoto.set(f.path, `fotos/${base}_foto-${contaFoto[f.ponto_id]}.jpg`);
  });

  let feitos = 0;
  const urls = {};
  const falhas = [];
  await emParalelo(arquivos, 4, async (a) => {
    try {
      const blob = await api.baixarArquivo(a.bucket, a.caminho);
      let nome;
      if (a.bucket === 'oficios') nome = `oficio/${tarefa.oficio_nome || a.caminho.split('/').pop()}`;
      else nome = nomeFoto.get(a.caminho) || `fotos/outras/${a.caminho.split('/').pop()}`;
      await zip.adicionar(`${pasta}/${nome}`, blob, a.criado_em ? new Date(a.criado_em) : new Date());
      if (a.bucket === 'fotos') urls[a.caminho] = nome;
    } catch (e) {
      falhas.push(`${a.caminho}: ${mensagemErro(e)}`);
    }
    feitos += 1;
    progresso(`${tarefa.titulo}: arquivo ${feitos} de ${arquivos.length}`);
  });
  if (falhas.length) throw new Error(`${falhas.length} arquivo(s) não baixaram (${falhas[0]}). Nada foi apagado.`);

  progresso(`${tarefa.titulo}: montando o relatório…`);
  let html = await montarRelatorio({ tarefa, equipe, pontos, fotos, urls, redes, estruturas });
  html = html.replace("location.hash.includes('sem-imprimir')", 'true'); // não abre a impressão sozinho
  await zip.adicionar(`${pasta}/relatorio.html`, html);

  await zip.adicionar(`${pasta}/pontos.csv`, csv([
    ['Nº', 'Plaqueta', 'Latitude', 'Longitude', 'Poste', 'Poste (altura/esforço)', 'Equipamento', 'Situação', 'Quantidade',
      'Tamanho (m)', 'Rumo (°)', 'Fora da área', 'Fotos', 'Observações', 'Registrado em'],
    ...pontos.map((p, i) => [i + 1, p.plaqueta, num(p.lat, 7), num(p.lng, 7), nomePoste(tipoPoste(p)), p.poste || '',
      EQUIPAMENTOS[equipamento(p)], nomeSituacao(p), p.qtd_luminarias ?? 1, num(p.tamanho_m, 1), Math.round(p.rotacao),
      p.fora_da_area ? 'sim' : 'não', fotos.filter((f) => f.ponto_id === p.id).length, p.observacoes, horaBR(p.criado_em)]),
  ]));
  if (redes.length) {
    await zip.adicionar(`${pasta}/rede.csv`, csv([
      ['Trecho', 'Tipo', 'Situação', 'Rede', 'Vértices', 'Comprimento no mapa (m)', 'Medida em campo (m)', 'Observações'],
      ...redes.map((r, i) => [i + 1, TIPOS[r.tipo] || r.tipo, SITUACOES[r.situacao] || r.situacao, nomeCabo(r.cabo), (r.pontos || []).length,
        num(comprimentoM(r.pontos), 1), num(medidaInformada(r), 1), r.observacoes]),
    ]));
  }
  if (estruturas.length) {
    await zip.adicionar(`${pasta}/estruturas.csv`, csv([
      ['Nº', 'Nome', 'Cantos', 'Área (m²)', 'Perímetro (m)', 'Cantos (lat lng; …)', 'Observações'],
      ...estruturas.map((e, i) => [i + 1, nomeEstrutura(e), (e.pontos || []).length, num(areaM2(e.pontos), 1), num(perimetroM(e.pontos), 1),
        (e.pontos || []).map(([la, ln]) => `${la.toFixed(7)} ${ln.toFixed(7)}`).join('; '), e.observacoes]),
    ]));
  }
  await zip.adicionar(`${pasta}/dados.json`, JSON.stringify({
    gerado_em: new Date().toISOString(), tarefa, pontos, redes, estruturas, fotos,
    fotos_no_pacote: Object.fromEntries(Object.entries(urls)),
  }, null, 2));
  return { arquivos: arquivos.length, bytes: arquivos.reduce((t, a) => t + Number(a.bytes || 0), 0) };
}

export async function baixarPacote(tarefas, equipe, progresso = () => {}) {
  const zip = new Zip();
  const resultado = {};
  for (const t of tarefas) resultado[t.id] = await adicionarDemanda(zip, t, equipe, progresso);
  const hoje = dia(new Date().toISOString());
  await zip.adicionar('LEIAME.txt', [
    'Pacote do RondaLuz',
    `Gerado em ${new Date().toLocaleString('pt-BR')}`,
    '',
    'Cada pasta é uma demanda:',
    '  relatorio.html  abre no navegador (com fotos e mapa); dá para imprimir ou salvar em PDF',
    '  pontos.csv      planilha dos pontos (abre no Excel)',
    '  rede.csv        planilha da rede desenhada (quando houver)',
    '  estruturas.csv  estruturas desenhadas (prédio, quadra, campo…) com área e cantos (quando houver)',
    '  fotos/          fotos de cada ponto (o número é o mesmo do relatório)',
    '  oficio/         ofício ou encaminhamento anexado',
    '  dados.json      todos os dados, para guardar ou importar depois',
    '',
    'Abra o relatorio.html com a pasta extraída (fora do .zip), senão as fotos não aparecem.',
  ].join('\r\n'));
  progresso('Preparando o arquivo para baixar…');
  const nome = tarefas.length === 1
    ? `RondaLuz - ${nomePasta(tarefas[0])} - pacote ${hoje}.zip`
    : `RondaLuz - ${tarefas.length} demandas - pacote ${hoje}.zip`;
  baixarBlob(zip.gerar(), nome);
  const agora = new Date().toISOString();
  Object.entries(resultado).forEach(([id, r]) => guardarPacote(id, { em: agora, ...r }));
  return resultado;
}

// Apaga do servidor as fotos e o ofício (mantém pontos, rede e dados da demanda).
async function arquivarDemanda(t) {
  const arquivos = await api.arquivosDaTarefa(t.id);
  const pac = pacotesBaixados()[t.id];
  if (!pac) throw new Error('baixe o pacote antes de limpar');
  if (arquivos.length > pac.arquivos) throw new Error('chegaram arquivos novos depois do pacote; baixe de novo');
  const porBalde = { fotos: [], oficios: [] };
  arquivos.forEach((a) => porBalde[a.bucket]?.push(a.caminho));
  for (const [b, lista] of Object.entries(porBalde)) if (lista.length) await api.removerArquivos(b, lista);
  await api.apagarFotosDaTarefa(t.id);
  await api.alterarTarefa(t.id, { arquivada_em: new Date().toISOString(), oficio_path: null });
}

async function excluirDemanda(t) {
  const pac = pacotesBaixados()[t.id];
  if (!pac) throw new Error('baixe o pacote antes de excluir');
  const arquivos = await api.arquivosDaTarefa(t.id);
  if (arquivos.length > pac.arquivos) throw new Error('chegaram arquivos novos depois do pacote; baixe de novo');
  const porBalde = { fotos: [], oficios: [] };
  arquivos.forEach((a) => porBalde[a.bucket]?.push(a.caminho));
  for (const [b, lista] of Object.entries(porBalde)) if (lista.length) await api.removerArquivos(b, lista);
  await api.excluirTarefa(t.id);
}

// ------------------------------------------------------------------
// Tela
// ------------------------------------------------------------------
function barra(usado, limite) {
  const pct = limite ? Math.min(100, (usado / limite) * 100) : 0;
  const nivel = pct >= 85 ? 'critico' : pct >= 60 ? 'atencao' : 'ok';
  return `<div class="uso-barra ${nivel}"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="uso-num"><b>${formatarBytes(usado)}</b> de ${formatarBytes(limite)} <span>${pct < 1 && usado ? '&lt; 1' : Math.round(pct)}%</span></div>`;
}

function janelaProgresso(titulo) {
  const { caixa, fechar } = abrirModal(`<h3>${esc(titulo)}</h3>
    <p class="progresso-txt">Começando…</p><div class="uso-barra ok anima"><i style="width:100%"></i></div>
    <p class="dica">Não feche esta tela até terminar.</p>`);
  caixa.querySelector('.modal-fechar').hidden = true;
  return { texto: (t) => { const p = caixa.querySelector('.progresso-txt'); if (p) p.textContent = t; }, fechar };
}

export async function telaBanco(el, _p, ctx) {
  el.innerHTML = `<section class="pagina">
    <div class="cabecalho-pagina"><h1>Banco de dados</h1>
      <button class="btn" id="b-atualizar">↻ Atualizar</button></div>
    <p class="dica">Quanto o RondaLuz ocupa no Supabase (plano gratuito: 500 MB de dados e 1 GB de arquivos).
      As fotos são o que mais pesa: baixe o pacote das demandas concluídas e depois limpe as fotos do servidor.</p>
    <div id="resumo" class="uso-grade"><p class="vazio">Carregando…</p></div>
    <div id="orfaos"></div>
    <h3 class="titulo-secao">Demandas <span class="contador" id="n-dem">0</span></h3>
    <div class="uso-ferramentas">
      <label class="check"><input type="checkbox" id="so-concluidas" checked> Só concluídas</label>
      <label class="check"><input type="checkbox" id="esconder-arquivadas" checked> Esconder já limpas</label>
      <button class="btn" id="b-antigas">Marcar concluídas há mais de 30 dias</button>
      <button class="btn" id="b-nenhuma">Desmarcar</button>
    </div>
    <div class="tabela-rolagem"><table class="tabela-uso">
      <thead><tr><th></th><th>Demanda</th><th>Status</th><th>Pontos</th><th>Fotos</th><th>Espaço</th><th>Pacote</th></tr></thead>
      <tbody id="lista"></tbody></table></div>
    <div class="barra-acao-uso">
      <span id="sel-txt">Nenhuma demanda marcada.</span>
      <button class="btn primario" id="b-baixar" disabled>⬇ Baixar pacote (.zip)</button>
      <button class="btn perigo" id="b-limpar" disabled>🧹 Limpar fotos e ofício</button>
      <button class="btn perigo" id="b-excluir" disabled>Excluir demanda</button>
    </div>
    <p class="dica">O pacote traz, para cada demanda, o relatório (abre no navegador e salva em PDF), as fotos, o ofício,
      as planilhas dos pontos e da rede e os dados completos. <b>Limpar</b> só fica liberado depois de baixar o pacote
      neste computador; os pontos, a rede e o histórico continuam no app, só as fotos e o ofício saem do servidor.
      <b>Excluir</b> apaga a demanda inteira.</p>
    <details class="detalhes-uso"><summary>Detalhes por tabela</summary><div id="tabelas"></div>
      <p class="dica">O tamanho do banco inclui as tabelas internas do Supabase e não diminui na hora quando se apagam linhas:
      o espaço liberado é reaproveitado pelos dados novos.</p></details>
  </section>`;

  let uso = null;
  let equipe = [];
  let tarefas = {};
  const marcadas = new Set();
  const filtros = { conc: true, esconder: true };

  const visiveis = () => (uso?.demandas || []).filter((d) => (!filtros.conc || d.status === 'concluido')
    && (!filtros.esconder || !d.arquivada_em || Number(d.fotos_bytes) + Number(d.oficio_bytes) > 0));

  const atualizarAcoes = () => {
    const sel = (uso?.demandas || []).filter((d) => marcadas.has(d.id));
    const pac = pacotesBaixados();
    const bytes = sel.reduce((t, d) => t + Number(d.fotos_bytes) + Number(d.oficio_bytes), 0);
    const prontas = sel.filter((d) => pac[d.id] && Number(d.fotos) + (Number(d.oficio_bytes) ? 1 : 0) <= pac[d.id].arquivos);
    $('#sel-txt', el).innerHTML = sel.length
      ? `<b>${sel.length}</b> marcada(s) · ${formatarBytes(bytes)} em fotos e ofícios · ${prontas.length} com pacote baixado`
      : 'Nenhuma demanda marcada.';
    $('#b-baixar', el).disabled = !sel.length;
    const todasProntas = sel.length && prontas.length === sel.length;
    $('#b-limpar', el).disabled = !todasProntas || !bytes;
    $('#b-excluir', el).disabled = !todasProntas;
    $('#b-limpar', el).title = todasProntas ? '' : 'Baixe o pacote das demandas marcadas primeiro';
    $('#b-excluir', el).title = $('#b-limpar', el).title;
  };

  const renderLista = () => {
    const pac = pacotesBaixados();
    const lista = visiveis();
    $('#n-dem', el).textContent = lista.length;
    $('#lista', el).innerHTML = lista.length ? lista.map((d) => {
      const peso = Number(d.fotos_bytes) + Number(d.oficio_bytes);
      const p = pac[d.id];
      const moto = equipe.find((m) => m.id === d.motoqueiro_id);
      return `<tr class="${marcadas.has(d.id) ? 'marcada' : ''}">
        <td><input type="checkbox" data-id="${d.id}" ${marcadas.has(d.id) ? 'checked' : ''} aria-label="Marcar ${esc(d.titulo)}"></td>
        <td><a href="#/tarefa/${d.id}"><b>${esc(d.titulo)}</b></a><small>${esc(moto?.nome || 'sem motoqueiro')} · criada ${horaBR(d.criado_em)}</small></td>
        <td>${seloStatus(d.status)}${d.arquivada_em ? `<small class="arquivada">🗄 limpa em ${horaBR(d.arquivada_em)}</small>` : ''}</td>
        <td>${d.pontos}</td><td>${d.fotos}</td>
        <td><b>${formatarBytes(peso)}</b></td>
        <td>${p ? `<span class="selo selo-concluido" title="${p.arquivos} arquivo(s)">✓ ${horaBR(p.em)}</span>` : '<span class="dica">—</span>'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="vazio">Nenhuma demanda aqui.</td></tr>';
    $$('#lista input[type=checkbox]', el).forEach((c) => {
      c.onchange = () => { if (c.checked) marcadas.add(c.dataset.id); else marcadas.delete(c.dataset.id); c.closest('tr').classList.toggle('marcada', c.checked); atualizarAcoes(); };
    });
    atualizarAcoes();
  };

  const render = () => {
    const arq = Object.fromEntries((uso.arquivos || []).map((a) => [a.bucket, a]));
    const bytesArq = (uso.arquivos || []).reduce((t, a) => t + Number(a.bytes), 0);
    const tab = Object.fromEntries((uso.tabelas || []).map((t) => [t.tabela, t]));
    const limpaveis = (uso.demandas || []).filter((d) => d.status === 'concluido' && !d.arquivada_em);
    const bytesLimp = limpaveis.reduce((t, d) => t + Number(d.fotos_bytes) + Number(d.oficio_bytes), 0);
    $('#resumo', el).innerHTML = `
      <div class="uso-cartao"><h3>🗃 Dados</h3>${barra(Number(uso.banco_bytes), LIMITES.banco)}
        <p class="dica">${tab.tarefas?.linhas ?? 0} demandas · ${tab.pontos?.linhas ?? 0} pontos · ${tab.redes?.linhas ?? 0} trechos de rede</p></div>
      <div class="uso-cartao"><h3>📷 Arquivos</h3>${barra(bytesArq, LIMITES.arquivos)}
        <p class="dica">${arq.fotos?.qtd ?? 0} fotos (${formatarBytes(arq.fotos?.bytes)}) · ${arq.oficios?.qtd ?? 0} ofícios (${formatarBytes(arq.oficios?.bytes)})</p></div>
      <div class="uso-cartao destaque"><h3>🧹 Dá para liberar</h3><b class="uso-grande">${formatarBytes(bytesLimp)}</b>
        <p class="dica">em fotos e ofícios de ${limpaveis.length} demanda(s) concluída(s) ainda não limpas</p></div>`;
    $('#tabelas', el).innerHTML = `<table class="tabela-uso pequena"><thead><tr><th>Tabela</th><th>Linhas</th><th>Espaço</th></tr></thead><tbody>
      ${(uso.tabelas || []).map((t) => `<tr><td>${esc(t.tabela)}</td><td>${t.linhas}</td><td>${formatarBytes(t.bytes)}</td></tr>`).join('')}</tbody></table>`;
    const o = uso.orfaos || { qtd: 0 };
    $('#orfaos', el).innerHTML = Number(o.qtd) ? `<div class="aviso-orfaos">
      <span>⚠ ${o.qtd} arquivo(s) sobraram de demandas já excluídas (${formatarBytes(o.bytes)}).</span>
      <button class="btn perigo" id="b-orfaos">Apagar arquivos sem demanda</button></div>` : '';
    $('#b-orfaos', el)?.addEventListener('click', limparOrfaos);
    renderLista();
  };

  const carregar = async () => {
    try {
      const [u, eq, ts] = await Promise.all([api.usoBanco(), api.equipe(), api.tarefas()]);
      uso = u;
      equipe = eq;
      tarefas = Object.fromEntries(ts.map((t) => [t.id, t]));
      const existem = new Set((uso.demandas || []).map((d) => d.id));
      [...marcadas].forEach((id) => { if (!existem.has(id)) marcadas.delete(id); });
      render();
    } catch (e) {
      const m = mensagemErro(e);
      $('#resumo', el).innerHTML = /uso_banco|function|schema cache/i.test(m)
        ? '<p class="vazio">Falta rodar o SQL <code>supabase/uso-banco.sql</code> no Supabase (SQL Editor).</p>'
        : `<p class="vazio">Não foi possível carregar: ${esc(m)}</p>`;
    }
  };

  const selecionadas = () => (uso?.demandas || []).filter((d) => marcadas.has(d.id)).map((d) => tarefas[d.id]).filter(Boolean);

  $('#so-concluidas', el).onchange = (e) => { filtros.conc = e.target.checked; renderLista(); };
  $('#esconder-arquivadas', el).onchange = (e) => { filtros.esconder = e.target.checked; renderLista(); };
  $('#b-antigas', el).onclick = () => {
    const limite = Date.now() - 30 * 86400000;
    const lista = (uso?.demandas || []).filter((d) => d.status === 'concluido'
      && new Date(d.finalizada_em || d.criado_em).getTime() < limite
      && Number(d.fotos_bytes) + Number(d.oficio_bytes) > 0);
    lista.forEach((d) => marcadas.add(d.id));
    aviso(lista.length ? `${lista.length} demanda(s) marcada(s).` : 'Nenhuma demanda concluída há mais de 30 dias com fotos.', lista.length ? 'ok' : 'info');
    renderLista();
  };
  $('#b-nenhuma', el).onclick = () => { marcadas.clear(); renderLista(); };
  $('#b-atualizar', el).onclick = carregar;

  $('#b-baixar', el).onclick = async () => {
    const lista = selecionadas();
    if (!lista.length) return;
    const pesado = lista.reduce((t, x) => {
      const d = uso.demandas.find((y) => y.id === x.id);
      return t + Number(d.fotos_bytes) + Number(d.oficio_bytes);
    }, 0);
    if (pesado > 400 * 1024 ** 2 && !await confirmar(`O pacote vai ter cerca de ${formatarBytes(pesado)}. Pode demorar e usa a internet do servidor. Continuar?`, 'Baixar')) return;
    const j = janelaProgresso(lista.length === 1 ? 'Baixando o pacote da demanda' : `Baixando o pacote de ${lista.length} demandas`);
    try {
      await baixarPacote(lista, equipe, j.texto);
      j.fechar();
      aviso('Pacote baixado. Confira o arquivo .zip antes de limpar.', 'ok');
    } catch (e) {
      j.fechar();
      aviso(`Não consegui montar o pacote: ${mensagemErro(e)}`, 'erro');
    }
    renderLista();
  };

  const executar = async (titulo, fn, msgOk) => {
    const lista = selecionadas();
    const j = janelaProgresso(titulo);
    const erros = [];
    let ok = 0;
    for (const t of lista) {
      j.texto(`${t.titulo}…`);
      try { await fn(t); ok += 1; marcadas.delete(t.id); } catch (e) { erros.push(`${t.titulo}: ${mensagemErro(e)}`); }
    }
    j.fechar();
    if (erros.length) aviso(`${ok} feita(s), ${erros.length} com problema — ${erros[0]}`, 'erro');
    else aviso(msgOk(ok), 'ok');
    await carregar();
  };

  $('#b-limpar', el).onclick = async () => {
    const lista = selecionadas();
    if (!await confirmar(`Apagar do servidor as fotos e o ofício de ${lista.length} demanda(s)? Os pontos, a rede e o histórico continuam no app. As fotos só ficam no pacote que você baixou — guarde bem o .zip. Não dá para desfazer.`, 'Limpar fotos e ofício')) return;
    await executar('Limpando fotos e ofícios', arquivarDemanda, (n) => `${n} demanda(s) limpa(s).`);
  };

  $('#b-excluir', el).onclick = async () => {
    const lista = selecionadas();
    if (!await confirmar(`Excluir ${lista.length} demanda(s) inteira(s) — pontos, rede, fotos e ofício? Elas somem do app e só ficam no pacote que você baixou. Não dá para desfazer.`, 'Excluir')) return;
    await executar('Excluindo demandas', excluirDemanda, (n) => `${n} demanda(s) excluída(s).`);
  };

  async function limparOrfaos() {
    const o = uso?.orfaos;
    if (!await confirmar(`Apagar ${o.qtd} arquivo(s) que sobraram de demandas já excluídas (${formatarBytes(o.bytes)})? Não dá para desfazer.`, 'Apagar')) return;
    try {
      const arqs = await api.arquivosOrfaos();
      for (const b of ['fotos', 'oficios']) {
        const lista = arqs.filter((a) => a.bucket === b).map((a) => a.caminho);
        if (lista.length) await api.removerArquivos(b, lista);
      }
      aviso('Arquivos sem demanda apagados.', 'ok');
    } catch (e) { aviso(mensagemErro(e), 'erro'); }
    carregar();
  }

  await carregar();
  return () => {};
}
