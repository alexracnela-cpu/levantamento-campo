-- RondaLuz — logradouro e bairro de cada demanda (obrigatórios na tela de nova demanda).
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
alter table public.tarefas add column if not exists logradouro text not null default '';
alter table public.tarefas add column if not exists bairro text not null default '';
notify pgrst, 'reload schema';
