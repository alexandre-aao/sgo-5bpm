# SGO 5º BPM — Sistema de Gestão Operacional

Aplicativo full-stack para a Seção de Planejamento (P3) do 5º Batalhão de Polícia Militar. Nasceu como "Pauta de Eventos" (gestão de eventos e diárias) e cresceu para cobrir também o Cartão Programa de patrulhamento diário, cadastros de referência (bairros, pessoal) e relatórios operacionais. Todo o domínio é em português — nomes de variáveis, campos de dados e textos de interface usam a terminologia da corporação (Ofício, diária, viatura, guarnição, Fiscal de Operações etc.).

## Stack e arquitetura

- **Backend:** Node.js + Express, arquivo único `server.js`. Sem TypeScript, sem framework de rotas além do Express puro.
- **Frontend:** HTML/CSS/JS vanilla, sem build step, sem framework (nada de React/Vue). SPA por abas: todo o HTML das telas fica em `public/index.html` dentro de `<section class="tab-content">`, escondido/mostrado via classe `active`.
- **Banco de dados:** Supabase (Postgres). `server.js` acessa via `@supabase/supabase-js` com a chave `service_role` (bypassa RLS; a autorização é toda feita pelo próprio app — `autenticar`/`exigirP3`). Para preservar a lógica de negócio já escrita em JS puro (filter/map/reduce) sem reescrever tudo em SQL, existe um shim `readDB()`/`writeDB()` em `server.js` que busca/grava cada tabela inteira e monta o mesmo formato de objeto que o código já esperava do antigo `data/db.json`. `writeDB(db, tabelas)` recebe a lista explícita de tabelas alteradas por aquela escrita — nunca sincroniza as 8 tabelas inteiras à toa. Rotas quentes (`autenticar`, `/api/login`) usam consultas pontuais (`buscarSessaoPorToken`, `buscarUsuarioPorLogin`) em vez do shim. Schema completo em `supabase/schema.sql` — mudanças de schema são SQL aditivo (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) rodado manualmente pelo usuário no SQL Editor do Supabase (não há migration runner automático), e a tabela nova/coluna nova entra em `TABELAS`/`CHAVE_PRIMARIA` no topo do `server.js`.
- **Sem dependências de frontend via bundler** (npm só serve o backend). CDNs usados: Lucide (ícones), Google Fonts, **Leaflet** (mapa, aba Mapa).
- **Deploy:** Vercel, função serverless única (`server.js` via `@vercel/node`, ver `vercel.json`). Projeto conectado ao repositório GitHub `alexandre-aao/sgo-5bpm` — todo `git push` na branch `main` dispara deploy automático em produção (`https://sgo-5bpm.vercel.app`). Variáveis de ambiente `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` configuradas no painel da Vercel (Project Settings → Environment Variables), **não** commitadas — localmente ficam em `.env.local` (git-ignorado) e são carregadas também via `.claude/launch.json` pro preview server.
- **Não é monorepo.** Só existe este projeto neste diretório.

### Arquivos principais

| Arquivo | Papel |
|---|---|
| `server.js` | API REST completa (Express) + camada de acesso ao Supabase |
| `public/index.html` | Todo o markup de todas as abas |
| `public/app.js` | Toda a lógica client-side (fetch, render, handlers) |
| `public/style.css` | Design system (variáveis CSS, dark theme) |
| `supabase/schema.sql` | Schema Postgres de referência (rodar manualmente no Supabase) |
| `data/db.json` | **Legado** — arquivo do antigo "banco" em JSON, não é mais lido pelo servidor. Preservado como histórico, não apagar sem avisar o usuário. |
| `.env.local` | Credenciais do Supabase para rodar localmente (git-ignorado) |
| `.claude/launch.json` | Config do preview server (porta 3005, `autoPort: true`, env vars do Supabase) |
| `vercel.json` | Config de build/rotas da Vercel |

## Rodando o projeto

```bash
npm install
npm start        # ou: node server.js
```

