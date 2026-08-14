import { useState, type FormEvent } from 'react';
import { LayoutTemplate, X, Check } from 'lucide-react';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import { useTemplatesCartao } from './useTemplatesCartao';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface ModalNovoTemplateProps {
  onFechar: () => void;
  onCriado: (template: CartaoDetalhado) => void;
}

// Espelha #modal-novo-template + handleCriarTemplate() em public/app.js. Depois
// de criado, o cartão padrão abre direto no editor de viaturas/roteiro (onCriado).
export function ModalNovoTemplate({ onFechar, onCriado }: ModalNovoTemplateProps) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const { criarTemplate } = useTemplatesCartao();
  const [nome, setNome] = useState('');
  const [tipoModelo, setTipoModelo] = useState<'ordinario' | 'operacao'>('ordinario');
  const [qtdViaturas, setQtdViaturas] = useState('5');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await criarTemplate({
      nome_template: nome.trim(),
      tipo_modelo: tipoModelo,
      qtd_viaturas_base: Number(qtdViaturas),
    });
    setEnviando(false);
    if (resultado.ok && resultado.template) {
      toast('Cartão padrão criado. Adicione as viaturas e roteiros abaixo.', 'success');
      onCriado(resultado.template);
    } else if (!resultado.ok) {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><LayoutTemplate /> Novo Modelo de Cartão</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
              <label htmlFor="template-nome">Nome do Modelo *</label>
            <input
              type="text" id="template-nome" required placeholder="Ex: Ordinário 5º BPM ou Sentinela"
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="template-tipo-modelo">Tipo de Modelo *</label>
              <select id="template-tipo-modelo" required value={tipoModelo} onChange={(e) => setTipoModelo(e.target.value as 'ordinario' | 'operacao')}>
                <option value="ordinario">Modelo Ordinário</option>
                <option value="operacao">Modelo de Operação</option>
              </select>
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="template-qtd-viaturas">Quantidade de Viaturas Base *</label>
              <input id="template-qtd-viaturas" type="number" min={0} max={20} step={1} required value={qtdViaturas} onChange={(e) => setQtdViaturas(e.target.value)} />
            </div>
          </div>
          <p className="texto-auxiliar">
            {tipoModelo === 'ordinario'
              ? 'O Modelo Ordinário publicado e ativo origina todos os cartões do dia.'
              : 'O Modelo de Operação poderá ser adicionado como um bloco ao cartão de qualquer dia.'} O comandante fica em branco para ser preenchido no serviço.
          </p>
          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Criar Modelo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
