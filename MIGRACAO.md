# Plano de Migração SGO 5º BPM — Vanilla JS → React

## Decisão de arquitetura (revoga CLAUDE.md anterior)
- Nova stack: React 18 + Vite + TypeScript (frontend) | Express (backend, mantido) | Supabase | Vercel
- Estrutura: monorepo — `/client` (React) e `/server` (Express atual refatorado)
- O frontend antigo (`public/`) permanece intacto até o fim da Fase 6, servindo como referência obrigatória

## Regras invioláveis (herdadas do projeto)
1. Identidade visual atual é referência obrigatória: mesmas cores, tipografia (Inter), espaçamentos, ícones Lucide, temas claro/escuro, navegação mobile. NÃO redesenhar.
2. Tabelas de alta concorrência (escalas, cartoes, eventos, operacoes): sempre update/insert/delete por linha. NUNCA reescrever tabela inteira.
3. Regra de diárias: 1 aparição em escala = 2 diárias. Inegociável.
4. Cartão Programa: ordenação relativa ao turno ancorada em 07:00 fixo, via `((minutos - refMin) + 1440) % 1440`.
5. `diariaDaOperacao()`: usa totais reais da escala se houver militares escalados; senão, `qtd_diarias_estimada`. Nunca somar as duas fontes.
6. Permissão `exigirP3` = "perfil de administrador" na UI. Nunca expor o nome interno.
7. Tela inicial por perfil: P3 → Dashboard; Adjunto e Oficial → Meu Turno. Menus diferentes por perfil.
8. Coordenadas de bairros: tabela estática `bairros_coordenadas` + `normalizarTexto()`. Não usar geocoding dinâmico.
9. CSP estrita (sem 'unsafe-inline'). JSX resolve isso nativamente — manter.
10. Migrations Supabase: via MCP `apply_migration` com slug nomeado. `RENAME COLUMN` não é idempotente.

## Validação entre fases (obrigatória)
Cada fase termina com: (a) checklist de validação executado, (b) commit + push com mensagem descritiva em português, (c) aprovação explícita do usuário antes da fase seguinte. Máximo 2 itens por lote dentro de cada fase.

---

## FASE 0 — Segurança e congelamento de referência
0.1 RLS: executar `get_advisors` (type: security) no Supabase MCP [exige aprovação na UI do Claude Code], identificar tabelas expostas, verificar se `public/app.js` usa anon key ou se tudo passa por `server.js` com service_role. Ativar RLS com policies adequadas.
0.2 Referência visual: capturar screenshots de TODAS as telas (desktop + mobile, tema claro + escuro, perfis P3/Adjunto/Oficial). Salvar em `/docs/referencia-visual/`. Extrair de `style.css` a paleta de cores, tipografia e espaçamentos para `/docs/design-tokens.md`.
0.3 Documentar fluxos: mapear em `/docs/fluxos-por-perfil.md` cada rota/tela visível por perfil, ações permitidas e regras de negócio de cada módulo.
Validação: RLS ativo confirmado por novo `get_advisors` limpo; docs revisados pelo usuário.

## FASE 1 — API nova (Express, sem readDB/writeDB)
1.1 Criar rotas específicas por recurso com colunas limitadas e filtros por período:
   `/api/dashboard-resumo` (agregado único), `/api/eventos`, `/api/operacoes`,
   `/api/escalas`, `/api/cartoes`, `/api/pessoal` (com busca nome/nome_guerra/matricula),
   `/api/viaturas`, `/api/usuarios`, `/api/config`
1.2 Paginação onde aplicável; gzip (compression) e Cache-Control configurados.
1.3 Manter rotas antigas funcionando em paralelo (frontend vanilla continua operante).
1.4 Atualizar registro TABELAS/CHAVE_PRIMARIA se necessário.
Validação: comparar respostas das rotas novas vs. dados do frontend antigo; medir contagem de queries (meta: dashboard ≤ 3 queries vs. ~77 atuais).

**Status (2026-07-23):** 1.1/1.3/1.4 já estavam substancialmente prontos por refatorações
anteriores a este plano (`readTabela`/`buscarConfig` já em uso na maioria das rotas de tabela
única). Faltavam só duas rotas agregadoras ainda em `readDB()`: `/api/dashboard-resumo` (11→7
SELECTs paralelos — não dá pra chegar a ≤3 sem mover a agregação para SQL, o que colidiria com
o princípio de manter a lógica de negócio em JS; decisão do usuário: manter em JS, aceitar 7) e
`/api/cartoes/templates` (11→1 SELECT). **Item 1.2 (paginação) foi propositalmente adiado para
a Fase 4/6**: o problema real de paginação vive inteiramente no frontend vanilla
(`renderEventosTab()` em `public/app.js` renderiza a lista inteira de uma vez; a API já devolve
tudo sem paginação nenhuma), e a regra de orquestração 5 ("nunca modificar `public/` antes da
Fase 6") impede resolver isso no app antigo agora. Será implementado só na tela React de
Eventos (Fase 4), com paginação real desde o início.

## FASE 2 — Shell React
2.1 Scaffold: Vite + React + TS em `/client`; ESLint; ajustar `vercel.json` para servir client build + API.
2.2 Migrar apenas: Login, AppLayout (Sidebar, Topbar, NavegacaoMobile), AlternadorTema, rotas (React Router com lazy loading por módulo), guarda de permissões por perfil, sessão/expiração, refresh automático 60s + ao focar aba.
2.3 Reutilizar `style.css` como base inicial; tipos TS gerados via Supabase MCP `generate_typescript_types`.
Validação: comparação lado a lado com screenshots da Fase 0 (desktop/mobile, claro/escuro); login e navegação funcionais nos 3 perfis.

## FASE 3 — Módulos núcleo (regras críticas)
Ordem: 3.1 Dashboard (consome /api/dashboard-resumo, 7 cards) → 3.2 Cartão Programa (sort 07:00, acesso antecipado Adjunto) → 3.3 Escalas + Planejador de diárias (regra 2 diárias, diariaDaOperacao) → 3.4 Meu Turno.
Validação por módulo: casos de teste das regras 3, 4, 5 com dados reais; comparação visual.

## FASE 4 — Módulos de gestão
4.1 Eventos (lista, cadastro, modal, filtros) → 4.2 Operacoes (situacao Planejada/Executada; concluir Passo 2 pendente das rotas se ainda não feito na Fase 1) → 4.3 Mapa (Leaflet, carregado sob demanda, bairros_coordenadas) → 4.4 Pessoal (244 registros, autocomplete nome/nome_guerra/matricula, tabela→cards no mobile) + Viaturas.
Validação: itens funcionais dos antigos Lotes 1–3 conferidos aqui (edição de usuários, reset de senha, mobile).

## FASE 5 — Módulos finais
5.1 Usuários (edição, reset de senha, perfis) → 5.2 Relatórios → 5.3 Configurações.
Validação: matriz completa de permissões testada nos 3 perfis.

## FASE 6 — Corte e limpeza
6.1 Auditoria final: comparação visual e funcional completa (desktop/mobile × claro/escuro × 3 perfis).
6.2 Remover `public/` antigo, rotas legadas, readDB()/writeDB().
6.3 Dropar `missoes_planejadas` SOMENTE após confirmar migração de dados para `operacoes`.
6.4 Atualizar CLAUDE.md com a arquitetura definitiva e as regras invioláveis.
Validação: deploy Vercel de produção testado; `get_advisors` final limpo.

## Prazo
Meta: Fases 0–5 concluídas até 05/09/2026; Fase 6 até 12/09/2026 (margem para eleições de outubro).