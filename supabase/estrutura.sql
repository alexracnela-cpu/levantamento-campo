-- =====================================================================
-- RondaLuz — estruturas desenhadas em campo (prédio, quadra, campo… nome livre)
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
--   pontos: cantos do polígono [[lat, lng], ...]
-- =====================================================================

create table if not exists public.estruturas (
  id             uuid primary key,          -- gerado no celular (funciona offline)
  tarefa_id      uuid not null references public.tarefas(id) on delete cascade,
  nome           text not null default '',
  pontos         jsonb not null,
  observacoes    text not null default '',
  criado_por     uuid references public.perfis(id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists estruturas_tarefa_idx on public.estruturas (tarefa_id);

alter table public.estruturas enable row level security;

drop policy if exists estruturas_ler on public.estruturas;
create policy estruturas_ler on public.estruturas for select to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists estruturas_criar on public.estruturas;
create policy estruturas_criar on public.estruturas for insert to authenticated
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists estruturas_alterar on public.estruturas;
create policy estruturas_alterar on public.estruturas for update to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id))
  with check (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

drop policy if exists estruturas_excluir on public.estruturas;
create policy estruturas_excluir on public.estruturas for delete to authenticated
  using (public.eh_lider() or public.tarefa_eh_minha(tarefa_id));

grant select, insert, update, delete on table public.estruturas to authenticated;

drop trigger if exists estruturas_atualizado on public.estruturas;
create trigger estruturas_atualizado
  before update on public.estruturas
  for each row execute function public.tocar_atualizado();

alter table public.estruturas replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'estruturas'
  ) then
    alter publication supabase_realtime add table public.estruturas;
  end if;
end $$;

notify pgrst, 'reload schema';
