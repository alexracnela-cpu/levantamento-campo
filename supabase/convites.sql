-- =====================================================================
-- RondaLuz — acesso só por convite
-- Rode no SQL Editor (New query > Run). Pode rodar de novo sem problema.
--
-- Como funciona:
--   * A primeira conta do sistema vira líder (sem convite).
--   * Depois disso, só cria conta quem tiver o e-mail convidado por um líder
--     na tela Equipe. Qualquer outro cadastro é recusado pelo banco.
--   * O líder pode remover o acesso de alguém (papel "bloqueado") e devolver depois.
-- =====================================================================

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
