-- RondaLuz — poste (altura/esforço, ex.: 11/300) em cada ponto.
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
alter table public.pontos add column if not exists poste text not null default '';
