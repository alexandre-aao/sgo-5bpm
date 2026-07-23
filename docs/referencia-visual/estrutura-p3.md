# Estrutura de telas — perfil P3 (referência textual)

> Capturado em 2026-07-23, via árvore de acessibilidade (`read_page filter=all`) do app rodando localmente (preview server, dados reais de produção). Login de teste: `teste-migracao-p3` (apagado ao final da etapa 0.2 — ver [design-tokens.md](../design-tokens.md)).
>
> **Por que texto e não imagem:** nesta sessão o painel do navegador não compõe frames ("Browser pane is not displayed"), então `computer{action:"screenshot"}` falha. Screenshots em PNG reais ficam pendentes para uma sessão interativa (ver nota no `MIGRACAO.md`/aprovação do usuário). Este documento serve como a referência estrutural/de conteúdo enquanto isso — cada aba, cada campo de formulário, cada tabela e cada modal do app estão listados abaixo, na ordem em que aparecem no DOM.
>
> **Observação técnica importante:** o app é uma SPA de aba única (`public/index.html`) — todas as `<section class="tab-content">` de todas as abas E todos os modais ficam no DOM simultaneamente, alternando visibilidade via classe `active`/`hidden`. Por isso uma única captura de árvore de acessibilidade (autenticado como P3, que vê tudo) trouxe a estrutura completa do app: 12 abas + ~20 modais, na sequência abaixo.

## Sidebar / navegação (perfil P3)

- Marca: brasão + "SGO 5º BPM" + "Sistema de Gestão Operacional"
- Perfil-card: nome do usuário, "Online", "Perfil: P3"
- Menu (com separadores de seção):
  - **Eventos:** Dashboard, Novo Evento, Listar Eventos, Mapa
  - **Patrulhamento:** Meu Turno, Cartão Programa
  - **Diárias:** Operações, Planejador Diárias, Relatório Diárias
  - **Administração:** Usuários, Cadastro de Pessoal, Cadastro de Viaturas
- Cota Mensal de Diárias (anel, P3-only): mês/ano, %, Consumido/Disponível/Total, botão "Ver Planejador"
- Rodapé: "Alterar Senha", "Sair do Sistema"

## Topbar

- Botão "Abrir menu" (mobile)
- Título da aba ativa + subtítulo
- Toggle de tema (radiogroup "Claro"/"Escuro")
- Data + dia da semana
- Nome do usuário + cargo

## Barra de abas inferior (mobile, `nav-drawer`)

P3: Início, Eventos, Operações, Cartão, Mais

---

## 1. Dashboard Operacional

Filtros: Mês / Ano.
KPIs: Eventos (7 dias), Operações (período), Diárias Consumidas (de N, %), Conflitos Hoje (com resumo do cartão de hoje).
Alertas Operacionais (lista ou estado vazio "Nenhum alerta operacional no momento").
Patrulhamento de Hoje: tabela Viatura/Setor/Companhia/Comandante + "Ver cartão completo" (ou estado vazio "Nenhum Cartão Programa lançado para hoje" + botão "Lançar Cartão de Hoje").
Módulos (7 cards): Eventos, Cartão Programa, Planejador de Diárias, Relatório de Diárias, Cadastro de Viaturas, Pessoal, Usuários — cada um com contagem viva.
Donut "Diárias — Visão Geral" (consumidas/planejadas/disponível) + "Distribuição por Tipo de Missão" (barras).
Tabela "Operações Recentes" (Data/Operação/Tipo/Situação/Diárias/Escalados) + "Ver todas as operações".
Tabela "Top 10 — Ranking de Empenho" (Policial/Escalas/Diárias).
Trilho lateral: "Eventos Próximos" (Data/Evento/Nº OS, "Ver todos") + "Atalhos Rápidos" (Novo Evento, Nova Operação, Cartão Programa de Hoje, Lançamento — Missão Avulsa, Relatório de Diárias, Mapa de Eventos).

## 2. Novo Evento

Card "Documentação": Número do Ofício, Número da OS, Número SEI (texto livre).
Card "Identificação": Tipo de Evento* (Show/Futebol/Ato Público/Religioso/Cultural/Evento Junino/Missão Avulsa/Outros), Nome do Evento*, Demandante/Solicitante*.
Card "Quando e Onde": Data de Início*, Data de Término, Horário de Início, Local/Itinerário*, Bairro (select + campo livre "Outro").
Ações: Limpar (reset), Salvar Evento (submit).

## 3. Meu Turno

Seletor "Hoje"/"Amanhã" (radiogroup).
Status do cartão do dia + "Abrir Cartão Programa".
4 KPIs: Eventos do dia, Viaturas no turno, Efetivo empregado, Avisos do turno.
"Eventos do Dia" (lista clicável → drawer de evento).
"Cartão Programa — Viaturas do Turno": tabela Prefixo/Setor/Categoria/Companhia/Comandante + "Ver cartão completo".
Trilho: "Equipe de Serviço" (fiscal/adjunto/sobreaviso) + "Avisos do Turno".

## 4. Listar Eventos

4 KPIs: No filtro atual, Próximos 7 dias, Sem Nº da OS, Sem Nº SEI.
Filtros: Data Inicial, Data Final, Filtrar Texto (Evento/Local/Demandante).
Ações: Limpar Filtros, Relatório (PDF), Novo Evento.
Tabela: Data/Nome do Evento/Tipo/Demandante/Bairro/Local/Nº OS/Nº SEI. **Sem paginação** (pendência conhecida, ver `CLAUDE.md`).

## 5. Mapa

