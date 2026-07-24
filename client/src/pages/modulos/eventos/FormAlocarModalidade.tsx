import { useState, type FormEvent } from 'react';
import { useToast } from '../../../context/useToast';
import type { AlocacaoPayload, ResultadoAcao } from './useEventoDrawer';

const MODALIDADES = ['A Pé', 'Rádio Patrulha', 'Motopatrulhamento', 'Cavalaria', 'Trânsito'];

interface FormAlocarModalidadeProps {
  onAdicionar: (payload: AlocacaoPayload) => Promise<ResultadoAcao>;
  onFechar: () => void;
}

// Sub-formulário "Alocar Modalidade" da gaveta de Evento — espelha
// #form-alocacao-container + handleCreateAlocacao() em public/app.js.
export function FormAlocarModalidade({ onAdicionar, onFechar }: FormAlocarModalidadeProps) {
  const { toast } = useToast();
  const [modalidade, setModalidade] = useState(MODALIDADES[0]);
  const [policiais, setPoliciais] = useState('2');
  const [viaturas, setViaturas] = useState('1');
  const [prefixos, setPrefixos] = useState('');
  const [comando, setComando] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await onAdicionar({
      modalidade,
      qtd_policiais: parseInt(policiais, 10) || 0,
      qtd_viaturas: parseInt(viaturas, 10) || 0,
      prefixos_vtr: prefixos.trim(),
      comando_servico: comando.trim(),
    });
    setEnviando(false);
    if (resultado.ok) {
      toast('Modalidade alocada com sucesso!', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="sub-form-panel">
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group col-md-6">
            <label htmlFor="aloc_modalidade">Modalidade *</label>
            <select id="aloc_modalidade" required value={modalidade} onChange={(e) => setModalidade(e.target.value)}>
              {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="aloc_policiais">Policiais *</label>
            <input type="number" id="aloc_policiais" min={1} required value={policiais} onChange={(e) => setPoliciais(e.target.value)} />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="aloc_viaturas">Viaturas</label>
            <input type="number" id="aloc_viaturas" min={0} value={viaturas} onChange={(e) => setViaturas(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group col-md-6">
            <label htmlFor="aloc_prefixos">Prefixos das Viaturas</label>
            <input
              type="text" id="aloc_prefixos" placeholder="Ex: M-05101, M-05102"
              value={prefixos} onChange={(e) => setPrefixos(e.target.value)}
            />
          </div>
          <div className="form-group col-md-6">
            <label htmlFor="aloc_comando">Comando do Serviço</label>
            <input
              type="text" id="aloc_comando" placeholder="Ex: Sgt PM Ribeiro"
              value={comando} onChange={(e) => setComando(e.target.value)}
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}>Cancelar</button>
          <button type="submit" className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
            Confirmar Alocação
          </button>
        </div>
      </form>
    </div>
  );
}
