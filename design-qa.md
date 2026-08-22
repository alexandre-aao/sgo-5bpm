# QA visual — Cartão Ordinário

Resultado: `passed`

## Referências

- Referência fornecida: `C:/Users/Alexa/Downloads/ChatGPT Image 21 de ago. de 2026, 23_35_16.png`
- Especificação funcional: `C:/Users/Alexa/.codex/attachments/01ffe0bf-29aa-4841-825a-64643aa9cd9c/pasted-text.txt`
- Evidência da implementação: `C:/Users/Alexa/AppData/Local/Temp/sgo-cartao-ordinario-qa.png`

## Verificações

- Desktop em viewport 1280 × 720: resumo, biblioteca, roteiro diário, ação em lote e primeiro card aberto.
- Mobile em viewport 390 × 844: cabeçalho compacto, resumo em duas colunas, biblioteca recolhível, roteiro e ações empilhados.
- Clique real para expandir/recolher VTR.
- Busca real na biblioteca e abertura/fechamento do modal “Visualizar padrão”.
- Troca de data para 22/08/2026 e retorno para 21/08/2026 sem gravação de dados.
- Edição inline de item aberta e cancelada sem gravação.
- Fluxo “Emitir cartão” abriu a Central de Emissão e preservou o portal de impressão.
- `npm run build` e `npm run lint` do cliente: aprovados.
- `npm test` e `npm run lint` do backend: 109 testes aprovados.

## Ledger de divergências

- Sidebar: permanece no shell compartilhado e refletiu o estado recolhido já persistido na sessão de teste.
- Conteúdo: título duplicado removido do cabeçalho interno porque o shell já fornece o título principal “Cartão Ordinário”.
- Dados: nenhum mock, criação, edição persistida, exclusão ou alteração em registros reais durante o QA.
