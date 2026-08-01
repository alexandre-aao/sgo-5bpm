import type { CartaoDetalhado } from '../../lib/cartaoConflitos';
import { formatHoraCartao } from '../../lib/cartaoConflitos';
import { marcarViradaDeDia } from '../../lib/janelaCartao';
import { atividadeBadgeClass } from '../modulos/cartao/constantes';

interface BlocosOperacaoProps {
  cartao: CartaoDetalhado;
}

/**
 * Modo Operação (mobile, leitura): um bloco por missão, empilhado, tipografia
 * ampliada e alto contraste — sem nenhum controle de edição. Mesma ordenação e
 * mesmo separador de virada de dia do modo Edição; nunca cor crua, só var().
 */
export function BlocosOperacao({ cartao }: BlocosOperacaoProps) {
  return (
    <div className="ctc-blocos-lista">
      {cartao.viaturas.map((vtr) => (
        <section className="ctc-blocos-secao" key={vtr.id}>
          <h3 className="ctc-blocos-titulo">VTR {vtr.prefixo} — {vtr.setor}</h3>
          <p className="ctc-blocos-comandante">Efetivo: {vtr.comandante || 'Não informado'}</p>

          {vtr.itens.length === 0 ? (
            <p className="ctc-blocos-vazio">Sem itens de roteiro.</p>
          ) : (
            marcarViradaDeDia(vtr.itens, cartao.data || '').map((entrada) => {
              if (entrada.tipo === 'virada') {
                return (
                  <div className="ctc-blocos-virada" key={`virada-${vtr.id}`}>
                    {entrada.rotulo}
                  </div>
                );
              }

              const item = entrada.item;
              return (
                <div className="ctc-bloco-missao" key={item.id}>
                  <div className="ctc-bloco-horario">
                    {formatHoraCartao(item.inicio)}{item.fim ? ` às ${formatHoraCartao(item.fim)}` : ''}
                  </div>
                  <div className="ctc-bloco-missao-linha">
                    <span className={`badge ${atividadeBadgeClass(item.atividade)}`}>{item.atividade}</span>
                    <span className="ctc-bloco-local">{item.local}</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}
