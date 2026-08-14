-- SGO 5º BPM — Rascunho/publicado, versões e biblioteca de grupos.
-- Aplique no SQL Editor do Supabase. Não altera cartões do dia já existentes.

alter table cartoes add column if not exists estado_template text;
alter table cartoes add column if not exists publicado_em timestamptz;
alter table cartoes add column if not exists publicado_por text;
alter table cartoes add column if not exists versao_publicada integer;
update cartoes set estado_template = case when padrao_ativo then 'publicado' else 'rascunho' end
 where is_template = true and estado_template is null;
alter table cartoes drop constraint if exists cartoes_estado_template_check;
alter table cartoes add constraint cartoes_estado_template_check
  check (estado_template is null or estado_template in ('rascunho', 'publicado'));

create table if not exists cartao_padrao_versoes (
  id text primary key,
  cartao_id text not null references cartoes(id) on delete cascade,
  versao integer not null,
  criado_em timestamptz not null default now(),
  criado_por text not null,
  snapshot jsonb not null,
  unique (cartao_id, versao)
);
create index if not exists idx_cartao_padrao_versoes_cartao on cartao_padrao_versoes (cartao_id, versao desc);

create table if not exists cartao_grupos_modelo (
  id text primary key,
  nome text not null,
  tipo text not null default 'Especial',
  area text default '',
  bairro text default '',
  missao text default '',
  pontos text default '',
  horario_inicio text default '',
  horario_fim text default '',
  observacoes text default '',
  configuracao jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_cartao_grupos_modelo_nome_normalizado
  on cartao_grupos_modelo (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')));
create index if not exists idx_cartao_grupos_modelo_filtros on cartao_grupos_modelo (ativo, tipo, bairro);

-- Publica a linha e a fotografia correspondente de forma atômica. A versão é
-- calculada sob lock do cartão; um cabeçalho atualizado_em vencido aborta tudo.
create or replace function publicar_cartao_padrao(
  p_id text,
  p_atualizado_em timestamptz,
  p_usuario text,
  p_versao_id text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cartao cartoes%rowtype;
  v_versao integer;
begin
  select * into v_cartao
    from cartoes
   where id = p_id
     and is_template = true
     and atualizado_em = p_atualizado_em
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CARTAO_DESATUALIZADO';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from cartao_padrao_versoes
   where cartao_id = p_id;

  update cartoes
     set estado_template = 'publicado',
         versao_publicada = v_versao,
         publicado_em = now(),
         publicado_por = p_usuario,
         atualizado_em = now()
   where id = p_id
   returning * into v_cartao;

  insert into cartao_padrao_versoes (id, cartao_id, versao, criado_por, snapshot)
  values (p_versao_id, p_id, v_versao, p_usuario, to_jsonb(v_cartao));

  delete from cartao_padrao_versoes
   where id in (
     select id from cartao_padrao_versoes
      where cartao_id = p_id
      order by versao desc
      offset 5
   );

  return to_jsonb(v_cartao);
end;
$$;

revoke all on function publicar_cartao_padrao(text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function publicar_cartao_padrao(text, timestamptz, text, text) to service_role;

alter table cartao_padrao_versoes enable row level security;
alter table cartao_grupos_modelo enable row level security;
