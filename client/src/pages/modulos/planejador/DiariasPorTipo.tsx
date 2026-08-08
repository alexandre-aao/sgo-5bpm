import { BarChart3 } from 'lucide-react';
import type { OperacaoDoMes } from './usePlanejadorDiarias';
import { BarraPercentual } from '../../../components/BarraPercentual';

interface DiariasPorTipoProps {
  operacoes: OperacaoDoMes[];
}

// Série categórica (tipo de operação) — família azul/roxo, sem verde/amarelo:
// aqui a cor distingue categorias, não sinaliza situação.
const TONS = [
  { texto: 'tom-primary', barra: 'primary' },
  { texto: 'tom-info', barra: 'info' },
  { texto: 'tom-roxo', barra: 'roxo' },
  { texto: 'tom-evento-1', barra: 'evento-1' },
  { texto: 'tom-evento-4', barra: 'evento-4' },
  { texto: 'tom-neutro', barra: 'neutro' },
] as const;

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
            const tom = TONS[i % TONS.length];
            return (
              <div className="categoria-linha" key={tipo}>
                <div className="categoria-topo">
                  <span className={`peso-600 ${tom.texto}`}>{tipo}</span>
                  <span className="texto-muted">{qtd}</span>
                </div>
                <BarraPercentual valor={pct} tom={tom.barra} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
