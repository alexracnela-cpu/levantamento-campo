// Criação do mapa (OpenStreetMap + satélite) e desenho da área.

export const MANAUS = [-3.1019, -60.025];

export function criarMapa(el, { centro = MANAUS, zoom = 13 } = {}) {
  const mapa = L.map(el, { zoomControl: true, maxZoom: 22, tap: true }).setView(centro, zoom);

  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19, maxZoom: 22, crossOrigin: 'anonymous',
    attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 19, maxZoom: 22, crossOrigin: 'anonymous',
    attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics',
  });

  const escolhida = localStorage.getItem('rondaluz-camada') === 'satelite' ? satelite : osm;
  escolhida.addTo(mapa);
  L.control.layers({ Mapa: osm, 'Satélite': satelite }, null, { position: 'topright' }).addTo(mapa);
  mapa.on('baselayerchange', (e) => {
    localStorage.setItem('rondaluz-camada', e.layer === satelite ? 'satelite' : 'mapa');
  });
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);

  // corrige tamanho quando o mapa aparece depois de a tela montar
  setTimeout(() => mapa.invalidateSize(), 60);
  return mapa;
}

export function desenharArea(mapa, area, opcoes = {}) {
  if (!area || area.length < 3) return null;
  return L.polygon(area, {
    color: '#1f3a6b', weight: 2.5, dashArray: '8 6', fillColor: '#1f3a6b', fillOpacity: 0.07,
    interactive: false, ...opcoes,
  }).addTo(mapa);
}

// Ferramenta simples de desenho de polígono: toque para pôr vértices, arraste para ajustar.
export class DesenhoDeArea {
  constructor(mapa, aoMudar) {
    this.mapa = mapa;
    this.aoMudar = aoMudar;
    this.vertices = [];
    this.marcadores = [];
    this.ativo = false;
    this.poligono = L.polygon([], {
      color: '#c8281e', weight: 2.5, fillColor: '#c8281e', fillOpacity: 0.08, interactive: false,
    }).addTo(mapa);
    this.cliqueFn = (e) => this.adicionar(e.latlng);
    mapa.on('click', this.cliqueFn);
  }

  ligar(sim) {
    this.ativo = sim;
    this.mapa.getContainer().classList.toggle('desenhando', sim);
  }

  adicionar(latlng) {
    if (!this.ativo) return;
    this.vertices.push([latlng.lat, latlng.lng]);
    this.redesenhar();
  }

  desfazer() {
    this.vertices.pop();
    this.redesenhar();
  }

  limpar() {
    this.vertices = [];
    this.redesenhar();
  }

  definir(area) {
    this.vertices = (area || []).map((v) => [...v]);
    this.redesenhar();
  }

  redesenhar() {
    this.marcadores.forEach((m) => m.remove());
    this.marcadores = this.vertices.map((v, i) => {
      const m = L.marker(v, {
        draggable: true,
        icon: L.divIcon({ className: 'vertice', iconSize: [16, 16], iconAnchor: [8, 8], html: `<span>${i + 1}</span>` }),
      }).addTo(this.mapa);
      m.on('drag', (e) => {
        const p = e.target.getLatLng();
        this.vertices[i] = [p.lat, p.lng];
        this.poligono.setLatLngs(this.vertices);
      });
      m.on('dragend', () => this.aoMudar?.(this.vertices));
      return m;
    });
    this.poligono.setLatLngs(this.vertices);
    this.aoMudar?.(this.vertices);
  }

  destruir() {
    this.mapa.off('click', this.cliqueFn);
    this.marcadores.forEach((m) => m.remove());
    this.poligono.remove();
  }
}

// Posição do GPS: bolinha azul + círculo de precisão.
export class MinhaPosicao {
  constructor(mapa, aoAtualizar) {
    this.mapa = mapa;
    this.aoAtualizar = aoAtualizar;
    this.marcador = null;
    this.precisao = null;
    this.ultima = null;
    this.id = null;
  }

  iniciar() {
    if (!('geolocation' in navigator)) return false;
    this.id = navigator.geolocation.watchPosition(
      (pos) => {
        const ll = [pos.coords.latitude, pos.coords.longitude];
        this.ultima = { latlng: ll, precisao: pos.coords.accuracy };
        if (!this.marcador) {
          this.precisao = L.circle(ll, {
            radius: pos.coords.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.08, interactive: false,
          }).addTo(this.mapa);
          this.marcador = L.circleMarker(ll, {
            radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false,
          }).addTo(this.mapa);
        } else {
          this.marcador.setLatLng(ll);
          this.precisao.setLatLng(ll).setRadius(pos.coords.accuracy);
        }
        this.aoAtualizar?.(this.ultima);
      },
      (erro) => this.aoAtualizar?.(null, erro),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return true;
  }

  parar() {
    if (this.id != null) navigator.geolocation.clearWatch(this.id);
    this.marcador?.remove();
    this.precisao?.remove();
  }
}
