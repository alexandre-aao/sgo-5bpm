-- Migration 007 — Carimbo de atualização em `cartoes` (edição concorrente)
-- Rodar no SQL Editor do Supabase. Aditiva e idempotente (segunda execução é no-op).
--
-- MOTIVO: o Cartão Programa é a única tela que P3 e Adjunto editam ao mesmo
-- tempo, e hoje a última escrita simplesmente vence — quem salvou primeiro perde
-- o trabalho sem aviso. A tabela `cartoes` **não tem** nenhuma coluna de tempo
-- (nem `created_at`, nem `updated_at`), então não há como o servidor perceber que
-- a linha mudou entre a leitura do cliente e a gravação.
--
-- ⚠️ NENHUM CÓDIGO USA ESTA COLUNA AINDA. Ela é a pré-condição do item 6 da
-- Fase 2B (avisar e oferecer recarregar em vez de sobrescrever em silêncio).
-- Aplicar esta migration sozinha não muda comportamento nenhum.

alter table cartoes add column if not exists atualizado_em timestamptz;

-- O carimbo é do BANCO, via trigger, e não do app: as escritas de cartão passam
-- por `writeRow` em vários handlers diferentes, e confiar em cada um lembrar de
-- preencher a coluna é exatamente o tipo de detalhe que escapa numa rota nova.
create or replace function cartoes_marcar_atualizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_cartoes_atualizado_em on cartoes;
create trigger trg_cartoes_atualizado_em
  before insert or update on cartoes
  for each row execute function cartoes_marcar_atualizacao();

-- Backfill: sem valor inicial, todo cartão anterior à migration ficaria com NULL
-- e o primeiro salvamento de cada um seria tratado como "alguém alterou no meio".
-- `now()` é impreciso como histórico, mas o dado não existe — e o que importa
-- aqui é a comparação entre duas leituras a partir de agora, não a data real da
-- última edição.
update cartoes set atualizado_em = now() where atualizado_em is null;
