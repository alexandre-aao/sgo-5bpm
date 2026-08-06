-- Migration 006 — Um cartão padrão ativo POR TIPO DE PERÍODO
-- Rodar no SQL Editor do Supabase. Idempotente (segunda execução é no-op).
--
-- O QUE MUDA: até aqui existia UM padrão ativo no sistema inteiro
-- (ux_cartoes_padrao_unico, migration 002). Passam a existir DOIS em vigor ao
-- mesmo tempo — um 'semana' e um 'fim_de_semana' — e POST /api/cartoes escolhe
-- pelo dia da semana da data do cartão.
--
-- ⚠️ ANTES DE ATIVAR UM PADRÃO DE FIM DE SEMANA, PREENCHA-O. Em 2026-08-06 os
-- três templates de fim de semana tinham 1, 0 e 0 viaturas cadastradas, contra 6
-- do padrão ativo de dia útil. Ativar um deles vazio faria o cartão de sábado
-- nascer sem viatura nenhuma. Enquanto NENHUM padrão de fim de semana estiver
-- ativo, o servidor cai no padrão do outro tipo e o comportamento é o mesmo de
-- hoje — a migration por si só não muda nada na prática.

-- -----------------------------------------------------------------
-- 1. Índice: de global para um por tipo de período
-- -----------------------------------------------------------------
-- O índice antigo indexava (padrao_ativo) e, como todos os que entravam tinham
-- o mesmo valor (true), qualquer segundo ativo colidia. O novo indexa o TIPO,
-- então colide apenas dentro do mesmo período.
drop index if exists ux_cartoes_padrao_unico;

create unique index if not exists ux_cartoes_padrao_unico_periodo
  on cartoes (tipo_periodo)
  where is_template = true and padrao_ativo = true;

-- Nota sobre NULL: `tipo_periodo` é nullable e no Postgres NULLs não colidem em
-- índice único, então dois templates SEM período poderiam ficar ativos ao mesmo
-- tempo. O CHECK abaixo fecha isso exigindo período para ser padrão ativo —
-- é o que dá sentido à escolha por dia da semana.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cartoes_padrao_exige_periodo'
  ) then
    alter table cartoes
      add constraint cartoes_padrao_exige_periodo
      check (not padrao_ativo or tipo_periodo is not null);
  end if;
end $$;

-- -----------------------------------------------------------------
-- 2. Troca de padrão ativo, atômica, agora POR TIPO
-- -----------------------------------------------------------------
-- Mesma razão da 002 para viver numa função e não em dois UPDATEs: índice único
-- não é deferível, e duas chamadas sequenciais deixariam uma janela sem padrão.
-- A diferença é o `and tipo_periodo = ...`: ativar um padrão de fim de semana
-- não pode desligar o de dia útil.
create or replace function ativar_cartao_padrao(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  select tipo_periodo into v_tipo
    from cartoes where id = p_id and is_template;

  if not found then
    raise exception 'Cartão padrão % não encontrado', p_id;
  end if;

  if v_tipo is null then
    raise exception 'Cartão padrão % não tem tipo de período definido', p_id;
  end if;

  update cartoes set padrao_ativo = false
   where is_template and padrao_ativo and tipo_periodo = v_tipo and id <> p_id;

  update cartoes set padrao_ativo = true where id = p_id;
end $$;

revoke execute on function ativar_cartao_padrao(text) from public;
revoke execute on function ativar_cartao_padrao(text) from anon, authenticated;

-- -----------------------------------------------------------------
-- 3. Sem promoção automática do segundo tipo
-- -----------------------------------------------------------------
-- A 002 promoveu automaticamente o template "menos vazio" para não deixar o
-- sistema sem padrão. Aqui NÃO se repete isso: promover um template de fim de
-- semana vazio é pior que não ter nenhum (com nenhum, o fallback usa o padrão de
-- dia útil, que está preenchido). A ativação do segundo padrão é manual.
