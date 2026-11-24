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

const TINTA = '#003c78';
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

// Tipos de poste e de luminária escolhidos pelo motoqueiro (desenhos do usuário no AutoCAD).
export const TIPOS_POSTE = {
  duplo_t: 'Duplo T',
  concreto_circular: 'Concreto circular',
  fibra: 'Fibra',
  metalico: 'Metálico',
  madeira: 'Madeira',
};
export const SEM_POSTE = 'sem_poste'; // só para projetor (chão, fachada, praça)
export const EQUIPAMENTOS = { luminaria: 'Luminária', projetor: 'Projetor' };
export const SITUACOES_LUMINARIA = { existente: 'Existente', nova: 'Nova' };
export const CORES_LUMINARIA = { existente: '#0000ff', nova: VERMELHO };
export const CORES_PROJETOR = { existente: '#2e9e57', nova: VERMELHO }; // contorno; o vidro é sempre azul
const AZUL_VIDRO = '#1f74d6';
const VERDE_FIBRA = '#156936';

export const equipamento = (p) => (p?.equipamento === 'projetor' ? 'projetor' : 'luminaria');
export const tipoPoste = (p) => {
  if (p?.tipo_poste === SEM_POSTE) return equipamento(p) === 'projetor' ? SEM_POSTE : 'duplo_t';
  return TIPOS_POSTE[p?.tipo_poste] ? p.tipo_poste : 'duplo_t';
};
export const nomePoste = (t) => (t === SEM_POSTE ? 'Sem poste' : TIPOS_POSTE[t] || TIPOS_POSTE.duplo_t);
export const situacaoLuminaria = (p) => (SITUACOES_LUMINARIA[p?.luminaria] ? p.luminaria : 'existente');
// "existente" / "nova" (luminária) / "novo" (projetor)
export const nomeSituacao = (p) => {
  const sit = situacaoLuminaria(p);
  if (sit === 'existente') return 'Existente';
  return equipamento(p) === 'projetor' ? 'Novo' : 'Nova';
};
export const corEquipamento = (p) => (equipamento(p) === 'projetor' ? CORES_PROJETOR : CORES_LUMINARIA)[situacaoLuminaria(p)];

// Formas no sistema do bloco, com comprimento total = 1.
// O braço sai da borda do poste: do círculo pequeno no duplo T, do círculo de fora nos redondos.
export function formasDoBloco(tipo = 'duplo_t') {
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
  const raioSaida = tipo === 'duplo_t' ? P.raioPoste : q;
  const xBraco = Math.sqrt(raioSaida ** 2 - P.meioBraco ** 2);
  return {
    poste: formasDoPoste(tipo),
    braco: [[[xBraco, P.meioBraco], [P.encEsq, P.meioBraco]], [[xBraco, -P.meioBraco], [P.encEsq, -P.meioBraco]]],
    luminaria,
    encaixe,
    vermelho: metadeVermelha,
    ponta: [1, 0],
  };
}