"Mapa de Eventos da Semana" (Leaflet) + botão "Gerenciar Bairros" (P3).
Toggles: mostrar Eventos / mostrar Viaturas (Cartão de hoje).
Select "Estilo do Mapa" (Escuro/Colorido).
Painel lateral "Ocorrências no Mapa" (contagem + lista clicável).
Painel "Cadastro de Bairros" (P3): form Nome/Latitude/Longitude + tabela com Ações (editar/excluir).

## 6. Relatório Diárias

4 KPIs: Militares no mês, Total de diárias, Escalas lançadas, Média por militar.
**Consolidado por Militar:** filtros Mês/Ano/Pesquisar Militar, botões "Relatório (PDF)" e "Exportar" (CSV). Tabela: Matrícula/Nome/Qtd. Escalas/Total Aparições/Total Diárias.
**Relatório Diário de Diárias:** toggle "Por Data"/"Por Operação" + "Relatório (PDF)".

## 7. Operações (P3-only)

Filtros: Situação (Todas/Planejada/Executada), Filtrar Texto.
Botão "Nova Operação".
Tabela: Data/Operação/Tipo/Situação/Demandante/Militares/Diária.

## 8. Planejador Diárias

Filtros Mês/Ano + Cota mensal (inline, P3-only) + Salvar.
4 KPIs: Cota Mensal, Consumido, Planejado, Disponível.
"Ocupação da Cota" (barra segmentada consumido/planejado/disponível, "Cota mensal excedida" quando estourada).
"Operações do Mês": tabela Data/Operação/Tipo/Situação/Escala/Diárias.
Trilho: "Calendário de Diárias" (heatmap, navegação mês anterior/próximo, legenda Leve/Médio/Alto, clique lança Missão Avulsa) + "Diárias por Tipo de Operação".

## 9. Cartão Programa

Navegador de data (dia anterior/próximo, campo de data), status do cartão.
Ações: Criar Cartão, Copiar, Imprimir, "Mais ações" → Cartões Padrão, Novo Cartão Padrão, Excluir.
"Cartões Padrão de Patrulhamento": tabela Nome/Período/Qtd. VTRs Base/Viaturas/Ações.
"Cartões Recentes": tabela Data/Fiscal/Adjunto/Viaturas/Ação.
Estado vazio "Nenhum Cartão Programa para esta data" com 3 caminhos (em branco / copiar / template) + seletor Tipo de Cartão + Quantidade de Viaturas + "Buscar Cartão Padrão Sugerido".
Cabeçalho do cartão: Tipo de Cartão, Fiscal de Operações, Adjunto, Oficial de Sobreaviso (combos populados por `pessoal`), campo Sobreaviso.
"Quadro Resumo" (tabela de impressão): Companhia/Viatura/Setor/QTL Almoço/QTL Jantar/Madrugada Segura.
Sub-abas "Viaturas"/"Roteiro". Tabela de viaturas: Prefixo/Setor/Companhia/Categoria/Comandante/Observação/Ações. Form "Adicionar Viatura ao Cartão": Prefixo*, Setor/Bairro*, Comandante, Companhia, Categoria, Obs./Turno da Madrugada.
Trilho: "Resumo do Turno", "Distribuição por Categoria", "Alertas de Conflito".

## 10. Usuários (P3-only)

Botões "Exportar Backup", "Novo Usuário".
Tabela: Login/Nome/Perfil/Ações.

## 11. Cadastro de Pessoal (P3-only)

Botão "Nova Pessoa".
Filtros por categoria: Todos, Adjuntos, Fiscais de Operações, Oficiais de Operações, Oficiais de Sobreaviso, Executores, Sem categoria.
Tabela: Matrícula/Nome/Subunidade/Posto-Graduação/Tipo/Categorias/Ações.

## 12. Cadastro de Viaturas (P3-only)

Botão "Nova Viatura". Filtros: Todas/Ativas/Manutenção.
Tabela: Prefixo/Companhia/Categoria/Status/Observação/Ações.

---

## Modais (P3 vê todos)

- **Novo Usuário:** Login, Nome de Exibição, Perfil (P3/Adjunto/Oficial), Senha Inicial (mín. 8).
- **Nova Pessoa:** Nome, Matrícula (RE), Subunidade, Posto/Graduação, Categorias (5 checkboxes).
- **Nova Viatura / Editar Viatura:** Prefixo, Companhia, Categoria, Status, Setor Padrão, Observação.
- **Confirmar Exclusão:** campo "Digite para confirmar" + Excluir.
- **Resetar Senha:** Nova Senha (mín. 8).
- **Lançar Missão Avulsa:** Nome da Missão*, Data*, Horário, Local — cria uma `operação` Planejada.
- **Novo Cartão Padrão:** Nome*, Período* (Dia Útil/Fim de Semana), Qtd. Viaturas Base* (5/6/7).
- **Copiar Cartão Programa:** combobox "Copiar de qual cartão?" (qualquer cartão existente).
- **Relatório (PDF):** preview + "Imprimir / Salvar PDF" (estilo SGEPM — ver `CLAUDE.md`).
- **Drawer de Evento:** Detalhes do Ofício, Modalidades Alocadas (form: Modalidade, Policiais, Viaturas, Prefixos, Comando do Serviço), Excluir/Editar Evento.
- **Drawer de Operação:** Detalhes da Operação (+ Diárias Estimadas), "Efetivo Escalado (Diárias)" com autocomplete de militar (Nome Completo, Matrícula, Nº Aparições — cálculo automático de diárias), Excluir Operação, Marcar como Executada, Editar.
- **Nova/Editar Operação:** Nome*, Tipo* (7 opções), Data Início*, Data Término, Diárias Estimadas*, Horário, Recorrência, Bairro, Local, Ofício/OS/SEI/Demandante.
- **Editar Evento:** mesmos campos do Novo Evento.
- **Alterar Minha Senha:** Senha Atual, Nova Senha, Confirmar Nova Senha.
