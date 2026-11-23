-- RondaLuz — permissões das tabelas para usuários logados.
-- Projetos novos do Supabase não liberam as tabelas automaticamente para a API.
-- Rode este arquivo uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
-- Quem vê o quê continua decidido pelas regras de acesso (RLS) do schema.sql.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on table public.perfis, public.tarefas, public.pontos, public.fotos
  to authenticated;

grant execute on function public.eh_lider()             to authenticated;
grant execute on function public.tarefa_eh_minha(uuid)  to authenticated;
grant execute on function public.uuid_ou_nulo(text)     to authenticated;
