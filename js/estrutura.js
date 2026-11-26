// Estrutura: polígono desenhado em campo (prédio, quadra, campo… o motoqueiro dá o nome).
// Só desenho de referência: não bloqueia os toques no mapa (dá para marcar ponto dentro dela).
import { emMetros, esc } from './util.js';

export const COR_ESTRUTURA = '#7a3fb0';
// atalhos que preenchem o nome (ele pode digitar qualquer outro)
export const SUGESTOES_ESTRUTURA = ['Prédio', 'Quadra', 'Campo', 'Praça', 'Escola', 'Igreja', 'Estacionamento'];

export const nomeEstrutura = (e) => (String(e?.nome || '').trim() || 'Estrutura');

// área em m² (fórmula do laço, em metros locais)
export function areaM2(pontos) {
  if (!pontos || pontos.length < 3) return 0;
  const [la0, ln0] = pontos[0];
  const xy = pontos.map(([la, ln]) => emMetros(la0, ln0, la, ln));
  let s = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function perimetroM(pontos) {
  if (!pontos || pontos.length < 2) return 0;
  let t = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    if (pontos.length === 2 && i === 1) break;
    const [e, n] = emMetros(a[0], a[1], b[0], b[1]);
    t += Math.hypot(e, n);
  }
  return t;
}

export function formatarArea(m2) {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2).replace('.', ',')} ha`;
  return `${Math.round(m2).toLocaleString('pt-BR')} m²`;
}

export function centroDe(pontos) {
  const n = pontos.length || 1;
  return [pontos.reduce((t, p) => t + p[0], 0) / n, pontos.reduce((t, p) => t + p[1], 0) / n];
}

export function svgEstrutura(largura = 26, altura = 16) {
  return `<svg width="${largura}" height="${altura}" viewBox="0 0 26 16" aria-hidden="true"><polygon points="2,14 4,3 16,1 24,6 22,14" fill="${COR_ESTRUTURA}" fill-opacity=".18" stroke="${COR_ESTRUTURA}" stroke-width="2"/></svg>`;
}

export class EstruturaNoMapa {
  constructor(mapa, estrutura, { editavel = false, aoTocar, aoMudar } = {}) {
    this.mapa = mapa;
    this.est = { ...estrutura, pontos: (estrutura.pontos || []).map((p) => [...p]) };
    this.editavel = editavel;
    this.aoTocar = aoTocar;
    this.aoMudar = aoMudar;
    this.selecionada = false;
    this.vertices = [];
    this.forma = L.polygon(this.est.pontos, this.estilo()).addTo(mapa);
    this.rotulo = L.marker(this.centro(), { icon: this.icone(), zIndexOffset: 400, keyboard: false }).addTo(mapa);
    this.rotulo.on('click', (e) => { L.DomEvent.stopPropagation(e); this.aoTocar?.(this); });
  }

  centro() { return this.est.pontos.length ? centroDe(this.est.pontos) : [0, 0]; }

  get area() { return areaM2(this.est.pontos); }

  estilo() {
    return {
      color: COR_ESTRUTURA, weight: this.selecionada ? 4 : 2.5, opacity: 0.95,
      fillColor: COR_ESTRUTURA, fillOpacity: this.selecionada ? 0.22 : 0.12,
      dashArray: this.est.pontos.length < 3 ? '6 5' : null, interactive: false,
    };
  }

  icone() {
    const n = this.est.pontos.length;
    const txt = n >= 3 ? `${esc(nomeEstrutura(this.est))}` : `${esc(nomeEstrutura(this.est))} · ${n}/3`;
    return L.divIcon({ className: `rotulo-estrutura${this.selecionada ? ' ativo' : ''}`, html: `<span>${txt}</span>`, iconSize: null });
  }

  desenhar() {
    this.forma.setLatLngs(this.est.pontos);
    this.forma.setStyle(this.estilo());
    this.rotulo.setLatLng(this.centro());
    this.rotulo.setIcon(this.icone());
    this.rotulo.getElement()?.style.setProperty('display', this.est.pontos.length ? '' : 'none');
    if (this.selecionada && this.editavel) this.criarVertices();
  }

  criarVertices() {
    this.vertices.forEach((m) => m.remove());
    this.vertices = this.est.pontos.map((p, i) => {
      const m = L.marker(p, {
        draggable: true,
        zIndexOffset: 900,
        icon: L.divIcon({ className: 'vertice-rede vertice-estrutura', iconSize: [16, 16], iconAnchor: [8, 8] }),
      }).addTo(this.mapa);
      m.on('drag', (e) => {
        const ll = e.target.getLatLng();
        this.est.pontos[i] = [ll.lat, ll.lng];
        this.forma.setLatLngs(this.est.pontos);
        this.rotulo.setLatLng(this.centro());
      });
      m.on('dragend', () => { this.criarVertices(); this.aoMudar?.(this, i); });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.aoTocar?.(this); });
      return m;
    });
  }

  adicionarVertice(latlng) {
    this.est.pontos.push([latlng[0], latlng[1]]);
    this.desenhar();
  }

  desfazer() {
    this.est.pontos.pop();
    this.desenhar();
  }

  selecionar(sim) {
    this.selecionada = sim;
    if (!sim) { this.vertices.forEach((m) => m.remove()); this.vertices = []; }
    this.desenhar();
  }

  atualizar(campos) {
    Object.assign(this.est, campos);
    if (campos.pontos) this.est.pontos = campos.pontos.map((p) => [...p]);
    this.desenhar();
  }

  remover() {
    this.vertices.forEach((m) => m.remove());
    this.forma.remove();
    this.rotulo.remove();
  }
}
