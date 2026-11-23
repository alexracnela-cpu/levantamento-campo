// Símbolo do levantamento, desenhado em escala real (metros) sobre o mapa.
//
// Cópia do bloco do AutoCAD, com o braço apontando para +x e o ponto de
// inserção no centro do poste (quadrado). Medidas tiradas do bloco original,
// em frações do comprimento total (centro do poste até a ponta da luminária = 1):
//   - poste: quadrado com círculo no centro e linha de centro horizontal;
//   - braço: duas linhas paralelas saindo do círculo até a luminária;
//   - luminária: contorno vermelho com encaixe para o braço,
//     metade de cima (+y) preenchida de vermelho.
// "tamanho_m" é esse comprimento total, em metros.
// "rotacao" é o rumo do braço em graus: 0 = norte, 90 = leste (padrão, igual ao bloco).

import { deslocar, emMetros } from './util.js';

export const TAMANHO_PADRAO = 2.5; // metros, do centro do poste até a ponta da luminária

const TINTA = '#1f3a6b';
const VERMELHO = '#e00000';

export const PROPORCAO = {
  meioQuadrado: 0.177, // metade do lado do quadrado do poste
  raioPoste: 0.0733, // círculo dentro do quadrado
  meioBraco: 0.031, // metade da largura do braço
  // luminária
  lumEsq: 0.5552, // borda esquerda (reta vertical)
  lumChanfro: 0.6067, // fim do chanfro em cima/embaixo
  lumMeioReta: 0.06, // metade da reta vertical da esquerda
  lumMeiaAltura: 0.128, // metade da altura da luminária
  lumRetaFim: 0.922, // onde a reta de cima/baixo vira arco
  lumArcoCentro: 0.856, // centro do arco da frente (raio até x = 1)
  // encaixe do braço (abertura na luminária)
  encEsq: 0.5952,
  encReta: 0.7486,
  encMeiaAltura: 0.0455,
  encArcoCentro: 0.7286,
};

const arco = (cx, cy, r, a0, a1, n = 18) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});

// Formas no sistema do bloco, com comprimento total = 1.
export function formasDoBloco() {
  const P = PROPORCAO;
  const q = P.meioQuadrado;
  const rLum = 1 - P.lumArcoCentro;
  const aLum = Math.atan2(P.lumMeiaAltura, P.lumRetaFim - P.lumArcoCentro);
  const rEnc = Math.hypot(P.encReta - P.encArcoCentro, P.encMeiaAltura);
  const aEnc = Math.atan2(P.encMeiaAltura, P.encReta - P.encArcoCentro);
  const xEncFrente = P.encArcoCentro + rEnc;

  const luminaria = [
    [P.lumEsq, -P.lumMeioReta], [P.lumEsq, P.lumMeioReta],
    [P.lumChanfro, P.lumMeiaAltura], [P.lumRetaFim, P.lumMeiaAltura],
    ...arco(P.lumArcoCentro, 0, rLum, aLum, -aLum, 24),
    [P.lumChanfro, -P.lumMeiaAltura],
  ];
  const encaixe = [
    [P.encEsq, P.encMeiaAltura], [P.encReta, P.encMeiaAltura],
    ...arco(P.encArcoCentro, 0, rEnc, aEnc, -aEnc, 12),
    [P.encEsq, -P.encMeiaAltura],
  ];
  const metadeVermelha = [
    [P.lumEsq, 0], [P.lumEsq, P.lumMeioReta], [P.lumChanfro, P.lumMeiaAltura], [P.lumRetaFim, P.lumMeiaAltura],
    ...arco(P.lumArcoCentro, 0, rLum, aLum, 0, 12),
    [xEncFrente, 0],
    ...arco(P.encArcoCentro, 0, rEnc, 0, aEnc, 6),
    [P.encEsq, P.encMeiaAltura], [P.encEsq, 0],
  ];
  const xBraco = Math.sqrt(P.raioPoste ** 2 - P.meioBraco ** 2);
  return {
    quadrado: [[-q, -q], [-q, q], [q, q], [q, -q]],
    poste: arco(0, 0, P.raioPoste, 0, Math.PI * 2, 36),
    centro: [[[-q, 0], [-P.raioPoste, 0]], [[P.raioPoste, 0], [q, 0]]],
    braco: [[[xBraco, P.meioBraco], [P.encEsq, P.meioBraco]], [[xBraco, -P.meioBraco], [P.encEsq, -P.meioBraco]]],
    luminaria,
    encaixe,
    vermelho: metadeVermelha,
    ponta: [1, 0],
  };
}

