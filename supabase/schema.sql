-- =================================================================
-- SGO 5º BPM — Schema Postgres (Supabase)
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Supabase Dashboard > SQL Editor > New Query > colar > Run).
--
-- Segurança: o app acessa o Supabase SOMENTE pelo backend (server.js),
-- usando a Service Role Key, que ignora RLS. A autorização (P3 x Adjunto
-- x Oficial) continua sendo feita no Express, como já era com o JSON.
-- Por isso as tabelas abaixo não têm RLS/políticas — nenhum cliente do
-- navegador fala diretamente com o Supabase.
-- =================================================================

create table if not exists eventos (
  id text primary key,
  num_oficio text default '',
  num_os_manual text default '',
  num_sei text default '',
  nome_evento text not null,
  tipo_evento text not null,
  demandante text default '',
  data_inicio date not null,
  data_termino date,
  horario_inicio text default '',
  local_itinerario text default '',
  bairro text default '',
  created_at timestamptz default now()
);

create table if not exists alocacoes (
  id text primary key,
  evento_id text not null references eventos(id) on delete cascade,
  modalidade text default '',
  qtd_policiais int default 0,
  qtd_viaturas int default 0,
  prefixos_vtr text default '',
  comando_servico text default ''
);
create index if not exists idx_alocacoes_evento on alocacoes(evento_id);

create table if not exists escalas (
  id text primary key,
  evento_id text not null references eventos(id) on delete cascade,
  militar_nome text not null,
  militar_id text default '',
  qtd_aparicoes int not null default 1,
  total_diarias int not null default 2
);
create index if not exists idx_escalas_evento on escalas(evento_id);

-- Missões planejadas: entidade independente de "eventos", usada só no Planejador de Diárias
-- para reservar diárias no mês antes de um evento existir de fato (ou sem nunca virar evento).
create table if not exists missoes_planejadas (
  id text primary key,
  nome text not null,
  tipo_recorrencia text not null check (tipo_recorrencia in ('diaria', 'fim_de_semana', 'dia_unico')),
  data_inicio date not null,
  data_fim date not null,
  qtd_diarias_por_ocorrencia int not null,
  mes text not null,
  ano text not null,
  convertida_em_evento_id text default null references eventos(id) on delete set null
);
create index if not exists idx_missoes_planejadas_mes_ano on missoes_planejadas(ano, mes);

create table if not exists usuarios (
  usuario text primary key,
  senha text not null,
  role text not null check (role in ('P3', 'Adjunto', 'Oficial')),
  nome text not null
);

create table if not exists sessoes (
  token text primary key,
  usuario text not null,
  role text not null,
  nome text not null,
  expira bigint not null
);

create table if not exists config (
  id int primary key default 1,
  cota_mensal_diarias int not null default 0,
  constraint config_linha_unica check (id = 1)
);
insert into config (id, cota_mensal_diarias) values (1, 0)
  on conflict (id) do nothing;

create table if not exists bairros_coordenadas (
  id text primary key,
  nome_bairro text not null unique,
  latitude double precision not null,
  longitude double precision not null
);

create table if not exists pessoal (
  id text primary key,
  nome text not null,
  posto_graduacao text not null,
  tipo text not null check (tipo in ('Praça', 'Oficial')),
  categorias text[] not null default '{}', -- pode ficar vazio: efetivo geral sem papel no Cartão Programa ainda
  ativo boolean not null default true,
  matricula text default '', -- RE (matrícula), opcional, alimentado pela importação do relatório de efetivo do SGEPM
  subunidade text default '' -- PCS / 1ª Companhia / 2ª Companhia / 3ª Companhia, texto livre (mesmo domínio de `companhia` em viaturas, mas sem "Não informada")
);

-- Cadastro central de viaturas: alimenta o autocomplete de prefixo no Cartão Programa,
-- mas o campo lá continua aceitando texto livre (reservas rotativas não são cadastradas).
create table if not exists viaturas (
  id text primary key,
  prefixo text not null unique,
  companhia text,
  categoria text not null default 'Ordinária' check (categoria in ('Ordinária', 'Força Tática', 'Suplementar')),
  status text not null default 'Ativa' check (status in ('Ativa', 'Manutenção')),
  observacao text default '',
  -- Setor padrão da viatura, usado pelo Mapa quando não há item de roteiro ativo no
  -- Cartão Programa do dia (prioridade: item ativo agora > setor central > setor do dia).
  setor text
);

-- Cartão Programa: viaturas/itens ficam em JSONB (mesmo formato aninhado que já
-- existia no db.json) em vez de tabelas filhas — reduz drasticamente a reescrita
-- das rotas de sub-recurso (adicionar/editar/excluir viatura e item) sem perder
-- nada da estrutura ou das regras de negócio já implementadas.
create table if not exists cartoes (
  id text primary key,
  data date, -- null para templates
  fiscal text default '',
  adjunto text default '',
  oficial_sobreaviso text default '',
  is_template boolean not null default false,
  nome_template text,
  tipo_periodo text check (tipo_periodo is null or tipo_periodo in ('semana', 'fim_de_semana')),
  qtd_viaturas_base int,
  origem_template_id text references cartoes(id) on delete set null,
  viaturas jsonb not null default '[]'::jsonb
);

-- Garante no banco a regra "só um Cartão Programa por data" (templates, com data
-- null, ficam de fora do índice — vários templates podem coexistir sem data).
create unique index if not exists cartoes_data_unica
  on cartoes (data)
  where is_template = false;

-- Trilha de auditoria: fora da lista TABELAS/readDB()/writeDB() de propósito — é um log
-- que só cresce, não pode entrar no ciclo de leitura da tabela inteira a cada requisição.
-- Acesso via consultas pontuais (insert no registro; select filtrado na tela de consulta).
create table if not exists auditoria (
  id text primary key,
  usuario text not null,
  acao text not null check (acao in ('criar', 'editar', 'excluir')),
  entidade text not null,
  entidade_id text,
  descricao_resumida text default '',
  criado_em bigint not null
);
create index if not exists idx_auditoria_criado_em on auditoria(criado_em desc);
create index if not exists idx_auditoria_usuario on auditoria(usuario);
create index if not exists idx_auditoria_entidade on auditoria(entidade);
