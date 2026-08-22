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
  operacao_gerada_id text,
  created_at timestamptz default now()
);

-- Tipos de Evento: cadastro administrável pela P3. O texto em `eventos.tipo_evento`
-- continua sendo preservado para manter compatibilidade com os eventos antigos;
-- este cadastro só passa a ser a fonte dos novos registros.
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
  endereco text default '',
  evento_origem_id text references eventos(id) on delete set null,
  diaria_definida boolean not null default false,
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
create unique index if not exists ux_operacoes_evento_origem
  on operacoes(evento_origem_id) where evento_origem_id is not null;

-- Vínculo navegável nos dois sentidos. As FKs usam SET NULL para preservar o
-- registro restante caso um dos lados seja removido no futuro.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_operacao_gerada_id_fkey') then
    alter table eventos add constraint eventos_operacao_gerada_id_fkey
      foreign key (operacao_gerada_id) references operacoes(id) on delete set null;
  end if;
end $$;
create index if not exists idx_eventos_operacao_gerada
  on eventos(operacao_gerada_id) where operacao_gerada_id is not null;

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
  constraint escalas_total_diarias_nao_negativo check (total_diarias >= 0),
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
  role text not null check (role in ('P3', 'Adjunto', 'Oficial', 'Sargenteante')),
  nome text not null,
  unidade text
);
alter table usuarios add column if not exists exigir_troca_senha boolean not null default false;
alter table usuarios add column if not exists ativo boolean not null default true;
alter table usuarios add column if not exists unidade text;

create table if not exists sessoes (
  token text primary key,
  usuario text not null,
  role text not null,
  nome text not null,
  expira bigint not null,
  unidade text,
  exigir_troca_senha boolean not null default false
);
alter table sessoes add column if not exists exigir_troca_senha boolean not null default false;
alter table sessoes add column if not exists unidade text;

-- Log operacional curto (30 dias). Nunca recebe senha, hash, token ou segredo.
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
  nome_guerra text default '', -- forma curta usada nos cartões, escalas e relatórios operacionais
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
  tipo_modelo text check (tipo_modelo is null or tipo_modelo in ('ordinario', 'operacao')),
  -- Carimbo mantido por trigger (migration 007), para detectar edição concorrente
  -- entre P3 e Adjunto. Nenhum código lê ainda.
  atualizado_em timestamptz
);
alter table cartoes add column if not exists estado_template text;
alter table cartoes add column if not exists publicado_em timestamptz;
alter table cartoes add column if not exists publicado_por text;
alter table cartoes add column if not exists versao_publicada integer;
update cartoes set estado_template = case when padrao_ativo then 'publicado' else 'rascunho' end
 where is_template = true and estado_template is null;
alter table cartoes drop constraint if exists cartoes_estado_template_check;
alter table cartoes add constraint cartoes_estado_template_check
  check (estado_template is null or estado_template in ('rascunho', 'publicado'));

-- Snapshots independentes das edições do template. A linha de `cartoes` continua
-- sendo o rascunho atual; cartões do dia recebem cópia profunda do snapshot
-- publicado e não mantêm referência viva ao modelo.
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

