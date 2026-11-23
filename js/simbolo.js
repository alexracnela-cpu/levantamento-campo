// Símbolo do levantamento, desenhado em escala real (metros) sobre o mapa.
//
// Desenho no sistema do bloco (como no AutoCAD), com o braço apontando para +x:
//   - círculo duplo centrado no ponto (o poste);
//   - braço saindo do círculo até 85% do comprimento;
//   - garra na ponta (travessa + duas pontas);
//   - metade de cima (+y) do círculo interno pintada de vermelho.
// "tamanho_m" é o comprimento total, do centro do círculo até a ponta da garra.
// "rotacao" é o rumo do braço em graus: 0 = norte, 90 = leste (padrão, igual ao bloco).

import { deslocar, emMetros } from './util.js';

const TINTA = '#1f3a6b';
const VERMELHO = '#c8281e';

export const PROPORCAO = {
  raioExterno: 0.18,
  raioInterno: 0.11,
  fimBraco: 0.80,
  meiaGarra: 0.10,
};

// Formas no sistema do bloco, com comprimento total = 1.
export function formasDoBloco() {
  const P = PROPORCAO;
  const circulo = (r, n = 48) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const meioCirculoDeCima = (r, n = 24) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  };
  return {
    externo: circulo(P.raioExterno),
    interno: circulo(P.raioInterno),
    vermelho: meioCirculoDeCima(P.raioInterno),
    braco: [[P.raioExterno, 0], [P.fimBraco, 0]],
    garra: [
      [1, P.meiaGarra], [P.fimBraco, P.meiaGarra], [P.fimBraco, -P.meiaGarra], [1, -P.meiaGarra],
    ],
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
  return Math.min(200, Math.max(0.5, Math.round((Number(t) || 6) * 10) / 10));
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
    this.cExterno = L.polygon([], { ...estilo, fill: true, fillColor: '#fff', fillOpacity: 0.55 }).addTo(this.grupo);
    this.cInterno = L.polygon([], { ...estilo }).addTo(this.grupo);
    this.cVermelho = L.polygon([], {
      ...estilo, color: VERMELHO, weight: 1, fill: true, fillColor: VERMELHO, fillOpacity: 0.95,
    }).addTo(this.grupo);
    this.cBraco = L.polyline([], { ...estilo, weight: 3 }).addTo(this.grupo);
    this.cGarra = L.polyline([], { ...estilo, weight: 3 }).addTo(this.grupo);
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
    const afastado = this.mapa.getZoom() < 18;
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
    this.cExterno.setLatLngs(m(f.externo));
    this.cInterno.setLatLngs(m(f.interno));
    this.cVermelho.setLatLngs(m(f.vermelho));
    this.cBraco.setLatLngs(m(f.braco));
    this.cGarra.setLatLngs(m(f.garra));
    const fora = this.ponto.fora_da_area;
    const cor = fora ? '#d97706' : TINTA;
    [this.cExterno, this.cInterno, this.cBraco, this.cGarra].forEach((c) => c.setStyle({ color: cor }));
    this.cExterno.setStyle({ weight: this.selecionado ? 3.5 : 2, dashArray: fora ? '4 3' : null });
    this.pino.setLatLng(this.latlng);
    this.pino.setStyle({ fillColor: fora ? '#d97706' : VERMELHO, radius: this.selecionado ? 9 : 7 });
    if (this.alcaCentro && !this.arrastandoCentro) this.alcaCentro.setLatLng(this.latlng);
    if (this.alcaPonta && !this.arrastandoPonta) this.alcaPonta.setLatLng(this.pontoMapa(f.ponta));
  }

  criarAlcas() {
    const icone = (cls) => L.divIcon({ className: `alca ${cls}`, iconSize: [30, 30], iconAnchor: [15, 15] });
    this.alcaCentro = L.marker(this.latlng, { draggable: true, icon: icone('alca-centro'), zIndexOffset: 1000 });
    this.alcaPonta = L.marker(this.pontoMapa(this.formas.ponta), { draggable: true, icon: icone('alca-ponta'), zIndexOffset: 1001 });

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
  const s = (lista) => lista.map(([x, y]) => `${(x * 100).toFixed(1)},${(-y * 100).toFixed(1)}`).join(' ');
  return `<svg viewBox="-22 -22 126 44" width="${px * 2.8}" height="${px}" aria-hidden="true">
    <polygon points="${s(f.externo)}" fill="#fff" stroke="${TINTA}" stroke-width="2.4"/>
    <polygon points="${s(f.interno)}" fill="none" stroke="${TINTA}" stroke-width="2"/>
    <polygon points="${s(f.vermelho)}" fill="${VERMELHO}"/>
    <polyline points="${s(f.braco)}" fill="none" stroke="${TINTA}" stroke-width="3"/>
    <polyline points="${s(f.garra)}" fill="none" stroke="${TINTA}" stroke-width="3"/>
  </svg>`;
}
