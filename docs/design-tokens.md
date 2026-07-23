# Design tokens — SGO 5º BPM

> Extraído de [public/style.css](../public/style.css) (linhas 1–174 e breakpoints), 2026-07-23. Fonte de verdade para a Fase 2 (Shell React) do `MIGRACAO.md` — regra invíolável nº 1: identidade visual atual é referência obrigatória, **não redesenhar**.
>
> Dois temas por classe no `<body>`: sem classe = **Claro** (padrão), `.tema-escuro` = **Escuro** (azulado — não é inversão, ver notas). Alternância via `.tema-toggle` na topbar.

## Cores — Tema Claro (`:root`)

### Superfícies
| Token | Valor | Uso |
|---|---|---|
| `--bg-app` | `#f1f4f9` | fundo geral da aplicação |
| `--bg-panel` | `#ffffff` | cards, painéis, modais |
| `--bg-sidebar` | `#ffffff` | sidebar |
| `--surface-2` | `#f5f7fb` | superfície secundária (card de perfil, tracks, inputs) |
| `--surface-3` | `#eaeef6` | um passo além da 2 (hover/press de botão secundário) |
| `--surface-hover` | `#f7f9fc` | hover de linha de tabela |
| `--border-color` | `#e4e8ef` | bordas |
| `--divider` | `#f1f4f9` | divisor interno (mais leve que borda) |
| `--overlay` | `rgba(15,23,42,.45)` | backdrop de modal/drawer |

### Texto
| Token | Valor | Uso |
|---|---|---|
| `--text-main` | `#10131c` | texto principal |
| `--text-body` | `#475569` | texto de corpo |
| `--text-muted` | `#5b6478` | texto secundário — **deliberadamente mais escuro que o handoff** (`#64748B` reprova AA em 11px sobre `--surface-2`) |
| `--text-faint` | `#94a3b8` | texto terciário/placeholder |

### Primária
| Token | Valor | Uso |
|---|---|---|
| `--primary` | `#2563eb` | acento (ícone, borda, texto de destaque) |
| `--primary-solid` | `#2563eb` | fundo sólido com texto branco (botão, avatar, logo) — **fica igual nos dois temas de propósito** |
| `--primary-hover` | `#1d4ed8` | hover |
| `--primary-fg` | `#ffffff` | texto sobre `--primary-solid` |
| `--primary-soft` | `#e0eafb` | tint de fundo (ícones, chips) |
| `--nav-active-bg` | `#eef2fb` | item de menu ativo (fundo) |
| `--nav-active-fg` | `#2563eb` | item de menu ativo (texto/ícone) |
| `--link` / `--link-hover` | `#2563eb` / `#1d4ed8` | links |

### Status (par `-x`/`-x-fg`: sólido com texto branco vs. texto legível sobre `-bg`)
| Status | sólido (`--x`) | texto sobre tint (`--x-fg`) | fundo tint (`--x-bg`) | borda (`--x-border`) |
|---|---|---|---|---|
| Success | `#15803d` | `#15803d` | `#dcfce7` | `#86efac` |
| Warning | `#f59e0b` | `#b45309` | `#fef3c7` | `#fde68a` |
| Danger | `#dc2626` | `#b91c1c` | `#fee2e2` | `#fca5a5` |
| Info | `#0369a1` | `#0369a1` | `#e0f2fe` | `#bfdbfe` |

Roxo `#7c3aed` (bg `#ede9fe`), Laranja `#c2410c` (bg `#ffedd5`) — usos pontuais (badges).

**Todos os valores acima foram deliberadamente escurecidos em relação ao handoff original do Claude Designer** para fechar contraste WCAG AA (comentários no `:root` do CSS trazem a razão de cada um — ex.: `--success` handoff era `#16A34A`, dá 3.30:1 e reprova; `#15803D` dá 5.02:1).

### Badges (auto-contidos, não variam por tema)
- Evento: `#4338ca` `#7c3aed` `#9333ea` `#c026d3` `#db2777` `#9d174d`
- Neutro: `#64748b` (claro) / `#475569` (escuro)
- Pessoal: `#2563eb` `#0369a1` `#075985`
- Categoria (Cadastro de Pessoal): `#0e7490` `#1d4ed8` `#4338ca` `#6d28d9` `#0f766e`

## Cores — Tema Escuro (`.tema-escuro`)

| Token | Valor | Nota |
|---|---|---|
| `--bg-app` | `#0b1220` | |
| `--bg-panel` / `--bg-sidebar` | `#151e30` | |
| `--surface-hover` | `#1a2438` | |
| `--border-color` | `#26324a` | |
| `--divider` | `#232e45` | |
| `--overlay` | `rgba(0,0,0,.6)` | |
| `--text-main` | `#e8edf5` | |
| `--text-body` | `#cbd5e1` | |
| `--text-muted` | `#94a3b8` | |
| `--text-faint` | `#7e8ca3` | |
| `--primary` | `#3b82f6` | clareia no escuro (acento) |
| `--primary-solid` | `#2563eb` | **não clareia** — `#3B82F6` com texto branco dá só 3.68:1, reprova AA |
| `--primary-soft` | `rgba(59,130,246,.18)` | |
| `--nav-active-bg` | `rgba(59,130,246,.14)` | |
| `--nav-active-fg` | `#60a5fa` | |
| `--link` / `--link-hover` | `#60a5fa` / `#93c5fd` | |

