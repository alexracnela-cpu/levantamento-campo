-- =====================================================================
-- RondaLuz — uso do banco e arquivamento de demandas (24/11/2026)
-- Tela "Banco de dados" do líder: quanto espaço cada parte usa e
-- limpeza das fotos/ofício depois de baixar o pacote da demanda.
-- Pode rodar de novo sem problema.
-- =====================================================================

-- Quando as fotos e o ofício foram baixados e apagados do servidor.
alter table public.tarefas add column if not exists arquivada_em timestamptz;

-- Resumo do uso (só líder).
create or replace function public.uso_banco()
returns json language plpgsql stable security definer set search_path = public, storage as $$
declare v json;
begin
  if not public.eh_lider() then raise exception 'Só o líder pode ver o uso do banco.'; end if;

  with arq as (
    select bucket_id, public.uuid_ou_nulo(split_part(name, '/', 1)) as tarefa_id,
           coalesce((metadata->>'size')::bigint, 0) as bytes
      from storage.objects
     where bucket_id in ('fotos', 'oficios')
  ),
  por_tarefa as (
    select t.id, t.titulo, t.status, t.criado_em, t.finalizada_em, t.arquivada_em, t.motoqueiro_id,
           (select count(*) from pontos p where p.tarefa_id = t.id) as pontos,
           (select count(*) from redes r where r.tarefa_id = t.id) as redes,
           (select count(*) from arq a where a.tarefa_id = t.id and a.bucket_id = 'fotos') as fotos,
           (select coalesce(sum(bytes), 0) from arq a where a.tarefa_id = t.id and a.bucket_id = 'fotos') as fotos_bytes,
           (select coalesce(sum(bytes), 0) from arq a where a.tarefa_id = t.id and a.bucket_id = 'oficios') as oficio_bytes
      from tarefas t
  )
  select json_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'tabelas', (
      select json_agg(json_build_object('tabela', x.nome, 'linhas', x.linhas,
                                        'bytes', pg_total_relation_size(('public.' || x.nome)::regclass)) order by x.nome)
        from (values ('tarefas', (select count(*) from tarefas)),
                     ('pontos',  (select count(*) from pontos)),
                     ('fotos',   (select count(*) from fotos)),
                     ('redes',   (select count(*) from redes)),
                     ('perfis',  (select count(*) from perfis)),
                     ('convites', (select count(*) from convites))) as x(nome, linhas)
    ),
    'arquivos', (
      select coalesce(json_agg(json_build_object('bucket', b, 'qtd', q, 'bytes', s)), '[]'::json)
        from (select bucket_id b, count(*) q, sum(bytes) s from arq group by bucket_id) z
    ),
    'orfaos', (
      select json_build_object('qtd', count(*), 'bytes', coalesce(sum(bytes), 0))
        from arq a where a.tarefa_id is null or not exists (select 1 from tarefas t where t.id = a.tarefa_id)
    ),
    'demandas', (select coalesce(json_agg(row_to_json(pt) order by pt.fotos_bytes + pt.oficio_bytes desc), '[]'::json) from por_tarefa pt)
  ) into v;
  return v;
end $$;

-- Arquivos guardados de uma demanda (fotos e ofício), inclusive os que ficaram sem ficha.
create or replace function public.arquivos_da_tarefa(t uuid)
returns table (bucket text, caminho text, bytes bigint, criado_em timestamptz)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.eh_lider() then raise exception 'Só o líder pode fazer isso.'; end if;
  return query
    select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
      from storage.objects o
     where o.bucket_id in ('fotos', 'oficios') and split_part(o.name, '/', 1) = t::text
     order by o.bucket_id, o.name;
end $$;

-- Arquivos que sobraram de demandas já excluídas.
create or replace function public.arquivos_orfaos()
returns table (bucket text, caminho text, bytes bigint)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.eh_lider() then raise exception 'Só o líder pode fazer isso.'; end if;
  return query
    select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
      from storage.objects o
     where o.bucket_id in ('fotos', 'oficios')
       and not exists (select 1 from tarefas t where t.id = public.uuid_ou_nulo(split_part(o.name, '/', 1)));
end $$;

revoke all on function public.uso_banco() from public;
revoke all on function public.arquivos_da_tarefa(uuid) from public;
revoke all on function public.arquivos_orfaos() from public;
grant execute on function public.uso_banco()              to authenticated;
grant execute on function public.arquivos_da_tarefa(uuid) to authenticated;
grant execute on function public.arquivos_orfaos()        to authenticated;
