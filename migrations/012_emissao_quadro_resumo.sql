-- =================================================================
-- 012_emissao_quadro_resumo.sql — permite registrar no histórico a
-- modalidade Quadro Resumo já oferecida pela Central de Emissão.
--
-- Idempotente e sem alteração de dados existentes. Os nomes abaixo são
-- os gerados pelo Postgres para os CHECKs inline da migration 003.
-- =================================================================

alter table emissoes_cartao
  drop constraint if exists emissoes_cartao_modalidade_check;

alter table emissoes_cartao
  add constraint emissoes_cartao_modalidade_check
  check (modalidade in ('guarnicao', 'arquivo_sei', 'consolidado', 'quadro_resumo', 'personalizado'));

alter table emissoes_cartao
  drop constraint if exists emissoes_cartao_tipo_documento_check;

alter table emissoes_cartao
  add constraint emissoes_cartao_tipo_documento_check
  check (tipo_documento in ('individual', 'consolidado', 'quadro_resumo'));
