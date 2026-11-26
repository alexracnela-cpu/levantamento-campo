// Relatório do levantamento: página A4 pronta para imprimir ou "Salvar como PDF".
// Contém dados da demanda, resumo, mapa com pontos numerados e rede, tabela de pontos,
// rede por trecho e a ficha de cada ponto com as fotos.

import {
  blocoParaMapa, pecasDoPonto, svgPecas, svgPoste, svgLuminaria, tipoPoste, situacaoLuminaria, nomePoste, nomeSituacao,
  equipamento, EQUIPAMENTOS,
} from './simbolo.js';
import {
  comprimentoM, metragemRede, medidaInformada, formatarMetros, TIPOS, SITUACOES, CORES, CABOS, nomeCabo,
} from './rede.js';
import {
  esc, dataBR, horaBR, diasComPessoa,
} from './util.js';

const STATUS_TXT = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' };
const AZUL = '#003c78';
const LOGO = 'icones/icone-192.png';

// O relatório abre numa aba nova (sem endereço do site), então a logo vai embutida.
async function logoEmbutida() {
  try {
    if (LOGO.startsWith('data:')) return LOGO;
    const r = await fetch(LOGO);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(null); f.readAsDataURL(blob); });
  } catch { return null; }
}

// Permite trocar o fundo do mapa (o treinamento desenha ruas ilustrativas).
export const opcoesRelatorio = { desenharFundo: null };

// ------------------------------------------------------------------
// Mapa estático (canvas) com OpenStreetMap ao fundo
// ------------------------------------------------------------------
const TILE = 256;
const px = (lng, z) => ((lng + 180) / 360) * TILE * 2 ** z;
const py = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
};

function carregarImagem(src, ms = 8000) {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => ok(null), ms);
    img.onload = () => { clearTimeout(t); ok(img); };
    img.onerror = () => { clearTimeout(t); ok(null); };
    img.src = src;
  });
}

