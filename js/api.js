// Conexão com o Supabase e as consultas do app.

const cfg = window.RONDALUZ_CONFIG || {};
export const configurado = /^https:\/\//.test(cfg.SUPABASE_URL || '') && (cfg.SUPABASE_ANON_KEY || '').length > 20;

export const sb = configurado && window.supabase
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rondaluz-sessao' },
  })
  : null;

function ok({ data, error }) {
  if (error) throw error;
  return data;
}

export const api = {
  // ---- acesso
  async sessao() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  entrar: (email, senha) => sb.auth.signInWithPassword({ email, password: senha }).then(ok),
  criarConta: (nome, email, senha) => sb.auth.signUp({
    email, password: senha, options: { data: { nome } },
  }).then(ok),
  sair: () => sb.auth.signOut(),

  // ---- perfis
  meuPerfil: (id) => sb.from('perfis').select('*').eq('id', id).maybeSingle().then(ok),
  equipe: () => sb.from('perfis').select('*').order('nome').then(ok),
  mudarPapel: (id, papel) => sb.from('perfis').update({ papel }).eq('id', id).then(ok),

  // ---- tarefas
  tarefas: () => sb.from('tarefas').select('*').order('criado_em', { ascending: false }).then(ok),
  tarefa: (id) => sb.from('tarefas').select('*').eq('id', id).maybeSingle().then(ok),
  criarTarefa: (t) => sb.from('tarefas').insert(t).select().single().then(ok),
  alterarTarefa: (id, campos) => sb.from('tarefas').update(campos).eq('id', id).then(ok),
  excluirTarefa: (id) => sb.from('tarefas').delete().eq('id', id).then(ok),
  contarPontos: () => sb.from('pontos').select('tarefa_id').then(ok),

  // ---- pontos e fotos
  pontos: (tarefaId) => sb.from('pontos').select('*').eq('tarefa_id', tarefaId).order('criado_em').then(ok),
  fotos: (tarefaId) => sb.from('fotos').select('*').eq('tarefa_id', tarefaId).order('criado_em').then(ok),

  // ---- arquivos
  async enviarOficio(tarefaId, arquivo, nomeSeguro) {
    const path = `${tarefaId}/${nomeSeguro}`;
    ok(await sb.storage.from('oficios').upload(path, arquivo, {
      upsert: true, contentType: arquivo.type || 'application/octet-stream',
    }));
    return path;
  },
  baixarOficio: (path) => sb.storage.from('oficios').download(path).then(ok),
  async urlsFotos(paths) {
    if (!paths.length) return {};
    const data = ok(await sb.storage.from('fotos').createSignedUrls(paths, 3600));
    const mapa = {};
    data.forEach((d) => { if (d.signedUrl) mapa[d.path] = d.signedUrl; });
    return mapa;
  },
  async apagarArquivosTarefa(tarefaId, oficioPath) {
    try {
      if (oficioPath) await sb.storage.from('oficios').remove([oficioPath]);
      const fotos = await this.fotos(tarefaId);
      if (fotos.length) await sb.storage.from('fotos').remove(fotos.map((f) => f.path));
    } catch { /* arquivos órfãos não impedem a exclusão */ }
  },

  // ---- tempo real
  ouvir(nome, tabelas, aoMudar) {
    const canal = sb.channel(nome);
    tabelas.forEach(({ tabela, filtro }) => {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela, ...(filtro ? { filter: filtro } : {}) },
        (p) => aoMudar(tabela, p));
    });
    canal.subscribe();
    return () => sb.removeChannel(canal);
  },
};
