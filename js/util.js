// Funções pequenas usadas em todo o app.

export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function esc(txt) {
  return String(txt ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Ponto dentro do polígono (raio). poligono = [[lat, lng], ...]
export function dentroDoPoligono(lat, lng, poligono) {
  if (!poligono || poligono.length < 3) return true;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    const cruza = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

// Conversão metros <-> graus perto de um ponto (precisão de sobra para alguns metros).
const M_POR_GRAU_LAT = 111320;
export function deslocar(lat, lng, lesteM, norteM) {
  const dLat = norteM / M_POR_GRAU_LAT;
  const dLng = lesteM / (M_POR_GRAU_LAT * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}
export function emMetros(lat0, lng0, lat, lng) {
  const norte = (lat - lat0) * M_POR_GRAU_LAT;
  const leste = (lng - lng0) * M_POR_GRAU_LAT * Math.cos((lat0 * Math.PI) / 180);
  return [leste, norte];
}

export const STATUS = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

export function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function horaBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function prazoVencido(prazo, status) {
  if (!prazo || status === 'concluido') return false;
  const hoje = new Date();
  const h = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return prazo < h;
}

let avisoTimer;
export function aviso(msg, tipo = 'info') {
  const el = document.getElementById('aviso');
  el.textContent = msg;
  el.className = `aviso mostrar ${tipo}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.className = 'aviso'; }, tipo === 'erro' ? 6000 : 3200);
}

export function nomeArquivoSeguro(nome) {
  const base = String(nome || 'arquivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_');
  return base.slice(-80) || 'arquivo';
}

// Reduz a foto antes de guardar (economiza espaço e dados móveis).
export async function comprimirFoto(arquivo, ladoMax = 1600, qualidade = 0.8) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    return arquivo;
  }
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((ok) => canvas.toBlob((b) => ok(b || arquivo), 'image/jpeg', qualidade));
}

export function mensagemErro(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered|already exists/i.test(m)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/RONDALUZ_SEM_CONVITE|Database error saving new user/i.test(m)) return 'Este e-mail não foi convidado. Peça ao líder para te convidar na tela Equipe.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Email not confirmed/i.test(m)) return 'E-mail não confirmado. No Supabase, desligue "Confirm email".';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor.';
  if (/row-level security|permission denied/i.test(m)) return 'Sem permissão para isso.';
  return m;
}
