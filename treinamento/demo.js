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
      { id: UID.joao, nome: 'João Motoqueiro', email: 're010@motoqueiro.rondaluz.app', re: '010', papel: 'motoqueiro', criado_em: iso(8000) },
      { id: UID.carla, nome: 'Carla Souza', email: 're011@motoqueiro.rondaluz.app', re: '011', papel: 'motoqueiro', criado_em: iso(7000) },
    ],
    convites: [{ email: 're012@motoqueiro.rondaluz.app', re: '012', nome: 'Pedro Lima', papel: 'motoqueiro', convidado_por: UID.lider, criado_em: iso(90), usado_em: null }],
    credenciais: {
      '010': { pin: '4821', segredo: 'segredo-joao', tentativas: 0, bloqueadoAte: 0, zerado: false },
      '011': { pin: '7392', segredo: 'segredo-carla', tentativas: 0, bloqueadoAte: 0, zerado: false },
    },
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
      { id: 'p-1', tarefa_id: t1, lat: em(-70, 11)[0], lng: em(-70, 11)[1], tamanho_m: 2.5, rotacao: 180, plaqueta: 'MN-04521', observacoes: 'Luminária apagada', fora_da_area: false, criado_por: UID.joao, criado_em: iso(40), atualizado_em: iso(40) },
      { id: 'p-2', tarefa_id: t1, lat: em(35, -11)[0], lng: em(35, -11)[1], tamanho_m: 2.5, rotacao: 0, plaqueta: '', observacoes: '', fora_da_area: false, criado_por: UID.joao, criado_em: iso(30), atualizado_em: iso(30) },
      ...[-260, -200, -150].map((y, i) => ({
        id: `p-q${i}`, tarefa_id: t3, lat: em(211, y)[0], lng: em(211, y)[1], tamanho_m: 2.5, rotacao: 270,
        observacoes: i === 1 ? 'Braço torto' : '', fora_da_area: false, criado_por: UID.carla, criado_em: iso(3000 - i), atualizado_em: iso(3000 - i),
      })),
    ],
    redes: [
      { id: 'r-1', tarefa_id: t1, tipo: 'secundaria', situacao: 'existente', pontos: [em(-70, 11), em(35, -11)].map((p) => [...p]), observacoes: '', criado_por: UID.joao, criado_em: iso(25), atualizado_em: iso(25) },
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
    d.redes.filter((r) => r.tarefa_id === linha.id).forEach((r) => apagarEmCascata('redes', r));
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
    if (t === 'pontos' || t === 'fotos' || t === 'redes') return tarefaMinha(r.tarefa_id);
    return false;
  };
  const podeEscrever = (t, r) => {
    if (papel() === 'lider') return true;
    if (t === 'pontos' || t === 'fotos' || t === 'redes') return tarefaMinha(r.tarefa_id);
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
            Object.assign(atual, v, t === 'pontos' || t === 'redes' ? { atualizado_em: agora } : {});
            saida.push(atual);
            notificar(t, 'UPDATE', atual);
          } else if (atual) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
          } else {
            const novo = {
              ...(t === 'convites' ? {} : { id: crypto.randomUUID() }),
              criado_em: agora,
              ...(t === 'tarefas' ? { status: 'pendente', descricao: '', criado_por: inst.uid } : {}),
              ...(t === 'pontos' || t === 'redes' ? { atualizado_em: agora, criado_por: inst.uid } : {}),
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

  const erro = (message) => ({ data: null, error: { message } });
  const pinFraco = (p) => !/^[0-9]{4}$/.test(p) || /^(.)\1{3}$/.test(p) || '01234567890'.includes(p) || '09876543210'.includes(p)
    || ['1212', '2121', '1122', '2580', '0852', '1010', '6969', '1313', '2020', '2323'].includes(p);
  function consultarRe(re) {
    const d = DB.dados;
    const p = d.perfis.find((x) => x.re === re);
    if (p) {
      if (p.papel === 'bloqueado') return { estado: 'sem_acesso' };
      const c = d.credenciais[re];
      if (!c || c.zerado || !c.pin) return { estado: 'criar_pin', nome: p.nome };
      return { estado: 'ativo', nome: p.nome.split(' ')[0] };
    }
    const cv = d.convites.find((x) => x.re === re && !x.usado_em);
    return cv ? { estado: 'criar_pin', nome: cv.nome, novo: true } : { estado: 'inexistente' };
  }

  async function rpc(nome, args) {
    await espera(120);
    if (!inst.online) return semRede;
    const d = DB.dados;
    if (nome === 'consultar_re') return { data: consultarRe(args.p_re), error: null };
    if (nome === 'criar_pin') {
      const info = consultarRe(args.p_re);
      if (info.estado !== 'criar_pin') return erro('Este RE já tem PIN. Use "Entrar" ou peça ao líder para zerar.');
      if (pinFraco(args.p_pin)) return erro('Esse PIN é fácil de adivinhar. Escolha outro.');
      const segredo = crypto.randomUUID();
      d.credenciais[args.p_re] = { pin: args.p_pin, segredo, tentativas: 0, bloqueadoAte: 0, zerado: false };
      const p = d.perfis.find((x) => x.re === args.p_re);
      if (p) return { data: { email: p.email, segredo, nova_conta: false }, error: null };
      return { data: { email: `re${args.p_re}@motoqueiro.rondaluz.app`, segredo, nova_conta: true, nome: info.nome }, error: null };
    }
    if (nome === 'entrar_re') {
      const c = d.credenciais[args.p_re];
      const p = d.perfis.find((x) => x.re === args.p_re);
      if (!c || !p || !c.pin || c.zerado) return erro('RE ou PIN incorretos.');
      if (p.papel === 'bloqueado') return erro('Seu acesso foi removido. Fale com o líder.');
      if (c.bloqueadoAte > Date.now()) return erro(`Muitas tentativas erradas. Tente de novo em ${Math.ceil((c.bloqueadoAte - Date.now()) / 60000)} minuto(s) ou peça ao líder para zerar o PIN.`);
      if (c.pin !== args.p_pin) {
        c.tentativas += 1;
        if (c.tentativas >= 5) { c.bloqueadoAte = Date.now() + 15 * 60000; return erro('PIN errado 5 vezes. RE bloqueado por 15 minutos.'); }
        return erro(`PIN incorreto. Restam ${5 - c.tentativas} tentativa(s).`);
      }
      c.tentativas = 0; c.bloqueadoAte = 0;
      return { data: { email: p.email, segredo: c.segredo }, error: null };
    }
    if (nome === 'zerar_pin') {
      if (papel() !== 'lider') return erro('Só o líder pode zerar PIN.');
      const p = d.perfis.find((x) => x.id === args.p_perfil);
      if (!p?.re) return erro('Esta pessoa não entra por RE.');
      d.credenciais[p.re] = { pin: null, segredo: crypto.randomUUID(), tentativas: 0, bloqueadoAte: 0, zerado: true };
      return { data: null, error: null };
    }
    const t = DB.dados.tarefas.find((x) => x.id === args.t);
    if (!t) return { data: null, error: { message: 'Tarefa não encontrada' } };
    if (nome === 'finalizar_tarefa') {
      if (!tarefaMinha(t.id)) return { data: null, error: { message: 'Esta tarefa não é sua.' } };
      Object.assign(t, { finalizada_em: new Date().toISOString(), finalizacao_obs: args.obs || '' });
      if (t.status === 'pendente') t.status = 'em_andamento';
      notificar('tarefas', 'UPDATE', t);
    } else if (nome === 'iniciar_tarefa') {
      if ((tarefaMinha(t.id) || papel() === 'lider') && t.status === 'pendente') {
        t.status = 'em_andamento';
        notificar('tarefas', 'UPDATE', t);
      }
    }
    return { data: null, error: null };
  }

  return {
    rpc,
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
      async signInWithPassword({ email, password }) {
        await espera(200);
        const p = DB.dados.perfis.find((x) => x.email === String(email).toLowerCase());
        if (!p) return { data: null, error: { message: 'Invalid login credentials' } };
        if (p.re && DB.dados.credenciais[p.re]?.segredo !== password) return { data: null, error: { message: 'Invalid login credentials' } };
        inst.uid = p.id;
        inst.logado = true;
        setTimeout(() => inst.cbAuth?.('SIGNED_IN', sessao()), 0);
        return { data: { session: sessao() }, error: null };
      },
      async signUp({ email, options }) {
        await espera(200);
        const e = String(email).toLowerCase();
        const cv = DB.dados.convites.find((x) => x.email === e && !x.usado_em);
        if (!cv) return { data: null, error: { message: 'RONDALUZ_SEM_CONVITE' } };
        cv.usado_em = new Date().toISOString();
        const p = { id: crypto.randomUUID(), nome: cv.nome || options?.data?.nome || e.split('@')[0], email: e, re: cv.re || null, papel: cv.papel, criado_em: new Date().toISOString() };
        DB.dados.perfis.push(p);
        notificar('perfis', 'INSERT', p);
        inst.uid = p.id;
        inst.logado = true;
        setTimeout(() => inst.cbAuth?.('SIGNED_IN', sessao()), 0);
        return { data: { session: sessao() }, error: null };
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

// Mesmo mapa ilustrativo, desenhado no canvas do relatório.
function desenharFundoRelatorio(g, P, W, H) {
  g.fillStyle = '#efe7d4';
  g.fillRect(0, 0, W, H);
  const ret = (x0, y0, x1, y1, cor) => {
    const pts = retangulo(x0, y0, x1, y1).map(([la, ln]) => P(la, ln));
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = cor; g.fill();
  };
  const xs = [-EXT, ...RUAS_NS.map((r) => r[0]), EXT];
  const ys = [-EXT, ...RUAS_LO.map((r) => r[0]), EXT];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const praca = xs[i] === 0 && ys[j] === 220;
      ret(xs[i] + MEIA_RUA + 4, ys[j] + MEIA_RUA + 4, xs[i + 1] - MEIA_RUA - 4, ys[j + 1] - MEIA_RUA - 4, praca ? '#cfe3bf' : '#e3d9c1');
    }
  }
  RUAS_LO.forEach(([y]) => ret(-EXT, y - MEIA_RUA, EXT, y + MEIA_RUA, '#fbf8f1'));
  RUAS_NS.forEach(([x]) => ret(x - MEIA_RUA, -EXT, x + MEIA_RUA, EXT, '#fbf8f1'));
  g.font = 'bold 15px Arial'; g.fillStyle = '#8d8168'; g.textAlign = 'center'; g.textBaseline = 'middle';
  RUAS_LO.forEach(([y, n]) => { [-315, 105].forEach((x) => { const [a, b] = P(...em(x, y)); if (a > 0 && a < W && b > 0 && b < H) g.fillText(n.toUpperCase(), a, b); }); });
  RUAS_NS.forEach(([x, n]) => {
    [-110, 110].forEach((y) => {
      const [a, b] = P(...em(x, y));
      if (a > 0 && a < W && b > 0 && b < H) { g.save(); g.translate(a, b); g.rotate(-Math.PI / 2); g.fillText(n.toUpperCase(), 0, 0); g.restore(); }
    });
  });
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
    open: () => null, // o visualizador não abre abas: o relatório aparece numa janela dentro da página
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
  M.relatorio.opcoesRelatorio.desenharFundo = desenharFundoRelatorio;
  inst.M = M;
}

function destruirApp(inst, raiz) {
  if (!inst) return;
  inst.vivo = false;
  (inst.timers || []).forEach((id) => clearInterval(id));
  DB.canais.forEach((c) => { if (c.inst === inst) DB.canais.delete(c); });
  raiz.innerHTML = '';
}
