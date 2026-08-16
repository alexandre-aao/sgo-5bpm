-- SGO 5º BPM — Alterações do Serviço.
-- Migration aditiva. O navegador não acessa estas tabelas: toda autorização
-- usuário → perfil → unidade → operação permanece no backend Express.

alter table public.usuarios drop constraint if exists usuarios_role_check;
alter table public.usuarios
  add constraint usuarios_role_check
  check (role in ('P3', 'Adjunto', 'Oficial', 'Sargenteante'));

alter table public.usuarios add column if not exists unidade text;
alter table public.usuarios drop constraint if exists usuarios_unidade_sargenteante_check;
alter table public.usuarios
  add constraint usuarios_unidade_sargenteante_check check (
    (role = 'Sargenteante' and unidade in ('1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS'))
    or (role <> 'Sargenteante' and unidade is null)
  );

alter table public.sessoes add column if not exists unidade text;

create table if not exists public.composicoes_servico (
  id text primary key,
  unidade text not null check (unidade in ('1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS')),
  data date not null,
  turno text not null check (length(trim(turno)) between 1 and 40),
  qtd_viaturas_previstas integer not null check (qtd_viaturas_previstas between 0 and 99),
  policiais_por_viatura integer not null check (policiais_por_viatura between 1 and 20),
  qtd_extras integer not null default 0 check (qtd_extras between 0 and 999),
  observacao text,
  criado_por text not null references public.usuarios(usuario) on update cascade,
  criado_em timestamptz not null default now(),
  atualizado_por text not null references public.usuarios(usuario) on update cascade,
  atualizado_em timestamptz not null default now(),
  constraint composicoes_servico_unidade_data_turno_key unique (unidade, data, turno)
);

create table if not exists public.alteracoes_servico (
  id text primary key,
  unidade text not null check (unidade in ('1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS')),
  data_inicio date not null,
  data_fim date not null,
  turno text not null check (length(trim(turno)) between 1 and 40),
  policial_pessoal_id text not null references public.pessoal(id) on update cascade,
  policial_nome text not null,
  policial_matricula text,
  tipo text not null check (tipo in ('PERMUTA', 'ATESTADO', 'DISPENSA/FOLGA', 'FÉRIAS', 'CURSO', 'LICENÇA', 'AFASTAMENTO', 'FALTA PREVISTA', 'OUTRO')),
  substituto_pessoal_id text references public.pessoal(id) on update cascade,
  substituto_nome text,
  substituto_matricula text,
  data_referencia_servico date,
  motivo text not null,
  observacoes text,
  numero_documento text,
  situacao text not null default 'INFORMADA' check (situacao in ('INFORMADA', 'CONFIRMADA', 'CANCELADA')),
  criado_por text not null references public.usuarios(usuario) on update cascade,
  criado_em timestamptz not null default now(),
  atualizado_por text not null references public.usuarios(usuario) on update cascade,
  atualizado_em timestamptz not null default now(),
  constraint alteracoes_servico_periodo_check check (data_fim >= data_inicio),
  constraint alteracoes_servico_permuta_check check (
    tipo <> 'PERMUTA'
    or (substituto_pessoal_id is not null and substituto_pessoal_id <> policial_pessoal_id)
  ),
  constraint alteracoes_servico_substituto_snapshot_check check (
    substituto_pessoal_id is null or length(trim(coalesce(substituto_nome, ''))) > 0
  )
);

create table if not exists public.alteracoes_servico_ciencias (
  id text primary key,
  alteracao_id text not null references public.alteracoes_servico(id) on delete restrict,
  usuario text not null references public.usuarios(usuario) on update cascade,
  usuario_nome text not null,
  criado_em timestamptz not null default now(),
  constraint alteracoes_servico_ciencias_unica unique (alteracao_id, usuario)
);

create table if not exists public.alteracoes_servico_divergencias (
  id text primary key,
  alteracao_id text not null references public.alteracoes_servico(id) on delete restrict,
  descricao text not null check (length(trim(descricao)) between 3 and 1000),
  criado_por text not null references public.usuarios(usuario) on update cascade,
  criado_por_nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.alteracoes_servico_historico (
  id text primary key,
  alteracao_id text not null references public.alteracoes_servico(id) on delete restrict,
  acao text not null check (acao in ('CRIAÇÃO', 'EDIÇÃO', 'CONFIRMAÇÃO', 'CANCELAMENTO', 'CIÊNCIA', 'DIVERGÊNCIA')),
  usuario text not null references public.usuarios(usuario) on update cascade,
  usuario_nome text not null,
  criado_em timestamptz not null default now(),
  valores_anteriores jsonb,
  valores_novos jsonb
);

create index if not exists idx_composicoes_servico_data_unidade
  on public.composicoes_servico (data, unidade, turno);
create index if not exists idx_alteracoes_servico_periodo_unidade
  on public.alteracoes_servico (unidade, data_inicio, data_fim, turno);
create index if not exists idx_alteracoes_servico_situacao
  on public.alteracoes_servico (situacao, data_inicio);
create index if not exists idx_alteracoes_servico_policial
  on public.alteracoes_servico (policial_pessoal_id, data_inicio desc);
create index if not exists idx_alteracoes_servico_matricula
  on public.alteracoes_servico (policial_matricula);
create index if not exists idx_alteracoes_servico_historico_registro
  on public.alteracoes_servico_historico (alteracao_id, criado_em desc);
create index if not exists idx_alteracoes_servico_divergencias_registro
  on public.alteracoes_servico_divergencias (alteracao_id, criado_em desc);

alter table public.composicoes_servico enable row level security;
alter table public.alteracoes_servico enable row level security;
alter table public.alteracoes_servico_ciencias enable row level security;
alter table public.alteracoes_servico_divergencias enable row level security;
alter table public.alteracoes_servico_historico enable row level security;

revoke all on table public.composicoes_servico from anon, authenticated;
revoke all on table public.alteracoes_servico from anon, authenticated;
revoke all on table public.alteracoes_servico_ciencias from anon, authenticated;
revoke all on table public.alteracoes_servico_divergencias from anon, authenticated;
revoke all on table public.alteracoes_servico_historico from anon, authenticated;
grant select, insert, update, delete on table public.composicoes_servico to service_role;
grant select, insert, update, delete on table public.alteracoes_servico to service_role;
grant select, insert on table public.alteracoes_servico_ciencias to service_role;
grant select, insert on table public.alteracoes_servico_divergencias to service_role;
grant select, insert on table public.alteracoes_servico_historico to service_role;
