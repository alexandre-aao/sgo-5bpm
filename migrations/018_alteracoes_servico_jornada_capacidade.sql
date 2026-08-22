-- SGO 5º BPM — Jornadas de 12h e fotografia final da capacidade operacional.
-- Migration aditiva: não remove nem reescreve registros anteriores.

alter table public.composicoes_servico add column if not exists jornada text;
alter table public.composicoes_servico add column if not exists horario_inicio text;
alter table public.composicoes_servico add column if not exists horario_fim text;
alter table public.composicoes_servico add column if not exists qtd_viaturas_completas integer;
alter table public.composicoes_servico add column if not exists qtd_policiais_disponiveis integer;

alter table public.alteracoes_servico add column if not exists jornada text;
alter table public.alteracoes_servico add column if not exists horario_inicio text;
alter table public.alteracoes_servico add column if not exists horario_fim text;

alter table public.composicoes_servico drop constraint if exists composicoes_servico_jornada_check;
alter table public.composicoes_servico add constraint composicoes_servico_jornada_check
  check (jornada is null or jornada in ('24H', '12H'));
alter table public.composicoes_servico drop constraint if exists composicoes_servico_horarios_12h_check;
alter table public.composicoes_servico add constraint composicoes_servico_horarios_12h_check
  check (jornada <> '12H' or (horario_inicio is not null and horario_fim is not null and horario_inicio <> horario_fim));
alter table public.composicoes_servico drop constraint if exists composicoes_servico_capacidade_final_check;
alter table public.composicoes_servico add constraint composicoes_servico_capacidade_final_check
  check ((qtd_viaturas_completas is null or qtd_viaturas_completas between 0 and 99)
     and (qtd_policiais_disponiveis is null or qtd_policiais_disponiveis between 0 and 999));

alter table public.alteracoes_servico drop constraint if exists alteracoes_servico_jornada_check;
alter table public.alteracoes_servico add constraint alteracoes_servico_jornada_check
  check (jornada is null or jornada in ('24H', '12H'));
alter table public.alteracoes_servico drop constraint if exists alteracoes_servico_horarios_12h_check;
alter table public.alteracoes_servico add constraint alteracoes_servico_horarios_12h_check
  check (jornada <> '12H' or (horario_inicio is not null and horario_fim is not null and horario_inicio <> horario_fim));

create index if not exists idx_composicoes_servico_jornada
  on public.composicoes_servico (data, unidade, jornada, turno);
create index if not exists idx_alteracoes_servico_jornada
  on public.alteracoes_servico (unidade, jornada, turno, data_inicio, data_fim);
