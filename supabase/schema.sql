-- =====================================================================
-- RondaLuz — banco de dados, regras de acesso (RLS) e arquivos
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (ele recria funções e regras).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text not null default '',
  papel      text not null default 'motoqueiro' check (papel in ('lider', 'motoqueiro')),
  criado_em  timestamptz not null default now()
);

create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descricao      text not null default '',
  prazo          date,
  area           jsonb not null,            -- lista de vértices [[lat, lng], ...]
  oficio_path    text,                      -- caminho no bucket "oficios"
  oficio_nome    text,
  oficio_tipo    text,
  motoqueiro_id  uuid references public.perfis(id) on delete set null,
  status         text not null default 'pendente'
                 check (status in ('pendente', 'em_andamento', 'concluido')),
  criado_por     uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now()
);

create table if not exists public.pontos (
  id             uuid primary key,          -- gerado no celular (funciona offline)
  tarefa_id      uuid not null references public.tarefas(id) on delete cascade,
  lat            double precision not null,
  lng            double precision not null,
  tamanho_m      real not null default 2.5 check (tamanho_m > 0 and tamanho_m <= 200),
  rotacao        real not null default 0,
  plaqueta       text not null default '',
  observacoes    text not null default '',
  fora_da_area   boolean not null default false,
  criado_por     uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.fotos (
  id          uuid primary key,             -- gerado no celular
  ponto_id    uuid not null references public.pontos(id) on delete cascade,
  tarefa_id   uuid not null references public.tarefas(id) on delete cascade,
  path        text not null,                -- caminho no bucket "fotos"
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);

-- colunas adicionadas depois (para bancos já criados)
alter table public.pontos add column if not exists plaqueta text not null default '';

create index if not exists pontos_tarefa_idx on public.pontos (tarefa_id);
create index if not exists fotos_ponto_idx   on public.fotos (ponto_id);
create index if not exists fotos_tarefa_idx  on public.fotos (tarefa_id);
create index if not exists tarefas_moto_idx  on public.tarefas (motoqueiro_id);

-- ---------------------------------------------------------------------
-- Funções auxiliares (security definer: leem perfis/tarefas sem esbarrar no RLS)
-- ---------------------------------------------------------------------

create or replace function public.eh_lider()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'lider');
$$;

create or replace function public.tarefa_eh_minha(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select t is not null and exists (select 1 from tarefas where id = t and motoqueiro_id = auth.uid());
$$;

create or replace function public.uuid_ou_nulo(txt text)
returns uuid language plpgsql immutable as $$
begin
  return txt::uuid;
exception when others then
  return null;
end $$;

-- A primeira conta criada vira líder; as demais entram como motoqueiro.
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7311001);
  insert into perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    case when exists (select 1 from perfis) then 'motoqueiro' else 'lider' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

-- Não deixa a equipe ficar sem nenhum líder.
create or replace function public.proteger_ultimo_lider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.papel = 'lider' and new.papel <> 'lider'
     and not exists (select 1 from perfis where papel = 'lider' and id <> old.id) then
    raise exception 'A equipe precisa de pelo menos um líder.';
  end if;
  return new;
end $$;

drop trigger if exists proteger_lider on public.perfis;
create trigger proteger_lider
  before update of papel on public.perfis
  for each row execute function public.proteger_ultimo_lider();

-- Atualiza a data de alteração do ponto.
create or replace function public.tocar_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists pontos_atualizado on public.pontos;
create trigger pontos_atualizado
  before update on public.pontos
  for each row execute function public.tocar_atualizado();

-- ---------------------------------------------------------------------
-- Regras de acesso (RLS)
-- ---------------------------------------------------------------------

alter table public.perfis  enable row level security;
alter table public.tarefas enable row level security;
alter table public.pontos  enable row level security;
alter table public.fotos   enable row level security;

-- perfis: todos logados veem a equipe; só líder muda papel/nome.
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (true);

drop policy if exists perfis_lider_altera on public.perfis;
create policy perfis_lider_altera on public.perfis for update to authenticated
  using (public.eh_lider()) with check (public.eh_lider());

-- tarefas: líder faz tudo; motoqueiro só vê as dele.
drop policy if exists tarefas_ler on public.tarefas;
create policy tarefas_ler on public.tarefas for select to authenticated
  using (public.eh_lider() or motoqueiro_id = auth.uid());

