import { useState, type FormEvent } from 'react';
import { Car, X, Check } from 'lucide-react';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import type { Tables } from '../../../types/supabase';
import { CATEGORIAS_VIATURA } from '../../../lib/categoriasViatura';
import { useToast } from '../../../context/useToast';
import { SeletorCompanhia } from './SeletorCompanhia';
import { PainelAvisosViatura } from './PainelAvisosViatura';
import type { ViaturaPayload } from './useViaturasCartao';
import type { ResultadoAcao } from './useCartaoPrograma';

interface ModalEditarViaturaProps {
  viatura: CartaoViatura;
  bairros: Tables<'bairros_coordenadas'>[];
  avisos: Tables<'avisos'>[];
  onFechar: () => void;
  onSalvar: (vtrId: string, payload: ViaturaPayload) => Promise<ResultadoAcao>;
}

// Espelha #modal-editar-vtr de public/index.html + handleSalvarEdicaoVtr(). O pai
// (index.tsx) só monta este componente quando há uma viatura em edição e o
// desmonta ao fechar — cada abertura já é uma instância nova, então o estado
// inicial (lazy) é suficiente; não precisa de useEffect pra resincronizar.
export function ModalEditarViatura({ viatura, bairros, avisos, onFechar, onSalvar }: ModalEditarViaturaProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ViaturaPayload>(() => ({
    prefixo: viatura.prefixo || '',
    setor: viatura.setor || '',
    companhia: viatura.companhia || '',
    categoria: viatura.categoria || 'Ordinária',
    comandante: viatura.comandante || '',
    observacao: viatura.observacao || '',
    // Viaturas gravadas antes da migration 001 não têm estes campos.
    bairro_id: viatura.bairro_id || '',
    comandante_pessoal_id: viatura.comandante_pessoal_id || '',
    avisos_ids: viatura.avisos_ids || [],
  }));
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
    const resultado = await onSalvar(viatura.id, payload);
    setEnviando(false);
    if (resultado.ok) {
      toast('Viatura atualizada com sucesso.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><Car /> Editar Viatura</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="edit-vtr-prefixo">Prefixo VTR *</label>
              <input
                type="text" id="edit-vtr-prefixo" required
                value={form.prefixo} onChange={(e) => setForm({ ...form, prefixo: e.target.value })}
              />
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="edit-vtr-setor">Setor / Bairro *</label>
              <input
                type="text" id="edit-vtr-setor" required
                value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="edit-vtr-bairro">Bairro (Alertas)</label>
              <select id="edit-vtr-bairro" value={form.bairro_id} onChange={(e) => setForm({ ...form, bairro_id: e.target.value })}>
                <option value="">Não vinculado</option>
                {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome_bairro}</option>)}
              </select>
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="edit-vtr-categoria">Categoria da Viatura</label>
              <select id="edit-vtr-categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS_VIATURA.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <SeletorCompanhia
              id="edit-vtr-companhia"
              valor={form.companhia}
              onChange={(companhia) => setForm({ ...form, companhia })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-vtr-comandante">Comandante da Guarnição</label>
            <input
              type="text" id="edit-vtr-comandante"
              value={form.comandante} onChange={(e) => setForm({ ...form, comandante: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-vtr-observacao">Observação / Turno da Madrugada</label>
            <input
              type="text" id="edit-vtr-observacao"
              value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>

          <PainelAvisosViatura
            avisos={avisos}
            bairros={bairros}
            viatura={{ ...form, itens: viatura.itens }}
            selecionados={form.avisos_ids}
            onChange={(avisos_ids) => setForm((atual) => ({ ...atual, avisos_ids }))}
          />
          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar Viatura
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
