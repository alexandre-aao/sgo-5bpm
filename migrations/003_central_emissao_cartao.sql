-- =================================================================
-- 003_central_emissao_cartao.sql — histórico rastreável da Central de
-- Emissão do Cartão Programa.
--
-- Aditiva e idempotente. Não altera nem remove dados de `cartoes`; cada
-- emissão guarda metadados e um snapshot do recorte efetivamente emitido.
-- O backend acessa esta tabela apenas com service_role e toda autorização
-- continua no Express.
-- =================================================================

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

alter table emissoes_cartao enable row level security;

-- O navegador nunca acessa esta tabela diretamente. A concessão explícita
-- mantém compatibilidade com projetos Supabase que não expõem tabelas novas
-- automaticamente e limita o acesso à service_role usada pelo backend.
revoke all on table emissoes_cartao from anon, authenticated;
grant select, insert, update, delete on table emissoes_cartao to service_role;

create or replace function registrar_emissao_cartao(
  p_cartao_id text,
  p_viaturas jsonb,
  p_emissao jsonb,
  p_retificacao boolean
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

-- Rollback seguro (executar somente se for realmente necessário):
-- drop function if exists registrar_emissao_cartao(text, jsonb, jsonb, boolean);
-- drop table if exists emissoes_cartao;
