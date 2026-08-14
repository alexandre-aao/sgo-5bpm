-- SGO 5º BPM — modelo ordinário único, modelos de operação e vínculo Evento → Operação.
-- Aditiva e idempotente. Não altera o conteúdo de cartões do dia já criados.

alter table cartoes add column if not exists tipo_modelo text;
update cartoes set tipo_modelo = 'ordinario' where is_template = true and tipo_modelo is null;
alter table cartoes drop constraint if exists cartoes_tipo_modelo_check;
alter table cartoes add constraint cartoes_tipo_modelo_check
  check (tipo_modelo is null or tipo_modelo in ('ordinario', 'operacao'));

-- A migration 006 permitia dois ativos, um por período. Mantém como ativo o
-- ordinário publicado mais recentemente e desativa os demais sem apagar nada.
with ativos_ordenados as (
  select id, row_number() over (
    order by coalesce(publicado_em, atualizado_em) desc nulls last, id
  ) as ordem
  from cartoes
  where is_template = true and padrao_ativo = true and coalesce(tipo_modelo, 'ordinario') = 'ordinario'
)
update cartoes set padrao_ativo = false
 where id in (select id from ativos_ordenados where ordem > 1);

update cartoes set padrao_ativo = false
 where is_template = true and tipo_modelo = 'operacao' and padrao_ativo = true;

drop index if exists ux_cartoes_padrao_unico_periodo;
drop index if exists ux_cartoes_padrao_unico;
alter table cartoes drop constraint if exists cartoes_padrao_exige_periodo;
alter table cartoes drop constraint if exists cartoes_padrao_exige_modelo_ordinario;
alter table cartoes add constraint cartoes_padrao_exige_modelo_ordinario
  check (not padrao_ativo or (is_template = true and tipo_modelo = 'ordinario'));
create unique index if not exists ux_cartoes_padrao_ordinario_unico
  on cartoes (padrao_ativo)
  where is_template = true and padrao_ativo = true and tipo_modelo = 'ordinario';

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
end;
$$;
revoke all on function ativar_cartao_padrao(text) from public, anon, authenticated;
grant execute on function ativar_cartao_padrao(text) to service_role;

alter table operacoes add column if not exists evento_origem_id text;
alter table operacoes add column if not exists endereco text default '';
alter table operacoes add column if not exists diaria_definida boolean not null default false;
update operacoes set diaria_definida = true where diaria_definida = false and evento_origem_id is null;
alter table eventos add column if not exists operacao_gerada_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'escalas_total_diarias_nao_negativo') then
    alter table escalas add constraint escalas_total_diarias_nao_negativo check (total_diarias >= 0);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operacoes_evento_origem_id_fkey') then
    alter table operacoes add constraint operacoes_evento_origem_id_fkey
      foreign key (evento_origem_id) references eventos(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eventos_operacao_gerada_id_fkey') then
    alter table eventos add constraint eventos_operacao_gerada_id_fkey
      foreign key (operacao_gerada_id) references operacoes(id) on delete set null;
  end if;
end $$;

create unique index if not exists ux_operacoes_evento_origem
  on operacoes (evento_origem_id) where evento_origem_id is not null;
create index if not exists idx_eventos_operacao_gerada
  on eventos (operacao_gerada_id) where operacao_gerada_id is not null;

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
  if not found then raise exception using errcode = 'P0002', message = 'EVENTO_NAO_ENCONTRADO'; end if;
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
