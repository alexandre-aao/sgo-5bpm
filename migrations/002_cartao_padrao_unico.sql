-- =================================================================
-- 002_cartao_padrao_unico.sql — Padrão único de Cartão Programa.
--
-- Rodar inteiro no SQL Editor do Supabase (Dashboard > SQL Editor >
-- New Query > colar > Run). Aditivo e idempotente: pode rodar de novo
-- sem duplicar nada. Não apaga nem reescreve template existente.
--
-- Decisões de modelagem (divergem do rascunho original de propósito):
--
--  * Não existem tabelas `cartoes_padrao`/`cartoes_padrao_missoes`. O
--    template já É um cartão (`cartoes.is_template = true`), com o
--    roteiro no mesmo JSONB `viaturas[].itens[]` que qualquer cartão do
--    dia usa. Criar tabela relacional nova duplicaria a estrutura e
--    exigiria conversão JSONB<->relacional só para clonar.
--
--  * "Padrão único" = um único template com a flag `padrao_ativo = true`
--    ao mesmo tempo, imposto por índice único parcial. Nenhum template
--    é apagado ao promover outro — os inativos continuam disponíveis
--    como histórico de padrões (ver GET /api/cartoes/templates).
--
--  * Trocar o padrão ativo é feito só pela função `ativar_cartao_padrao`,
--    nunca por dois UPDATEs separados: índice único não é deferível, e
--    duas chamadas HTTP sequenciais (desativar o antigo, ativar o novo)
--    deixariam uma janela sem nenhum padrão ativo — sem padrão, ninguém
--    consegue criar o cartão do dia.
-- =================================================================


-- -----------------------------------------------------------------
-- 1. Flag de padrão ativo, restrita a templates
-- -----------------------------------------------------------------
alter table cartoes
  add column if not exists padrao_ativo boolean not null default false;

-- Um cartão do dia (is_template=false) nunca pode carregar a flag —
-- fecha a porta para um "padrão fantasma" fora do índice abaixo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cartoes_padrao_so_template'
  ) then
    alter table cartoes
      add constraint cartoes_padrao_so_template check (not padrao_ativo or is_template);
  end if;
end $$;

-- Índice parcial com condição dupla: só template com a flag ligada entra
-- no índice, e como todos os que entram têm o mesmo valor (true), um
-- segundo template ativo colide.
create unique index if not exists ux_cartoes_padrao_unico
  on cartoes (padrao_ativo)
  where is_template = true and padrao_ativo = true;


-- -----------------------------------------------------------------
-- 2. Troca de padrão ativo, atômica
-- -----------------------------------------------------------------
create or replace function ativar_cartao_padrao(p_id text)
returns void
language plpgsql
security definer
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

-- Só o backend (service_role) troca o padrão ativo. Mesma cautela de
-- proximo_numero_cartao: revogar de public/anon/authenticated mantém a
-- autorização toda no Express.
revoke execute on function ativar_cartao_padrao(text) from public;
revoke execute on function ativar_cartao_padrao(text) from anon, authenticated;


-- -----------------------------------------------------------------
-- 3. Promoção inicial (só roda se nenhum padrão estiver ativo ainda)
-- -----------------------------------------------------------------
-- Escolhe o template com mais viaturas cadastradas como ponto de partida
-- provisório — não é necessariamente um cartão "pronto", só o menos vazio
-- dos existentes. Guardado por "not exists" para não sobrescrever uma
-- escolha manual já feita (idempotente: rodar de novo não muda nada).
update cartoes set padrao_ativo = true
where id = (
  select id from cartoes
   where is_template = true
   order by jsonb_array_length(coalesce(viaturas, '[]'::jsonb)) desc, nome_template asc
   limit 1
)
and not exists (
  select 1 from cartoes where is_template = true and padrao_ativo = true
);
