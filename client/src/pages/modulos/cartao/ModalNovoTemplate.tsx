import { useState, type FormEvent } from 'react';
import { LayoutTemplate, X, Check } from 'lucide-react';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import { useTemplatesCartao } from './useTemplatesCartao';

interface ModalNovoTemplateProps {
  onFechar: () => void;
  onCriado: (template: CartaoDetalhado) => void;
}

// Espelha #modal-novo-template + handleCriarTemplate() em public/app.js. Depois
// de criado, o cartão padrão abre direto no editor de viaturas/roteiro (onCriado).
export function ModalNovoTemplate({ onFechar, onCriado }: ModalNovoTemplateProps) {
  const { toast } = useToast();
  const { criarTemplate } = useTemplatesCartao();
  const [nome, setNome] = useState('');
  const [tipoPeriodo, setTipoPeriodo] = useState('semana');
  const [qtdViaturas, setQtdViaturas] = useState('5');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await criarTemplate({
      nome_template: nome.trim(),
      tipo_periodo: tipoPeriodo,
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
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><LayoutTemplate /> Novo Cartão Padrão de Patrulhamento</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="template-nome">Nome do Cartão Padrão *</label>
            <input
              type="text" id="template-nome" required placeholder="Ex: Dia Útil - 5 VTRs"
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="template-tipo-periodo">Período *</label>
              <select id="template-tipo-periodo" required value={tipoPeriodo} onChange={(e) => setTipoPeriodo(e.target.value)}>
                <option value="semana">Dia Útil (Semana)</option>
                <option value="fim_de_semana">Fim de Semana</option>
              </select>
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="template-qtd-viaturas">Quantidade de Viaturas Base *</label>
              <select id="template-qtd-viaturas" required value={qtdViaturas} onChange={(e) => setQtdViaturas(e.target.value)}>
                <option value="5">5 viaturas</option>
                <option value="6">6 viaturas</option>
                <option value="7">7 viaturas</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Depois de criado, adicione as viaturas e os roteiros do cartão padrão normalmente — o campo Comandante pode ficar em branco, já que será preenchido pelo Adjunto no dia.
          </p>
          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Criar Cartão Padrão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
