-- =================================================================
-- 001_cartao_avisos.sql — Cartão Programa (numeração, Delta 07,
-- vínculo com bairro) + módulo de Avisos Operacionais.
--
-- Rodar inteiro no SQL Editor do Supabase (Dashboard > SQL Editor >
-- New Query > colar > Run). Aditivo e idempotente: pode rodar de novo
-- sem duplicar nada. Não apaga nem reescreve dado existente.
--
-- Decisões de modelagem (divergem do rascunho original de propósito):
--
--  * IDs são `text` em todo o schema deste projeto (gerados pelo app em
--    generateId()), não bigserial. Todas as FKs aqui seguem `text`.
--
--  * Não existe tabela `bairros` nova: o cadastro de bairros do projeto
--    é `bairros_coordenadas`, já usado pelo Mapa e pelo select de
--    Evento. Criar outra duplicaria o cadastro.
--
--  * Não existe tabela `cartao_roteiro`: o roteiro já existe como
--    `itens[]` dentro de cada viatura na coluna JSONB `cartoes.viaturas`.
--
--  * Não existe tabela `cartao_avisos`: `cartoes` é UM registro por DIA,
--    com N viaturas no JSONB, e a seleção de avisos é POR VIATURA (cada
--    uma tem seu bairro). O vínculo vira `avisos_ids[]` dentro do JSONB
--    da viatura — guarda só os ids, nunca o texto do aviso. Mesma razão
--    vale para status de envio, versão e comandante: são campos POR
--    VIATURA e ficam no JSONB, não em colunas de `cartoes` (que valeriam
--    para o dia inteiro e quebrariam o "_v2" por viatura).
-- =================================================================


-- -----------------------------------------------------------------
-- 1. Cadastro de bairros (tabela existente `bairros_coordenadas`)
-- -----------------------------------------------------------------
-- Coordenada passa a ser opcional: um bairro pode existir só para
-- receber aviso/vincular viatura, sem estar plotado no Mapa.
-- ATENÇÃO: enquanto o formulário de bairro ainda exigir lat/lng (hoje
-- exige), nenhuma linha fica nula — o Mapa continua intacto. O filtro
-- de coordenada nula no Mapa entra junto da tela que permite cadastrar
-- sem coordenada.
alter table bairros_coordenadas alter column latitude  drop not null;
alter table bairros_coordenadas alter column longitude drop not null;

-- Bairro desativado some dos seletores novos sem sumir do histórico.
alter table bairros_coordenadas
  add column if not exists ativo boolean not null default true;


-- -----------------------------------------------------------------
-- 2. Avisos Operacionais (criados pela P3)
-- -----------------------------------------------------------------
-- Escopo: por bairro, por Companhia, ou os dois (constraint garante ao
-- menos um). `companhia` usa o mesmo domínio textual já vigente em
-- `viaturas.companhia` e `pessoal.subunidade` ('1ª/2ª/3ª Companhia'),
-- não smallint — evita converter o dado que já existe.
-- `categoria` é texto livre (decisão do usuário).
create table if not exists avisos (
  id            text primary key,
  bairro_id     text references bairros_coordenadas(id) on delete set null,
  companhia     text check (companhia is null or companhia in ('1ª Companhia', '2ª Companhia', '3ª Companhia')),
  categoria     text not null default '',
  prioridade    text not null default 'informativa'
    check (prioridade in ('informativa', 'atencao', 'alta', 'critica')),
  texto         text not null check (char_length(texto) <= 240),
  data_inicio   date not null default current_date,
  data_fim      date,
  permanente    boolean not null default false,
  ativo         boolean not null default true,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  constraint aviso_tem_escopo check (bairro_id is not null or companhia is not null)
);

-- Índice parcial: a consulta quente é "avisos ativos deste bairro",
-- disparada toda vez que o Adjunto escolhe o bairro de uma viatura.
create index if not exists idx_avisos_bairro on avisos (bairro_id) where ativo;

alter table avisos enable row level security;


