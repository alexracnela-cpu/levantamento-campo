-- =====================================================================
-- RondaLuz — tipo de poste, luminária ou projetor, existente ou novo, em cada ponto
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
-- Pontos antigos ficam como duplo T com luminária existente.
-- =====================================================================

alter table public.pontos add column if not exists tipo_poste  text not null default 'duplo_t';
alter table public.pontos add column if not exists luminaria   text not null default 'existente';
alter table public.pontos add column if not exists equipamento text not null default 'luminaria';

alter table public.pontos drop constraint if exists pontos_tipo_poste_check;
alter table public.pontos add constraint pontos_tipo_poste_check
  check (tipo_poste in ('duplo_t', 'concreto_circular', 'fibra', 'metalico', 'madeira', 'sem_poste'));

alter table public.pontos drop constraint if exists pontos_luminaria_check;
alter table public.pontos add constraint pontos_luminaria_check
  check (luminaria in ('existente', 'nova'));

alter table public.pontos drop constraint if exists pontos_equipamento_check;
alter table public.pontos add constraint pontos_equipamento_check
  check (equipamento in ('luminaria', 'projetor'));

-- avisa a API das colunas novas na hora
notify pgrst, 'reload schema';
