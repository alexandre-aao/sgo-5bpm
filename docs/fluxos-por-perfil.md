# Fluxos por perfil — rotas, telas e regras de negócio

> Etapa 0.3 do `MIGRACAO.md`. Cruza a navegação por perfil (levantada em 0.2 — ver [referencia-visual/](referencia-visual/)) com as rotas reais de `server.js` e as regras de negócio já formalizadas no `CLAUDE.md`. Serve de base para o guard de rotas da Fase 2 e para o desenho da API nova da Fase 1.
>
> **Perfis:** `P3` (administrador), `Adjunto`, `Oficial`. `Adjunto` e `Oficial` têm exatamente o mesmo conjunto de permissões no código atual (não há diferenciação entre eles em nenhuma rota nem no client) — tratados como um grupo único abaixo ("Adjunto/Oficial").

## Matriz de acesso client-side (sidebar, `hidden-role`)

| Tela | P3 | Adjunto/Oficial |
|---|---|---|
| Dashboard | ✅ | ❌ |
| Novo Evento | ✅ | ❌ |
| Listar Eventos | ✅ | ✅ |
| Mapa | ✅ | ✅ (sem o painel "Gerenciar Bairros", que é só do P3) |
| Meu Turno | ✅ (tela inicial de Adjunto/Oficial não é a dele, mas a aba existe) | ✅ (tela inicial) |
| Cartão Programa | ✅ | ✅ (pode editar; não pode excluir cartão nem gerenciar Cartões Padrão — ver abaixo) |
| Operações | ✅ | ❌ |
| Planejador Diárias | ✅ | ❌ |
| Relatório Diárias | ✅ | ❌ |
| Usuários | ✅ | ❌ |
| Cadastro de Pessoal | ✅ | ❌ |
| Cadastro de Viaturas | ✅ | **✅ (não deveria — ver "Achados" abaixo)** |

Tela inicial por perfil (regra 7 do `MIGRACAO.md`): P3 → Dashboard; Adjunto/Oficial → Meu Turno.

## Rotas da API por módulo

Todas as rotas abaixo (exceto `/api/login`) passam pelo middleware `autenticar` (token Bearer válido, 12h). "P3" na coluna Middleware = rota adicionalmente protegida por `exigirP3`. Onde não há `exigirP3`, qualquer usuário autenticado (dos 3 perfis) pode chamar a rota diretamente, **independente do que a sidebar mostra**.

### Autenticação / sessão
| Rota | Método | Middleware |
|---|---|---|
| `/api/login` | POST | rate limit, sem `autenticar` |
| `/api/logout` | POST | autenticado |
| `/api/alterar-senha` | POST | autenticado (própria senha) |

### Usuários (Administração — tela P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/usuarios` | GET/POST | **P3** |
| `/api/usuarios/:usuario` | PUT | **P3** |
| `/api/usuarios/:usuario/resetar-senha` | POST | **P3** |
| `/api/usuarios/:usuario` | DELETE | **P3** |

Coerente: rota e tela protegidas nos dois lados.

### Pessoal (Cadastro de Pessoal — tela P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/pessoal` | GET | autenticado (**sem P3**) |
| `/api/pessoal` | POST | **P3** |
| `/api/pessoal/:id` | PUT/DELETE | **P3** |

`GET` sem `exigirP3` é proposital: o Cartão Programa (visível a Adjunto/Oficial) precisa de `pessoal` para os selects de Fiscal/Adjunto/Oficial de Sobreaviso e para o autocomplete de escala. Escrita é P3-only nos dois lados, coerente com a tela.

### Eventos (Novo Evento / Listar Eventos)
| Rota | Método | Middleware |
|---|---|---|
| `/api/eventos` | GET | autenticado |
| `/api/eventos` | POST/PUT/DELETE | **P3** |

Coerente com a regra "Adjunto/Oficial só leitura em Listar Eventos" — a tela "Novo Evento" fica oculta pra eles e a API de escrita também é P3-only.

### Operações + Escalas (Operações — tela P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/operacoes` | GET | autenticado (**sem P3**) |
| `/api/operacoes` | POST/PUT/DELETE | **P3** |
| `/api/escalas` | GET | autenticado (**sem P3**) |
| `/api/escalas` | POST/PUT/DELETE | **P3** |

**Achado:** a tela Operações é 100% oculta para Adjunto/Oficial (`hidden-role`), mas o `GET /api/operacoes`/`GET /api/escalas` não é. Um Adjunto autenticado pode chamar essas rotas diretamente e ler todos os dados de operações/diárias/efetivo escalado do batalhão, mesmo sem a aba aparecer pra ele. Não é o mesmo tipo de falha do achado de Viaturas (aqui é só leitura, não escrita), mas ainda diverge do princípio "client-side E server-side" do `CLAUDE.md`. Registrar como backlog de segurança — não corrigido nesta etapa (fora do escopo de 0.3, documentação apenas).

### Alocações (parte do drawer de Evento/Operação)
| Rota | Método | Middleware |
|---|---|---|
| `/api/alocacoes` | GET | autenticado |
| `/api/alocacoes` | POST/DELETE | **P3** |

### Bairros (Mapa → Gerenciar Bairros, painel P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/bairros-coordenadas` | GET | autenticado (alimenta o select de Bairro em Novo Evento e o Mapa, ambos usados por todos os perfis) |
| `/api/bairros-coordenadas` | POST/PUT/DELETE | **P3** |

Coerente: o painel de gerenciamento já é ocultado por `hidden-role` no Mapa para Adjunto/Oficial, e a API de escrita também é P3-only.

