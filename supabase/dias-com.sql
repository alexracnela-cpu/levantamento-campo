-- RondaLuz — data em que a tarefa foi entregue ao motoqueiro atual (para contar os dias com ele).
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.

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