Status no escuro viram **tintas translúcidas ~16-18%** em vez de pastel sólido:
| Status | sólido | texto (`-fg`) | fundo tint |
|---|---|---|---|
| Success | `#15803d` | `#22c55e` | `rgba(34,197,94,.16)` |
| Warning | `#f59e0b` | `#fbbf24` | `rgba(245,158,11,.16)` |
| Danger | `#dc2626` | `#f87171` (não `#ef4444`, que dá 4.43) | `rgba(239,68,68,.16)` |
| Info | `#0369a1` | `#38bdf8` | `rgba(56,189,248,.16)` |

**Regra crítica para a migração:** os pares `-x`/`-x-fg` têm papéis diferentes (sólido com texto branco em cima vs. texto/ícone sobre o tint `-bg`) — trocar um pelo outro é o erro mais comum e sempre reprova contraste em algum tema. Nunca hardcodar cor em componente — sempre var (equivalente em React/CSS Modules/Tailwind: nunca literal, sempre token).

## Tipografia

- **Família única:** `'Inter', system-ui, -apple-system, sans-serif` — tanto `--font-title` quanto `--font-body` (a Outfit do handoff original saiu; `--font-title` é alias mantido só por compatibilidade com regras existentes).
- **Sem escala de tamanho tokenizada** — os `font-size` são valores `rem` ad hoc por componente (ex.: `0.68rem`, `0.79rem`, `0.9rem`, `1.32rem`, `2rem` em KPIs grandes). Não há `--font-size-sm/md/lg` no CSS atual. Ao portar para React, reaproveitar os valores literais por componente (não inventar uma escala nova sem confirmar com o usuário — regra 1 do `MIGRACAO.md` veda redesenho).

## Espaçamento, raio, sombra, transição

| Token | Valor | Uso |
|---|---|---|
| `--border-radius` | `14px` | cards/painéis |
| `--radius-sm` | `8px` | botões, inputs, badges, container de ícone |
| `--radius-pill` | `999px` | pills/badges arredondados |
| `--shadow-sm` | `0 1px 2px 0 rgba(15,23,42,.05)` (claro) / `rgba(0,0,0,.35)` (escuro) | |
| `--shadow-md` | `0 4px 10px -2px rgba(15,23,42,.07), 0 2px 4px -2px rgba(15,23,42,.05)` | |
| `--shadow-lg` | `0 10px 20px -4px rgba(15,23,42,.08), 0 4px 8px -4px rgba(15,23,42,.05)` | |
| `--shadow-premium` | `0 24px 50px -12px rgba(15,23,42,.18), 0 8px 16px -8px rgba(15,23,42,.1)` | elevação máxima (dropdowns, popovers) |
| `--transition-fast` | `0.15s ease` | |
| `--transition-normal` | `0.3s cubic-bezier(.4,0,.2,1)` | |

Não há tokens `--space-*` — espaçamento é `px`/`rem` literal por regra.

## Breakpoints (mobile-first via `max-width`)

| Breakpoint | Uso principal |
|---|---|
| `1400px` | KPI row cai para 2 colunas |
| `1279px` | layouts `.dash-layout`/`.dash-layout-360` colapsam trilho lateral pra coluna única |
| `1023px` | ajustes intermediários de grid |
| `768px` | **shell mobile completo**: topbar vira faixa azul (`--primary-solid`), aparece a barra de abas inferior (`.bottom-tabs`), sidebar/menu vira drawer (`.nav-drawer-open`) |
| `560px` | ajustes finos de KPI em telas muito estreitas |

## Ícones e assets

- Ícones: Lucide, via CDN fixado em `lucide@1.24.0` (nunca `@latest`).
- Brasão: `public/img/brasao-5bpm.png` (112×128, ~20KB — versão otimizada; não usar o arquivo cru de `uploads/`).
- Mapa: Leaflet 1.9.4 via CDN, dois tiles (CartoCDN `dark_all` e `voyager`).

## Regras de aplicação (para a Fase 2 do MIGRACAO.md)

1. Nunca cor crua em componente — sempre var()/token equivalente.
2. Não confundir `--x` (sólido, texto branco em cima) com `--x-fg` (texto sobre tint `-bg`).
3. `--primary-solid` fica `#2563EB` nos dois temas; só `--primary` (acento) clareia no escuro.
4. Contraste é requisito — vários valores aqui já foram escurecidos deliberadamente em relação ao handoff original para fechar WCAG AA; não "corrigir" de volta para os valores do handoff sem revalidar contraste.
5. Reaproveitar `style.css` como base inicial na Fase 2 (conforme item 2.3 do `MIGRACAO.md`) em vez de recriar os tokens do zero.