### Viaturas (Cadastro de Viaturas — tela deveria ser P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/viaturas` | GET | autenticado |
| `/api/viaturas` | POST | autenticado (**sem P3** — ⚠️) |
| `/api/viaturas/:id` | PUT | autenticado (**sem P3** — ⚠️) |
| `/api/viaturas/:id` | DELETE | **P3** |

**Achado principal desta auditoria (já registrado em 0.2):** a tela não está em `hidden-role` para Adjunto/Oficial (deveria estar, segundo o `CLAUDE.md`) **e** as rotas de criação/edição não são protegidas por `exigirP3`. É o único módulo onde o gap é de leitura **e** escrita, nos dois lados. Prioridade mais alta dos achados desta fase.

### Config (cota mensal — usada no Planejador)
| Rota | Método | Middleware |
|---|---|---|
| `/api/config` | GET | autenticado |
| `/api/config` | PUT | **P3** |

### Planejador de Diárias (tela P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/planejador-diarias` | GET | autenticado (**sem P3**) |
| `/api/diarias-calendario` | GET | autenticado (**sem P3**) |

Mesmo padrão do achado de Operações/Escalas: tela oculta, rota não protegida.

### Dashboard (tela P3-only)
| Rota | Método | Middleware |
|---|---|---|
| `/api/dashboard-resumo` | GET | **P3** |

Único agregador realmente coerente entre tela oculta e rota protegida (fora Usuários).

### Relatórios de Diárias
| Rota | Método | Middleware |
|---|---|---|
| `/api/relatorio-diarias` | GET | autenticado (**sem P3**) — Consolidado por Militar |
| `/api/relatorio-diario` | GET | **P3** — Relatório Diário (por data/operação) |

Ambas as sub-telas do Relatório Diárias são P3-only no client, mas só uma das duas rotas tem `exigirP3`.

### Cartão Programa (tela visível a todos, edição permitida a Adjunto/Oficial)
| Rota | Método | Middleware | Quem pode |
|---|---|---|---|
| `/api/cartoes`, `/api/cartoes/:id`, `/api/cartoes/templates` | GET | autenticado | todos |
| `/api/cartoes` | POST | autenticado; checagem manual de P3 **dentro do handler** só quando `is_template=true` | Adjunto/Oficial criam cartão do dia livremente; só P3 cria template |
| `/api/cartoes/:id` | PUT | autenticado | todos (edição diária) |
| `/api/cartoes/:id` | DELETE | **P3** | só P3 apaga cartão (template ou do dia) |
| `/api/cartoes/:id/clonar` | POST | autenticado | todos ("Importar e Clonar" template) |
| `/api/cartoes/:id/viaturas*` (CRUD viatura+itens do cartão) | POST/PUT/DELETE | autenticado | todos |

Este é o único módulo com modelo de permissão genuinamente diferenciado por ação (não por tela inteira) — replicar essa granularidade na Fase 2/3 do React, não simplificar para "tela toda P3 ou toda aberta".

### Rotas órfãs (achado novo)
`GET /api/estatisticas` e `GET /api/estatisticas-cartao` existem no `server.js` mas **não são chamadas em nenhum lugar de `public/app.js`** — a aba "Estatísticas" citada no `CLAUDE.md` (módulo 10) não existe como tela separada; o painel analítico foi incorporado dentro de Relatório Diárias (comentário em `public/index.html:393-395` confirma a decisão deliberada). Não portar essas duas rotas na Fase 1 sem antes confirmar com o usuário se ainda têm uso planejado — por ora, são código morto.

### Backup
| Rota | Método | Middleware |
|---|---|---|
| `/api/backup` | GET | **P3** |

## Regras de negócio por módulo (resumo — detalhe completo no `CLAUDE.md`)

- **Diária = nº de aparições × 2**, sempre (`escalas.total_diarias`). Regra 3 do `MIGRACAO.md`.
- **`diariaDaOperacao(op, escalas)`**: soma real das escalas se houver militar escalado; senão usa `qtd_diarias_estimada`. Nunca soma as duas fontes (regra 5).
- **Alocações**: vinculadas a exatamente um `evento_id` OU um `operacao_id` (nunca os dois, nunca nenhum — constraint no banco).
- **Cartão Programa**: ordenação de itens de roteiro ancorada em 07:00 (`((minutos - refMin) + 1440) % 1440` — regra 4). Alerta não-bloqueante quando Fiscal é Praça e Sobreaviso está vazio.
- **Bairros**: tabela estática `bairros_coordenadas` + `normalizarTexto()`, sem geocoding dinâmico (regra 8).
- **Eventos** não têm mais diária nem escala nominal (migrou para `operacoes`); só `num_os_manual`/`num_sei` como texto livre, sem status/Kanban.
- **`missoes_planejadas`**: tabela órfã (dados migrados para `operacoes`, sem `DROP`) — não recriar dependência.

## Achados consolidados desta fase (0.1–0.3) para decisão do usuário

1. **Cadastro de Viaturas — gap de leitura E escrita** (tela + `POST`/`PUT` sem `exigirP3`) — prioridade alta.
2. **Operações, Escalas, Planejador de Diárias — gap de leitura** (`GET` sem `exigirP3`, apesar da tela oculta) — prioridade média, é dado sensível de efetivo/diárias.
3. **`GET /api/estatisticas` e `/api/estatisticas-cartao`** — código morto, não usado pelo client atual.

Nenhum desses três foi corrigido nesta etapa (fora de escopo de 0.1–0.3, que é levantamento/documentação). Ficam registrados aqui e nos arquivos de `referencia-visual/` para tratamento explícito — via correção pontual antes da migração, ou via a Fase 1 (que já vai desenhar rotas novas do zero, oportunidade natural de fechar o gap 1 e 2 corretamente desde o início).