// opcoes.croqui = true: enquadra só pontos e rede, fundo bem claro, traços grossos,
// metragem de cada trecho e plaqueta ao lado do número (para usar de croqui no AutoCAD).
export async function mapaEstatico({ area, pontos, redes }, W = 1600, H = 1000, opcoes = {}) {
  const croqui = !!opcoes.croqui;
  const K = croqui ? W / 1600 : 1; // escala dos traços e textos
  const desenho = [...pontos.map((p) => [p.lat, p.lng]), ...redes.flatMap((r) => r.pontos || [])];
  const todos = croqui && desenho.length ? desenho : [...(area || []), ...desenho];
  if (!todos.length) return null;
  const lats = todos.map((p) => p[0]);
  const lngs = todos.map((p) => p[1]);
  const [n, s, e, w] = [Math.max(...lats), Math.min(...lats), Math.max(...lngs), Math.min(...lngs)];
  const margem = croqui ? 260 * K : 160;
  let z = croqui ? 23 : 21;
  while (z > 3 && ((px(e, z) - px(w, z)) > W - margem || (py(s, z) - py(n, z)) > H - margem)) z -= 1;
  if (croqui && z < 23) {
    // zoom fracionado: o desenho ocupa o quadro todo
    const lx = Math.max(px(e, z) - px(w, z), 1); const ly = Math.max(py(s, z) - py(n, z), 1);
    z = Math.min(23, z + Math.log2(Math.min((W - margem) / lx, (H - margem) / ly)));
  }
  const cx = (px(e, z) + px(w, z)) / 2;
  const cy = (py(s, z) + py(n, z)) / 2;
  const ox = cx - W / 2;
  const oy = cy - H / 2;
  const P = (lat, lng) => [px(lng, z) - ox, py(lat, z) - oy];
  const mPorPx = (156543.03392 * Math.cos((((n + s) / 2) * Math.PI) / 180)) / 2 ** z;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = croqui ? '#ffffff' : '#eef2f6';
  g.fillRect(0, 0, W, H);

  let comFundo = false;
  try {
    if (opcoesRelatorio.desenharFundo) {
      opcoesRelatorio.desenharFundo(g, P, W, H);
      comFundo = true;
    } else {
      const tz = Math.min(Math.floor(z), 19);
      const esc2 = 2 ** (z - tz);
      const t = TILE * esc2;
      const x0 = Math.floor(ox / t); const x1 = Math.floor((ox + W) / t);
      const y0 = Math.floor(oy / t); const y1 = Math.floor((oy + H) / t);
      const pedidos = [];
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          pedidos.push(carregarImagem(`https://tile.openstreetmap.org/${tz}/${x}/${y}.png`).then((img) => {
            if (img) { g.drawImage(img, x * t - ox, y * t - oy, t, t); comFundo = true; }
          }));
        }
      }
      await Promise.all(pedidos);
    }
    if (comFundo) { g.fillStyle = croqui ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.18)'; g.fillRect(0, 0, W, H); }
  } catch { /* sem fundo: segue só com os desenhos */ }

  // área
  if (area?.length >= 3) {
    g.beginPath();
    area.forEach(([la, ln], i) => { const [x, y] = P(la, ln); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath();
    if (!croqui) { g.fillStyle = 'rgba(31,99,173,.08)'; g.fill(); }
    g.setLineDash([16 * K, 10 * K]); g.lineWidth = (croqui ? 2.5 : 4) * K; g.strokeStyle = croqui ? 'rgba(0,60,120,.55)' : AZUL; g.stroke(); g.setLineDash([]);
  }

  // rede
  const rotulos = [];
  redes.forEach((r, ri) => {
    if ((r.pontos || []).length < 2) return;
    const caminho = () => { g.beginPath(); r.pontos.forEach(([la, ln], i) => { const [x, y] = P(la, ln); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };
    g.lineJoin = 'round';
    caminho(); g.setLineDash([]); g.lineWidth = (croqui ? 16 : 11) * K; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineCap = 'butt'; g.stroke();
    caminho(); g.lineWidth = (croqui ? 9 : 6) * K; g.strokeStyle = CORES[r.situacao] || CORES.existente;
    g.setLineDash(r.tipo === 'primaria' ? [26 * K, 14 * K] : []); g.stroke(); g.setLineDash([]);
    if (croqui) {
      // rótulo no meio do maior segmento
      let melhor = null;
      for (let i = 1; i < r.pontos.length; i++) {
        const [x1, y1] = P(...r.pontos[i - 1]); const [x2, y2] = P(...r.pontos[i]);
        const L = Math.hypot(x2 - x1, y2 - y1);
        if (!melhor || L > melhor.L) melhor = { L, x: (x1 + x2) / 2, y: (y1 + y2) / 2, ang: Math.atan2(y2 - y1, x2 - x1) };
      }
      if (melhor) rotulos.push({ ...melhor, txt: `T${ri + 1} · ${formatarMetros(metragemRede(r))}${r.cabo ? ` · ${nomeCabo(r.cabo)}` : ''}`, cor: CORES[r.situacao] || CORES.existente });
    }
  });

  // símbolos (no croqui, ampliados quando ficariam pequenos demais) + número de cada ponto
  const desenharForma = (lista, p, tam, fechar) => {
    g.beginPath();
    lista.forEach((xy, i) => {
      const [la, ln] = blocoParaMapa(p.lat, p.lng, tam, p.rotacao, xy);
      const [x, y] = P(la, ln);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    if (fechar) g.closePath();
  };
  let ampliou = false;
  pontos.forEach((p) => {
    let tam = p.tamanho_m;
    if (croqui) {
      const minimo = 90 * K * mPorPx; // tamanho mínimo na imagem, em metros
      if (tam < minimo) { tam = Math.min(minimo, tam * 4); ampliou = true; }
    }
    pecasDoPonto(p, { tinta: AZUL, opFundo: croqui ? 1 : 0.8 }).forEach((pc) => {
      desenharForma(pc.pts, p, tam, pc.fechada);
      if (pc.preench) { g.globalAlpha = pc.opacidade ?? 1; g.fillStyle = pc.preench; g.fill(); g.globalAlpha = 1; }
      if (pc.traco) { g.lineWidth = (pc.principal ? 2.4 : Math.max(1.2, pc.peso)) * (croqui ? 1.6 * K : 1); g.strokeStyle = pc.traco; g.stroke(); }
    });
  });

  // rótulos da rede por cima dos símbolos
  rotulos.forEach((r) => {
    let a = r.ang; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
    g.save(); g.translate(r.x, r.y); g.rotate(a);
    g.font = `bold ${Math.round(22 * K)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(r.txt).width;
    const dy = -24 * K;
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = r.cor; g.lineWidth = 2 * K;
    g.beginPath(); g.rect(-tw / 2 - 8 * K, dy - 16 * K, tw + 16 * K, 32 * K); g.fill(); g.stroke();
    g.fillStyle = '#1d2433'; g.fillText(r.txt, 0, dy + 1);
    g.restore();
  });

  pontos.forEach((p, i) => {
    const [x, y] = P(p.lat, p.lng);
    const R = (croqui ? 21 : 17) * K;
    const bx = x - (croqui ? 34 : 20) * K; const by = y - (croqui ? 38 : 22) * K;
    g.beginPath(); g.moveTo(x, y); g.lineTo(bx, by); g.lineWidth = 2 * K; g.strokeStyle = AZUL; g.stroke();
    g.beginPath(); g.arc(bx, by, R, 0, Math.PI * 2);
    g.fillStyle = p.fora_da_area ? '#d97706' : AZUL; g.fill();
    g.lineWidth = 3 * K; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${Math.round((croqui ? 21 : 17) * K)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), bx, by + 1);
    if (croqui && p.plaqueta) {
      g.font = `bold ${Math.round(17 * K)}px Arial`; g.textAlign = 'right';
      const tw = g.measureText(p.plaqueta).width;
      g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(bx - R - tw - 14 * K, by - 12 * K, tw + 10 * K, 24 * K);
      g.fillStyle = AZUL; g.fillText(p.plaqueta, bx - R - 9 * K, by + 1);
    }
  });

  // escala, norte e créditos
  const opcoesEscala = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const metros = opcoesEscala.filter((m) => m / mPorPx <= 260 * K).pop() || 1;
  const larg = metros / mPorPx;
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(20 * K, H - 54 * K, larg + 90 * K, 36 * K);
  g.fillStyle = AZUL; g.fillRect(30 * K, H - 34 * K, larg, 6 * K);
  g.font = `bold ${Math.round(18 * K)}px Arial`; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(`${metros} m`, 40 * K + larg, H - 31 * K);
  if (croqui) {
    const nx = W - 50 * K; const ny = 70 * K;
    g.beginPath(); g.moveTo(nx, ny - 34 * K); g.lineTo(nx + 14 * K, ny + 8 * K); g.lineTo(nx, ny); g.lineTo(nx - 14 * K, ny + 8 * K); g.closePath();
    g.fillStyle = AZUL; g.fill();
    g.font = `bold ${Math.round(22 * K)}px Arial`; g.textAlign = 'center'; g.fillText('N', nx, ny + 30 * K);
  }
  if (comFundo && !opcoesRelatorio.desenharFundo) {
    g.font = `${Math.round(15 * K)}px Arial`; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.85)';
    const txt = '© colaboradores do OpenStreetMap';
    const tw = g.measureText(txt).width;
    g.fillRect(W - tw - 20 * K, H - 28 * K, tw + 16 * K, 24 * K);
    g.fillStyle = '#333'; g.fillText(txt, W - 12 * K, H - 16 * K);
  }
  let url = null;
  try { url = croqui ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88); } catch { url = null; }
  return croqui ? (url && { url, ampliou }) : url;
}

// ------------------------------------------------------------------
// Página do relatório
// ------------------------------------------------------------------
const coord = (p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

const tipoTexto = (p) => nomePoste(tipoPoste(p));
const lumTexto = (p) => `${equipamento(p) === 'projetor' ? 'proj.' : 'lum.'} ${nomeSituacao(p).toLowerCase()}`;

function svgPontoPequeno(p) {
  return svgPecas(pecasDoPonto({ ...p, rotacao: 90, qtd_luminarias: 1 }, { tinta: AZUL, opFundo: 1 }), {
    viewBox: '-20 -20 122 40', largura: 66, altura: 22,
  });
}

function linhaRede(tipo, situacao) {
  return `<svg width="38" height="10"><line x1="1" y1="5" x2="37" y2="5" stroke="${CORES[situacao]}" stroke-width="4" ${tipo === 'primaria' ? 'stroke-dasharray="8 5"' : ''}/></svg>`;
}

export async function montarRelatorio({ tarefa, equipe, pontos, fotos, urls, redes }) {
  const moto = equipe.find((m) => m.id === tarefa.motoqueiro_id);
  const lider = equipe.find((m) => m.id === tarefa.criado_por);
  const previa = tarefa.status !== 'concluido';
  const agora = new Date();
  const logo = await logoEmbutida();
  const mapa = await mapaEstatico({ area: tarefa.area, pontos, redes });
  const croqui = (pontos.length || redes.length)
    ? await (() => {
      // formato da imagem acompanha o desenho: deitado, quadrado ou em pé
      const d = [...pontos.map((p) => [p.lat, p.lng]), ...redes.flatMap((r) => r.pontos || [])];
      const la = d.map((x) => x[0]); const ln = d.map((x) => x[1]);
      const larg = (Math.max(...ln) - Math.min(...ln)) * Math.cos((la[0] * Math.PI) / 180);
      const alt = Math.max(...la) - Math.min(...la);
      const H = larg > alt * 1.4 ? 1700 : (alt > larg * 1.4 ? 3200 : 2400);
      return mapaEstatico({ area: tarefa.area, pontos, redes }, 2400, H, { croqui: true });
    })() : null;
  const semPlaqueta = pontos.filter((p) => !p.plaqueta).length;
  const fora = pontos.filter((p) => p.fora_da_area).length;
  const somas = {};
  redes.forEach((r) => { const k = `${r.tipo}|${r.situacao}`; somas[k] = (somas[k] || 0) + metragemRede(r); });
  const totalRede = Object.values(somas).reduce((a, b) => a + b, 0);
  const fotosDo = (pid) => fotos.filter((f) => f.ponto_id === pid && urls[f.path]);
  const nome = (p, i) => (p.plaqueta ? `Plaqueta ${esc(p.plaqueta)}` : `Ponto ${i + 1}`);

  const info = [
    ['Logradouro', esc(tarefa.logradouro || '—')],
    ['Bairro', esc(tarefa.bairro || '—')],
    ['Motoqueiro', esc(moto?.nome || moto?.email || '—')],
    ['Criada por', esc(lider?.nome || '—')],
    ['Criada em', horaBR(tarefa.criado_em) || '—'],
    ['Prazo', dataBR(tarefa.prazo)],
    ['Entregue pelo motoqueiro', tarefa.finalizada_em ? horaBR(tarefa.finalizada_em) : '—'],
    ['Ofício', esc(tarefa.oficio_nome || '—')],
    ['Dias com o motoqueiro', (() => { const d = diasComPessoa(tarefa); return d ? `${d.dias} (${d.texto})` : '—'; })()],
  ];

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório — ${esc(tarefa.titulo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm;
    @bottom-left { content: "RondaLuz · ${esc(tarefa.titulo).replace(/"/g, '')} · gerado em ${agora.toLocaleString('pt-BR')}"; font: 8pt Arial, sans-serif; color: #6b7385; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt Arial, sans-serif; color: #6b7385; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10pt/1.4 'Segoe UI', Roboto, Arial, sans-serif; color: #1d2433; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barra-acoes { position: sticky; top: 0; background: #003c78; color: #fff; padding: 10px 16px; display: flex; gap: 10px; align-items: center; z-index: 5; }
  .barra-acoes button { font: 600 11pt Arial; padding: 8px 14px; border-radius: 6px; border: 0; cursor: pointer; background: #fff; color: #003c78; }
  .barra-acoes span { flex: 1; font-size: 10pt; opacity: .9; }
  @media print { .barra-acoes { display: none; } }
  .folha { max-width: 186mm; margin: 0 auto; padding: 6mm 0; }
  .cab { display: flex; align-items: center; gap: 12px; background: linear-gradient(90deg, #00305f, #003c78 60%, #1f5a9c); color: #fff; padding: 12px 16px; border-radius: 6px; border-bottom: 3px solid #7aa7d6; }
  .cab .logo { width: 42px; height: 42px; border-radius: 9px; display: block; }
  .cab .marca { font: 700 16pt Arial; } .cab .marca b { color: #8cc4f2; }
  .cab .tipo { margin-left: auto; text-align: right; font-size: 9pt; opacity: .9; }
  h1 { font: 700 17pt Arial; color: #003c78; margin: 14px 0 2px; }
  .desc { color: #4a5263; margin: 0 0 10px; white-space: pre-wrap; }
  .selo { display: inline-block; font: 700 8pt Arial; text-transform: uppercase; letter-spacing: .4px; padding: 3px 8px; border-radius: 4px; background: #e1ecf8; color: #003c78; }
  .selo.concluido { background: #dcefe2; color: #2f7d4a; } .selo.pendente { background: #f2e6c9; color: #7a5a12; }
  .selo.previa { background: #fde7cf; color: #9a4a00; margin-left: 6px; }
  .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; margin: 10px 0; padding: 10px 12px; border: 1px solid #cddcee; border-radius: 6px; background: #f6f9fd; }
  .info div span { display: block; font-size: 8pt; color: #6b7385; text-transform: uppercase; letter-spacing: .3px; }
  .info div b { font-size: 10pt; color: #1d2433; }
  .obs-final { border-left: 4px solid #2f7d4a; background: #eef7f0; padding: 8px 12px; border-radius: 4px; margin: 8px 0; }
  .resumo { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; margin: 10px 0 12px; }
  .resumo div { border: 1px solid #cddcee; border-radius: 6px; padding: 8px 10px; text-align: center; }
  .resumo b { display: block; font: 700 16pt Arial; color: #003c78; }
  .resumo span { font-size: 8.5pt; color: #6b7385; }
  .resumo .alerta b { color: #b45309; }
  h2 { font: 700 13pt Arial; color: #003c78; border-bottom: 2px solid #cddcee; padding-bottom: 3px; margin: 16px 0 8px; break-after: avoid; }
  .pag-croqui { break-before: page; break-inside: avoid; }
  .dica-croqui { font-size: 8.5pt; color: #4a5263; margin: 0 0 6px; }
  .mapa.croqui img { max-height: 235mm; width: auto; max-width: 100%; margin: 0 auto; }
  .mapa img { width: 100%; border: 1px solid #cddcee; border-radius: 6px; display: block; }
  .legenda { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 8.5pt; color: #4a5263; margin-top: 6px; align-items: center; }
  .legenda span { display: inline-flex; align-items: center; gap: 6px; }
  .num { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: #003c78; color: #fff; font: 700 8pt Arial; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #003c78; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
  td { padding: 5px 6px; border-bottom: 1px solid #dfe7f1; vertical-align: top; }
  tr:nth-child(even) td { background: #f6f9fd; }
  tr { break-inside: avoid; }
  .fora { color: #b45309; font-weight: 700; }
  .ficha { border: 1px solid #cddcee; border-radius: 6px; padding: 10px 12px; margin: 0 0 10px; break-inside: avoid; }
  .ficha.longa { break-inside: auto; }
  .ficha-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .ficha-cab h3 { margin: 0; font: 700 12pt Arial; color: #003c78; }
  .ficha-cab .selo { margin-left: auto; }
  .ficha .dados { color: #4a5263; font-size: 9pt; }
  .ficha .obs { margin: 6px 0; padding: 6px 10px; background: #f6f9fd; border-radius: 4px; white-space: pre-wrap; }
  .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
  .fotos figure { margin: 0; break-inside: avoid; }
  .fotos img { width: 100%; height: auto; max-height: 120mm; object-fit: contain; background: #f3f5f8; border-radius: 4px; border: 1px solid #cddcee; display: block; }
  .fotos figcaption { font-size: 8pt; color: #6b7385; margin-top: 2px; }
  .sem-fotos { color: #8a93a6; font-style: italic; font-size: 9pt; }
  .marca-dagua { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font: 700 64pt Arial; color: rgba(217,119,6,.10); transform: rotate(-28deg); pointer-events: none; z-index: 0; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 34px; break-inside: avoid; }
  .assinaturas div { border-top: 1px solid #1d2433; padding-top: 4px; text-align: center; font-size: 9pt; color: #4a5263; }
</style></head><body>
<div class="barra-acoes"><span>Relatório pronto. Para salvar, toque em "Imprimir / Salvar PDF" e escolha <b>Salvar como PDF</b>.</span>
  <button onclick="window.print()">Imprimir / Salvar PDF</button></div>
${previa ? '<div class="marca-dagua">PRÉVIA</div>' : ''}
<div class="folha">
  <div class="cab">
    ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<div class="marca">Ronda<b>Luz</b></div>
    <div class="tipo">Relatório de levantamento<br>Iluminação pública · Manaus</div>
  </div>
  <h1>${esc(tarefa.titulo)}</h1>
  <div><span class="selo ${esc(tarefa.status)}">${STATUS_TXT[tarefa.status] || esc(tarefa.status)}</span>${previa ? '<span class="selo previa">Prévia — levantamento não concluído</span>' : ''}</div>
  ${tarefa.descricao ? `<p class="desc">${esc(tarefa.descricao)}</p>` : ''}
  <div class="info">${info.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
  ${tarefa.finalizacao_obs ? `<div class="obs-final"><b>Observação final do motoqueiro:</b> ${esc(tarefa.finalizacao_obs)}</div>` : ''}
  <div class="resumo">
    <div><b>${pontos.length}</b><span>pontos levantados</span></div>
    <div><b>${pontos.filter((p) => equipamento(p) === 'luminaria').reduce((t, p) => t + (p.qtd_luminarias ?? 1), 0)}</b><span>luminárias</span></div>
    ${pontos.some((p) => equipamento(p) === 'projetor') ? `<div><b>${pontos.filter((p) => equipamento(p) === 'projetor').reduce((t, p) => t + (p.qtd_luminarias ?? 1), 0)}</b><span>projetores</span></div>` : ''}
    <div class="${semPlaqueta ? 'alerta' : ''}"><b>${semPlaqueta}</b><span>sem plaqueta</span></div>
    <div class="${fora ? 'alerta' : ''}"><b>${fora}</b><span>fora da área</span></div>
    <div><b>${formatarMetros(totalRede)}</b><span>de rede desenhada</span></div>
  </div>

  <h2>Mapa do levantamento</h2>
  <div class="mapa">${mapa ? `<img src="${mapa}" alt="Mapa do levantamento">` : '<p class="sem-fotos">Mapa indisponível.</p>'}</div>
  <div class="legenda">
    <span><svg width="26" height="12"><rect x="1" y="1" width="24" height="10" fill="rgba(31,99,173,.08)" stroke="${AZUL}" stroke-width="2" stroke-dasharray="5 3"/></svg> Área do levantamento</span>
    ${[...new Set(pontos.map(tipoPoste))].map((t) => `<span>${svgPoste(t, 20)} ${t === 'sem_poste' ? 'Sem poste' : `Poste ${nomePoste(t).toLowerCase()}`}</span>`).join('')}
    ${[...new Set(pontos.map((p) => `${equipamento(p)}|${situacaoLuminaria(p)}`))].map((k) => {
    const [eq, sit] = k.split('|');
    return `<span>${svgLuminaria(sit, 12, eq)} ${EQUIPAMENTOS[eq]} ${nomeSituacao({ equipamento: eq, luminaria: sit }).toLowerCase()}</span>`;
  }).join('')}
    ${pontos.length ? '' : `<span>${svgPontoPequeno({})} Ponto (em escala real)</span>`}
    <span><i class="num">1</i> Número do ponto</span>
    ${Object.keys(TIPOS).map((t) => Object.keys(SITUACOES).map((sit) => `<span>${linhaRede(t, sit)} ${TIPOS[t]} ${SITUACOES[sit].toLowerCase()}</span>`).join('')).join('')}
  </div>

  ${croqui ? `<section class="pag-croqui">
    <h2>Croqui do levantamento</h2>
    <p class="dica-croqui">Desenho ampliado só dos pontos e da rede, para servir de base no AutoCAD. T = trecho de rede, com a metragem.${croqui.ampliou ? ' Os símbolos foram ampliados para leitura; a posição e o rumo são os reais.' : ''}</p>
    <div class="mapa croqui"><img src="${croqui.url}" alt="Croqui do levantamento"></div>
  </section>` : ''}

  <h2>Pontos levantados</h2>
  ${pontos.length ? `<table><thead><tr><th>Nº</th><th>Plaqueta</th><th>Poste</th><th>Lum.</th><th>Coordenadas (lat, long)</th><th>Tamanho / rumo</th><th>Fotos</th><th>Observações</th></tr></thead><tbody>
    ${pontos.map((p, i) => `<tr><td><b>${i + 1}</b></td><td>${p.plaqueta ? esc(p.plaqueta) : '<span class="fora">sem plaqueta</span>'}</td><td>${tipoTexto(p)}${p.poste ? ` · ${esc(p.poste)}` : ''}</td><td>${p.qtd_luminarias ?? 1} ${lumTexto(p)}</td>
      <td>${coord(p)}${p.fora_da_area ? '<br><span class="fora">fora da área</span>' : ''}</td>
      <td>${String(p.tamanho_m).replace('.', ',')} m · ${Math.round(p.rotacao)}°</td><td>${fotosDo(p.id).length}</td>
      <td>${esc(p.observacoes || '—')}</td></tr>`).join('')}
  </tbody></table>` : '<p class="sem-fotos">Nenhum ponto levantado.</p>'}

  <h2>Rede desenhada</h2>
  ${redes.length ? `<table><thead><tr><th>Trecho</th><th>Tipo</th><th>Situação</th><th>Rede</th><th>Vértices</th><th>Comprimento</th></tr></thead><tbody>
    ${redes.map((r, i) => `<tr><td>${linhaRede(r.tipo, r.situacao)} ${i + 1}</td><td>${TIPOS[r.tipo] || r.tipo}</td><td>${SITUACOES[r.situacao] || r.situacao}</td><td>${nomeCabo(r.cabo) || '—'}</td><td>${(r.pontos || []).length}</td><td>${medidaInformada(r) ? `${formatarMetros(medidaInformada(r))} <small>(medida em campo; mapa ${formatarMetros(comprimentoM(r.pontos))})</small>` : formatarMetros(comprimentoM(r.pontos))}</td></tr>`).join('')}
    ${Object.entries(somas).map(([k, m]) => { const [t, sit] = k.split('|'); return `<tr><td colspan="5"><b>Total ${TIPOS[t].toLowerCase()} ${SITUACOES[sit].toLowerCase()}</b></td><td><b>${formatarMetros(m)}</b></td></tr>`; }).join('')}
    ${Object.keys(CABOS).filter((c) => redes.some((r) => r.cabo === c)).map((c) => `<tr><td colspan="5">Total rede ${CABOS[c]}</td><td>${formatarMetros(redes.filter((r) => r.cabo === c).reduce((t, r) => t + metragemRede(r), 0))}</td></tr>`).join('')}
  </tbody></table>` : '<p class="sem-fotos">Nenhuma rede desenhada.</p>'}

  <h2>Fichas dos pontos</h2>
  ${pontos.map((p, i) => {
    const fs = fotosDo(p.id);
    return `<div class="ficha ${fs.length > 2 ? 'longa' : ''}">
      <div class="ficha-cab"><i class="num">${i + 1}</i><h3>${nome(p, i)}</h3>${p.fora_da_area ? '<span class="selo previa">fora da área</span>' : ''}</div>
      <div class="dados">Poste: <b>${tipoTexto(p)}${p.poste ? ` ${esc(p.poste)}` : ''}</b> · ${equipamento(p) === 'projetor' ? 'Projetores' : 'Luminárias'}: <b>${p.qtd_luminarias ?? 1} ${nomeSituacao(p).toLowerCase()}</b> · Coordenadas: <b>${coord(p)}</b> · Tamanho: <b>${String(p.tamanho_m).replace('.', ',')} m</b> · Rumo: <b>${Math.round(p.rotacao)}°</b> · Registrado em ${horaBR(p.criado_em)}</div>
      ${p.observacoes ? `<div class="obs">${esc(p.observacoes)}</div>` : '<div class="dados">Sem observações.</div>'}
      ${fs.length ? `<div class="fotos">${fs.map((f, k) => `<figure><img src="${urls[f.path]}" alt="Foto ${k + 1}"><figcaption>Foto ${k + 1} · ${horaBR(f.criado_em)}</figcaption></figure>`).join('')}</div>` : '<p class="sem-fotos">Sem fotos.</p>'}
    </div>`;
  }).join('') || '<p class="sem-fotos">Nenhum ponto levantado.</p>'}

  <div class="assinaturas"><div>${esc(moto?.nome || 'Motoqueiro')}<br>Levantamento de campo</div><div>${esc(lider?.nome || 'Líder')}<br>Conferência</div></div>
</div>
<script>
  Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))))
    .then(() => { if (!location.hash.includes('sem-imprimir')) setTimeout(() => window.print(), 300); });
</script>
</body></html>`;
}

// Abre o relatório numa aba nova (o navegador oferece "Salvar como PDF").
export function abrirRelatorio(html) {
  const janela = window.open('', '_blank');
  if (!janela) return false;
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
  return true;
}
