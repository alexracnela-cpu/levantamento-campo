// Modo claro / escuro. Lembra a escolha; sem escolha, segue o tema do aparelho.

const CHAVE = 'rondaluz-tema';
const midia = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function escolhido() {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}

export function temaAtual() {
  const t = escolhido();
  if (t === 'escuro' || t === 'claro') return t;
  return midia?.matches ? 'escuro' : 'claro';
}

export function aplicarTema() {
  const escuro = temaAtual() === 'escuro';
  document.body.classList.toggle('tema-escuro', escuro);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', escuro ? '#0b1424' : '#003c78');
  document.querySelectorAll('.botao-tema').forEach((b) => {
    b.textContent = escuro ? '☀️' : '🌙';
    b.title = escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro';
    b.setAttribute('aria-label', b.title);
  });
}

export function alternarTema() {
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  try { localStorage.setItem(CHAVE, novo); } catch { /* sem armazenamento */ }
  aplicarTema();
}

export function botaoTema() {
  return '<button type="button" class="botao-tema" data-tema-botao></button>';
}

// liga os botões que estiverem dentro do elemento
export function ligarBotoesTema(raiz) {
  raiz.querySelectorAll('[data-tema-botao]').forEach((b) => { b.onclick = alternarTema; });
  aplicarTema();
}

midia?.addEventListener?.('change', () => { if (!escolhido()) aplicarTema(); });
