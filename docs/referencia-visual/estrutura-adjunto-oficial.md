# Estrutura de telas — perfis Adjunto e Oficial (referência textual)

> Capturado em 2026-07-23. Mesma ressalva de [estrutura-p3.md](estrutura-p3.md): sem screenshots PNG nesta sessão (painel do navegador não composita frames); referência textual via DOM/JS ao vivo. Logins de teste `teste-migracao-adjunto` e `teste-migracao-oficial` (apagados ao final da etapa 0.2).

## Tela inicial

Ambos os perfis abrem em **Meu Turno** ("Escala de Turno (Serviço Diário)"), confirmando a regra 7 do `MIGRACAO.md` (P3 → Dashboard; Adjunto/Oficial → Meu Turno). Conteúdo idêntico ao descrito em `estrutura-p3.md` § "3. Meu Turno".

## Sidebar — itens visíveis (checado via `getComputedStyle(...).display` + classe `hidden-role`, não só a árvore de acessibilidade — o DOM mantém os `<button>` ocultos das outras abas mesmo escondidos)

Confirmado **idêntico** para Adjunto e Oficial:

| Item | Visível? |
|---|---|
| Dashboard | ❌ oculto (`hidden-role`) |
| Novo Evento | ❌ oculto |
| Listar Eventos | ✅ visível |
| Mapa | ✅ visível |
| Meu Turno | ✅ visível |
| Cartão Programa | ✅ visível |
| Operações | ❌ oculto |
| Planejador Diárias | ❌ oculto |
| Relatório Diárias | ❌ oculto |
| Usuários | ❌ oculto |
| Cadastro de Pessoal | ❌ oculto |
| **Cadastro de Viaturas** | **✅ visível** |

Cota Mensal de Diárias (sidebar): oculta para os dois perfis (`hidden-role`, P3-only), como esperado.

## ⚠️ Achado fora do escopo desta etapa — gap de permissão em Cadastro de Viaturas

O `CLAUDE.md` (seção "Perfis de acesso") documenta que Adjunto/Oficial "só veem Meu Turno, Cartão Programa, Listar Eventos e Mapa (leitura)". Na prática, **"Cadastro de Viaturas" está visível e navegável para os dois perfis** (sem `hidden-role` no botão da sidebar) — item não documentado como exceção.

Conferido também no backend (`server.js`): `POST /api/viaturas` e `PUT /api/viaturas/:id` **não têm o middleware `exigirP3`** (só o `DELETE /api/viaturas/:id` tem, linha ~1247). Ou seja, Adjunto/Oficial conseguem **criar e editar** viaturas do cadastro, não só visualizar — violando o princípio "client-side E server-side" que o próprio `CLAUDE.md` estabelece como regra de segurança.

**Não corrigido nesta etapa** (fora do escopo de 0.1/0.2 — captura de referência). Registrar como item de backlog para decisão do usuário: (a) é um comportamento desejado que ficou de fora da doc, ou (b) é um bug de controle de acesso a corrigir (adicionar `hidden-role` no botão + `exigirP3` no POST/PUT) antes ou depois da migração.

## Telas visíveis — conteúdo

Idêntico ao já documentado em `estrutura-p3.md`:
- § "3. Meu Turno" (tela inicial)
- § "4. Listar Eventos"
- § "5. Mapa" (sem o painel "Cadastro de Bairros", que é P3-only — a checar se `hidden-role` cobre esse bloco também)
- § "9. Cartão Programa" (Adjunto/Oficial podem editar; não podem excluir cartão — `DELETE /api/cartoes/:id` usa `exigirP3`)
- § "12. Cadastro de Viaturas" (ver achado acima — acesso não deveria existir segundo a doc atual)

## Barra de abas inferior (mobile)

Conforme `CLAUDE.md`: Adjunto e Oficial = Meu Turno / Cartão / Eventos / Mapa / Mais (sem Início nem Operações, que são P3-only na barra mobile — não testado nesta sessão por falta de screenshot/viewport mobile funcional; a montagem é feita em `montarBottomTabs(role)` no `app.js`).
