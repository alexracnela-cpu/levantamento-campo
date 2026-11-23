// =====================================================================
// RondaLuz — modo treinamento
// Roda o código real do app com um "Supabase de mentira" em memória,
// mapa ilustrativo e GPS simulado. Nada é enviado para o banco de verdade.
// =====================================================================

const CENTRO = [-3.1300, -60.0230];
const M_LAT = 111320;
const desl = (lat, lng, e, n) => [lat + n / M_LAT, lng + e / (M_LAT * Math.cos((lat * Math.PI) / 180))];
const em = (e, n) => desl(CENTRO[0], CENTRO[1], e, n);
const UID = { lider: 'u-lider', joao: 'u-joao', carla: 'u-carla' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const DB = { dados: null, arquivos: new Map(), urls: new Map(), canais: new Set() };

function hojeMais(d) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
const retangulo = (x0, y0, x1, y1) => [em(x0, y1), em(x1, y1), em(x1, y0), em(x0, y0)];

// ---------------------------------------------------------------------
// Imagens de exemplo (ofício e foto) desenhadas na hora
// ---------------------------------------------------------------------
function canvasParaBlob(c, tipo, q) {
  return new Promise((ok) => c.toBlob(ok, tipo, q));
}

async function gerarOficio() {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 1200;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 1200);
  g.fillStyle = '#1f3a6b'; g.fillRect(0, 0, 900, 14);
  g.fillStyle = '#1d2433';
  g.font = 'bold 30px Arial'; g.fillText('SECRETARIA MUNICIPAL DE INFRAESTRUTURA', 80, 110);
  g.font = '22px Arial'; g.fillText('Departamento de Iluminação Pública', 80, 148);
  g.font = 'bold 34px Arial'; g.fillText('OFÍCIO Nº 0043/2026', 80, 250);
  g.font = '24px Arial';
  const linhas = [
    'Assunto: levantamento da iluminação pública — trecho central',
    '',
    'Solicitamos o levantamento de todos os pontos de iluminação',
    'do trecho indicado no mapa anexo, com registro fotográfico',
    'e anotação das luminárias apagadas, braços danificados e',
    'postes sem identificação.',
    '',
    'Prazo para retorno: 5 (cinco) dias úteis.',
    '',
    'Atenciosamente,',
    '',
    '',
    '______________________________',
    'Coordenação de Iluminação Pública',
  ];
  linhas.forEach((l, i) => g.fillText(l, 80, 340 + i * 42));
  g.save();
  g.translate(450, 700); g.rotate(-0.5);
  g.font = 'bold 64px Arial'; g.fillStyle = 'rgba(200,40,30,.13)'; g.textAlign = 'center';
  g.fillText('EXEMPLO — TREINAMENTO', 0, 0);
  g.restore();
  return canvasParaBlob(c, 'image/png');
}

