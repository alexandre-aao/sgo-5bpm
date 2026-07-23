import { useState, type FormEvent } from 'react';
import { Car, Plus } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { useToast } from '../../../context/useToast';
import type { ViaturaPayload } from './useViaturasCartao';
import type { ResultadoAcao } from './useCartaoPrograma';

const VAZIO: ViaturaPayload = { prefixo: '', setor: '', companhia: '', categoria: 'Ordinária', comandante: '', observacao: '' };

interface FormAdicionarViaturaProps {
  viaturasCadastradas: Tables<'viaturas'>[];
  onAdicionar: (payload: ViaturaPayload) => Promise<ResultadoAcao>;
}

// Espelha o form #form-cartao-vtr de public/index.html + handleAddCartaoVtr().
export function FormAdicionarViatura({ viaturasCadastradas, onAdicionar }: FormAdicionarViaturaProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ViaturaPayload>(VAZIO);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: ViaturaPayload = {
      ...form,
      prefixo: form.prefixo.trim(),
      setor: form.setor.trim().toUpperCase(),
      comandante: form.comandante.trim(),
      observacao: form.observacao.trim(),
    };
    setEnviando(true);
    const resultado = await onAdicionar(payload);
    setEnviando(false);
    if (resultado.ok) {
      toast(`VTR ${payload.prefixo} adicionada ao cartão.`, 'success');
      setForm(VAZIO);
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="panel cartao-add-vtr-panel">
      <div className="section-actions" style={{ padding: '16px 20px 0 20px' }}>
        <h4><Car style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> Adicionar Viatura ao Cartão</h4>
      </div>
      <form className="styled-form" style={{ paddingTop: 8 }} onSubmit={handleSubmit}>
        <datalist id="lista-prefixos-viaturas">
          {viaturasCadastradas.map((v) => <option key={v.id} value={v.prefixo} />)}
        </datalist>
        <div className="form-row">
          <div className="form-group col-md-3">
            <label htmlFor="vtr_prefixo">Prefixo VTR *</label>
            <input
              type="text" id="vtr_prefixo" placeholder="Ex: B05-05" list="lista-prefixos-viaturas" required
              value={form.prefixo} onChange={(e) => setForm({ ...form, prefixo: e.target.value })}
            />
          </div>
          <div className="form-group col-md-4">
            <label htmlFor="vtr_setor">Setor / Bairro *</label>
            <input
              type="text" id="vtr_setor" placeholder="Ex: PONTA NEGRA" required
              value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}
            />
          </div>
          <div className="form-group col-md-5">
            <label htmlFor="vtr_comandante">Comandante da Guarnição</label>
            <input
              type="text" id="vtr_comandante" placeholder="Ex: 2º SGT PM DÊNIS"
              value={form.comandante} onChange={(e) => setForm({ ...form, comandante: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group col-md-4">
            <label htmlFor="vtr_companhia">Companhia</label>
            <select id="vtr_companhia" value={form.companhia} onChange={(e) => setForm({ ...form, companhia: e.target.value })}>
              <option value="">Não informada</option>
              <option value="1ª Companhia">1ª Companhia</option>
              <option value="2ª Companhia">2ª Companhia</option>
              <option value="3ª Companhia">3ª Companhia</option>
            </select>
          </div>
          <div className="form-group col-md-4">
            <label htmlFor="vtr_categoria">Categoria da Viatura</label>
            <select id="vtr_categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option value="Ordinária">Ordinária</option>
              <option value="Força Tática">Força Tática</option>
              <option value="Suplementar">Suplementar</option>
            </select>
          </div>
          <div className="form-group col-md-4">
            <label htmlFor="vtr_observacao">Obs. / Turno da Madrugada</label>
            <input
              type="text" id="vtr_observacao" placeholder="Ex: 1º TURNO - HEMISFÉRIO SUL"
              value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
            <Plus /> Adicionar Viatura
          </button>
        </div>
      </form>
    </div>
  );
}