-- Biblioteca de blocos reutilizáveis (viatura/grupo), separada dos cartões reais.
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
  -- A linha é o rascunho atual; a fotografia publicada fica na tabela de
  -- versões. `versao = 0` representa um padrão ainda não publicado.
  versao integer not null default 0,
  publicado boolean not null default false,
  publicado_em timestamptz,
  publicado_por text,
  descricao text not null default '',
  metadados jsonb not null default '{}'::jsonb,
  componentes jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_cartao_grupos_modelo_nome_normalizado
  on cartao_grupos_modelo (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')));
create index if not exists idx_cartao_grupos_modelo_filtros on cartao_grupos_modelo (ativo, tipo, bairro);

-- Histórico imutável de fotografias dos padrões operacionais. Cartões do dia
-- copiam a fotografia e os metadados para o JSONB de cada viatura, portanto
-- uma edição futura do padrão não altera o histórico operacional.
create table if not exists cartao_grupos_modelo_versoes (
  id text primary key,
  grupo_id text not null references cartao_grupos_modelo(id) on delete cascade,
  versao integer not null check (versao > 0),
  criado_em timestamptz not null default now(),
  criado_por text not null,
  snapshot jsonb not null,
  unique (grupo_id, versao)
);
create index if not exists idx_cartao_grupos_modelo_versoes_grupo
  on cartao_grupos_modelo_versoes (grupo_id, versao desc);

-- Numeração 000123/2026: única por ano. Templates (sem data) e cartões
-- históricos ainda não numerados ficam fora do índice.
create unique index if not exists idx_cartoes_numero_ano
  on cartoes (ano, numero)
  where numero is not null;

-- Existe um único Modelo Ordinário ativo. `tipo_periodo` permanece apenas para
-- leitura de templates históricos; não participa mais da seleção automática.
alter table cartoes drop constraint if exists cartoes_padrao_so_template;
alter table cartoes add constraint cartoes_padrao_so_template
  check (not padrao_ativo or is_template);
alter table cartoes drop constraint if exists cartoes_padrao_exige_modelo_ordinario;
alter table cartoes add constraint cartoes_padrao_exige_modelo_ordinario
  check (not padrao_ativo or (is_template = true and tipo_modelo = 'ordinario'));

create unique index if not exists ux_cartoes_padrao_ordinario_unico
  on cartoes (padrao_ativo)
  where is_template = true and padrao_ativo = true and tipo_modelo = 'ordinario';

-- Troca o único Modelo Ordinário ativo numa transação só.
create or replace function ativar_cartao_padrao(p_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from cartoes
     where id = p_id and is_template = true and tipo_modelo = 'ordinario'
  ) then
    raise exception 'Modelo ordinário % não encontrado', p_id;
  end if;

  update cartoes set padrao_ativo = false
   where is_template = true and padrao_ativo = true and tipo_modelo = 'ordinario' and id <> p_id;
  update cartoes set padrao_ativo = true where id = p_id;
end; $$;
revoke all on function ativar_cartao_padrao(text) from public, anon, authenticated;
grant execute on function ativar_cartao_padrao(text) to service_role;

-- Carimbo automático usado na futura proteção contra edição concorrente.
create or replace function cartoes_marcar_atualizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_cartoes_atualizado_em on cartoes;
create trigger trg_cartoes_atualizado_em
  before insert or update on cartoes
  for each row execute function cartoes_marcar_atualizacao();

-- Publicação transacional do cartão padrão: o compare-and-swap da linha, o
-- snapshot publicado e a retenção das cinco versões confirmam ou falham juntos.
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
  modalidade text not null check (modalidade in ('guarnicao', 'arquivo_sei', 'consolidado', 'quadro_resumo', 'personalizado')),
  formato text not null check (formato in ('celular', 'a4')),
  tipo_documento text not null check (tipo_documento in ('individual', 'consolidado', 'quadro_resumo')),
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
  p_retificacao boolean,
  p_atualizado_em timestamptz
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_viaturas_ids text[] := array(
    select jsonb_array_elements_text(coalesce(p_emissao -> 'viaturas_ids', '[]'::jsonb))
  );
begin
  update cartoes
     set viaturas = p_viaturas
   where id = p_cartao_id
     and atualizado_em = p_atualizado_em;
  if not found then
    raise exception using errcode = 'P0001', message = 'CARTAO_DESATUALIZADO';
  end if;

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

revoke all on function registrar_emissao_cartao(text, jsonb, jsonb, boolean, timestamptz) from public, anon, authenticated;
grant execute on function registrar_emissao_cartao(text, jsonb, jsonb, boolean, timestamptz) to service_role;

-- Conversão transacional: preserva o evento original, cria a operação com os
-- campos compatíveis e grava os dois lados do vínculo sem janela intermediária.
create or replace function converter_evento_em_operacao(
  p_evento_id text,
  p_operacao_id text,
  p_tipo_operacao text default 'Outras',
  p_qtd_diarias_estimada integer default 0
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_evento eventos%rowtype;
  v_operacao operacoes%rowtype;
begin
  if p_qtd_diarias_estimada < 0 then
    raise exception 'Quantidade de diárias estimada inválida';
  end if;

  select * into v_evento from eventos where id = p_evento_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EVENTO_NAO_ENCONTRADO';
  end if;
  if v_evento.operacao_gerada_id is not null then
    raise exception using errcode = 'P0001', message = 'EVENTO_JA_CONVERTIDO';
  end if;

  insert into operacoes (
    id, num_oficio, num_os_manual, num_sei, nome_operacao, tipo_operacao,
    demandante, data_inicio, data_termino, horario_inicio, local_itinerario,
    bairro, endereco, situacao, qtd_diarias_estimada, evento_origem_id
  ) values (
    p_operacao_id, v_evento.num_oficio, v_evento.num_os_manual, v_evento.num_sei,
    v_evento.nome_evento, p_tipo_operacao, v_evento.demandante, v_evento.data_inicio,
    v_evento.data_termino, v_evento.horario_inicio, v_evento.local_itinerario,
    v_evento.bairro, v_evento.endereco, 'Planejada', p_qtd_diarias_estimada, v_evento.id
  ) returning * into v_operacao;

  update eventos set operacao_gerada_id = v_operacao.id where id = v_evento.id;
  return to_jsonb(v_operacao);
end;
$$;
revoke all on function converter_evento_em_operacao(text, text, text, integer) from public, anon, authenticated;
grant execute on function converter_evento_em_operacao(text, text, text, integer) to service_role;

-- Bloqueio progressivo de login persistente (migration 008). O backend usa
-- service_role; anon/authenticated não recebem acesso direto.
create table if not exists tentativas_login (
  usuario text primary key,
  falhas integer not null default 0,
  ultima_falha bigint not null default 0
);

create or replace function registrar_falha_login(p_usuario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tentativas_login (usuario, falhas, ultima_falha)
  values (p_usuario, 1, (extract(epoch from now()) * 1000)::bigint)
  on conflict (usuario) do update
    set falhas = tentativas_login.falhas + 1,
        ultima_falha = (extract(epoch from now()) * 1000)::bigint;
end $$;

revoke execute on function registrar_falha_login(text) from public;
revoke execute on function registrar_falha_login(text) from anon, authenticated;


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
alter table if exists pessoal add column if not exists nome_guerra text default '';
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
alter table if exists tentativas_login    enable row level security;
alter table if exists tipos_evento        enable row level security;
alter table if exists auditoria           enable row level security;
alter table if exists cartao_padrao_versoes enable row level security;
alter table if exists cartao_grupos_modelo  enable row level security;
alter table if exists cartao_grupos_modelo_versoes enable row level security;
revoke all on table cartao_grupos_modelo_versoes from anon, authenticated;
grant select, insert, update, delete on table cartao_grupos_modelo_versoes to service_role;

-- =================================================================
-- ALTERAÇÕES DO SERVIÇO — projeção fornecida pelas Sargenteações.
-- A migration versionada com constraints, índices e grants completos é
-- migrations/016_alteracoes_servico.sql.
-- =================================================================
create table if not exists composicoes_servico (
  id text primary key, unidade text not null, data date not null, turno text not null,
  qtd_viaturas_previstas integer not null, policiais_por_viatura integer not null,
  qtd_extras integer not null default 0, observacao text,
  criado_por text not null references usuarios(usuario), criado_em timestamptz not null default now(),
  atualizado_por text not null references usuarios(usuario), atualizado_em timestamptz not null default now(),
  unique (unidade, data, turno)
);
create table if not exists alteracoes_servico (
  id text primary key, unidade text not null, data_inicio date not null, data_fim date not null,
  turno text not null, policial_pessoal_id text not null references pessoal(id),
  policial_nome text not null, policial_matricula text, tipo text not null,
  substituto_pessoal_id text references pessoal(id), substituto_nome text, substituto_matricula text,
  data_referencia_servico date, motivo text not null, observacoes text, numero_documento text,
  situacao text not null default 'INFORMADA', criado_por text not null references usuarios(usuario),
  criado_em timestamptz not null default now(), atualizado_por text not null references usuarios(usuario),
  atualizado_em timestamptz not null default now(), check (data_fim >= data_inicio)
);
create table if not exists alteracoes_servico_ciencias (
  id text primary key, alteracao_id text not null references alteracoes_servico(id) on delete restrict,
  usuario text not null references usuarios(usuario), usuario_nome text not null,
  criado_em timestamptz not null default now(), unique (alteracao_id, usuario)
);
create table if not exists alteracoes_servico_divergencias (
  id text primary key, alteracao_id text not null references alteracoes_servico(id) on delete restrict,
  descricao text not null, criado_por text not null references usuarios(usuario),
  criado_por_nome text not null, criado_em timestamptz not null default now()
);
create table if not exists alteracoes_servico_historico (
  id text primary key, alteracao_id text not null references alteracoes_servico(id) on delete restrict,
  acao text not null, usuario text not null references usuarios(usuario), usuario_nome text not null,
  criado_em timestamptz not null default now(), valores_anteriores jsonb, valores_novos jsonb
);
-- Migration aditiva 018: jornadas 12h e fotografia final de capacidade.
alter table if exists composicoes_servico add column if not exists jornada text;
alter table if exists composicoes_servico add column if not exists horario_inicio text;
alter table if exists composicoes_servico add column if not exists horario_fim text;
alter table if exists composicoes_servico add column if not exists qtd_viaturas_completas integer;
alter table if exists composicoes_servico add column if not exists qtd_policiais_disponiveis integer;
alter table if exists alteracoes_servico add column if not exists jornada text;
alter table if exists alteracoes_servico add column if not exists horario_inicio text;
alter table if exists alteracoes_servico add column if not exists horario_fim text;
alter table if exists composicoes_servico enable row level security;
alter table if exists alteracoes_servico enable row level security;
alter table if exists alteracoes_servico_ciencias enable row level security;
alter table if exists alteracoes_servico_divergencias enable row level security;
alter table if exists alteracoes_servico_historico enable row level security;