drop policy if exists tarefas_criar on public.tarefas;
create policy tarefas_criar on public.tarefas for insert to authenticated
  with check (public.eh_lider());

drop policy if exists tarefas_alterar on public.tarefas;
create policy tarefas_alterar on public.tarefas for update to authenticated
  using (public.eh_lider()) with check (public.eh_lider());

drop policy if exists tarefas_excluir on public.tarefas;
create policy tarefas_excluir on public.tarefas for delete to authenticated
  using (public.eh_lider());

-- pontos: líder vê e mexe em todos; motoqueiro só nas tarefas dele.
drop policy if exists pontos_ler on public.pontos;
create policy pontos_ler on public.pontos for select to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists pontos_criar on public.pontos;
create policy pontos_criar on public.pontos for insert to authenticated
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists pontos_alterar on public.pontos;
create policy pontos_alterar on public.pontos for update to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id))
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists pontos_excluir on public.pontos;
create policy pontos_excluir on public.pontos for delete to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

-- fotos: mesma regra dos pontos.
drop policy if exists fotos_ler on public.fotos;
create policy fotos_ler on public.fotos for select to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists fotos_criar on public.fotos;
create policy fotos_criar on public.fotos for insert to authenticated
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists fotos_alterar on public.fotos;
create policy fotos_alterar on public.fotos for update to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id))
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists fotos_excluir on public.fotos;
create policy fotos_excluir on public.fotos for delete to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

-- ---------------------------------------------------------------------
-- Arquivos (Storage): ofícios e fotos, ambos privados.
-- Caminhos: oficios/<tarefa_id>/<arquivo>   fotos/<tarefa_id>/<ponto_id>/<foto_id>.jpg
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('oficios', 'oficios', false), ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists rl_oficios_ler on storage.objects;
create policy rl_oficios_ler on storage.objects for select to authenticated
  using (bucket_id = 'oficios' and (
    public.eh_lider() or public.tarefa_eh_minha(public.uuid_ou_nulo((storage.foldername(name))[1]))
  ));

drop policy if exists rl_oficios_criar on storage.objects;
create policy rl_oficios_criar on storage.objects for insert to authenticated
  with check (bucket_id = 'oficios' and public.eh_lider());

drop policy if exists rl_oficios_alterar on storage.objects;
create policy rl_oficios_alterar on storage.objects for update to authenticated
  using (bucket_id = 'oficios' and public.eh_lider());

drop policy if exists rl_oficios_excluir on storage.objects;
create policy rl_oficios_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'oficios' and public.eh_lider());

drop policy if exists rl_fotos_ler on storage.objects;
create policy rl_fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (
    public.eh_lider() or public.tarefa_eh_minha(public.uuid_ou_nulo((storage.foldername(name))[1]))
  ));

drop policy if exists rl_fotos_criar on storage.objects;
create policy rl_fotos_criar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (
    public.eh_lider() or public.tarefa_eh_minha(public.uuid_ou_nulo((storage.foldername(name))[1]))
  ));

drop policy if exists rl_fotos_alterar on storage.objects;
create policy rl_fotos_alterar on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (
    public.eh_lider() or public.tarefa_eh_minha(public.uuid_ou_nulo((storage.foldername(name))[1]))
  ));

drop policy if exists rl_fotos_excluir on storage.objects;
create policy rl_fotos_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (
    public.eh_lider() or public.tarefa_eh_minha(public.uuid_ou_nulo((storage.foldername(name))[1]))
  ));

-- ---------------------------------------------------------------------
-- Tempo real: o líder vê os pontos chegando sem recarregar.
-- ---------------------------------------------------------------------

alter table public.pontos  replica identity full;
alter table public.fotos   replica identity full;
alter table public.tarefas replica identity full;

do $$
declare t text;
begin
  foreach t in array array['pontos', 'fotos', 'tarefas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Permissões (também em permissoes.sql)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on table public.perfis, public.tarefas, public.pontos, public.fotos
  to authenticated;

grant execute on function public.eh_lider()             to authenticated;
grant execute on function public.tarefa_eh_minha(uuid)  to authenticated;
grant execute on function public.uuid_ou_nulo(text)     to authenticated;

-- =====================================================================
-- Acesso só por convite (também em convites.sql)
create table if not exists public.convites (
  email         text primary key check (email = lower(email) and position('@' in email) > 1),
  papel         text not null default 'motoqueiro' check (papel in ('lider', 'motoqueiro')),
  convidado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  usado_em      timestamptz
);

alter table public.convites enable row level security;

drop policy if exists convites_lider on public.convites;
create policy convites_lider on public.convites for all to authenticated
  using (public.eh_lider()) with check (public.eh_lider());

grant select, insert, update, delete on table public.convites to authenticated;

-- novo papel "bloqueado" (acesso removido)
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('lider', 'motoqueiro', 'bloqueado'));