// Desenho do poste, peça por peça. Cada peça: { pts, fechada, traco, preench, peso, principal }.
//   traco/preench: 'tinta' | 'verde' | 'fundo' (branco translúcido) | null.
//   principal: contorno de fora (fica grosso quando selecionado e tracejado fora da área).
// Os redondos têm o mesmo tamanho do quadrado do duplo T (diâmetro = lado do quadrado).
export function formasDoPoste(tipo = 'duplo_t') {
  const P = PROPORCAO;
  const R = P.meioQuadrado;
  const circulo = (r) => arco(0, 0, r, 0, Math.PI * 2, 40);
  const contorno = (pts, preench = 'fundo') => ({ pts, fechada: true, traco: 'tinta', preench, peso: 2.5, principal: true });
  const linha = (pts, peso = 1) => ({ pts, fechada: false, traco: 'tinta', preench: null, peso });
  switch (tipo) {
    case SEM_POSTE:
      return [];
    case 'concreto_circular':
      return [contorno(circulo(R)), { pts: circulo(R * 0.54), fechada: true, traco: 'tinta', preench: null, peso: 1.2 }];
    case 'fibra':
      return [contorno(circulo(R), 'verde')];
    case 'metalico':
      return [contorno(circulo(R)), { pts: circulo(R * 0.667), fechada: true, traco: 'tinta', preench: 'tinta', peso: 1 }];
    case 'madeira': {
      // hachura a 45°, subindo para a direita (gira junto com o símbolo)
      const n = [Math.SQRT1_2, -Math.SQRT1_2]; // normal às linhas
      const d = [Math.SQRT1_2, Math.SQRT1_2]; // direção das linhas
      const linhas = [];
      for (let k = -3; k <= 3; k += 1) {
        const o = k * R * 0.27;
        const m = Math.sqrt(R ** 2 - o ** 2);
        linhas.push(linha([[n[0] * o - d[0] * m, n[1] * o - d[1] * m], [n[0] * o + d[0] * m, n[1] * o + d[1] * m]], 0.8));
      }
      return [contorno(circulo(R)), ...linhas];
    }
    default: // duplo T: quadrado, círculo no centro e linha de centro
      return [
        contorno([[-R, -R], [-R, R], [R, R], [R, -R]]),
        { pts: circulo(P.raioPoste), fechada: true, traco: 'tinta', preench: null, peso: 1.5 },
        linha([[-R, 0], [-P.raioPoste, 0]]),
        linha([[P.raioPoste, 0], [R, 0]]),
      ];
  }
}

// Projetor (desenho do usuário), visto de frente: a base do suporte em U fica presa no ponto
// (borda do poste ou o próprio ponto, quando não há poste) e o vidro aponta para o rumo.
// Medidas em pixels do desenho original: t = distância a partir da base, s = lateral.
const PROJ = 0.55 / 564; // escala: o corpo vai até 0,55 do comprimento do símbolo
function formasDoProjetor() {
  const ret = (s0, s1, t0, t1) => [[t0, s0], [t0, s1], [t1, s1], [t1, s0]].map(([t, l]) => [t * PROJ, -l * PROJ]);
  const pt = (t, l) => [t * PROJ, -l * PROJ];
  // hachura do vidro: diagonais a 45°, recortadas no retângulo
  const vidro = { s0: -208, s1: 208, t0: 220, t1: 525 };
  const hachura = [];
  for (let c = vidro.s0 - (vidro.t1 - vidro.t0) + 40; c < vidro.s1; c += 42) {
    // linha l = c + (t - t0)
    let tA = vidro.t0; let lA = c;
    if (lA < vidro.s0) { tA += vidro.s0 - lA; lA = vidro.s0; }
    let tB = vidro.t1; let lB = c + (vidro.t1 - vidro.t0);
    if (lB > vidro.s1) { tB -= lB - vidro.s1; lB = vidro.s1; }
    if (tB > tA) hachura.push([pt(tA, lA), pt(tB, lB)]);
  }
  return {
    suporte: [pt(357, -279), pt(0, -279), pt(0, 279), pt(357, 279)],
    abasSuporte: [[pt(357, -279), pt(357, -248)], [pt(357, 279), pt(357, 248)]],
    pinos: [ret(-299, -279, 264, 309), ret(279, 299, 264, 309)],
    corpo: ret(-248, 248, 28, 564),
    painel: [pt(144, -248), pt(144, 248)],
    vidro: ret(vidro.s0, vidro.s1, vidro.t0, vidro.t1),
    hachura,
  };
}

const girar = (a) => {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return ([x, y]) => [x * c - y * sn, x * sn + y * c];
};

