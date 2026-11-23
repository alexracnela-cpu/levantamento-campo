-- =====================================================================
-- RondaLuz — metragem da rede digitada em campo (23/11/2026)
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
--   comprimento_informado: metros digitados pelo motoqueiro; vazio = vale a medida do mapa.
-- =====================================================================
alter table public.redes add column if not exists comprimento_informado numeric;
grant select, insert, update, delete on public.redes to authenticated;
notify pgrst, 'reload schema';
