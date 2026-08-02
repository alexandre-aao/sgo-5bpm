# Central de Emissão do Cartão Programa

## Arquitetura

Todas as saídas do Cartão Programa passam pela rota React `/impressao` e pela
camada `pages/modulos/impressao/documentoCartao.ts`. Essa camada produz o mesmo
modelo normalizado para prévia, impressão, salvamento como PDF e
compartilhamento de texto. O objeto completo do cartão não é renderizado
diretamente.

O campo interno `oficial_sobreaviso` continua no Cartão Programa e nas regras
operacionais, mas não entra no modelo documental nem no snapshot de emissão.

Os estados legados por viatura permanecem compatíveis:

- `pendente`: elaboração ainda não emitida;
- conferência/finalização: estado transitório da Central antes da saída;
- `gerado` e `enviado`: saída registrada;
- `alterado`: conteúdo já emitido mudou e exige retificação;
- `retificado` e `substituido`: estados do histórico rastreável de emissões.

## Migration obrigatória

Antes do deploy do backend, executar no SQL Editor do Supabase:

`migrations/003_central_emissao_cartao.sql`

A migration é aditiva e idempotente. Ela cria `emissoes_cartao`, seus índices,
RLS/grants restritos à `service_role` e a função
`registrar_emissao_cartao(...)`. A função atualiza as viaturas, registra o
snapshot e substitui emissões anteriores na mesma transação.

Não publicar o novo backend antes dessa migration: a Central depende da função
RPC para registrar uma saída sem risco de gravação parcial.

## Deploy

1. Executar a migration no Supabase e confirmar que a tabela e a função foram criadas.
2. Reiniciar o servidor local depois de qualquer alteração em `server.js`.
3. Executar `node --check server.js`, `npm run lint` e `npm run build` em `client/`.
4. Fazer commit e push para `main`; a integração do repositório publica na Vercel.
5. Validar uma emissão real de teste com P3 e outra com Adjunto/Oficial, removendo o registro operacional de teste ao final.

## Rollback

O rollback preferencial é reverter o commit da aplicação, preservando
`emissoes_cartao` para auditoria. Se a remoção do schema for indispensável,
executar, nesta ordem:

```sql
drop function if exists registrar_emissao_cartao(text, jsonb, jsonb, boolean);
drop table if exists emissoes_cartao;
```

O segundo comando apaga o histórico de emissões e só deve ser usado após backup
e autorização explícita. Nenhuma coluna existente de `cartoes` é removida.
