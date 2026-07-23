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
| Cadastro de Viaturas | ✅ visível (intencional — ver nota abaixo) |

Cota Mensal de Diárias (sidebar): oculta para os dois perfis (`hidden-role`, P3-only), como esperado.

## ✅ Correção: Cadastro de Viaturas visível a Adjunto/Oficial é intencional, não bug

Concluí inicialmente (nesta mesma sessão) que "Cadastro de Viaturas" visível para Adjunto/Oficial era um gap de permissão. **Estava errado** — é decisão deliberada e comentada em `applyRolePermissions` (`public/app.js`, por volta da linha 263): "Cadastro de Viaturas é aberto a Adjunto/Oficial (cadastrar e editar; excluir segue P3-only...)". O `POST`/`PUT` de `/api/viaturas` não terem `exigirP3` é proposital (só o `DELETE` é P3-only), coerente com o client. A lacuna real era na documentação (`CLAUDE.md` não citava essa exceção) — já corrigida na seção "Perfis de acesso" do `CLAUDE.md`.

## Telas visíveis — conteúdo

Idêntico ao já documentado em `estrutura-p3.md`:
- § "3. Meu Turno" (tela inicial)
- § "4. Listar Eventos"
- § "5. Mapa" (sem o painel "Cadastro de Bairros", que é P3-only — a checar se `hidden-role` cobre esse bloco também)
- § "9. Cartão Programa" (Adjunto/Oficial podem editar; não podem excluir cartão — `DELETE /api/cartoes/:id` usa `exigirP3`)
- § "12. Cadastro de Viaturas" (ver achado acima — acesso não deveria existir segundo a doc atual)

## Barra de abas inferior (mobile)

Conforme `CLAUDE.md`: Adjunto e Oficial = Meu Turno / Cartão / Eventos / Mapa / Mais (sem Início nem Operações, que são P3-only na barra mobile — não testado nesta sessão por falta de screenshot/viewport mobile funcional; a montagem é feita em `montarBottomTabs(role)` no `app.js`).
