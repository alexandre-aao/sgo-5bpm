import { CalendarDays, FileDown } from 'lucide-react';
import { dataBrHifen, nomeMes } from './mesesNomes';
import { nomeExibicaoMilitarDiario } from './nomeExibicaoMilitar';
import type { RelatorioDiarioResponse } from './useRelatorioDiario';

interface RelatorioDiarioTextoProps {
  agrupar: 'data' | 'operacao';
  onMudarAgrupar: (agrupar: 'data' | 'operacao') => void;
  onAbrirPdf: () => void;
  dados: RelatorioDiarioResponse | null;
  carregando: boolean;
  erro: string;
}

function montarTexto(dados: RelatorioDiarioResponse): string {
  const cabMes = `${nomeMes(dados.mes)}/${dados.ano}`;
  if (dados.grupos.length === 0) {
    return `RELATÓRIO DE DIÁRIAS — ${cabMes}\n\nNenhuma diária lançada no período.`;
  }
  const linhas = [`RELATÓRIO DE DIÁRIAS — ${cabMes} (${dados.agrupar === 'operacao' ? 'por operação' : 'por data'})`, ''];
  dados.grupos.forEach((g) => {
    const militaresTxt = g.militares.map((m) => `${nomeExibicaoMilitarDiario(m)} ${m.diarias} diárias`).join(', ');
    if (dados.agrupar === 'operacao') {
      linhas.push(`${g.operacao} — ${dataBrHifen(g.data)}${g.tipo ? ' (' + g.tipo + ')' : ''}: ${militaresTxt} — Total: ${g.total} diárias`);
    } else {
      linhas.push(`${dataBrHifen(g.data)}: ${militaresTxt} — Total do dia: ${g.total} diárias`);
    }
  });
  linhas.push('', `TOTAL DO MÊS: ${dados.total_mes} diárias`);
  return linhas.join('\n');
}

export function RelatorioDiarioTexto({ agrupar, onMudarAgrupar, onAbrirPdf, dados, carregando, erro }: RelatorioDiarioTextoProps) {
  const texto = carregando ? 'Carregando...' : erro ? erro : dados ? montarTexto(dados) : 'Selecione o mês/ano acima.';

  return (
    <div className="panel report-panel" style={{ marginTop: 16 }}>
      <div className="panel-header flex-column-mobile">
        <div className="panel-title">
          <CalendarDays />
          <h2>Relatório Diário de Diárias</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={`btn btn-sm ${agrupar === 'data' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onMudarAgrupar('data')}>
            Por Data
          </button>
          <button
            type="button" className={`btn btn-sm ${agrupar === 'operacao' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onMudarAgrupar('operacao')}
          >
            Por Operação
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAbrirPdf}>
            <FileDown /> Relatório (PDF)
          </button>
        </div>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0 4px 8px' }}>
        Usa o mês/ano selecionados acima. Fonte: operações + escalas (diária = aparições × 2).
      </p>
      <pre className="lista-sei-texto">{texto}</pre>
    </div>
  );
}
