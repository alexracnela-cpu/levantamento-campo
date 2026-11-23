-- RondaLuz — quantidade de luminárias em cada ponto.
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
alter table public.pontos add column if not exists qtd_luminarias int not null default 1
  check (qtd_luminarias between 0 and 20);
