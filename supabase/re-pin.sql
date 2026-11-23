-- =====================================================================
-- RondaLuz — entrada do motoqueiro com RE (3 números) + PIN (4 números)
-- Rode uma vez no SQL Editor (New query > Run). Pode rodar de novo sem problema.
--
-- Como funciona:
--   * O líder cadastra o motoqueiro na tela Equipe (nome + RE).
--   * Primeiro acesso: o motoqueiro digita o RE, confirma o nome e cria o PIN.
--   * Depois: RE + PIN. 5 PINs errados bloqueiam o RE por 15 minutos.
--   * O PIN nunca vira a senha da conta: o banco confere o PIN e devolve uma
--     senha longa e aleatória, guardada só no banco, usada para abrir a sessão.
--   * O líder pode zerar o PIN (o motoqueiro cria outro no próximo acesso).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.perfis   add column if not exists re text;
alter table public.convites add column if not exists re text;
alter table public.convites add column if not exists nome text not null default '';

create unique index if not exists perfis_re_unico   on public.perfis (re)   where re is not null;
create unique index if not exists convites_re_unico on public.convites (re) where re is not null and usado_em is null;

-- Credenciais: ninguém lê pela API (sem grants); só as funções abaixo mexem aqui.
create table if not exists public.credenciais (
  re             text primary key check (re ~ '^[0-9]{3}$'),
  pin_hash       text,
  segredo        text,
  tentativas     int not null default 0,
  bloqueado_ate  timestamptz,
  pin_zerado     boolean not null default false,
  atualizado_em  timestamptz not null default now()
);
alter table public.credenciais enable row level security;
revoke all on table public.credenciais from anon, authenticated;

create or replace function public.email_do_re(p_re text)
returns text language sql immutable as $$
  select 're' || p_re || '@motoqueiro.rondaluz.app';
$$;

create or replace function public.pin_fraco(p text)
returns boolean language sql immutable as $$
  select p !~ '^[0-9]{4}$'
      or p ~ '^(.)\1{3}$'
      or position(p in '01234567890') > 0
      or position(p in '09876543210') > 0
      or p in ('1212','2121','1122','2580','0852','1010','6969','1313','2020','2323');
$$;

-- Cadastro: a primeira conta vira líder; as outras precisam de convite (e-mail ou RE).
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_conv  convites%rowtype;
  v_email text := lower(coalesce(new.email, ''));
  v_papel text;
