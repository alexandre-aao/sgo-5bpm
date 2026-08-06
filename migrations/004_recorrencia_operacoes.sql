-- Migration 004 — Recorrência de Operações + granularidade de data na escala
-- Rodar no SQL Editor do Supabase. Aditiva e idempotente (segunda execução é no-op).
-- Sem RENAME COLUMN: RENAME não é idempotente no Postgres e quebraria no replay.

-- 1) Vínculo entre as ocorrências de um mesmo lote de recorrência.
--    TEXT (não UUID) por coerência com o resto do schema: operacoes.id, escalas.id e
--    eventos.id já são TEXT gerados no app (generateId -> 'op-k3n9x2p1w'). O grupo é
--    gerado do mesmo jeito: generateId('grp').
--    NULL = operação avulsa, sem grupo. É o estado de todas as 45 linhas existentes.
alter table operacoes add column if not exists grupo_recorrencia_id text;

-- 2) A regra que originou o grupo, gravada IDÊNTICA em todas as ocorrências dele.
--    Formato: { tipo, data_inicio, data_fim, dias_semana[], intervalo_dias,
--               datas[], datas_excluidas[], total_ocorrencias }
--    Ver lib/recorrencia.js. Sem CHECK de conteúdo: a validação vive no motor, que
--    devolve mensagem legível — um CHECK aqui só daria erro 500 opaco.
alter table operacoes add column if not exists recorrencia_regra jsonb;

create index if not exists idx_operacoes_grupo_recorrencia
  on operacoes (grupo_recorrencia_id);

-- 3) Data da escala. NÃO existia — a escala era datada indiretamente pela
--    data_inicio da operação, e é assim que o Relatório Diário agrupa até hoje.
--    Com recorrência cada ocorrência é uma operação de UM dia, então a data já fica
--    implícita; a coluna é denormalização deliberada, para o lote gravar a data certa
--    de cada ocorrência sem join e para sustentar o índice composto abaixo.
--    NULLABLE e SEM backfill: as 26 escalas existentes continuam com NULL e todo
--    leitor cai no fallback operacao.data_inicio.
alter table escalas add column if not exists data date;

create index if not exists idx_escalas_operacao_data
  on escalas (operacao_id, data);

-- Obs.: `operacoes.tipo_recorrencia` (diaria|fim_de_semana|dia_unico) NÃO é tocada.
-- É rótulo descritivo pré-existente (7 linhas preenchidas), campo distinto de
-- recorrencia_regra.tipo (diaria|semanal|intervalo|avulsa). Os dois coexistem.
