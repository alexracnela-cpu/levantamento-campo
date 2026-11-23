// Rede elétrica desenhada no mapa: secundária (linha contínua) ou primária (tracejada),
// existente ou inexistente (cores diferentes).

import { emMetros, deslocar } from './util.js';

export const TIPOS = { secundaria: 'Secundária', primaria: 'Primária' };
export const SITUACOES = { existente: 'Existente', inexistente: 'Inexistente' };
export const CORES = { existente: '#1f6fd0', inexistente: '#e07b00' };
const TRACEJADO = '14 9';

export function estiloRede(rede, selecionada = false) {
  return {
    color: CORES[rede.situacao] || CORES.existente,
    weight: selecionada ? 6 : 4,
    opacity: 1,
    dashArray: rede.tipo === 'primaria' ? TRACEJADO : null,
    lineCap: 'butt',
    lineJoin: 'round',
  };
}

export function comprimentoM(pontos) {
  let total = 0;
  for (let i = 1; i < (pontos || []).length; i++) {
    const [e, n] = emMetros(pontos[i - 1][0], pontos[i - 1][1], pontos[i][0], pontos[i][1]);
    total += Math.hypot(e, n);
  }
  return total;
}

// Metragem que vale (totais e relatório): a medida digitada em campo, se houver; senão a do mapa.
export function medidaInformada(rede) {
  const v = Number(rede?.comprimento_informado);
  return Number.isFinite(v) && v > 0 ? v : null;
}
export function metragemRede(rede) {
  return medidaInformada(rede) ?? comprimentoM(rede?.pontos);
}

export function formatarMetros(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`;
}

// Amostra de linha (para legendas e botões).
export function svgLinha(tipo, situacao, largura = 34) {
  return `<svg width="${largura}" height="10" viewBox="0 0 ${largura} 10" aria-hidden="true">
    <line x1="1" y1="5" x2="${largura - 1}" y2="5" stroke="${CORES[situacao]}" stroke-width="4"
      ${tipo === 'primaria' ? 'stroke-dasharray="8 5"' : ''}/></svg>`;
}

export function legendaRede() {
  return `<div class="legenda-rede">
    <span>${svgLinha('secundaria', 'existente')} Secundária</span>
    <span>${svgLinha('primaria', 'existente')} Primária</span>
    <span><i style="background:${CORES.existente}"></i> Existente</span>
    <span><i style="background:${CORES.inexistente}"></i> Inexistente</span>
  </div>`;
}

export class RedeNoMapa {
  constructor(mapa, rede, {
    editavel = false, aoTocar, aoTocarVertice, aoMudar,
  } = {}) {
    this.mapa = mapa;
    this.rede = { ...rede, pontos: (rede.pontos || []).map((p) => [...p]) };
    this.editavel = editavel;
    this.aoTocar = aoTocar;
    this.aoMudar = aoMudar;
    this.aoTocarVertice = aoTocarVertice;
    this.selecionada = false;
    this.vertices = [];
    this.verticeAtivo = null; // índice do ponto que as setas movem (null = o último)
    // contorno branco por baixo, para a linha aparecer sobre qualquer fundo
    this.fundo = L.polyline(this.rede.pontos, {
      color: '#fff', weight: 8, opacity: 0.75, interactive: false, lineCap: 'butt',
    }).addTo(mapa);
    this.linha = L.polyline(this.rede.pontos, { ...estiloRede(this.rede), bubblingMouseEvents: false }).addTo(mapa);
    this.linha.on('click', (e) => { L.DomEvent.stopPropagation(e); this.aoTocar?.(this, e.latlng); });
  }

  get comprimento() { return comprimentoM(this.rede.pontos); }

  get indiceAtivo() {
    const n = this.rede.pontos.length;
    if (!n) return -1;
    return this.verticeAtivo != null && this.verticeAtivo < n ? this.verticeAtivo : n - 1;
  }

  // Move só um ponto do cabo (os outros ficam onde estão), em metros.
  moverVertice(i, lesteM, norteM) {
    const p = this.rede.pontos[i];
    if (!p) return;
    this.rede.pontos[i] = deslocar(p[0], p[1], lesteM, norteM);
    this.desenhar();
  }

  desenhar() {
    this.fundo.setLatLngs(this.rede.pontos);
    this.linha.setLatLngs(this.rede.pontos);
    this.linha.setStyle(estiloRede(this.rede, this.selecionada));
    this.fundo.setStyle({ weight: this.selecionada ? 11 : 8 });
    if (this.selecionada && this.editavel) this.criarVertices();
  }

  criarVertices() {
    this.vertices.forEach((m) => m.remove());
    this.vertices = this.rede.pontos.map((p, i) => {
      const m = L.marker(p, {
        draggable: true,
        zIndexOffset: 900,
        icon: L.divIcon({
          className: `vertice-rede${i === this.indiceAtivo ? ' ativo' : ''}`,
          iconSize: i === this.indiceAtivo ? [20, 20] : [16, 16],
          iconAnchor: i === this.indiceAtivo ? [10, 10] : [8, 8],
        }),
      }).addTo(this.mapa);
      m.on('drag', (e) => {
        const ll = e.target.getLatLng();
        this.rede.pontos[i] = [ll.lat, ll.lng];
        this.fundo.setLatLngs(this.rede.pontos);
        this.linha.setLatLngs(this.rede.pontos);
      });
      m.on('dragstart', () => { this.verticeAtivo = i; });
      m.on('dragend', () => { this.criarVertices(); this.aoMudar?.(this); });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.aoTocarVertice ? this.aoTocarVertice(this, i, e.latlng) : this.aoTocar?.(this, e.latlng); });
      return m;
    });
  }

  adicionarVertice(latlng) {
    this.rede.pontos.push([latlng[0], latlng[1]]);
    this.verticeAtivo = null;
    this.desenhar();
  }

  desfazer() {
    this.rede.pontos.pop();
    this.verticeAtivo = null;
    this.desenhar();
  }

  selecionar(sim) {
    this.selecionada = sim;
    if (!sim) { this.vertices.forEach((m) => m.remove()); this.vertices = []; }
    this.desenhar();
    if (sim) this.linha.bringToFront();
  }

  atualizar(campos) {
    Object.assign(this.rede, campos);
    if (campos.pontos) this.rede.pontos = campos.pontos.map((p) => [...p]);
    this.desenhar();
  }

  remover() {
    this.vertices.forEach((m) => m.remove());
    this.fundo.remove();
    this.linha.remove();
  }
}
