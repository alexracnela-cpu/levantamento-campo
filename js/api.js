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
  async sair() {
    // tira este aparelho da lista de avisos antes de sair (outra pessoa pode entrar nele)
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const insc = reg && reg.pushManager && await reg.pushManager.getSubscription();
      if (insc) await sb.from('push_inscricoes').delete().eq('endpoint', insc.endpoint);
    } catch { /* sem internet: a função apaga inscrições velhas sozinha */ }
    return sb.auth.signOut();
  },
  registrarPush: (endpoint, p256dh, auth) =>
    sb.rpc('registrar_push', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }).then(ok),

  // ---- motoqueiro: RE + PIN
  consultarRe: (re) => sb.rpc('consultar_re', { p_re: re }).then(ok),
  async entrarRe(re, pin) {
    const r = ok(await sb.rpc('entrar_re', { p_re: re, p_pin: pin }));
    return ok(await sb.auth.signInWithPassword({ email: r.email, password: r.segredo }));
  },
  async criarPinEEntrar(re, pin) {
    const r = ok(await sb.rpc('criar_pin', { p_re: re, p_pin: pin }));
    if (r.nova_conta) {
      return ok(await sb.auth.signUp({ email: r.email, password: r.segredo, options: { data: { nome: r.nome } } }));
    }
    return ok(await sb.auth.signInWithPassword({ email: r.email, password: r.segredo }));
  },
  zerarPin: (perfilId) => sb.rpc('zerar_pin', { p_perfil: perfilId }).then(ok),
  cadastrarMotoqueiro: (nome, re) => sb.from('convites').upsert({
    email: `re${re}@motoqueiro.rondaluz.app`, papel: 'motoqueiro', nome: nome.trim(), re, usado_em: null,
  }, { onConflict: 'email' }).then(ok),

  // ---- perfis
  meuPerfil: (id) => sb.from('perfis').select('*').eq('id', id).maybeSingle().then(ok),
  equipe: () => sb.from('perfis').select('*').order('nome').then(ok),
  mudarPapel: (id, papel) => sb.from('perfis').update({ papel }).eq('id', id).then(ok),

  // ---- convites (só líder)
  convites: () => sb.from('convites').select('*').is('usado_em', null).order('criado_em', { ascending: false }).then(ok),
  convidar: (email, papel) => sb.from('convites').upsert({ email: email.trim().toLowerCase(), papel, usado_em: null }, { onConflict: 'email' }).then(ok),
  cancelarConvite: (email) => sb.from('convites').delete().eq('email', email).then(ok),

  // ---- tarefas
  tarefas: () => sb.from('tarefas').select('*').order('criado_em', { ascending: false }).then(ok),
  tarefa: (id) => sb.from('tarefas').select('*').eq('id', id).maybeSingle().then(ok),
  criarTarefa: (t) => sb.from('tarefas').insert(t).select().single().then(ok),
  alterarTarefa: (id, campos) => sb.from('tarefas').update(campos).eq('id', id).then(ok),
  devolverTarefa: (id) => sb.from('tarefas').update({ finalizada_em: null, finalizacao_obs: '' }).eq('id', id).then(ok),
  excluirTarefa: (id) => sb.from('tarefas').delete().eq('id', id).then(ok),
  contarPontos: () => sb.from('pontos').select('tarefa_id').then(ok),

  // ---- pontos e fotos
  pontos: (tarefaId) => sb.from('pontos').select('*').eq('tarefa_id', tarefaId).order('criado_em').then(ok),
  redes: (tarefaId) => sb.from('redes').select('*').eq('tarefa_id', tarefaId).order('criado_em').then(ok),
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

  // ---- uso do banco e limpeza (só líder)
  usoBanco: () => sb.rpc('uso_banco').then(ok),
  arquivosDaTarefa: (tarefaId) => sb.rpc('arquivos_da_tarefa', { t: tarefaId }).then(ok),
  arquivosOrfaos: () => sb.rpc('arquivos_orfaos').then(ok),
  baixarArquivo: (bucket, path) => sb.storage.from(bucket).download(path).then(ok),
  async removerArquivos(bucket, paths) {
    for (let i = 0; i < paths.length; i += 100) ok(await sb.storage.from(bucket).remove(paths.slice(i, i + 100)));
  },
  apagarFotosDaTarefa: (tarefaId) => sb.from('fotos').delete().eq('tarefa_id', tarefaId).then(ok),

  // ---- tempo real
  // Cada chamada abre um canal com nome único: o supabase-js reaproveita canais de mesmo nome,
  // e reabrir uma tela antes de o canal anterior fechar dava erro.
  ouvir(nome, tabelas, aoMudar) {
    let canal = null;
    let parado = false;
    let espera = null;
    const abrir = () => {
      try {
        const este = sb.channel(`${nome}-${Math.random().toString(36).slice(2, 10)}`);
        canal = este;
        tabelas.forEach(({ tabela, filtro }) => {
          este.on('postgres_changes', { event: '*', schema: 'public', table: tabela, ...(filtro ? { filter: filtro } : {}) },
            (p) => { try { aoMudar(tabela, p); } catch (e) { console.warn('Aviso ao vivo:', e); } });
        });
        este.subscribe((status, erro) => {
          if (parado || canal !== este) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`Tempo real (${nome}) caiu: ${status}`, erro || '');
            // reabre sozinho depois de alguns segundos
            clearTimeout(espera);
            espera = setTimeout(() => {
              if (parado) return;
              sb.removeChannel(este).catch(() => {});
              abrir();
            }, 5000);
          }
        });
      } catch (e) {
        console.warn('Atualização ao vivo indisponível:', e);
      }
    };
    abrir();
    return () => {
      parado = true;
      clearTimeout(espera);
      if (canal) sb.removeChannel(canal).catch(() => {});
    };
  },
};