begin
  perform pg_advisory_xact_lock(7311001);
  if not exists (select 1 from perfis) then
    v_papel := 'lider';
  else
    select * into v_conv from convites where email = v_email and usado_em is null;
    if v_conv.email is null then
      raise exception 'RONDALUZ_SEM_CONVITE: este e-mail não foi convidado';
    end if;
    v_papel := v_conv.papel;
    update convites set usado_em = now() where email = v_email;
  end if;

  insert into perfis (id, nome, email, papel, re)
  values (
    new.id,
    coalesce(nullif(v_conv.nome, ''), nullif(new.raw_user_meta_data->>'nome', ''), split_part(v_email, '@', 1)),
    v_email,
    v_papel,
    v_conv.re
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Quem é este RE? (usado antes de entrar; não revela nada além do nome)
create or replace function public.consultar_re(p_re text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_perfil perfis%rowtype;
  v_conv   convites%rowtype;
  v_cred   credenciais%rowtype;
begin
  if p_re !~ '^[0-9]{3}$' then return json_build_object('estado', 'invalido'); end if;
  select * into v_perfil from perfis where re = p_re;
  if v_perfil.id is not null then
    if v_perfil.papel = 'bloqueado' then return json_build_object('estado', 'sem_acesso'); end if;
    select * into v_cred from credenciais where re = p_re;
    if v_cred.re is null or v_cred.pin_zerado or v_cred.pin_hash is null then
      return json_build_object('estado', 'criar_pin', 'nome', v_perfil.nome);
    end if;
    return json_build_object('estado', 'ativo', 'nome', split_part(v_perfil.nome, ' ', 1));
  end if;
  select * into v_conv from convites where re = p_re and usado_em is null;
  if v_conv.email is not null then
    return json_build_object('estado', 'criar_pin', 'nome', v_conv.nome, 'novo', true);
  end if;
  return json_build_object('estado', 'inexistente');
end $$;

-- Cria o PIN (primeiro acesso ou depois de o líder zerar). Devolve e-mail + segredo da sessão.
create or replace function public.criar_pin(p_re text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_info    json := public.consultar_re(p_re);
  v_segredo text := encode(gen_random_bytes(24), 'hex');
  v_perfil  perfis%rowtype;
begin
  if v_info->>'estado' <> 'criar_pin' then
    raise exception 'Este RE já tem PIN. Use "Entrar" ou peça ao líder para zerar.';
  end if;
  if public.pin_fraco(p_pin) then
    raise exception 'Esse PIN é fácil de adivinhar. Escolha outro.';
  end if;
  insert into credenciais (re, pin_hash, segredo, tentativas, bloqueado_ate, pin_zerado, atualizado_em)
  values (p_re, crypt(p_pin, gen_salt('bf')), v_segredo, 0, null, false, now())
  on conflict (re) do update set pin_hash = excluded.pin_hash, segredo = excluded.segredo,
    tentativas = 0, bloqueado_ate = null, pin_zerado = false, atualizado_em = now();

  select * into v_perfil from perfis where re = p_re;
  if v_perfil.id is not null then
    -- conta já existe (PIN zerado): troca a senha da conta pelo segredo novo
    update auth.users set encrypted_password = crypt(v_segredo, gen_salt('bf')), updated_at = now()
     where id = v_perfil.id;
    return json_build_object('email', v_perfil.email, 'segredo', v_segredo, 'nova_conta', false);
  end if;
  return json_build_object('email', public.email_do_re(p_re), 'segredo', v_segredo,
                           'nova_conta', true, 'nome', v_info->>'nome');
end $$;

-- Entrada com RE + PIN (5 erros = 15 minutos bloqueado).
create or replace function public.entrar_re(p_re text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cred   credenciais%rowtype;
  v_perfil perfis%rowtype;
begin
  select * into v_cred from credenciais where re = p_re for update;
  select * into v_perfil from perfis where re = p_re;
  if v_cred.re is null or v_perfil.id is null or v_cred.pin_hash is null or v_cred.pin_zerado then
    raise exception 'RE ou PIN incorretos.';
  end if;
  if v_perfil.papel = 'bloqueado' then
    raise exception 'Seu acesso foi removido. Fale com o líder.';
  end if;
  if v_cred.bloqueado_ate is not null and v_cred.bloqueado_ate > now() then
    raise exception 'Muitas tentativas erradas. Tente de novo em % minuto(s) ou peça ao líder para zerar o PIN.',
      greatest(1, ceil(extract(epoch from (v_cred.bloqueado_ate - now())) / 60))::int;
  end if;
  if crypt(p_pin, v_cred.pin_hash) <> v_cred.pin_hash then
    update credenciais
       set tentativas = tentativas + 1,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else null end,
           atualizado_em = now()
     where re = p_re;
    if v_cred.tentativas + 1 >= 5 then
      raise exception 'PIN errado 5 vezes. RE bloqueado por 15 minutos.';
    end if;
    raise exception 'PIN incorreto. Restam % tentativa(s).', 5 - (v_cred.tentativas + 1);
  end if;
  update credenciais set tentativas = 0, bloqueado_ate = null, atualizado_em = now() where re = p_re;
  return json_build_object('email', v_perfil.email, 'segredo', v_cred.segredo);
end $$;

-- Líder zera o PIN de um motoqueiro (ele cria outro no próximo acesso).
create or replace function public.zerar_pin(p_perfil uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_re text;
begin
  if not public.eh_lider() then raise exception 'Só o líder pode zerar PIN.'; end if;
  select re into v_re from perfis where id = p_perfil;
  if v_re is null then raise exception 'Esta pessoa não entra por RE.'; end if;
  insert into credenciais (re, pin_zerado) values (v_re, true)
  on conflict (re) do update set pin_hash = null, pin_zerado = true, tentativas = 0, bloqueado_ate = null, atualizado_em = now();
  -- derruba a senha atual da conta (a sessão aberta no celular continua até sair)
  update auth.users set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = p_perfil;
end $$;

revoke all on function public.criar_pin(text, text) from public;
revoke all on function public.entrar_re(text, text) from public;
revoke all on function public.zerar_pin(uuid) from public;
grant execute on function public.consultar_re(text)     to anon, authenticated;
grant execute on function public.criar_pin(text, text)  to anon, authenticated;
grant execute on function public.entrar_re(text, text)  to anon, authenticated;
grant execute on function public.zerar_pin(uuid)        to authenticated;
