-- SGO 5º BPM — Eventos administráveis, auditoria e troca obrigatória de senha.
-- Aplique no SQL Editor do Supabase. Todas as operações são aditivas/idempotentes.

create table if not exists tipos_evento (
  id text primary key,
  nome text not null,
  descricao text default '',
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_tipos_evento_nome_normalizado
  on tipos_evento (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')));
create index if not exists idx_tipos_evento_ativo_nome on tipos_evento (ativo, nome);
insert into tipos_evento (id, nome, descricao, ativo, criado_por) values
  ('tev_show', 'Show', '', true, 'sistema'),
  ('tev_futebol', 'Futebol', '', true, 'sistema'),
  ('tev_ato_publico', 'Ato Público', '', true, 'sistema'),
  ('tev_religioso', 'Religioso', '', true, 'sistema'),
  ('tev_cultural', 'Cultural', '', true, 'sistema'),
  ('tev_evento_junino', 'Evento Junino', '', true, 'sistema'),
  ('tev_missao_avulsa', 'Missão Avulsa', '', true, 'sistema'),
  ('tev_outros', 'Outros', '', true, 'sistema')
on conflict do nothing;

alter table usuarios add column if not exists exigir_troca_senha boolean not null default false;
alter table usuarios add column if not exists ativo boolean not null default true;
alter table sessoes add column if not exists exigir_troca_senha boolean not null default false;

create table if not exists auditoria (
  id text primary key,
  usuario text not null,
  usuario_id text,
  usuario_nome text,
  criado_em bigint not null,
  acao text not null,
  entidade text not null,
  entidade_id text,
  descricao_resumida text,
  campos_alterados jsonb not null default '{}'::jsonb
);
alter table auditoria add column if not exists usuario_id text;
alter table auditoria add column if not exists usuario_nome text;
alter table auditoria add column if not exists campos_alterados jsonb not null default '{}'::jsonb;
create index if not exists idx_auditoria_criado_em on auditoria (criado_em desc);
create index if not exists idx_auditoria_usuario on auditoria (usuario);
create index if not exists idx_auditoria_entidade on auditoria (entidade, acao);

-- O navegador nunca acessa estas tabelas diretamente. O backend usa service_role;
-- sem policies, anon/authenticated ficam bloqueados mesmo quando o schema public
-- estiver exposto pela Data API.
alter table tipos_evento enable row level security;
alter table auditoria enable row level security;