// Converte um ponto do bloco (x, y) para [lat, lng].
export function blocoParaMapa(lat, lng, tamanho, rotacao, [x, y]) {
  const theta = ((90 - rotacao) * Math.PI) / 180; // rumo -> ângulo matemático
  const xs = x * tamanho;
  const ys = y * tamanho;
  const leste = xs * Math.cos(theta) - ys * Math.sin(theta);
  const norte = xs * Math.sin(theta) + ys * Math.cos(theta);
  return deslocar(lat, lng, leste, norte);
}

// A partir da posição da ponta arrastada, calcula rumo e tamanho.
export function pontaParaRumoTamanho(lat, lng, latPonta, lngPonta) {
  const [leste, norte] = emMetros(lat, lng, latPonta, lngPonta);
  const tamanho = Math.hypot(leste, norte);
  let rumo = (Math.atan2(leste, norte) * 180) / Math.PI;
  if (rumo < 0) rumo += 360;
  return { tamanho, rumo };
}

export function normalizarRumo(r) {
  let v = Number(r) || 0;
  v %= 360;
  if (v < 0) v += 360;
  return Math.round(v * 10) / 10;
}

export function limitarTamanho(t) {
  return Math.min(200, Math.max(0.5, Math.round((Number(t) || TAMANHO_PADRAO) * 10) / 10));
}

// ------------------------------------------------------------------
// Camada Leaflet
// ------------------------------------------------------------------