async function gerarFoto() {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  const g = c.getContext('2d');
  const ceu = g.createLinearGradient(0, 0, 0, 600);
  ceu.addColorStop(0, '#0b1424'); ceu.addColorStop(1, '#2a3346');
  g.fillStyle = ceu; g.fillRect(0, 0, 800, 600);
  g.fillStyle = '#3a3f4a'; g.fillRect(0, 480, 800, 120);
  const luz = g.createRadialGradient(470, 160, 10, 470, 160, 260);
  luz.addColorStop(0, 'rgba(255,240,200,.55)'); luz.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = luz; g.fillRect(0, 0, 800, 600);
  g.strokeStyle = '#c9ccd3'; g.lineWidth = 18; g.lineCap = 'round';
  g.beginPath(); g.moveTo(300, 560); g.lineTo(300, 180); g.quadraticCurveTo(300, 130, 360, 128); g.lineTo(470, 140); g.stroke();
  g.fillStyle = '#e8eaee'; g.beginPath(); g.ellipse(480, 145, 55, 16, 0.05, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 22px Arial';
  g.fillText('Foto de exemplo', 24, 40);
  return canvasParaBlob(c, 'image/jpeg', 0.85);
}

// ---------------------------------------------------------------------
// Dados de exemplo
// ---------------------------------------------------------------------
async function semear() {
  DB.urls.forEach((u) => URL.revokeObjectURL(u));
  DB.urls.clear();
  DB.arquivos.clear();
  DB.canais.clear();
  const agora = Date.now();
  const iso = (min) => new Date(agora - min * 60000).toISOString();
  const t1 = 't-centro'; const t2 = 't-praca'; const t3 = 't-quadra4';
  DB.dados = {
    perfis: [
      { id: UID.lider, nome: 'Alex (líder)', email: 'alex@exemplo.com', papel: 'lider', criado_em: iso(9000) },
      { id: UID.joao, nome: 'João Motoqueiro', email: 'joao@exemplo.com', papel: 'motoqueiro', criado_em: iso(8000) },
      { id: UID.carla, nome: 'Carla Souza', email: 'carla@exemplo.com', papel: 'motoqueiro', criado_em: iso(7000) },
    ],
    convites: [{ email: 'pedro@exemplo.com', papel: 'motoqueiro', convidado_por: UID.lider, criado_em: iso(90), usado_em: null }],
    tarefas: [
      {
        id: t1, titulo: 'Av. do Centro — trecho principal',
        descricao: 'Levantar todos os postes do trecho. Anotar luminárias apagadas e braços tortos.',
        prazo: hojeMais(3), area: retangulo(-150, -80, 150, 80), motoqueiro_id: UID.joao, status: 'em_andamento',
        criado_por: UID.lider, criado_em: iso(300),
        oficio_path: `${t1}/oficio-0043-2026.png`, oficio_nome: 'Ofício 0043-2026.png', oficio_tipo: 'image/png',
      },
      {
        id: t2, titulo: 'Rua do Porto — praça', descricao: 'Conferir a iluminação da praça e das calçadas em volta.',
        prazo: hojeMais(8), area: retangulo(-120, 150, 120, 330), motoqueiro_id: UID.joao, status: 'pendente',
        criado_por: UID.lider, criado_em: iso(200),
      },
      {
        id: t3, titulo: 'Rua Tarumã — quadra 4', descricao: '', prazo: hojeMais(-2),
        area: retangulo(120, -300, 320, -140), motoqueiro_id: UID.carla, status: 'concluido',
        criado_por: UID.lider, criado_em: iso(5000),
      },
    ],
    pontos: [
      { id: 'p-1', tarefa_id: t1, lat: em(-70, 11)[0], lng: em(-70, 11)[1], tamanho_m: 2.5, rotacao: 180, observacoes: 'Luminária apagada', fora_da_area: false, criado_por: UID.joao, criado_em: iso(40), atualizado_em: iso(40) },
      { id: 'p-2', tarefa_id: t1, lat: em(35, -11)[0], lng: em(35, -11)[1], tamanho_m: 2.5, rotacao: 0, observacoes: '', fora_da_area: false, criado_por: UID.joao, criado_em: iso(30), atualizado_em: iso(30) },
      ...[-260, -200, -150].map((y, i) => ({
        id: `p-q${i}`, tarefa_id: t3, lat: em(211, y)[0], lng: em(211, y)[1], tamanho_m: 2.5, rotacao: 270,
        observacoes: i === 1 ? 'Braço torto' : '', fora_da_area: false, criado_por: UID.carla, criado_em: iso(3000 - i), atualizado_em: iso(3000 - i),
      })),
    ],
    fotos: [{ id: 'f-1', ponto_id: 'p-1', tarefa_id: t1, path: `${t1}/p-1/f-1.jpg`, criado_por: UID.joao, criado_em: iso(39) }],
  };
  DB.arquivos.set(`oficios/${t1}/oficio-0043-2026.png`, await gerarOficio());
  DB.arquivos.set(`fotos/${t1}/p-1/f-1.jpg`, await gerarFoto());
}

// ---------------------------------------------------------------------
// "Supabase" de mentira, com as mesmas regras de acesso do banco real
// ---------------------------------------------------------------------
function notificar(tabela, evento, linha) {
  DB.canais.forEach((c) => {
    if (!c.inst.vivo || !c.inst.online) return;
    c.subs.filter((s) => s.t === tabela).forEach((s) => setTimeout(() => s.fn({
      eventType: evento, new: evento === 'DELETE' ? {} : structuredClone(linha), old: { id: linha.id },
    }), 30));
  });
}

function apagarEmCascata(tabela, linha) {
  const d = DB.dados;
  d[tabela] = d[tabela].filter((r) => r !== linha);
  notificar(tabela, 'DELETE', linha);
  if (tabela === 'tarefas') {
    d.pontos.filter((p) => p.tarefa_id === linha.id).forEach((p) => apagarEmCascata('pontos', p));
  }
  if (tabela === 'pontos') {
    d.fotos.filter((f) => f.ponto_id === linha.id).forEach((f) => apagarEmCascata('fotos', f));
  }
}

function criarSb(inst) {
  const semRede = { data: null, error: { message: 'Failed to fetch' } };
  const negado = { data: null, error: { message: 'new row violates row-level security policy' } };
  const papel = () => DB.dados.perfis.find((p) => p.id === inst.uid)?.papel;
  const ativo = () => papel() && papel() !== 'bloqueado';
  const tarefaMinha = (tid) => ativo() && DB.dados.tarefas.some((t) => t.id === tid && t.motoqueiro_id === inst.uid);
  const podeVer = (t, r) => {
    const p = papel();
    if (p === 'lider') return true;
    if (t === 'perfis') return ativo() || r.id === inst.uid;
    if (t === 'tarefas') return ativo() && r.motoqueiro_id === inst.uid;
    if (t === 'pontos' || t === 'fotos') return tarefaMinha(r.tarefa_id);
    return false;
  };
  const podeEscrever = (t, r) => {
    if (papel() === 'lider') return true;
    if (t === 'pontos' || t === 'fotos') return tarefaMinha(r.tarefa_id);
    return false;
  };
  const chave = (t) => (t === 'convites' ? 'email' : 'id');

  class Consulta {
    constructor(t) { this.t = t; this.op = 'select'; this.f = []; }
    select() { return this; }
    eq(c, v) { this.f.push((r) => r[c] === v); return this; }
    is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
    order(c, o) { this.ord = [c, o?.ascending !== false]; return this; }
    limit() { return this; }
    maybeSingle() { this.um = 'maybe'; return this; }
    single() { this.um = 'single'; return this; }
    insert(v) { this.op = 'insert'; this.v = v; return this; }
    upsert(v) { this.op = 'upsert'; this.v = v; return this; }
    update(v) { this.op = 'update'; this.v = v; return this; }
    delete() { this.op = 'delete'; return this; }
    then(a, b) { return this.rodar().then(a, b); }
    async rodar() {
      await espera(this.op === 'select' ? 60 : 140);
      if (!inst.online) return semRede;
      try { return this.exec(); } catch (e) { return { data: null, error: { message: e.message } }; }
    }
    fim(rs) {
      if (this.um === 'single') return rs.length === 1 ? { data: rs[0], error: null } : { data: null, error: { message: 'Registro não encontrado' } };
      if (this.um === 'maybe') return { data: rs[0] ?? null, error: null };
      return { data: rs, error: null };
    }
    exec() {
      const t = this.t;
      const tab = DB.dados[t];
      const agora = new Date().toISOString();
      const filtrados = () => tab.filter((r) => podeVer(t, r) && this.f.every((f) => f(r)));
      if (this.op === 'select') {
        const rs = filtrados();
        if (this.ord) {
          const [c, asc] = this.ord;
          rs.sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? '')) * (asc ? 1 : -1));
        }
        return this.fim(rs.map((r) => structuredClone(r)));
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        const k = chave(t);
        const saida = [];
        for (const v0 of (Array.isArray(this.v) ? this.v : [this.v])) {
          const v = { ...v0 };
          if (t === 'convites') v.email = String(v.email).toLowerCase();
          const atual = tab.find((r) => r[k] === v[k]);
          if (!podeEscrever(t, atual ? { ...atual, ...v } : v)) return negado;
          if (atual && this.op === 'upsert') {
            Object.assign(atual, v, t === 'pontos' ? { atualizado_em: agora } : {});
            saida.push(atual);
            notificar(t, 'UPDATE', atual);
          } else if (atual) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
          } else {
            const novo = {
              ...(t === 'convites' ? {} : { id: crypto.randomUUID() }),
              criado_em: agora,
              ...(t === 'tarefas' ? { status: 'pendente', descricao: '', criado_por: inst.uid } : {}),
              ...(t === 'pontos' ? { atualizado_em: agora, criado_por: inst.uid } : {}),
              ...(t === 'convites' ? { convidado_por: inst.uid, usado_em: null } : {}),
              ...v,
            };
            tab.push(novo);
            saida.push(novo);
            notificar(t, 'INSERT', novo);
          }
        }
        return this.fim(saida.map((r) => structuredClone(r)));
      }
      if (this.op === 'update') {
        const alvo = filtrados();
        if (alvo.some((r) => !podeEscrever(t, r))) return negado;
        if (t === 'perfis' && this.v.papel && this.v.papel !== 'lider'
          && !DB.dados.perfis.some((p) => p.papel === 'lider' && !alvo.includes(p))) {
          return { data: null, error: { message: 'A equipe precisa de pelo menos um líder.' } };
        }
        alvo.forEach((r) => { Object.assign(r, this.v); notificar(t, 'UPDATE', r); });
        return this.fim(alvo.map((r) => structuredClone(r)));
      }
      if (this.op === 'delete') {
        const alvo = filtrados();
        if (alvo.some((r) => !podeEscrever(t, r))) return negado;
        alvo.forEach((r) => apagarEmCascata(t, r));
        return this.fim([]);
      }
      return { data: null, error: { message: 'operação desconhecida' } };
    }
  }

  const sessao = () => ({ user: { id: inst.uid, email: DB.dados.perfis.find((p) => p.id === inst.uid)?.email } });

  return {
    from: (t) => new Consulta(t),
    storage: {
      from(bucket) {
        const k = (p) => `${bucket}/${p}`;
        return {
          async upload(path, blob) {
            await espera(220);
            if (!inst.online) return semRede;
            DB.arquivos.set(k(path), blob);
            if (DB.urls.has(k(path))) { URL.revokeObjectURL(DB.urls.get(k(path))); DB.urls.delete(k(path)); }
            return { data: { path }, error: null };
          },
          async download(path) {
            await espera(120);
            if (!inst.online) return semRede;
            const b = DB.arquivos.get(k(path));
            return b ? { data: b, error: null } : { data: null, error: { message: 'Arquivo não encontrado' } };
          },
          async remove(paths) {
            paths.forEach((p) => DB.arquivos.delete(k(p)));
            return { data: [], error: null };
          },
          async createSignedUrls(paths) {
            if (!inst.online) return semRede;
            return {
              data: paths.map((p) => {
                const b = DB.arquivos.get(k(p));
                if (!b) return { path: p, signedUrl: null };
                if (!DB.urls.has(k(p))) DB.urls.set(k(p), URL.createObjectURL(b));
                return { path: p, signedUrl: DB.urls.get(k(p)) };
              }),
              error: null,
            };
          },
        };
      },
    },
    auth: {
      async getSession() { return { data: { session: inst.logado ? sessao() : null } }; },
      onAuthStateChange(cb) {
        inst.cbAuth = cb;
        setTimeout(() => cb('INITIAL_SESSION', inst.logado ? sessao() : null), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut() { inst.logado = false; inst.cbAuth?.('SIGNED_OUT', null); return { error: null }; },
      async signInWithPassword() {
        await espera(200);
        inst.logado = true;
        setTimeout(() => inst.cbAuth?.('SIGNED_IN', sessao()), 0);
        return { data: { session: sessao() }, error: null };
      },
      async signUp() {
        return { data: null, error: { message: 'Na demonstração não dá para criar conta. Use "Entrar" com qualquer senha.' } };
      },
    },
    channel(nome) {
      return {
        nome, inst, subs: [],
        on(_ev, cfg, fn) { this.subs.push({ t: cfg.table, fn }); return this; },
        subscribe() { DB.canais.add(this); return this; },
      };
    },
    removeChannel(c) { DB.canais.delete(c); },
  };
}

// ---------------------------------------------------------------------
// Mapa ilustrativo (as páginas publicadas não carregam mapas de fora)
// ---------------------------------------------------------------------
const RUAS_LO = [[-440, 'Av. Sete Rios'], [-220, 'Rua das Mangueiras'], [0, 'Av. do Centro'], [220, 'Rua do Porto'], [440, 'Rua Boa Vista']];
const RUAS_NS = [[-420, 'Rua Japurá'], [-210, 'Rua Ipiranga'], [0, 'Rua da Matriz'], [210, 'Rua Tarumã'], [420, 'Rua Ajuricaba']];
const MEIA_RUA = 8;
const EXT = 620;

function desenharCidadeFalsa(mapa) {
  const opc = { interactive: false, bubblingMouseEvents: true };
  const xs = [-EXT, ...RUAS_NS.map((r) => r[0]), EXT];
  const ys = [-EXT, ...RUAS_LO.map((r) => r[0]), EXT];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + MEIA_RUA + 4; const x1 = xs[i + 1] - MEIA_RUA - 4;
      const y0 = ys[j] + MEIA_RUA + 4; const y1 = ys[j + 1] - MEIA_RUA - 4;
      const praca = xs[i] === 0 && ys[j] === 220;
      L.polygon(retangulo(x0, y0, x1, y1), {
        ...opc, stroke: false, fillOpacity: 1, fillColor: praca ? '#cfe3bf' : '#e3d9c1',
      }).addTo(mapa);
      if (!praca) {
        // lotes (desenho simples)
        for (let x = x0 + 6; x < x1 - 20; x += 38) {
          L.polygon(retangulo(x, y0 + 6, x + 30, y0 + 30), { ...opc, stroke: false, fillOpacity: 1, fillColor: '#d8ccb0' }).addTo(mapa);
          L.polygon(retangulo(x, y1 - 30, x + 30, y1 - 6), { ...opc, stroke: false, fillOpacity: 1, fillColor: '#d8ccb0' }).addTo(mapa);
        }
      } else {
        L.circle(em((x0 + x1) / 2, (y0 + y1) / 2), { ...opc, radius: 30, color: '#9cc38a', weight: 2, fillColor: '#b9d8a6', fillOpacity: 1 }).addTo(mapa);
      }
    }
  }
  const rua = { ...opc, color: '#cfc3a6', weight: 1, fillColor: '#fbf8f1', fillOpacity: 1 };
  RUAS_LO.forEach(([y]) => L.polygon(retangulo(-EXT, y - MEIA_RUA, EXT, y + MEIA_RUA), rua).addTo(mapa));
  RUAS_NS.forEach(([x]) => L.polygon(retangulo(x - MEIA_RUA, -EXT, x + MEIA_RUA, EXT), rua).addTo(mapa));
  const rotulo = (pos, txt, girar) => L.marker(pos, {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'rotulo-rua', iconSize: [0, 0], html: `<span style="${girar ? 'transform:translate(-50%,-50%) rotate(-90deg)' : ''}">${txt}</span>` }),
  }).addTo(mapa);
  RUAS_LO.forEach(([y, n]) => { [-315, 105].forEach((x) => rotulo(em(x, y), n, false)); });
  RUAS_NS.forEach(([x, n]) => { [-330, 110].forEach((y) => rotulo(em(x, y), n, true)); });
  rotulo(em(0, 330), 'Praça', false);
}