Sobe em `http://localhost:3005` por padrão (ver `.claude/launch.json`; `autoPort: true` deixa o harness de preview escolher outra porta livre se a 3005 já estiver em uso por outra sessão). Precisa de `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no ambiente — já configuradas em `.claude/launch.json` para o preview server.

**Sempre reiniciar o servidor** depois de editar `server.js` — não há hot reload. Se o usuário reportar "erro no servidor" em algo que você acabou de mudar, o primeiro suspeito é sempre um servidor real (`npm start` do próprio usuário, fora do preview do Claude Code) rodando código antigo sem reiniciar.

## Modelo de dados (Supabase / Postgres)

- **`eventos`** — Eventos_Pauta: eventos/operações policiais (Show, Futebol, Ato Público, Religioso, Cultural, **Missão Avulsa**, Outros). Campos-chave: `data_inicio`/`data_termino`, `bairro` (select alimentado por `bairros_coordenadas` + opção "Outro" com texto livre), `num_os_manual` e `num_sei` (texto livre, preenchidos manualmente — **não existe mais geração automática de código de OS nem status de OS/Kanban, foram removidos deliberadamente**).
- **`alocacoes`** — Alocacao_Policiamento: efetivo/viaturas alocados por evento (modalidade, qtd_policiais, qtd_viaturas).
- **`escalas`** — Escala_Diarias: militares escalados por evento. Regra de negócio fixa: **`total_diarias = qtd_aparicoes * 2`**.
- **`usuarios`** — login, senha (hash scrypt), `role` (`P3` | `Adjunto` | `Oficial`), nome. Conta de sistema (login), diferente de `pessoal`.
- **`pessoal`** — Cadastro de Pessoal: `nome`, `posto_graduacao` (lista fechada da hierarquia PMRN em `POSTOS_GRADUACAO` no `server.js`), `tipo` (`Praça` | `Oficial`, derivado automaticamente do posto), `categorias[]` (`Adjunto`, `Fiscal de Operações`, `Oficial de Operações`, `Oficial de Sobreaviso` — uma pessoa pode ter mais de uma). Alimenta os seletores de Fiscal/Adjunto/Sobreaviso do Cartão Programa.
- **`bairros_coordenadas`** — `nome_bairro`, `latitude`, `longitude`. Seed inicial: 7 bairros da Zona Sul de Natal (coordenadas aproximadas de centróide, não geocodificação precisa). Alimenta o select de Bairro em Novo Evento e os marcadores do Mapa.
- **`cartoes`** — Cartão Programa: um por data (`data`), com `viaturas[]` (prefixo, setor, companhia, categoria, comandante, observação) e `itens[]` de roteiro (horário início/fim, local, atividade). Campos de cabeçalho `fiscal`, `adjunto`, `oficial_sobreaviso` guardam o **nome** da pessoa selecionada (não um id — mantém compatibilidade com cartões antigos que tinham texto livre). Também serve de **template**: `is_template` (bool), `nome_template`, `tipo_periodo` (`semana` | `fim_de_semana`), `qtd_viaturas_base` (5/6/7), `origem_template_id` (rastreia de qual template um cartão do dia foi clonado). Templates têm `data: null` e nunca aparecem nas listagens normais por data.
- **`sessoes`** — tokens de autenticação ativos (expiram em 12h).
- **`config`** — `cota_mensal_diarias`.

### Regras de negócio importantes

- **Diária:** `qtd_aparicoes * 2`, sempre. Não mexer nessa fórmula sem confirmar com o usuário.
- **Não existe mais status de evento nem Kanban de Ordem de Serviço** — foi removido deliberadamente (era `status_os`/`codigo_os`/Kanban no Dashboard). Não reintroduzir sem pedido explícito do usuário. No lugar: `num_os_manual` e `num_sei`, campos de texto livre preenchidos manualmente. O Dashboard alerta quando um evento próximo/em andamento está sem Número da OS e/ou Número SEI informado (calculado, não é status manual).
- **Praça x Oficial no Cartão Programa:** se o Fiscal de Operações selecionado for classificado como `Praça` (posto/graduação até Subtenente) e o campo Oficial de Sobreaviso estiver vazio, o sistema mostra um alerta **não-bloqueante** no painel de Alertas de Conflito do Cartão — não impede salvar.
- **Templates do Cartão Programa:** P3 cria templates nomeados (período + qtd. de viaturas base) e monta viaturas/roteiros com o comandante em branco. No dia, quem cria o Cartão (Adjunto/P3) pode buscar o template sugerido pra aquele dia da semana + qtd. de viaturas e "Importar e Clonar" — isso faz um deep clone das viaturas/itens para um cartão novo (não-template), com `comandante` zerado pra ser preenchido. Se não houver template compatível, o sistema avisa mas não trava — o cartão pode ser criado manualmente.
- **Perfis de acesso:**
  - `P3` — acesso total (admin), incluindo Cadastro de Pessoal, Cadastro de Bairros e Templates do Cartão Programa.
  - `Adjunto` / `Oficial` — só veem Meu Turno, Cartão Programa, Listar Eventos e Mapa (leitura). Cartão Programa é a única coisa que eles podem *editar* (inclusive usar o fluxo de sugestão/clonagem de template — essa parte do endpoint de clonagem não exige P3 de propósito).
- Controle de acesso é **client-side (classe `hidden-role`) E server-side (middleware `exigirP3`)** — sempre implementar os dois lados, nunca confiar só no frontend.

## Segurança (já implementada — não regredir)

- Senhas com hash `scrypt` (nunca texto puro). Migração automática de senhas legadas roda no boot do servidor.
- Sessões via token Bearer, expiram em 12h, invalidadas no logout.
- Toda rota `/api/*` (exceto `/api/login`) exige token válido (middleware `autenticar`), que popula `req.user = { usuario, role, nome }`.
- Rotas de escrita administrativas exigem `exigirP3`. Algumas rotas (ex.: `POST /api/cartoes` com `is_template`, `DELETE /api/cartoes/:id` de um template) fazem checagem de role manualmente dentro do handler em vez de usar o middleware, porque a rota é compartilhada com um fluxo que não exige P3 — ler o handler antes de assumir que uma rota tem ou não restrição.
- **Toda inserção de dado do usuário no DOM passa pela função `esc()`** (escape de HTML) em `app.js` — proteção contra XSS. Ao adicionar `innerHTML` novo, sempre envolver valores dinâmicos com `esc(...)`.
- Senha mínima: **3 caracteres** (decisão deliberada, para não quebrar a senha padrão `123` já usada pelo batalhão — não "corrigir" para 4+ sem perguntar).

## Convenções de código

- **Idioma:** português em tudo — variáveis, funções, comentários, textos de UI. Não anglicizar.
- **Chamadas à API no frontend:** sempre via `apiFetch()` (wrapper que injeta o token e trata sessão expirada), nunca `fetch()` puro.
- **Modais:** padrão `.modal-overlay` + `.modal-box`, toggle via classe `hidden`. Ver `modal-usuario`, `modal-pessoa`, `modal-novo-template`, `modal-relatorio-sei` como referência.
- **Painéis colapsáveis** (Histórico do Cartão, Templates, Gerenciar Bairros): botão toggle + `panel.classList.toggle('hidden')`, renderiza sob demanda só quando abre.
- **Toasts:** `showToast(mensagem, tipo)` — tipos: `success`, `info`, `warning`, `danger`.
- **Badges de tipo/status:** classe CSS gerada via slug (minúsculo, espaço→hífen, remove acento com `normalize("NFD")`). Ao adicionar um novo tipo/atividade/categoria, lembrar de adicionar a cor correspondente em `style.css`.
- **Gráficos:** sem lib externa — SVG gerado à mão em JS (ver `renderSazonalidadeChart` em `app.js`), consistente com o resto do projeto (mini-barras em CSS já usadas em Estatísticas/Planejador).
- **Mapa:** Leaflet via CDN, tiles dark (`basemaps.cartocdn.com/dark_all`), overrides de tema em `style.css` (`.leaflet-popup-*`, `.mapa-*`).
- **Toda funcionalidade nova** deve funcionar corretamente nos dois lados de sessão: o que o `P3` vê/edita e o que `Adjunto`/`Oficial` vê (geralmente menos).
- **Migrações de schema:** IIFE no topo do `server.js` (junto das outras, ex. `normalizarCamposTemplateCartao`, `seedBairrosCoordenadas`) que roda no boot, lê o db, adiciona campos faltantes com `if (!('campo' in obj))`, e só grava (`writeDB`) se algo mudou. Nunca destrutivo.

## Módulos principais (abas)

1. **Dashboard** — visão geral, alertas operacionais consolidados (conflitos do Cartão Programa de hoje + eventos sem Número da OS/SEI se aproximando), preview do patrulhamento de hoje.
2. **Novo Evento** — cadastro de eventos. Bairro é um `<select>` do cadastro + opção "Outro" (texto livre).
3. **Listar Eventos** — consulta geral com filtro de datas, colunas Nº OS / Nº SEI, indicador de diária vinculada, botão "Gerar Relatório para SEI".
4. **Mapa** — eventos da semana corrente plotados por bairro (Leaflet dark mode), aviso quando o bairro do evento não está cadastrado. Painel "Gerenciar Bairros" (P3) para CRUD do cadastro de coordenadas.
5. **Meu Turno** — visão do dia para Adjunto/Oficial.
6. **Cartão Programa** — roteiro diário de patrulhamento por viatura: viaturas, itens de roteiro, Quadro Resumo automático, histórico navegável, alertas de conflito (sobreposição de horário / setor sem cobertura / Fiscal Praça sem Sobreaviso), impressão, **Templates** (criar/gerenciar/sugerir/clonar).
7. **Relatório Diárias** — consolidado por militar, exportável em CSV.
8. **Planejador Diárias** — cota mensal x consumo, calendário de diárias, lançamento rápido de "Missão Avulsa" (diária sem cadastro completo de evento).
9. **Estatísticas** — painel analítico (eventos: por bairro/tipo/modalidade; patrulhamento: por setor/atividade/viatura; gráfico de Sazonalidade planejados x realizados), sempre com filtro de ano.
10. **Usuários** — gestão de contas de login do sistema, reset de senha (só P3).
11. **Cadastro de Pessoal** — Adjuntos, Fiscais de Operações, Oficiais de Operações, Oficiais de Sobreaviso, com filtro por categoria (só P3).

## Relatório SEI

Botão "Gerar Relatório para SEI" (Listar Eventos, por período filtrado) e na gaveta de detalhes de um evento (por evento único). Modal com cabeçalho oficial, resumo, bairros atendidos, efetivo com diárias numerado. Botões "Copiar Texto Formatado" (texto puro, sem HTML, padrão `01 – NOME – Mat. XXXXXX`) e "Exportar PDF" (`window.print()` com CSS de impressão dedicado que isola só o conteúdo do relatório).

## Fluxo de trabalho recomendado ao editar

1. Ler o trecho relevante antes de editar (arquivos grandes — usar Grep para localizar, não abrir tudo).
2. Depois de editar `.js`, rodar `node --check <arquivo>` antes de testar no navegador.
3. Reiniciar o preview server (`server.js` não tem hot reload).
4. Testar de ponta a ponta no navegador (login, ação, verificação visual) — não declarar "pronto" sem isso. Testar com clique real (preview_click/preview_fill), não só chamando a função handler direto por `preview_eval` — já aconteceu de um fluxo funcionar via chamada direta e mascarar um problema de timing no clique real.
5. **Sempre limpar dados de teste** criados durante a verificação (eventos, cartões, templates, pessoal, bairros fictícios) antes de encerrar — o preview local aponta pro mesmo Supabase de produção (mesmas credenciais em `.env.local`/`.claude/launch.json`), não é um ambiente descartável. Exceção: quando o próprio usuário pede explicitamente para popular dados fictícios/demo — aí é pra manter.
6. Testar nos dois perfis relevantes quando a mudança afeta permissões (P3 e Adjunto).
7. Antes de mexer ou apagar qualquer registro no Supabase, checar se os dados batem com o que você mesmo criou nesta sessão — pode haver uso real do app em paralelo (outro servidor do usuário rodando, ou a própria produção na Vercel). Se encontrar registro que você não reconhece ter criado, não delete: avise o usuário.
8. Depois de validar localmente, `git add`/`commit`/`push` para `main` — a Vercel publica automaticamente via integração Git (ver seção "Stack e arquitetura"). Não fazer push sem o usuário saber que aquilo vai pra produção.

## Estado do projeto

Repositório Git local, remoto `alexandre-aao/sgo-5bpm` no GitHub, conectado à Vercel (deploy automático a cada push em `main`). Mudanças em arquivos versionados só chegam à produção depois de commit + push — editar o arquivo local não é suficiente.

## Pendências em aberto

Nenhuma pendência de arquitetura em aberto no momento. Ideias sugeridas e ainda não priorizadas pelo usuário: expandir cadastros de referência (Viaturas/Frota, Efetivo Operacional completo com matrícula, Setores de Patrulhamento com vínculo N:N a Bairros, Demandantes, Modalidades de Policiamento) para eliminar texto livre restante em outras telas (prefixo de viatura, demandante do evento, modalidade de policiamento).
