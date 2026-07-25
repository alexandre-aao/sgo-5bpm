-- =================================================================
-- MIGRAÇÃO — Cartão Programa: tipos Ordinário × Reforço (2026-07)
--
-- Rode este arquivo inteiro no SQL Editor do Supabase antes de subir a
-- versão nova do app. É aditivo e idempotente: nenhuma coluna é removida,
-- nenhum dado é apagado. Os cartões já existentes viram `tipo = 'padrao'`
-- (policiamento ordinário) pelo DEFAULT, sem UPDATE de migração.
--
-- Custo no plano gratuito: 7 colunas em `cartoes` (a maioria nula na
-- prática) + 1 tabela pequena de orientações. Sem tabela filha de roteiro,
-- sem versionamento/histórico.
-- =================================================================

-- -----------------------------------------------------------------
-- 1) `cartoes` — discriminador de tipo, vínculo com operação e
--    identificação do reforço
-- -----------------------------------------------------------------

-- 'padrao'  = policiamento ordinário (o cartão que já existia)
-- 'reforco' = reforço operacional (vários por data, vínculo opcional a operação)
alter table cartoes add column if not exists tipo text not null default 'padrao';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cartoes_tipo_valido') then
    alter table cartoes add constraint cartoes_tipo_valido
      check (tipo in ('padrao', 'reforco'));
  end if;
end $$;

-- Vínculo OPCIONAL a uma operação (só faz sentido em cartão de reforço).
-- on delete set null (não cascade): apagar a operação não pode levar junto o
-- roteiro que já foi impresso e entregue à tropa.
alter table cartoes add column if not exists operacao_id text
  references operacoes(id) on delete set null;

-- Identifica cada reforço quando há vários na mesma data ("Reforço Carnaval — Ponta Negra").
alter table cartoes add column if not exists titulo text default '';

-- Observações/orientações escritas pela P3 neste cartão específico. Nos modelos
-- de reforço é o campo "observações padrão", herdado pela cópia na clonagem.
alter table cartoes add column if not exists observacoes text default '';

-- -----------------------------------------------------------------
-- 2) `cartoes` — exclusão lógica
-- -----------------------------------------------------------------
alter table cartoes add column if not exists excluido_em timestamptz;
alter table cartoes add column if not exists excluido_por text;
alter table cartoes add column if not exists justificativa_exclusao text;

-- -----------------------------------------------------------------
-- 3) Diárias por viatura, dentro do JSONB `viaturas`
--
-- A diária é da guarnição, então mora na viatura do cartão — não há coluna
-- escalar pra receber um CHECK comum. Dá pra ter o CHECK real assim mesmo:
-- jsonb_path_exists é immutable e aceito em CHECK (sem subquery). A expressão
-- rejeita a linha se ALGUMA viatura tiver qtd_diarias não-numérica ou negativa.
-- Sem teto máximo, de propósito. Viatura sem o campo é válida (modelos não têm
-- diária nenhuma) — o app trata ausente como 2.
-- -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cartoes_qtd_diarias_valida') then
    alter table cartoes add constraint cartoes_qtd_diarias_valida check (
      not jsonb_path_exists(
        viaturas,
        '$[*].qtd_diarias ? (@.type() != "number" || @ < 0)'
      )
    );
  end if;
end $$;

-- -----------------------------------------------------------------
-- 4) Índice único da data — agora só prende o cartão ORDINÁRIO ativo
--
-- Antes: um cartão por data. Agora: um ORDINÁRIO por data, N reforços na
-- mesma data, e a data volta a ficar livre se o ordinário for excluído
-- logicamente (excluido_em is null faz parte do predicado).
-- -----------------------------------------------------------------
drop index if exists cartoes_data_unica;
create unique index if not exists cartoes_data_unica
  on cartoes (data)
  where is_template = false and tipo = 'padrao' and excluido_em is null;

-- Listagem por data já filtra tipo e exclusão lógica — índice composto cobre isso.
create index if not exists idx_cartoes_data_tipo
  on cartoes (data, tipo)
  where is_template = false and excluido_em is null;

create index if not exists idx_cartoes_operacao_id on cartoes (operacao_id);

-- -----------------------------------------------------------------
-- 5) Orientações permanentes da P3
--
-- Aparecem no bloco de observações da VIATURA (no cartão individual e no PDF),
-- nunca na linha do roteiro. Controle só por ativo/inativo — sem vigência por
-- data, como pedido. NÃO são copiadas para dentro do cartão: desativar uma
-- orientação some de todos os cartões, inclusive nas reimpressões. É também o
-- que mantém o banco pequeno.
-- -----------------------------------------------------------------
create table if not exists orientacoes_cartao (
  id text primary key,
  texto text not null,
  ativo boolean not null default true,
  -- null = vale para os dois tipos de cartão
  tipo_cartao text check (tipo_cartao is null or tipo_cartao in ('padrao', 'reforco')),
  ordem int not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_orientacoes_cartao_ativo on orientacoes_cartao (ativo);

-- RLS habilitado sem policy, igual às demais tabelas: o backend usa service_role
-- (BYPASSRLS) e os roles anon/authenticated ficam bloqueados no acesso direto.
alter table if exists orientacoes_cartao enable row level security;
