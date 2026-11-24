-- RondaLuz — tipo de cabo da rede (24/11/2026).
-- Rodar no SQL Editor ANTES de publicar a versão v31 do app.
alter table public.redes add column if not exists cabo text;
alter table public.redes drop constraint if exists redes_cabo_valido;
alter table public.redes add constraint redes_cabo_valido check (
  cabo is null or cabo in ('multiplexado', 'aluminio_nu', 'cabo_pp', 'smc', 'zero_bt', 'blindada', 'concentrica')
);
notify pgrst, 'reload schema';
