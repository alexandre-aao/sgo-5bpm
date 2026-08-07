-- Migration 008 — Bloqueio progressivo de login que sobrevive ao cold start
-- Rodar no SQL Editor do Supabase. Aditiva e idempotente.
--
-- MOTIVO: o bloqueio progressivo por usuário existe desde a auditoria de 2026-07,
-- mas o estado mora num Map em memória do processo. Na Vercel cada cold start da
-- função serverless zera esse Map, então quem está tentando adivinhar uma senha
-- só precisa esperar o processo reciclar para ganhar tentativas de novo. Sem
-- Redis no plano gratuito, o lugar natural do contador é o próprio Postgres.
--
-- O rate limit por IP (express-rate-limit) CONTINUA em memória e continua sendo
-- uma limitação aceita: ele protege contra rajada do mesmo IP, enquanto este aqui
-- protege a conta contra tentativas distribuídas.

create table if not exists tentativas_login (
  -- Login em minúsculas, como chega de `String(usuario).toLowerCase().trim()`.
  usuario text primary key,
  falhas integer not null default 0,
  ultima_falha bigint not null default 0  -- epoch ms, mesmo formato de sessoes.expira
);

-- RLS habilitado sem policy, igual às demais tabelas: o service_role do backend
-- tem BYPASSRLS, e anon/authenticated ficam sem acesso direto.
alter table tentativas_login enable row level security;

-- Contador de falhas atômico. Em plpgsql para o incremento não sofrer corrida
-- entre duas tentativas simultâneas do mesmo login — dois SELECT+UPDATE
-- concorrentes registrariam uma falha só, e o bloqueio demoraria mais a fechar.
create or replace function registrar_falha_login(p_usuario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tentativas_login (usuario, falhas, ultima_falha)
  values (p_usuario, 1, (extract(epoch from now()) * 1000)::bigint)
  on conflict (usuario) do update
    set falhas = tentativas_login.falhas + 1,
        ultima_falha = (extract(epoch from now()) * 1000)::bigint;
end $$;

revoke execute on function registrar_falha_login(text) from public;
revoke execute on function registrar_falha_login(text) from anon, authenticated;
