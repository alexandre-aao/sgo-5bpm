-- =================================================================
-- SGO 5º BPM — Schema Postgres (Supabase)
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Supabase Dashboard > SQL Editor > New Query > colar > Run).
--
-- Segurança: o app acessa o Supabase SOMENTE pelo backend (server.js),
-- usando a Service Role Key, que ignora RLS (service_role tem BYPASSRLS).
-- A autorização (P3 x Adjunto x Oficial) continua sendo feita no Express,
-- como já era com o JSON — nenhum cliente do navegador fala diretamente
-- com o Supabase.
-- RLS: todas as tabelas públicas têm RLS HABILITADO, sem policies (ver
-- bloco no final deste arquivo). Sem policy, os roles anon/authenticated
-- ficam bloqueados; o service_role do backend passa por cima. Isso fecha
-- o alerta rls_disabled_in_public do Supabase sem afetar o app.
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
  -- Rua e número (migration 005). Opcional: eventos anteriores a ela não têm, e
  -- não houve backfill — `local_itinerario` guardava o bairro, não o endereço.
  endereco text default '',
  bairro text default '',
  created_at timestamptz default now()
);

-- Operações: registro ÚNICO planejamento -> execução (não duplica registro como
-- fazia missoes_planejadas). Separadas de "eventos": eventos são civis/sem diária;
-- operações geram diária (via escalas) ou reservam diária estimada quando ainda Planejada.
create table if not exists operacoes (
  id text primary key,
  num_oficio text default '',
  num_os_manual text default '',
  num_sei text default '',
  nome_operacao text not null,
  tipo_operacao text not null default 'Outras',
    -- Ostensiva, Saturação, Cerco, Blitz, Cumprimento de Mandado, Reforço, Outras
  demandante text default '',
  data_inicio date not null,
  data_termino date,
  horario_inicio text default '',
  local_itinerario text default '',
  bairro text default '',
  situacao text not null default 'Planejada'
    check (situacao in ('Planejada', 'Executada')),
  qtd_diarias_estimada int not null default 0,
  tipo_recorrencia text
    check (tipo_recorrencia is null or tipo_recorrencia in ('diaria','fim_de_semana','dia_unico')),
  -- Recorrência (migration 004): as ocorrências de um mesmo lote compartilham o
  -- grupo_recorrencia_id (TEXT, generateId('grp'); null = operação avulsa) e gravam
  -- a mesma recorrencia_regra. Com recorrência ativa cada ocorrência é de UM dia
  -- (data_inicio = data_termino) e o "fim" da regra vive em recorrencia_regra.data_fim.
  -- tipo_recorrencia acima é OUTRO campo — rótulo descritivo anterior, mantido.
  grupo_recorrencia_id text,
  recorrencia_regra jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_operacoes_grupo_recorrencia on operacoes(grupo_recorrencia_id);

-- Uma alocação pertence a UM evento OU a UMA operação — nunca aos dois, nunca a
-- nenhum (constraint alocacoes_um_vinculo). Por isso evento_id agora é nullable.
create table if not exists alocacoes (
  id text primary key,
  evento_id text references eventos(id) on delete cascade,
  operacao_id text references operacoes(id) on delete cascade,
  modalidade text default '',
  qtd_policiais int default 0,
  qtd_viaturas int default 0,
  prefixos_vtr text default '',
  comando_servico text default '',
  constraint alocacoes_um_vinculo check (
    (evento_id is not null)::int + (operacao_id is not null)::int = 1
  )
);
create index if not exists idx_alocacoes_evento on alocacoes(evento_id);
create index if not exists idx_alocacoes_operacao on alocacoes(operacao_id);

-- Escala nominal de diárias: pertence a uma OPERAÇÃO (antes era evento_id).
create table if not exists escalas (
  id text primary key,
  operacao_id text not null references operacoes(id) on delete cascade,
  militar_nome text not null,
  militar_id text default '',
  qtd_aparicoes int not null default 1,
  total_diarias int not null default 2,
  -- Data da escala (migration 004). Denormalização deliberada: antes a escala era
  -- datada só pela data_inicio da operação. Nullable e sem backfill — escala antiga
  -- fica null e o leitor cai no fallback operacao.data_inicio.
  data date
);
create index if not exists idx_escalas_operacao on escalas(operacao_id);
create index if not exists idx_escalas_operacao_data on escalas(operacao_id, data);

-- (A antiga tabela `missoes_planejadas` foi migrada para `operacoes` — situacao='Planejada'
--  com qtd_diarias_estimada — e removida do banco via DROP TABLE. Sem tabela separada.)

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

-- Cadastro de bairros do batalhão. É o ÚNICO cadastro de bairro do projeto:
-- alimenta o select de Bairro em Evento, os marcadores do Mapa, o vínculo da
-- viatura no Cartão Programa e o escopo dos Avisos Operacionais.
-- Coordenada é opcional (migration 001): um bairro pode existir só para receber
-- aviso/vincular viatura, sem estar plotado no Mapa.
create table if not exists bairros_coordenadas (
  id text primary key,
  nome_bairro text not null unique,
  latitude double precision,
  longitude double precision,
  ativo boolean not null default true
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
-- Campos de nível DIA. O que é por VIATURA (bairro_id, comandante_pessoal_id,
-- comandante_exibicao, versao, status_envio, gerado_em, avisos_ids[]) fica no
-- JSONB `viaturas`, não aqui — um cartão é um DIA com N viaturas, e status de
-- envio/versão do PDF são por viatura.
-- "Delta 07" é o rótulo operacional do Fiscal de Operações: os campos são
-- fiscal_*, e a coluna `fiscal` (nome em texto) segue existindo por
-- compatibilidade com os cartões antigos. Os `*_exibicao` congelam
-- "graduação + nome de guerra" no momento em que o PDF é gerado.
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
  viaturas jsonb not null default '[]'::jsonb,
  ano smallint,
  numero integer,
  fiscal_pessoal_id text,
  adjunto_pessoal_id text,
  fiscal_exibicao text,
  adjunto_exibicao text,
  delta07_viatura text,
  padrao_ativo boolean not null default false,
  -- Carimbo mantido por trigger (migration 007), para detectar edição concorrente
  -- entre P3 e Adjunto. Nenhum código lê ainda.
  atualizado_em timestamptz
);

-- Numeração 000123/2026: única por ano. Templates (sem data) e cartões
-- históricos ainda não numerados ficam fora do índice.
create unique index if not exists idx_cartoes_numero_ano
  on cartoes (ano, numero)
  where numero is not null;

-- Padrão único de Cartão Programa: só um template pode estar com
-- padrao_ativo=true por vez (ver migrations/002_cartao_padrao_unico.sql).
-- O CHECK impede que um cartão do dia carregue a flag fora do índice.
alter table cartoes
  add constraint cartoes_padrao_so_template check (not padrao_ativo or is_template);

create unique index if not exists ux_cartoes_padrao_unico
  on cartoes (padrao_ativo)
  where is_template = true and padrao_ativo = true;

-- Troca o padrão ativo numa transação só, para nunca haver um instante
-- sem padrão nenhum (índice único não é deferível).
create or replace function ativar_cartao_padrao(p_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from cartoes where id = p_id and is_template) then
    raise exception 'Cartão padrão % não encontrado', p_id;
  end if;
  update cartoes set padrao_ativo = false
   where is_template and padrao_ativo and id <> p_id;
  update cartoes set padrao_ativo = true
   where id = p_id;
end; $$;
revoke execute on function ativar_cartao_padrao(text) from public;
revoke execute on function ativar_cartao_padrao(text) from anon, authenticated;

-- Avisos Operacionais: a P3 cadastra a orientação de um bairro (ou de uma
-- Companhia) e ela entra automaticamente no Cartão Programa das viaturas
-- alocadas naquele bairro. O vínculo cartão x aviso é `avisos_ids[]` no JSONB
-- da viatura — só ids, o texto nunca é duplicado.
create table if not exists avisos (
  id text primary key,
  bairro_id text references bairros_coordenadas(id) on delete set null,
  companhia text check (companhia is null or companhia in ('1ª Companhia', '2ª Companhia', '3ª Companhia')),
  categoria text not null default '', -- texto livre
  prioridade text not null default 'informativa'
    check (prioridade in ('informativa', 'atencao', 'alta', 'critica')),
  texto text not null check (char_length(texto) <= 240),
  data_inicio date not null default current_date,
  data_fim date, -- vigência padrão de 30 dias, definida pelo app; null + permanente = sem prazo
  permanente boolean not null default false,
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  constraint aviso_tem_escopo check (bairro_id is not null or companhia is not null)
);
create index if not exists idx_avisos_bairro on avisos (bairro_id) where ativo;

-- Sequencial de cartão por ano, com a corrida resolvida no próprio banco
-- (INSERT ... ON CONFLICT DO UPDATE serializa na linha do ano).
create table if not exists contador_cartoes (
  ano smallint primary key,
  ultimo integer not null default 0
);

create or replace function proximo_numero_cartao(p_ano smallint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  insert into contador_cartoes (ano, ultimo) values (p_ano, 1)
  on conflict (ano) do update set ultimo = contador_cartoes.ultimo + 1
  returning ultimo into v;
  return v;
end; $$;

revoke execute on function proximo_numero_cartao(smallint) from public;
revoke execute on function proximo_numero_cartao(smallint) from anon, authenticated;

-- Garante no banco a regra "só um Cartão Programa por data" (templates, com data
-- null, ficam de fora do índice — vários templates podem coexistir sem data).
create unique index if not exists cartoes_data_unica
  on cartoes (data)
  where is_template = false;

-- Histórico rastreável das emissões realizadas pela Central de Emissão. A
-- versão operacional continua em cada viatura do JSONB `cartoes.viaturas`;
-- esta tabela registra quem emitiu, como emitiu e o snapshot daquele recorte.
create table if not exists emissoes_cartao (
  id text primary key,
  cartao_id text not null references cartoes(id) on delete cascade,
  usuario text not null,
  usuario_nome text not null default '',
  emitido_em timestamptz not null default now(),
  modalidade text not null check (modalidade in ('guarnicao', 'arquivo_sei', 'consolidado', 'personalizado')),
  formato text not null check (formato in ('celular', 'a4')),
  tipo_documento text not null check (tipo_documento in ('individual', 'consolidado')),
  agrupamento text not null default 'nenhum' check (agrupamento in ('nenhum', 'companhia', 'categoria')),
  com_alertas boolean not null default false,
  viaturas_ids text[] not null default '{}',
  versao integer not null default 1,
  acao text not null check (acao in ('gerado', 'enviado')),
  status text not null default 'gerado' check (status in ('gerado', 'enviado', 'retificado', 'substituido')),
  snapshot jsonb not null default '{}'::jsonb
);
create index if not exists idx_emissoes_cartao_cartao_data
  on emissoes_cartao (cartao_id, emitido_em desc);
create index if not exists idx_emissoes_cartao_viaturas
  on emissoes_cartao using gin (viaturas_ids);

revoke all on table emissoes_cartao from anon, authenticated;
grant select, insert, update, delete on table emissoes_cartao to service_role;

-- Atualiza o estado das viaturas e o histórico na mesma transação. O backend
-- chama esta função com service_role; o navegador não recebe acesso direto.
create or replace function registrar_emissao_cartao(
  p_cartao_id text,
  p_viaturas jsonb,
  p_emissao jsonb,
  p_retificacao boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viaturas_ids text[] := array(
    select jsonb_array_elements_text(coalesce(p_emissao -> 'viaturas_ids', '[]'::jsonb))
  );
begin
  update cartoes set viaturas = p_viaturas where id = p_cartao_id;
  if not found then raise exception 'Cartão Programa não encontrado.'; end if;

  if p_retificacao then
    update emissoes_cartao
       set status = 'substituido'
     where cartao_id = p_cartao_id
       and status in ('gerado', 'enviado', 'retificado')
       and viaturas_ids && v_viaturas_ids;
  end if;

  insert into emissoes_cartao (
    id, cartao_id, usuario, usuario_nome, emitido_em, modalidade, formato,
    tipo_documento, agrupamento, com_alertas, viaturas_ids, versao, acao,
    status, snapshot
  ) values (
    p_emissao ->> 'id', p_cartao_id, p_emissao ->> 'usuario',
    coalesce(p_emissao ->> 'usuario_nome', ''),
    (p_emissao ->> 'emitido_em')::timestamptz,
    p_emissao ->> 'modalidade', p_emissao ->> 'formato',
    p_emissao ->> 'tipo_documento',
    coalesce(p_emissao ->> 'agrupamento', 'nenhum'),
    coalesce((p_emissao ->> 'com_alertas')::boolean, false), v_viaturas_ids,
    coalesce((p_emissao ->> 'versao')::integer, 1), p_emissao ->> 'acao',
    coalesce(p_emissao ->> 'status', 'gerado'),
    coalesce(p_emissao -> 'snapshot', '{}'::jsonb)
  );
end;
$$;

revoke all on function registrar_emissao_cartao(text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function registrar_emissao_cartao(text, jsonb, jsonb, boolean) to service_role;


-- =================================================================
-- ÍNDICES DE PERFORMANCE (fase de performance, 2026-07). Idempotentes.
-- Cobrem os filtros por igualdade/ordenação mais usados pelas rotas
-- (readTabela .eq() e as agregadoras). Não alteram comportamento — o
-- Postgres passa a usá-los sozinho. alocacoes é filtrada por evento_id
-- OU operacao_id separadamente (nunca as duas juntas) -> dois índices
-- simples, não um composto.
-- =================================================================
create index if not exists idx_operacoes_data_inicio on operacoes(data_inicio);
create index if not exists idx_escalas_operacao_id    on escalas(operacao_id);
create index if not exists idx_cartoes_data           on cartoes(data);
create index if not exists idx_eventos_data_inicio    on eventos(data_inicio);
create index if not exists idx_pessoal_nome_guerra    on pessoal(nome_guerra);
create index if not exists idx_alocacoes_evento_id    on alocacoes(evento_id);
create index if not exists idx_alocacoes_operacao_id  on alocacoes(operacao_id);


-- =================================================================
-- RLS: habilita Row Level Security em TODAS as tabelas públicas, sem
-- policies. Migration "ativar_rls_tabelas_publicas" (2026-07). Idempotente.
-- O backend usa service_role (BYPASSRLS), então isto não afeta o app;
-- apenas bloqueia acesso direto via anon/authenticated e fecha o alerta
-- rls_disabled_in_public do Supabase.
-- =================================================================
alter table if exists eventos             enable row level security;
alter table if exists alocacoes           enable row level security;
alter table if exists escalas             enable row level security;
alter table if exists usuarios            enable row level security;
alter table if exists sessoes             enable row level security;
alter table if exists config              enable row level security;
alter table if exists bairros_coordenadas enable row level security;
alter table if exists pessoal             enable row level security;
alter table if exists cartoes             enable row level security;
alter table if exists operacoes           enable row level security;
alter table if exists viaturas            enable row level security;
alter table if exists avisos              enable row level security;
alter table if exists contador_cartoes    enable row level security;
alter table if exists emissoes_cartao     enable row level security;
