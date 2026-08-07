-- Migration 009 — Fixa o search_path da função de trigger dos cartões
-- Aditiva e idempotente. Fecha o aviso `function_search_path_mutable` do
-- Supabase sem alterar o comportamento do carimbo `atualizado_em`.

create or replace function cartoes_marcar_atualizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
