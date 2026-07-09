# Guia de Entrega e Verificação (Walkthrough)

O aplicativo **Pauta de Eventos (P3 / 5º BPM)** foi iniciado e está rodando em ambiente local. A arquitetura foi ajustada para uma estrutura **Full-Stack** com servidor HTTP e banco de dados centralizado em arquivo JSON. Isso permite o compartilhamento das informações online em tempo real entre o Oficial de Dia, Adjunto e a P3.

---

## 1. Status do Servidor
O servidor Node.js foi inicializado com sucesso no seu sistema:
*   **Endereço Local:** `http://localhost:3005`
*   **Porta Ativa:** `3005` (alterada de 3000 para evitar conflitos de porta)

---

## 2. Estrutura de Arquivos Criados

Os seguintes arquivos foram estruturados na pasta do projeto no seu Desktop:
*   package.json — Configuração e dependências (Express e CORS).
*   server.js — Servidor API que controla as coleções (`db.json`) e executa as regras de automação no backend.
*   data/db.json — Banco de dados relacional simulado, semeado com dados iniciais de exemplo.
*   public/index.html — Interface do usuário responsiva (Dashboard, Novo Ofício e Relatório).
*   public/style.css — Design System premium em tons Slate/Navy escuro.
*   public/app.js — Script do cliente para navegação SPA, requisições HTTP, Drag-and-Drop no Kanban e renderização do calendário.

---

## 3. Passo a Passo para Acesso e Teste

### Acesso na mesma máquina:
Abra o navegador e acesse:
👉 http://localhost:3005

### Acesso por outros usuários (Oficial de Dia / Adjunto):
Para permitir que computadores ou celulares na mesma rede Wi-Fi/intranet do Batalhão acessem o sistema:
1. Obtenha o IP local da sua máquina. No terminal (PowerShell), você pode executar o comando `ipconfig` e localizar o campo `Endereço IPv4` (ex: `192.168.1.50`).
2. Passe o endereço para os outros oficiais. Eles acessarão digitando no navegador:
   👉 http://192.168.1.50:3005 (substituindo pelo seu IP real).

---

## 4. Guia de Validação das Funcionalidades

### A. Automação de Diárias (Coleção `Escala_Diarias`):
1. No **Dashboard**, clique no evento *"Futebol Beneficente - Estádio Municipal"* no Calendário ou Kanban. A gaveta lateral de detalhes se abrirá.
2. Clique na aba **"Escala de Militares (Diárias)"** e clique em **"Escalar Militar"**.
3. Digite o Nome (ex: *Sd PM Costa*), Matrícula (ex: *555.222-1*) e coloque a quantidade de aparições como **`3`**.
4. Observe a calculadora interna mostrando o preview: *"Cálculo automático de diárias: 6 diárias operacionais."*
5. Clique em **Confirmar Escala**.
6. Vá para a aba **Relatório Diárias**, selecione o mês de **Julho** e ano **2026**. O militar *Sd PM Costa* aparecerá listado com o total acumulado correto de `6` diárias.

### B. Gerador Sequencial de OS (Coleção `Eventos_Pauta`):
1. No **Dashboard**, localize o card *"Futebol Beneficente - Estádio Municipal"* na coluna **Planejando** do Kanban.
2. Arrasta o card e solte-o na coluna **Publicada**.
3. O card piscará com uma atualização visual e um Toast de sucesso surgirá na tela, notificando que a Ordem de Serviço foi gerada.
4. Clique no card para abrir os detalhes na gaveta lateral. Você verá que o campo **Código OS** foi preenchido automaticamente com `OS Nº 002/2026 - P3/5º BPM` (incrementando sequencialmente a OS 001 que já estava no banco de dados para o ano de 2026).

### C. Geração e Filtros de Relatórios:
1. Navegue para a aba **Relatório Diárias**.
2. Digite *"Silva"* na caixa de pesquisa. A tabela filtrará instantaneamente em tempo real apenas o militar correspondente.
3. Clique no botão verde **Exportar**. O navegador baixará uma planilha Excel/CSV (`relatorio_diarias_07_2026.csv`) pronta com os dados consolidados.