export class SimboloNoMapa {
  constructor(mapa, ponto, { editavel = false, aoTocar, aoMudar, aoSoltar } = {}) {
    this.mapa = mapa;
    this.ponto = { ...ponto };
    this.editavel = editavel;
    this.aoTocar = aoTocar;
    this.aoMudar = aoMudar;
    this.aoSoltar = aoSoltar;
    this.selecionado = false;
    this.grupo = L.featureGroup().addTo(mapa);
    this.formas = formasDoBloco();

    const estilo = { color: TINTA, weight: 2, fill: false, interactive: true, bubblingMouseEvents: false };
    const vermelho = { ...estilo, color: VERMELHO, weight: 1.5 };
    this.cQuadrado = L.polygon([], { ...estilo, weight: 2.5, fill: true, fillColor: '#fff', fillOpacity: 0.6 }).addTo(this.grupo);
    this.cPoste = L.polygon([], { ...estilo, weight: 1.5 }).addTo(this.grupo);
    this.cCentro = L.polyline([], { ...estilo, weight: 1 }).addTo(this.grupo);
    this.cBraco = L.polyline([], { ...estilo, weight: 1.5 }).addTo(this.grupo);
    this.cLuminaria = L.polygon([], { ...vermelho, fill: true, fillColor: '#fff', fillOpacity: 0.6 }).addTo(this.grupo);
    this.cVermelho = L.polygon([], { ...vermelho, weight: 0.5, fill: true, fillColor: VERMELHO, fillOpacity: 1 }).addTo(this.grupo);
    this.cEncaixe = L.polygon([], { ...vermelho, fill: true, fillColor: '#fff', fillOpacity: 0.6 }).addTo(this.grupo);
    // pino que aparece quando o mapa está afastado (o símbolo em escala real fica minúsculo)
    this.pino = L.circleMarker(this.latlng, {
      radius: 7, color: '#fff', weight: 2, fillColor: VERMELHO, fillOpacity: 1, bubblingMouseEvents: false,
    });
    this.pino.on('click', (e) => { L.DomEvent.stopPropagation(e); this.aoTocar?.(this); });
    this.aoZoom = () => this.ajustarPino();
    mapa.on('zoomend', this.aoZoom);

    this.grupo.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      this.aoTocar?.(this);
    });

    if (editavel) this.criarAlcas();
    this.desenhar();
    this.ajustarPino();
  }

  ajustarPino() {
    const afastado = this.mapa.getZoom() < 20;
    if (afastado && !this.mapa.hasLayer(this.pino)) this.pino.addTo(this.mapa);
    if (!afastado && this.mapa.hasLayer(this.pino)) this.pino.remove();
  }

  get latlng() { return [this.ponto.lat, this.ponto.lng]; }

  pontoMapa(xy) {
    const { lat, lng, tamanho_m: t, rotacao: r } = this.ponto;
    return blocoParaMapa(lat, lng, t, r, xy);
  }

  desenhar() {
    const f = this.formas;
    const m = (lista) => lista.map((xy) => this.pontoMapa(xy));
    this.cQuadrado.setLatLngs(m(f.quadrado));
    this.cPoste.setLatLngs(m(f.poste));
    this.cCentro.setLatLngs(f.centro.map(m));
    this.cBraco.setLatLngs(f.braco.map(m));
    this.cLuminaria.setLatLngs(m(f.luminaria));
    this.cVermelho.setLatLngs(m(f.vermelho));
    this.cEncaixe.setLatLngs(m(f.encaixe));
    const fora = this.ponto.fora_da_area;
    const cor = fora ? '#d97706' : TINTA;
    [this.cQuadrado, this.cPoste, this.cCentro, this.cBraco].forEach((c) => c.setStyle({ color: cor }));
    this.cQuadrado.setStyle({ weight: this.selecionado ? 4 : 2.5, dashArray: fora ? '4 3' : null });
    this.pino.setLatLng(this.latlng);
    this.pino.setStyle({ fillColor: fora ? '#d97706' : VERMELHO, radius: this.selecionado ? 9 : 7 });
    if (this.alcaCentro && !this.arrastandoCentro) this.alcaCentro.setLatLng(this.latlng);
    if (this.alcaPonta && !this.arrastandoPonta) this.alcaPonta.setLatLng(this.pontoMapa(f.ponta));
  }

  criarAlcas() {
    const icone = (cls, t) => L.divIcon({ className: `alca ${cls}`, iconSize: [t, t], iconAnchor: [t / 2, t / 2] });
    this.alcaCentro = L.marker(this.latlng, { draggable: true, icon: icone('alca-centro', 26), zIndexOffset: 1000 });
    this.alcaPonta = L.marker(this.pontoMapa(this.formas.ponta), { draggable: true, icon: icone('alca-ponta', 24), zIndexOffset: 1001 });

    this.alcaCentro.on('dragstart', () => { this.arrastandoCentro = true; });
    this.alcaCentro.on('drag', (e) => {
      const p = e.target.getLatLng();
      this.ponto.lat = p.lat;
      this.ponto.lng = p.lng;
      this.desenhar();
      this.aoMudar?.(this, 'mover');
    });
    this.alcaCentro.on('dragend', () => { this.arrastandoCentro = false; this.desenhar(); this.aoSoltar?.(this); });

    this.alcaPonta.on('dragstart', () => { this.arrastandoPonta = true; });
    this.alcaPonta.on('drag', (e) => {
      const p = e.target.getLatLng();
      const { tamanho, rumo } = pontaParaRumoTamanho(this.ponto.lat, this.ponto.lng, p.lat, p.lng);
      this.ponto.tamanho_m = limitarTamanho(tamanho);
      this.ponto.rotacao = normalizarRumo(rumo);
      this.desenhar();
      this.aoMudar?.(this, 'girar');
    });
    this.alcaPonta.on('dragend', () => { this.arrastandoPonta = false; this.desenhar(); this.aoSoltar?.(this); });
  }

  selecionar(sim) {
    this.selecionado = sim;
    if (this.editavel) {
      if (sim) { this.alcaCentro.addTo(this.mapa); this.alcaPonta.addTo(this.mapa); } else {
        this.alcaCentro.remove(); this.alcaPonta.remove();
      }
    }
    this.desenhar();
  }

  atualizar(campos) {
    Object.assign(this.ponto, campos);
    this.desenhar();
  }

  remover() {
    this.mapa.off('zoomend', this.aoZoom);
    this.pino.remove();
    this.grupo.remove();
    this.alcaCentro?.remove();
    this.alcaPonta?.remove();
  }
}

// Ícone SVG do símbolo (para listas e para o app).
export function svgSimbolo(px = 40) {
  const f = formasDoBloco();
  const p = ([x, y]) => `${(x * 100).toFixed(1)},${(-y * 100).toFixed(1)}`;
  const s = (lista) => lista.map(p).join(' ');
  const linhas = (pares) => pares.map((l) => `<polyline points="${s(l)}"/>`).join('');
  return `<svg viewBox="-20 -20 122 40" width="${px * 3}" height="${px}" aria-hidden="true">
    <polygon points="${s(f.quadrado)}" fill="#fff" stroke="${TINTA}" stroke-width="2.2"/>
    <polygon points="${s(f.poste)}" fill="none" stroke="${TINTA}" stroke-width="1.4"/>
    <g fill="none" stroke="${TINTA}" stroke-width="1.2">${linhas(f.centro)}${linhas(f.braco)}</g>
    <polygon points="${s(f.luminaria)}" fill="#fff" stroke="${VERMELHO}" stroke-width="1.4"/>
    <polygon points="${s(f.vermelho)}" fill="${VERMELHO}"/>
    <polygon points="${s(f.encaixe)}" fill="#fff" stroke="${VERMELHO}" stroke-width="1.2"/>
  </svg>`;
}
