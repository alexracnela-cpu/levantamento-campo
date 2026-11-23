-- =====================================================================
-- RondaLuz — motoqueiro avisa que terminou o levantamento
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
--   * finalizar_tarefa: o motoqueiro marca a tarefa dele como entregue (com observação).
--   * iniciar_tarefa: a tarefa passa de "pendente" para "em andamento" no primeiro ponto.
--   * O líder conclui ou devolve (limpa finalizada_em) pela tela da tarefa.
-- =====================================================================

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
