import { useState } from 'react';
import { FileSpreadsheet, FileDown, Download } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import { periodoInicial } from '../../../lib/periodo';
import { FiltroMesAno } from '../../../components/FiltroMesAno';
import { ModalRelatorioPdf } from '../../../components/relatorioPdf/ModalRelatorioPdf';
import { RelatorioKpis } from './RelatorioKpis';
import { TabelaConsolidado } from './TabelaConsolidado';
import { RelatorioConsolidadoPdf } from './RelatorioConsolidadoPdf';
import { useRelatorioDiarias } from './useRelatorioDiarias';

const CABECALHO_CSV = ['Matrícula', 'Nome do Militar', 'Quantidade de Escalas', 'Total de Aparições', 'Total de Diárias (Un.)'];
const BOM_UTF8 = '﻿';

export default function RelatorioPage() {
  const { toast } = useToast();
  const [{ mes, ano }, setPeriodo] = useState(periodoInicial);
  const [busca, setBusca] = useState('');
  const { lista } = useRelatorioDiarias(mes, ano);
  const [modalPdfAberto, setModalPdfAberto] = useState(false);

  const buscaNormalizada = busca.toLowerCase().trim();
  const listaFiltrada = lista.filter(
    (item) => item.militar_nome.toLowerCase().includes(buscaNormalizada) || item.militar_id.toLowerCase().includes(buscaNormalizada),
  );

  function handleExportarCsv() {
    const linhas = listaFiltrada.map((item) => [
      item.militar_id,
      item.militar_nome,
      String(item.escalas_count),
      String(item.qtd_aparicoes),
      String(item.total_diarias),
    ]);
    const csv = [CABECALHO_CSV, ...linhas].map((cols) => cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(BOM_UTF8 + csv)}`;
    link.download = `relatorio_diarias_${mes}_${ano}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Planilha CSV gerada e baixada.', 'success');
  }

  function handleAbrirPdf() {
    if (listaFiltrada.length === 0) {
      toast('Nenhum militar no período/filtro selecionado.', 'warning');
      return;
    }
    setModalPdfAberto(true);
  }

  return (
    <>
      <RelatorioKpis lista={listaFiltrada} />

      <div className="panel report-panel">
        <div className="panel-header">
          <div className="panel-title">
            <FileSpreadsheet />
            <h2>Consolidado por Militar</h2>
          </div>
          <div className="report-filters">
            <FiltroMesAno
              idPrefix="filter" mes={mes} ano={ano}
              onMesChange={(novoMes) => setPeriodo({ mes: novoMes, ano })}
              onAnoChange={(novoAno) => setPeriodo({ mes, ano: novoAno })}
            />
            <div className="filter-search">
              <label htmlFor="filter-search-input">Pesquisar Militar</label>
              <input
                type="text" id="filter-search-input" placeholder="Nome ou Matrícula..."
                value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAbrirPdf}>
              <FileDown /> Relatório (PDF)
            </button>
            <button type="button" className="btn btn-success" onClick={handleExportarCsv}>
              <Download /> <span>Exportar</span>
            </button>
          </div>
        </div>

        <TabelaConsolidado lista={listaFiltrada} />
      </div>

      {modalPdfAberto && (
        <ModalRelatorioPdf onFechar={() => setModalPdfAberto(false)}>
          <RelatorioConsolidadoPdf lista={listaFiltrada} mes={mes} ano={ano} busca={buscaNormalizada} />
        </ModalRelatorioPdf>
      )}
    </>
  );
}
