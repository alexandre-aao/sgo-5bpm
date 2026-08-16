-- SGO 5º BPM — Padrões Operacionais versionados.
-- Migration aditiva: não remove nem reescreve cartões do dia, templates ou
-- históricos existentes. A tabela legada cartao_grupos_modelo é mantida para
-- preservar os ids usados por cartões antigos.

alter table public.cartao_grupos_modelo
  add column if not exists versao integer not null default 0;
alter table public.cartao_grupos_modelo
  add column if not exists publicado boolean not null default false;
alter table public.cartao_grupos_modelo
  add column if not exists publicado_em timestamptz;
alter table public.cartao_grupos_modelo
  add column if not exists publicado_por text;
alter table public.cartao_grupos_modelo
  add column if not exists descricao text not null default '';
alter table public.cartao_grupos_modelo
  add column if not exists metadados jsonb not null default '{}'::jsonb;
alter table public.cartao_grupos_modelo
  add column if not exists componentes jsonb not null default '[]'::jsonb;

-- Registros legados ativos continuam disponíveis como primeira fotografia.
-- A publicação explícita passa a ser exigida somente para novas versões.
update public.cartao_grupos_modelo
   set publicado = ativo,
       versao = case when ativo then greatest(versao, 1) else versao end
 where versao = 0;

create table if not exists public.cartao_grupos_modelo_versoes (
  id text primary key,
  grupo_id text not null references public.cartao_grupos_modelo(id) on delete cascade,
  versao integer not null check (versao > 0),
  criado_em timestamptz not null default now(),
  criado_por text not null,
  snapshot jsonb not null,
  unique (grupo_id, versao)
);
create index if not exists idx_cartao_grupos_modelo_versoes_grupo
  on public.cartao_grupos_modelo_versoes (grupo_id, versao desc);

-- Gera uma fotografia inicial para grupos antigos. A operação é idempotente e
-- só preenche lacunas; versões novas são sempre criadas pela API ao publicar.
insert into public.cartao_grupos_modelo_versoes (id, grupo_id, versao, criado_por, snapshot)
select
  'popv-legado-' || g.id,
  g.id,
  greatest(g.versao, 1),
  coalesce(nullif(g.criado_por, ''), 'sistema'),
  to_jsonb(g)
from public.cartao_grupos_modelo g
where g.publicado = true
  and not exists (
    select 1 from public.cartao_grupos_modelo_versoes v
     where v.grupo_id = g.id and v.versao = greatest(g.versao, 1)
  );

alter table public.cartao_grupos_modelo_versoes enable row level security;
revoke all on table public.cartao_grupos_modelo_versoes from anon, authenticated;
grant select, insert, update, delete on table public.cartao_grupos_modelo_versoes to service_role;