-- Cadastro: primeira conta vira líder; as outras precisam de convite.
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_papel text;
  v_email text := lower(coalesce(new.email, ''));
begin
  perform pg_advisory_xact_lock(7311001);

  if not exists (select 1 from perfis) then
    v_papel := 'lider';
  else
    select papel into v_papel from convites where email = v_email and usado_em is null;
    if v_papel is null then
      raise exception 'RONDALUZ_SEM_CONVITE: este e-mail não foi convidado';
    end if;
    update convites set usado_em = now() where email = v_email;
  end if;

  insert into perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(v_email, '@', 1)),
    v_email,
    v_papel
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

-- Quem está bloqueado não vê mais nada (só o próprio perfil, para o app avisar).
create or replace function public.eh_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel <> 'bloqueado');
$$;

create or replace function public.tarefa_eh_minha(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select t is not null
     and exists (select 1 from tarefas where id = t and motoqueiro_id = auth.uid())
     and exists (select 1 from perfis where id = auth.uid() and papel <> 'bloqueado');
$$;

grant execute on function public.eh_ativo() to authenticated;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (public.eh_ativo() or id = auth.uid());

drop policy if exists tarefas_ler on public.tarefas;
create policy tarefas_ler on public.tarefas for select to authenticated
  using (public.eh_lider() or (motoqueiro_id = auth.uid() and public.eh_ativo()));

-- =====================================================================
-- Rede elétrica (também em rede.sql)
create table if not exists public.redes (
  id             uuid primary key,          -- gerado no celular (funciona offline)
  tarefa_id      uuid not null references public.tarefas(id) on delete cascade,
  tipo           text not null default 'secundaria' check (tipo in ('secundaria', 'primaria')),
  situacao       text not null default 'existente' check (situacao in ('existente', 'inexistente')),
  pontos         jsonb not null,
  comprimento_informado numeric,            -- metragem digitada em campo (vazio = medida do mapa)
  observacoes    text not null default '',
  criado_por     uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists redes_tarefa_idx on public.redes (tarefa_id);

alter table public.redes enable row level security;

drop policy if exists redes_ler on public.redes;
create policy redes_ler on public.redes for select to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists redes_criar on public.redes;
create policy redes_criar on public.redes for insert to authenticated
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists redes_alterar on public.redes;
create policy redes_alterar on public.redes for update to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id))
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists redes_excluir on public.redes;
create policy redes_excluir on public.redes for delete to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

grant select, insert, update, delete on table public.redes to authenticated;

drop trigger if exists redes_atualizado on public.redes;
create trigger redes_atualizado
  before update on public.redes
  for each row execute function public.tocar_atualizado();

alter table public.redes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'redes'
  ) then
    alter publication supabase_realtime add table public.redes;
  end if;
end $$;

-- =====================================================================
-- Entrega do motoqueiro (também em finalizar.sql)
alter table public.tarefas add column if not exists finalizada_em timestamptz;
alter table public.tarefas add column if not exists finalizacao_obs text not null default '';

