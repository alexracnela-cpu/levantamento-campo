-- RondaLuz — número da plaqueta em cada ponto.
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
alter table public.pontos add column if not exists plaqueta text not null default '';
