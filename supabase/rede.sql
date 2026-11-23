-- =====================================================================
-- RondaLuz — rede elétrica desenhada no mapa
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
--   tipo:     secundaria (linha contínua) | primaria (tracejada)
--   situacao: existente | inexistente (cores diferentes)
--   pontos:   vértices da linha [[lat, lng], ...]
-- =====================================================================

create table if not exists public.redes (
  id             uuid primary key,          -- gerado no celular (funciona offline)
  tarefa_id      uuid not null references public.tarefas(id) on delete cascade,
  tipo           text not null default 'secundaria' check (tipo in ('secundaria', 'primaria')),
  situacao       text not null default 'existente' check (situacao in ('existente', 'inexistente')),
  pontos         jsonb not null,
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
