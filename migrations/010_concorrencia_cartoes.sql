-- Migration 010 — Proteção atômica da Central de Emissão contra edição concorrente
-- A coluna/trigger `cartoes.atualizado_em` já existem desde as migrations 007/009.
-- Esta migration leva a mesma pré-condição para a função transacional que atualiza
-- as viaturas e registra o histórico de emissão.

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
    raise exception using
      errcode = '40001',
      message = 'CARTAO_DESATUALIZADO';
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

revoke all on function registrar_emissao_cartao(text, jsonb, jsonb, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function registrar_emissao_cartao(text, jsonb, jsonb, boolean, timestamptz)
  to service_role;

-- A assinatura antiga não possui pré-condição e não deve permanecer chamável.
drop function if exists registrar_emissao_cartao(text, jsonb, jsonb, boolean);

-- Rollback seguro (restaura somente a assinatura anterior; copiar a definição da
-- migration 003 antes de reverter o backend):
-- drop function if exists registrar_emissao_cartao(text, jsonb, jsonb, boolean, timestamptz);
