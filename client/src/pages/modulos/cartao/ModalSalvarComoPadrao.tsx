import { useState, type FormEvent } from 'react';
import { LayoutTemplate, X, Check } from 'lucide-react';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import { useTemplatesCartao } from './useTemplatesCartao';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface ModalSalvarComoPadraoProps {
  cartao: CartaoDetalhado;
  onFechar: () => void;
  onCriado: (template: CartaoDetalhado) => void;
}

/** Transforma o cartão de um DIA em novo cartão padrão — o inverso de criar o
 *  cartão do dia a partir do padrão. Preserva viaturas, setores e roteiro; a
 *  data, a numeração oficial e os comandantes escalados ficam para trás. */
export function ModalSalvarComoPadrao({ cartao, onFechar, onCriado }: ModalSalvarComoPadraoProps) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const { salvarComoPadrao } = useTemplatesCartao();
  const [nome, setNome] = useState('');
  const [tipoModelo, setTipoModelo] = useState<'ordinario' | 'operacao'>('ordinario');
  const [enviando, setEnviando] = useState(false);

  const qtdViaturas = (cartao.viaturas || []).length;
  const qtdItens = (cartao.viaturas || []).reduce((total, vtr) => total + (vtr.itens || []).length, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setEnviando(true);
    const resultado = await salvarComoPadrao(cartao.id, nome.trim(), tipoModelo);
    setEnviando(false);
    if (resultado.ok && resultado.template) {
      toast('Modelo criado a partir deste cartão. Publique-o antes de usar.', 'success');
      onCriado(resultado.template);
    } else if (!resultado.ok) {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><LayoutTemplate /> Salvar como cartão padrão</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="texto-auxiliar">
            Serão preservadas {qtdViaturas} viatura(s) e {qtdItens} item(ns) de roteiro, com setores e
            companhias. Data, numeração e comandantes não vão para o padrão.
          </p>

          <div className="form-group">
            <label htmlFor="padrao-nome">Nome do cartão padrão *</label>
            <input
              type="text" id="padrao-nome" required autoFocus maxLength={120}
              placeholder="Ex: Ordinário 5º BPM ou Operação Sentinela"
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="padrao-tipo-modelo">Tipo de modelo *</label>
            <select id="padrao-tipo-modelo" value={tipoModelo} onChange={(e) => setTipoModelo(e.target.value as 'ordinario' | 'operacao')}>
              <option value="ordinario">Modelo Ordinário</option>
              <option value="operacao">Modelo de Operação</option>
            </select>
          </div>

          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button
              type="submit"
              className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`}
              disabled={enviando || !nome.trim()}
            >
              <Check /> Criar cartão padrão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
