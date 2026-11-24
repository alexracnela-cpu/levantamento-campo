-- =====================================================================
-- RondaLuz — notificação push (aviso no celular mesmo com o app fechado)
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- O segredo NÃO fica aqui (o repositório é público): ele é gravado à parte,
-- com o comando que vem no arquivo de segredos entregue ao usuário.
-- =====================================================================

create extension if not exists pg_net;

-- Celulares/navegadores que aceitaram receber avisos.
create table if not exists public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists push_inscricoes_perfil on public.push_inscricoes(perfil_id);
alter table public.push_inscricoes enable row level security;

drop policy if exists push_ler on public.push_inscricoes;
create policy push_ler on public.push_inscricoes for select to authenticated
  using (perfil_id = auth.uid());
drop policy if exists push_apagar on public.push_inscricoes;
create policy push_apagar on public.push_inscricoes for delete to authenticated
  using (perfil_id = auth.uid());
grant select, delete on public.push_inscricoes to authenticated;

-- Grava a inscrição deste aparelho para quem está logado.
-- Se o aparelho já estava com outra pessoa (troca de login), passa para a pessoa atual.
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre no app primeiro'; end if;
  insert into public.push_inscricoes (perfil_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
end $$;
grant execute on function public.registrar_push(text, text, text) to authenticated;

-- Configuração privada (endereço da função e segredo). Sem GRANT: ninguém lê pela API.
create table if not exists public.push_config (
  chave text primary key,
  valor text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

insert into public.push_config (chave, valor)
values ('url', 'https://cpbavsbaqmggsuxsvjse.supabase.co/functions/v1/avisar')
on conflict (chave) do nothing;

-- Quando uma demanda muda, decide se alguém precisa ser avisado e chama a função "avisar".
--   novo:     demanda passou a ser de um motoqueiro (não vale se ele mesmo criou)
--   devolvido: líder desfez o "Terminei"
--   terminou:  motoqueiro tocou em "Terminei" (avisa os líderes)
create or replace function public.avisar_push_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tipo   text;
  v_url    text;
  v_seg    text;
begin
  if new.status = 'concluido' then return new; end if;

  if new.motoqueiro_id is not null
     and (tg_op = 'INSERT' or old.motoqueiro_id is distinct from new.motoqueiro_id)
     and new.criado_por is distinct from new.motoqueiro_id then
    v_tipo := 'novo';
  elsif tg_op = 'UPDATE' and old.finalizada_em is not null and new.finalizada_em is null then
    v_tipo := 'devolvido';
  elsif tg_op = 'UPDATE' and old.finalizada_em is null and new.finalizada_em is not null then
    v_tipo := 'terminou';
  else
    return new;
  end if;

  select valor into v_url from public.push_config where chave = 'url';
  select valor into v_seg from public.push_config where chave = 'segredo';
  if v_url is null or v_seg is null then return new; end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-rondaluz-segredo', v_seg),
      body    := jsonb_build_object('tipo', v_tipo, 'tarefa_id', new.id)
    );
  exception when others then
    -- falha no aviso nunca impede salvar a demanda
    raise warning 'RondaLuz push: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists tarefas_avisar_push on public.tarefas;
create trigger tarefas_avisar_push
  after insert or update of motoqueiro_id, finalizada_em on public.tarefas
  for each row execute function public.avisar_push_tarefa();