create or replace function public.finalizar_tarefa(t uuid, obs text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tarefa_eh_minha(t) then
    raise exception 'Esta tarefa não é sua.';
  end if;
  update tarefas
     set finalizada_em = now(),
         finalizacao_obs = coalesce(obs, ''),
         status = case when status = 'pendente' then 'em_andamento' else status end
   where id = t;
end $$;

create or replace function public.iniciar_tarefa(t uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.tarefa_eh_minha(t) or public.eh_lider() then
    update tarefas set status = 'em_andamento' where id = t and status = 'pendente';
  end if;
end $$;

grant execute on function public.finalizar_tarefa(uuid, text) to authenticated;
grant execute on function public.iniciar_tarefa(uuid) to authenticated;

-- =====================================================================
-- Entrada do motoqueiro com RE + PIN (também em re-pin.sql)
create extension if not exists pgcrypto with schema extensions;

alter table public.perfis   add column if not exists re text;
alter table public.convites add column if not exists re text;
alter table public.convites add column if not exists nome text not null default '';

create unique index if not exists perfis_re_unico   on public.perfis (re)   where re is not null;
create unique index if not exists convites_re_unico on public.convites (re) where re is not null and usado_em is null;

-- Credenciais: ninguém lê pela API (sem grants); só as funções abaixo mexem aqui.
create table if not exists public.credenciais (
  re             text primary key check (re ~ '^[0-9]{3}$'),
  pin_hash       text,
  segredo        text,
  tentativas     int not null default 0,
  bloqueado_ate  timestamptz,
  pin_zerado     boolean not null default false,
  atualizado_em  timestamptz not null default now()
);
alter table public.credenciais enable row level security;
revoke all on table public.credenciais from anon, authenticated;

create or replace function public.email_do_re(p_re text)
returns text language sql immutable as $$
  select 're' || p_re || '@motoqueiro.rondaluz.app';
$$;

create or replace function public.pin_fraco(p text)
returns boolean language sql immutable as $$
  select p !~ '^[0-9]{4}$'
      or p ~ '^(.)\1{3}$'
      or position(p in '01234567890') > 0
      or position(p in '09876543210') > 0
      or p in ('1212','2121','1122','2580','0852','1010','6969','1313','2020','2323');
$$;

-- Cadastro: a primeira conta vira líder; as outras precisam de convite (e-mail ou RE).
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_conv  convites%rowtype;
  v_email text := lower(coalesce(new.email, ''));
  v_papel text;
begin
  perform pg_advisory_xact_lock(7311001);
  if not exists (select 1 from perfis) then
    v_papel := 'lider';
  else
    select * into v_conv from convites where email = v_email and usado_em is null;
    if v_conv.email is null then
      raise exception 'RONDALUZ_SEM_CONVITE: este e-mail não foi convidado';
    end if;
    v_papel := v_conv.papel;
    update convites set usado_em = now() where email = v_email;
  end if;

  insert into perfis (id, nome, email, papel, re)
  values (
    new.id,
    coalesce(nullif(v_conv.nome, ''), nullif(new.raw_user_meta_data->>'nome', ''), split_part(v_email, '@', 1)),
    v_email,
    v_papel,
    v_conv.re
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Quem é este RE? (usado antes de entrar; não revela nada além do nome)
create or replace function public.consultar_re(p_re text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_perfil perfis%rowtype;
  v_conv   convites%rowtype;
  v_cred   credenciais%rowtype;
begin
  if p_re !~ '^[0-9]{3}$' then return json_build_object('estado', 'invalido'); end if;
  select * into v_perfil from perfis where re = p_re;
  if v_perfil.id is not null then
    if v_perfil.papel = 'bloqueado' then return json_build_object('estado', 'sem_acesso'); end if;
    select * into v_cred from credenciais where re = p_re;
    if v_cred.re is null or v_cred.pin_zerado or v_cred.pin_hash is null then
      return json_build_object('estado', 'criar_pin', 'nome', v_perfil.nome);
    end if;
    return json_build_object('estado', 'ativo', 'nome', split_part(v_perfil.nome, ' ', 1));
  end if;
  select * into v_conv from convites where re = p_re and usado_em is null;
  if v_conv.email is not null then
    return json_build_object('estado', 'criar_pin', 'nome', v_conv.nome, 'novo', true);
  end if;
  return json_build_object('estado', 'inexistente');
end $$;

-- Cria o PIN (primeiro acesso ou depois de o líder zerar). Devolve e-mail + segredo da sessão.
create or replace function public.criar_pin(p_re text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_info    json := public.consultar_re(p_re);
  v_segredo text := encode(gen_random_bytes(24), 'hex');
  v_perfil  perfis%rowtype;
begin
  if v_info->>'estado' <> 'criar_pin' then
    raise exception 'Este RE já tem PIN. Use "Entrar" ou peça ao líder para zerar.';
  end if;
  if public.pin_fraco(p_pin) then
    raise exception 'Esse PIN é fácil de adivinhar. Escolha outro.';
  end if;
  insert into credenciais (re, pin_hash, segredo, tentativas, bloqueado_ate, pin_zerado, atualizado_em)
  values (p_re, crypt(p_pin, gen_salt('bf')), v_segredo, 0, null, false, now())
  on conflict (re) do update set pin_hash = excluded.pin_hash, segredo = excluded.segredo,
    tentativas = 0, bloqueado_ate = null, pin_zerado = false, atualizado_em = now();

  select * into v_perfil from perfis where re = p_re;
  if v_perfil.id is not null then
    -- conta já existe (PIN zerado): troca a senha da conta pelo segredo novo
    update auth.users set encrypted_password = crypt(v_segredo, gen_salt('bf')), updated_at = now()
     where id = v_perfil.id;
    return json_build_object('email', v_perfil.email, 'segredo', v_segredo, 'nova_conta', false);
  end if;
  return json_build_object('email', public.email_do_re(p_re), 'segredo', v_segredo,
                           'nova_conta', true, 'nome', v_info->>'nome');
end $$;

-- Entrada com RE + PIN (5 erros = 15 minutos bloqueado).
create or replace function public.entrar_re(p_re text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cred   credenciais%rowtype;
  v_perfil perfis%rowtype;
begin
  select * into v_cred from credenciais where re = p_re for update;
  select * into v_perfil from perfis where re = p_re;
  if v_cred.re is null or v_perfil.id is null or v_cred.pin_hash is null or v_cred.pin_zerado then
    raise exception 'RE ou PIN incorretos.';
  end if;
  if v_perfil.papel = 'bloqueado' then
    raise exception 'Seu acesso foi removido. Fale com o líder.';
  end if;
  if v_cred.bloqueado_ate is not null and v_cred.bloqueado_ate > now() then
    raise exception 'Muitas tentativas erradas. Tente de novo em % minuto(s) ou peça ao líder para zerar o PIN.',
      greatest(1, ceil(extract(epoch from (v_cred.bloqueado_ate - now())) / 60))::int;
  end if;
  if crypt(p_pin, v_cred.pin_hash) <> v_cred.pin_hash then
    update credenciais
       set tentativas = tentativas + 1,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else null end,
           atualizado_em = now()
     where re = p_re;
    if v_cred.tentativas + 1 >= 5 then
      raise exception 'PIN errado 5 vezes. RE bloqueado por 15 minutos.';
    end if;
    raise exception 'PIN incorreto. Restam % tentativa(s).', 5 - (v_cred.tentativas + 1);
  end if;
  update credenciais set tentativas = 0, bloqueado_ate = null, atualizado_em = now() where re = p_re;
  return json_build_object('email', v_perfil.email, 'segredo', v_cred.segredo);
end $$;

-- Líder zera o PIN de um motoqueiro (ele cria outro no próximo acesso).
create or replace function public.zerar_pin(p_perfil uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_re text;
begin
  if not public.eh_lider() then raise exception 'Só o líder pode zerar PIN.'; end if;
  select re into v_re from perfis where id = p_perfil;
  if v_re is null then raise exception 'Esta pessoa não entra por RE.'; end if;
  insert into credenciais (re, pin_zerado) values (v_re, true)
  on conflict (re) do update set pin_hash = null, pin_zerado = true, tentativas = 0, bloqueado_ate = null, atualizado_em = now();
  -- derruba a senha atual da conta (a sessão aberta no celular continua até sair)
  update auth.users set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = p_perfil;
end $$;

revoke all on function public.criar_pin(text, text) from public;
revoke all on function public.entrar_re(text, text) from public;
revoke all on function public.zerar_pin(uuid) from public;
grant execute on function public.consultar_re(text)     to anon, authenticated;
grant execute on function public.criar_pin(text, text)  to anon, authenticated;
grant execute on function public.entrar_re(text, text)  to anon, authenticated;
grant execute on function public.zerar_pin(uuid)        to authenticated;

-- =====================================================================
-- Dias com o motoqueiro (também em dias-com.sql)
alter table public.tarefas add column if not exists atribuida_em timestamptz;

update public.tarefas set atribuida_em = criado_em
 where atribuida_em is null and motoqueiro_id is not null;

create or replace function public.marcar_atribuicao()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.motoqueiro_id is distinct from old.motoqueiro_id then
    new.atribuida_em := case when new.motoqueiro_id is null then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists tarefas_atribuicao on public.tarefas;
create trigger tarefas_atribuicao
  before insert or update of motoqueiro_id on public.tarefas
  for each row execute function public.marcar_atribuicao();

-- metragem digitada em campo (supabase/rede-metragem.sql)
alter table public.redes add column if not exists comprimento_informado numeric;

-- Poste altura/esforço (também em poste.sql)
alter table public.pontos add column if not exists poste text not null default '';

-- Quantidade de luminárias (também em luminarias.sql)
alter table public.pontos add column if not exists qtd_luminarias int not null default 1
  check (qtd_luminarias between 0 and 20);

-- Tipo de poste, luminária ou projetor, existente ou novo (também em tipo-poste.sql)
alter table public.pontos add column if not exists tipo_poste  text not null default 'duplo_t';
alter table public.pontos add column if not exists luminaria   text not null default 'existente';
alter table public.pontos add column if not exists equipamento text not null default 'luminaria';

alter table public.pontos drop constraint if exists pontos_tipo_poste_check;
alter table public.pontos add constraint pontos_tipo_poste_check
  check (tipo_poste in ('duplo_t', 'concreto_circular', 'fibra', 'metalico', 'madeira', 'sem_poste'));

alter table public.pontos drop constraint if exists pontos_luminaria_check;
alter table public.pontos add constraint pontos_luminaria_check
  check (luminaria in ('existente', 'nova'));

alter table public.pontos drop constraint if exists pontos_equipamento_check;
alter table public.pontos add constraint pontos_equipamento_check
  check (equipamento in ('luminaria', 'projetor'));

-- =====================================================================
-- Uso do banco e arquivamento (também em uso-banco.sql)
alter table public.tarefas add column if not exists arquivada_em timestamptz;

-- Resumo do uso (só líder).
create or replace function public.uso_banco()
returns json language plpgsql stable security definer set search_path = public, storage as $$
declare v json;
begin
  if not public.eh_lider() then raise exception 'Só o líder pode ver o uso do banco.'; end if;

  with arq as (
    select bucket_id, public.uuid_ou_nulo(split_part(name, '/', 1)) as tarefa_id,
           coalesce((metadata->>'size')::bigint, 0) as bytes
      from storage.objects
     where bucket_id in ('fotos', 'oficios')
  ),
  por_tarefa as (
    select t.id, t.titulo, t.status, t.criado_em, t.finalizada_em, t.arquivada_em, t.motoqueiro_id,
           (select count(*) from pontos p where p.tarefa_id = t.id) as pontos,
           (select count(*) from redes r where r.tarefa_id = t.id) as redes,
           (select count(*) from arq a where a.tarefa_id = t.id and a.bucket_id = 'fotos') as fotos,
           (select coalesce(sum(bytes), 0) from arq a where a.tarefa_id = t.id and a.bucket_id = 'fotos') as fotos_bytes,
           (select coalesce(sum(bytes), 0) from arq a where a.tarefa_id = t.id and a.bucket_id = 'oficios') as oficio_bytes
      from tarefas t
  )
  select json_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'tabelas', (
      select json_agg(json_build_object('tabela', x.nome, 'linhas', x.linhas,
                                        'bytes', pg_total_relation_size(('public.' || x.nome)::regclass)) order by x.nome)
        from (values ('tarefas', (select count(*) from tarefas)),
                     ('pontos',  (select count(*) from pontos)),
                     ('fotos',   (select count(*) from fotos)),
                     ('redes',   (select count(*) from redes)),
                     ('perfis',  (select count(*) from perfis)),
                     ('convites', (select count(*) from convites))) as x(nome, linhas)
    ),
    'arquivos', (
      select coalesce(json_agg(json_build_object('bucket', b, 'qtd', q, 'bytes', s)), '[]'::json)
        from (select bucket_id b, count(*) q, sum(bytes) s from arq group by bucket_id) z
    ),
    'orfaos', (
      select json_build_object('qtd', count(*), 'bytes', coalesce(sum(bytes), 0))
        from arq a where a.tarefa_id is null or not exists (select 1 from tarefas t where t.id = a.tarefa_id)
    ),
    'demandas', (select coalesce(json_agg(row_to_json(pt) order by pt.fotos_bytes + pt.oficio_bytes desc), '[]'::json) from por_tarefa pt)
  ) into v;
  return v;
end $$;

-- Arquivos guardados de uma demanda (fotos e ofício), inclusive os que ficaram sem ficha.
create or replace function public.arquivos_da_tarefa(t uuid)
returns table (bucket text, caminho text, bytes bigint, criado_em timestamptz)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.eh_lider() then raise exception 'Só o líder pode fazer isso.'; end if;
  return query
    select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
      from storage.objects o
     where o.bucket_id in ('fotos', 'oficios') and split_part(o.name, '/', 1) = t::text
     order by o.bucket_id, o.name;
end $$;

-- Arquivos que sobraram de demandas já excluídas.
create or replace function public.arquivos_orfaos()
returns table (bucket text, caminho text, bytes bigint)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.eh_lider() then raise exception 'Só o líder pode fazer isso.'; end if;
  return query
    select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
      from storage.objects o
     where o.bucket_id in ('fotos', 'oficios')
       and not exists (select 1 from tarefas t where t.id = public.uuid_ou_nulo(split_part(o.name, '/', 1)));
end $$;

revoke all on function public.uso_banco() from public;
revoke all on function public.arquivos_da_tarefa(uuid) from public;
revoke all on function public.arquivos_orfaos() from public;
grant execute on function public.uso_banco()              to authenticated;
grant execute on function public.arquivos_da_tarefa(uuid) to authenticated;
grant execute on function public.arquivos_orfaos()        to authenticated;
-- (incluído de supabase/push.sql)
create extension if not exists pg_net;

-- Celulares/navegadores que aceitaram receber avisos.
create table if not exists public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists push_inscricoes_perfil on public.push_inscricoes(perfil_id);
alter table public.push_inscricoes enable row level security;

drop policy if exists push_ler on public.push_inscricoes;
create policy push_ler on public.push_inscricoes for select to authenticated
  using (perfil_id = auth.uid());
drop policy if exists push_apagar on public.push_inscricoes;
create policy push_apagar on public.push_inscricoes for delete to authenticated
  using (perfil_id = auth.uid());
grant select, delete on public.push_inscricoes to authenticated;

-- Grava a inscrição deste aparelho para quem está logado.
-- Se o aparelho já estava com outra pessoa (troca de login), passa para a pessoa atual.
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre no app primeiro'; end if;
  insert into public.push_inscricoes (perfil_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
end $$;
grant execute on function public.registrar_push(text, text, text) to authenticated;

-- Configuração privada (endereço da função e segredo). Sem GRANT: ninguém lê pela API.
create table if not exists public.push_config (
  chave text primary key,
  valor text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

insert into public.push_config (chave, valor)
values ('url', 'https://cpbavsbaqmggsuxsvjse.supabase.co/functions/v1/avisar')
on conflict (chave) do nothing;

-- Quando uma demanda muda, decide se alguém precisa ser avisado e chama a função "avisar".
--   novo:     demanda passou a ser de um motoqueiro (não vale se ele mesmo criou)
--   devolvido: líder desfez o "Terminei"
--   terminou:  motoqueiro tocou em "Terminei" (avisa os líderes)
create or replace function public.avisar_push_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tipo   text;
  v_url    text;
  v_seg    text;
begin
  if new.status = 'concluido' then return new; end if;

  if new.motoqueiro_id is not null
     and (tg_op = 'INSERT' or old.motoqueiro_id is distinct from new.motoqueiro_id)
     and new.criado_por is distinct from new.motoqueiro_id then
    v_tipo := 'novo';
  elsif tg_op = 'UPDATE' and old.finalizada_em is not null and new.finalizada_em is null then
    v_tipo := 'devolvido';
  elsif tg_op = 'UPDATE' and old.finalizada_em is null and new.finalizada_em is not null then
    v_tipo := 'terminou';
  else
    return new;
  end if;

  select valor into v_url from public.push_config where chave = 'url';
  select valor into v_seg from public.push_config where chave = 'segredo';
  if v_url is null or v_seg is null then return new; end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-rondaluz-segredo', v_seg),
      body    := jsonb_build_object('tipo', v_tipo, 'tarefa_id', new.id)
    );
  exception when others then
    -- falha no aviso nunca impede salvar a demanda
    raise warning 'RondaLuz push: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists tarefas_avisar_push on public.tarefas;
create trigger tarefas_avisar_push
  after insert or update of motoqueiro_id, finalizada_em on public.tarefas
  for each row execute function public.avisar_push_tarefa();

-- =====================================================================
-- (incluído de supabase/rede-cabo.sql)
alter table public.redes add column if not exists cabo text;
alter table public.redes drop constraint if exists redes_cabo_valido;
alter table public.redes add constraint redes_cabo_valido check (
  cabo is null or cabo in ('multiplexado', 'aluminio_nu', 'cabo_pp', 'smc', 'zero_bt', 'blindada', 'concentrica')
);
notify pgrst, 'reload schema';