// Todas as peças do símbolo de um ponto (poste + braços e luminárias, ou projetores), com as cores já resolvidas.
// cores: { tinta, fundo, opFundo } para cada destino (mapa, relatório, ícone).
export function pecasDoPonto(p, { tinta = TINTA, fundo = '#fff', opFundo = 0.6 } = {}) {
  const tipo = tipoPoste(p);
  const f = formasDoBloco(tipo);
  const corEq = corEquipamento(p);
  const cor = (c) => ({ tinta, verde: VERDE_FIBRA, fundo }[c] || c || null);
  const pecas = f.poste.map((x) => ({
    ...x, traco: cor(x.traco), preench: cor(x.preench), opacidade: x.preench === 'fundo' ? opFundo : 1,
  }));
  const n = qtdLuminarias(p);
  if (equipamento(p) === 'projetor') {
    const pj = formasDoProjetor();
    const base = tipo === SEM_POSTE ? 0 : PROPORCAO.meioQuadrado; // preso na borda do poste
    for (let k = 0; k < n; k += 1) {
      const g = girar((-2 * Math.PI * k) / n);
      const m = (lista) => lista.map(([x, y]) => g([x + base, y]));
      const linha = (pts, c = corEq, peso = 1.2) => ({ pts: m(pts), fechada: false, traco: c, preench: null, peso });
      const caixa = (pts, preench, op, c = corEq, peso = 1.4) => ({ pts: m(pts), fechada: true, traco: c, preench, opacidade: op, peso });
      pecas.push(linha(pj.suporte, corEq, 1.4));
      pj.abasSuporte.forEach((l) => pecas.push(linha(l)));
      pj.pinos.forEach((r) => pecas.push(caixa(r, fundo, opFundo, corEq, 1)));
      pecas.push(caixa(pj.corpo, fundo, opFundo));
      pecas.push(linha(pj.painel));
      pecas.push(caixa(pj.vidro, null, 1, corEq, 1.2));
      pj.hachura.forEach((l) => pecas.push(linha(l, AZUL_VIDRO, 0.8)));
    }
    return pecas;
  }
  bracosDoPonto(f, n).forEach((b) => {
    b.braco.forEach((l) => pecas.push({ pts: l, fechada: false, traco: corEq, preench: null, peso: 1.5 }));
    pecas.push({ pts: b.luminaria, fechada: true, traco: corEq, preench: fundo, opacidade: opFundo, peso: 1.5 });
    pecas.push({ pts: b.vermelho, fechada: true, traco: corEq, preench: corEq, opacidade: 1, peso: 0.5 });
    pecas.push({ pts: b.encaixe, fechada: true, traco: corEq, preench: fundo, opacidade: opFundo, peso: 1.5 });
  });
  return pecas;
}

// Quantidade de luminárias do ponto (0 a 4; vazio = 1).
export const MAX_LUMINARIAS = 4;
export function qtdLuminarias(p) {
  const n = Math.round(Number(p?.qtd_luminarias ?? 1));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_LUMINARIAS, n)) : 1;
}

