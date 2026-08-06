-- Migration 005 — Endereço do evento (rua e número)
-- Rodar no SQL Editor do Supabase. Aditiva e idempotente (segunda execução é no-op).
--
-- MOTIVO: o Cartão Programa mostra os eventos da área para a guarnição, mas não
-- havia onde guardar o endereço. O campo `local_itinerario` foi ocupado na
-- prática pelo nome do bairro: em 2026-08-06, 460 dos 463 eventos tinham
-- local_itinerario idêntico a bairro, apenas 12 continham algum dígito e só 1
-- parecia um logradouro. Ou seja, a guarnição recebia o bairro duas vezes e
-- nunca a rua.
--
-- POR QUE UMA COLUNA SÓ, e não `logradouro` + `numero`: o número raramente é
-- usado isolado, o resto do cadastro é todo texto livre, e dois campos dobram a
-- fricção de preenchimento para a P3 num formulário que já é longo. Se algum dia
-- for preciso geocodificar o evento no Mapa, a separação pode ser feita por
-- parsing sem perder dado.

alter table eventos add column if not exists endereco text default '';

-- SEM BACKFILL de propósito. Os 463 eventos existentes continuam com endereco
-- vazio: não há de onde deduzir rua e número para evento passado, e copiar
-- `local_itinerario` só repetiria o bairro — exatamente o problema que a coluna
-- veio resolver. Todo leitor cai no fallback (local_itinerario / bairro).
