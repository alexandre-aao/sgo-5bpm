import { useState, type FormEvent } from 'react';
import { Pencil, Plus, X, Check } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { CATEGORIAS_VIATURA, COMPANHIAS } from '../../../lib/categoriasViatura';
import { useToast } from '../../../context/useToast';
import type { ResultadoAcao, ViaturaCadastroPayload } from './useViaturasCrud';

interface ModalViaturaProps {
  /** undefined/null = modo criação; presente = modo edição, pré-preenchido. */
  viatura?: Tables<'viaturas'> | null;
  onFechar: () => void;
  onSalvar: (payload: ViaturaCadastroPayload) => Promise<ResultadoAcao>;
}

function formularioVazio(): ViaturaCadastroPayload {
  return { prefixo: '', companhia: '', categoria: 'Ordinária', status: 'Ativa', setor: '', observacao: '' };
}

function formularioDaViatura(viatura: Tables<'viaturas'>): ViaturaCadastroPayload {
  return {
    prefixo: viatura.prefixo,
    companhia: viatura.companhia || '',
    categoria: viatura.categoria,
    status: viatura.status,
    setor: viatura.setor || '',
    observacao: viatura.observacao || '',
  };
}

// Modal "Nova/Editar Viatura" — espelha #modal-viatura + abrirModalViatura()/
// handleSalvarViatura() em public/app.js.
export function ModalViatura({ viatura, onFechar, onSalvar }: ModalViaturaProps) {
  const { toast } = useToast();
  const modoEdicao = !!viatura;
  const [form, setForm] = useState<ViaturaCadastroPayload>(() => (viatura ? formularioDaViatura(viatura) : formularioVazio()));
  const [enviando, setEnviando] = useState(false);

  function atualizar<K extends keyof ViaturaCadastroPayload>(campo: K, valor: ViaturaCadastroPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: ViaturaCadastroPayload = {
      prefixo: form.prefixo.trim(),
      companhia: form.companhia,
      categoria: form.categoria,
      status: form.status,
      setor: form.setor.trim(),
      observacao: form.observacao.trim(),
    };

    setEnviando(true);
    const resultado = await onSalvar(payload);
    setEnviando(false);
    if (resultado.ok) {
      toast(modoEdicao ? 'Viatura atualizada com sucesso.' : 'Viatura cadastrada com sucesso.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{modoEdicao ? <Pencil /> : <Plus />} {modoEdicao ? 'Editar Viatura' : 'Nova Viatura'}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="vtrcad-prefixo">Prefixo</label>
            <input
              type="text" id="vtrcad-prefixo" required placeholder="Ex: B05-05"
              value={form.prefixo} onChange={(e) => atualizar('prefixo', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="vtrcad-companhia">Companhia</label>
            <select id="vtrcad-companhia" value={form.companhia} onChange={(e) => atualizar('companhia', e.target.value)}>
              <option value="">Não informada</option>
              {COMPANHIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="vtrcad-categoria">Categoria</label>
            <select id="vtrcad-categoria" value={form.categoria} onChange={(e) => atualizar('categoria', e.target.value)}>
              {CATEGORIAS_VIATURA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="vtrcad-status">Status</label>
            <select id="vtrcad-status" value={form.status} onChange={(e) => atualizar('status', e.target.value)}>
              <option value="Ativa">Ativa</option>
              <option value="Manutenção">Manutenção</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="vtrcad-setor">Setor Padrão</label>
            <input
              type="text" id="vtrcad-setor" placeholder="Ex: PONTA NEGRA (usado no Mapa quando não há atividade em andamento)"
              value={form.setor} onChange={(e) => atualizar('setor', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="vtrcad-observacao">Observação</label>
            <input
              type="text" id="vtrcad-observacao" placeholder="Ex: revisão programada"
              value={form.observacao} onChange={(e) => atualizar('observacao', e.target.value)}
            />
          </div>
          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