// Braços com luminária, já girados no sistema do bloco: um por luminária,
// repartidos por igual (2 = opostos, 3 = a cada 120°, 4 = em cruz). O primeiro segue o rumo.
export function bracosDoPonto(formas, n) {
  return Array.from({ length: n }, (_, k) => {
    const a = (-2 * Math.PI * k) / n; // rumo cresce no sentido horário
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const g = ([x, y]) => [x * c - y * sn, x * sn + y * c];
    return {
      braco: formas.braco.map((l) => l.map(g)),
      luminaria: formas.luminaria.map(g),
      vermelho: formas.vermelho.map(g),
      encaixe: formas.encaixe.map(g),
    };
  });
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
    this.camadas = [];
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
    const fora = this.ponto.fora_da_area;
    const pecas = pecasDoPonto(this.ponto, { tinta: fora ? '#d97706' : TINTA });
    // troca de tipo/quantidade muda o número de peças: refaz as camadas
    if (pecas.length !== this.camadas.length || pecas.some((pc, i) => pc.fechada !== this.camadas[i].fechada)) {
      this.camadas.forEach((c) => c.camada.remove());
      this.camadas = pecas.map((pc) => ({
        fechada: pc.fechada,
        camada: (pc.fechada ? L.polygon([], { interactive: true, bubblingMouseEvents: false }) : L.polyline([], { interactive: true, bubblingMouseEvents: false })).addTo(this.grupo),
      }));
    }
    pecas.forEach((pc, i) => {
      const { camada } = this.camadas[i];
      camada.setLatLngs(pc.pts.map((xy) => this.pontoMapa(xy)));
      camada.setStyle({
        color: pc.traco || 'transparent',
        weight: pc.principal && this.selecionado ? 4 : pc.peso,
        dashArray: pc.principal && fora ? '4 3' : null,
        fill: !!pc.preench,
        fillColor: pc.preench || undefined,
        fillOpacity: pc.opacidade ?? 1,
      });
    });
    this.pino.setLatLng(this.latlng);
    this.pino.setStyle({ fillColor: fora ? '#d97706' : corEquipamento(this.ponto), radius: this.selecionado ? 9 : 7 });
    if (this.alcaCentro && !this.arrastandoCentro) this.alcaCentro.setLatLng(this.latlng);
    if (this.alcaPonta && !this.arrastandoPonta) this.alcaPonta.setLatLng(this.pontoMapa([1, 0]));
  }

  criarAlcas() {
    const icone = (cls, t) => L.divIcon({ className: `alca ${cls}`, iconSize: [t, t], iconAnchor: [t / 2, t / 2] });
    this.alcaCentro = L.marker(this.latlng, { draggable: true, icon: icone('alca-centro', 26), zIndexOffset: 1000 });
    this.alcaPonta = L.marker(this.pontoMapa([1, 0]), { draggable: true, icon: icone('alca-ponta', 24), zIndexOffset: 1001 });

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

// Ícones SVG (ficha, botões de escolha e relatório).
const svgPts = (lista) => lista.map(([x, y]) => `${(x * 100).toFixed(1)},${(-y * 100).toFixed(1)}`).join(' ');
export function svgPecas(pecas, { viewBox, largura, altura, escalaPeso = 1 }) {
  const corpo = pecas.map((pc) => {
    const tag = pc.fechada ? 'polygon' : 'polyline';
    const fill = pc.preench ? `fill="${pc.preench}"${pc.opacidade < 1 ? ` fill-opacity="${pc.opacidade}"` : ''}` : 'fill="none"';
    const stroke = pc.traco ? `stroke="${pc.traco}" stroke-width="${(pc.peso * 0.85 * escalaPeso).toFixed(2)}"` : '';
    return `<${tag} points="${svgPts(pc.pts)}" ${fill} ${stroke}/>`;
  }).join('');
  return `<svg viewBox="${viewBox}" width="${largura}" height="${altura}" aria-hidden="true">${corpo}</svg>`;
}

// Símbolo inteiro do ponto (poste + luminária).
export function svgSimbolo(px = 40, ponto = {}, cores = {}) {
  return svgPecas(pecasDoPonto({ qtd_luminarias: 1, ...ponto, rotacao: 90 }, { opFundo: 1, ...cores }), {
    viewBox: '-20 -20 122 40', largura: px * 3, altura: px,
  });
}

// Só o poste (botões de escolha do tipo). "Sem poste" mostra um X tracejado.
export function svgPoste(tipo, px = 34) {
  if (tipo === SEM_POSTE) {
    return `<svg viewBox="-20 -20 40 40" width="${px}" height="${px}" aria-hidden="true"><circle r="17" fill="none" stroke="${TINTA}" stroke-width="1.6" stroke-dasharray="4 3"/><path d="M-9 -9L9 9M9 -9L-9 9" stroke="${TINTA}" stroke-width="1.6"/></svg>`;
  }
  const pecas = pecasDoPonto({ tipo_poste: tipo, qtd_luminarias: 0 }, { opFundo: 1 });
  return svgPecas(pecas, { viewBox: '-20 -20 40 40', largura: px, altura: px, escalaPeso: 0.9 });
}

// Só o equipamento (botões luminária/projetor e existente/novo).
export function svgLuminaria(situacao, px = 22, eq = 'luminaria') {
  const ponto = { tipo_poste: 'duplo_t', luminaria: situacao, qtd_luminarias: 1, equipamento: eq };
  const pecas = pecasDoPonto(ponto, { opFundo: 1 }).filter((pc) => pc.traco !== TINTA); // tira o poste
  if (eq === 'projetor') {
    // de pé, como no desenho do AutoCAD
    const g = girar(Math.PI / 2);
    const em = pecas.map((pc) => ({ ...pc, pts: pc.pts.map(g) }));
    return svgPecas(em, { viewBox: '-34 -76 68 62', largura: px * 1.35, altura: px * 1.25, escalaPeso: 0.8 });
  }
  return svgPecas(pecas, { viewBox: '5 -16 98 32', largura: px * 3, altura: px });
}
