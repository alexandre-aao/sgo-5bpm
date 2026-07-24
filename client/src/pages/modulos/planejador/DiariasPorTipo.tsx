import { BarChart3 } from 'lucide-react';
import type { OperacaoDoMes } from './usePlanejadorDiarias';

interface DiariasPorTipoProps {
  operacoes: OperacaoDoMes[];
}

const CORES = ['var(--primary)', 'var(--warning-fg)', 'var(--info-fg)', 'var(--roxo)', 'var(--success)', 'var(--badge-neutro)'];

// Barras "Diárias por Tipo de Operação" do trilho do Planejador — espelha
// renderDiariasPorTipo() em public/app.js.
export function DiariasPorTipo({ operacoes }: DiariasPorTipoProps) {
  const porTipo = new Map<string, number>();
  operacoes.forEach((op) => {
    const tipo = op.tipo_operacao || 'Outras';
    porTipo.set(tipo, (porTipo.get(tipo) || 0) + (op.total_diarias || 0));
  });

  const linhas = [...porTipo.entries()].filter(([, qtd]) => qtd > 0).sort((a, b) => b[1] - a[1]);
  const maior = linhas[0]?.[1] || 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <BarChart3 />
          <h2>Diárias por Tipo de Operação</h2>
        </div>
      </div>
      <div className="cartao-categorias">
        {linhas.length === 0 ? (
          <p className="turno-vazio">Nenhuma diária lançada neste mês.</p>
        ) : (
          linhas.map(([tipo, qtd], i) => {
            const pct = Math.round((qtd / maior) * 100);
            const cor = CORES[i % CORES.length];
            return (
              <div className="categoria-linha" key={tipo}>
                <div className="categoria-topo">
                  <span style={{ fontWeight: 600, color: cor }}>{tipo}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{qtd}</span>
                </div>
                <div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${pct}%`, background: cor }} /></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