-- -----------------------------------------------------------------
-- 3. Campos novos do Cartão Programa (nível DIA)
-- -----------------------------------------------------------------
-- Só entra aqui o que vale para o cartão inteiro. Campos por viatura
-- (bairro_id, comandante_pessoal_id, comandante_exibicao, versao,
-- status_envio, gerado_em, avisos_ids[]) vivem no JSONB `viaturas`.
--
-- Delta 07 = o Fiscal de Operações que já existe (decisão do usuário):
-- por isso os campos abaixo são `fiscal_*`, não `delta07_*` — a coluna
-- `fiscal` (nome em texto) continua sendo a fonte compatível com os
-- cartões antigos, e `fiscal_pessoal_id` passa a ser a fonte de verdade.
-- `*_exibicao` congela "graduação + nome de guerra" no momento da
-- geração do PDF: se o militar for promovido depois, o cartão já enviado
-- continua fiel ao que o comandante recebeu no WhatsApp.
alter table cartoes
  add column if not exists ano                smallint,
  add column if not exists numero             integer,
  add column if not exists fiscal_pessoal_id  text,
  add column if not exists adjunto_pessoal_id text,
  add column if not exists fiscal_exibicao    text,
  add column if not exists adjunto_exibicao   text,
  add column if not exists delta07_viatura    text;

-- Índice parcial: templates (data null) e cartões antigos ainda não
-- numerados ficam de fora, então o backfill pode rodar por partes sem
-- violar a unicidade.
create unique index if not exists idx_cartoes_numero_ano
  on cartoes (ano, numero)
  where numero is not null;


-- -----------------------------------------------------------------
-- 4. Numeração sequencial por ano, à prova de concorrência
-- -----------------------------------------------------------------
create table if not exists contador_cartoes (
  ano    smallint primary key,
  ultimo integer not null default 0
);

alter table contador_cartoes enable row level security;

-- O INSERT ... ON CONFLICT DO UPDATE resolve a corrida no próprio banco:
-- duas criações simultâneas serializam na mesma linha e cada uma recebe
-- um número distinto.
-- security definer + search_path fixo: recomendação do Supabase para
-- funções expostas via RPC (fecha o advisor function_search_path_mutable).
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

-- Só o backend (service_role) numera cartões. anon/authenticated não
-- falam com o Supabase neste projeto, mas a função é executável por
-- `public` por padrão — revogar mantém o padrão de autorização no Express.
revoke execute on function proximo_numero_cartao(smallint) from public;
revoke execute on function proximo_numero_cartao(smallint) from anon, authenticated;


-- -----------------------------------------------------------------
-- 5. Backfill da numeração dos cartões já existentes
-- -----------------------------------------------------------------
-- Numera retroativamente por ordem de data, reiniciando a cada ano
-- (decisão do usuário). Só toca cartões do dia (não-template, com data)
-- que ainda estão sem número — rodar de novo não renumera nada.
-- O offset pelo maior número já atribuído no ano protege o caso de a migração
-- ser rodada em partes: se um cartão novo já tiver puxado o nº 1 do contador,
-- o backfill continua a partir dali em vez de colidir no índice único.
do $$
declare r record;
begin
  for r in
    select c.id,
           extract(year from c.data)::smallint as ano_cartao,
           coalesce(m.max_num, 0) + row_number() over (
             partition by extract(year from c.data)
             order by c.data, c.id
           ) as seq
    from cartoes c
    left join (
      select ano, max(numero) as max_num
        from cartoes
       where numero is not null and ano is not null
       group by ano
    ) m on m.ano = extract(year from c.data)::smallint
    where c.is_template = false
      and c.data is not null
      and c.numero is null
  loop
    update cartoes
       set ano = r.ano_cartao,
           numero = r.seq
     where id = r.id;
  end loop;

  -- Alinha o contador com o maior número já atribuído em cada ano, para
  -- o próximo cartão criado continuar a sequência em vez de colidir.
  insert into contador_cartoes (ano, ultimo)
  select ano, max(numero)
    from cartoes
   where is_template = false
     and numero is not null
     and ano is not null
   group by ano
  on conflict (ano) do update
    set ultimo = greatest(contador_cartoes.ultimo, excluded.ultimo);
end $$;
