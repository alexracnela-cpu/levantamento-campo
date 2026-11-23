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