// GPS simulado: anda pela Av. do Centro, entrando e saindo da área.
function criarGeo(inst) {
  return {
    watchPosition(ok) {
      let passo = 0;
      const emitir = () => {
        if (!inst.vivo) return;
        const ciclo = 48;
        const k = passo % ciclo;
        const f = k < ciclo / 2 ? k / (ciclo / 2) : 2 - k / (ciclo / 2);
        const [lat, lng] = em(-230 + f * 460, 3);
        passo += 1;
        ok({ coords: { latitude: lat, longitude: lng, accuracy: 6 } });
      };
      setTimeout(emitir, 300);
      const id = setInterval(emitir, 1500);
      inst.timers.push(id);
      return id;
    },
    clearWatch(id) { clearInterval(id); },
  };
}

function memoria() {
  const s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
  };
}

// ---------------------------------------------------------------------
// Uma cópia do app dentro de um elemento da página
// ---------------------------------------------------------------------
function criarApp(raiz, inst) {
  raiz.innerHTML = '<header id="topo" class="topo" hidden></header><main id="tela" class="tela"></main><div id="modal" class="modal"></div><div id="aviso" class="aviso" role="status" aria-live="polite"></div>';
  inst.timers = [];
  inst.vivo = true;
  const docReal = globalThis.document;
  const winReal = globalThis;
  const eventos = {};
  inst.emitir = (ev) => (eventos[ev] || []).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  /* eslint-disable no-shadow, no-unused-vars */
  const setInterval = (fn, ms) => {
    const id = winReal.setInterval(() => { if (inst.vivo) fn(); }, ms);
    inst.timers.push(id);
    return id;
  };
  const window = {
    addEventListener(ev, fn) { (eventos[ev] ||= []).push(fn); },
    removeEventListener() {},
    scrollTo() { raiz.scrollTop = 0; },
    confirm: () => true,
    RONDALUZ_CONFIG: { SUPABASE_URL: 'https://demonstracao.supabase.co', SUPABASE_ANON_KEY: 'modo-treinamento-sem-banco-real' },
    supabase: { createClient: () => criarSb(inst) },
  };
  let hash = '';
  const location = {
    get hash() { return hash; },
    set hash(v) { hash = v; setTimeout(() => inst.emitir('hashchange'), 0); },
    host: 'rondaluz.netlify.app',
  };
  const document = {
    getElementById: (id) => raiz.querySelector(`#${id}`),
    querySelector: (s) => raiz.querySelector(s),
    querySelectorAll: (s) => raiz.querySelectorAll(s),
    createElement: (t) => docReal.createElement(t),
    get activeElement() { return docReal.activeElement; },
    body: raiz,
    addEventListener() {},
    hidden: false,
  };
  const navigator = { get onLine() { return inst.online; }, geolocation: criarGeo(inst) };
  const localStorage = memoria();
  const sessionStorage = memoria();

  raiz.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && raiz.contains(a)) { e.preventDefault(); location.hash = a.getAttribute('href'); }
  }, true);

  /*MODULOS*/
}

function destruirApp(inst, raiz) {
  if (!inst) return;
  inst.vivo = false;
  (inst.timers || []).forEach((id) => clearInterval(id));
  DB.canais.forEach((c) => { if (c.inst === inst) DB.canais.delete(c); });
  raiz.innerHTML = '';
}
