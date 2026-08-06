import { useState, type FormEvent } from 'react';
import { Megaphone, X, Check } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { COMPANHIAS } from '../../../lib/categoriasViatura';
import { useToast } from '../../../context/useToast';
import { LIMITE_TEXTO_AVISO, PRIORIDADES_AVISO, ROTULO_PRIORIDADE, hojeISO } from '../../../lib/avisos';
import type { AvisoPayload, ResultadoAcao } from '../../../hooks/useAvisos';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface ModalAvisoProps {
  aviso: Tables<'avisos'> | null;
  bairros: Tables<'bairros_coordenadas'>[];
  onFechar: () => void;
  onSalvar: (payload: AvisoPayload) => Promise<ResultadoAcao>;
}

export function ModalAviso({ aviso, bairros, onFechar, onSalvar }: ModalAvisoProps) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const [form, setForm] = useState<AvisoPayload>(() => ({
    texto: aviso?.texto || '',
    categoria: aviso?.categoria || '',
    prioridade: aviso?.prioridade || 'informativa',
    bairro_id: aviso?.bairro_id || '',
    companhia: aviso?.companhia || '',
    data_inicio: aviso?.data_inicio || hojeISO(),
    data_fim: aviso?.data_fim || '',
    permanente: aviso?.permanente || false,
  }));
  const [enviando, setEnviando] = useState(false);

  const restantes = LIMITE_TEXTO_AVISO - form.texto.length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.bairro_id && !form.companhia) {
      toast('Escolha ao menos um escopo: bairro, Companhia, ou os dois.', 'warning');
      return;
    }
    setEnviando(true);
    const resultado = await onSalvar({ ...form, texto: form.texto.trim(), categoria: form.categoria.trim() });
    setEnviando(false);
    if (resultado.ok) {
      toast(aviso ? 'Alerta atualizado.' : 'Alerta cadastrado.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay overlay-painel" {...propsOverlay}>
      <div className="modal-box modal-box-painel" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><Megaphone /> {aviso ? 'Editar Alerta' : 'Novo Alerta'}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="aviso-texto">Orientação *</label>
            <textarea
              id="aviso-texto" rows={3} required maxLength={LIMITE_TEXTO_AVISO}
              placeholder="Ex: Intensificar abordagem a motos em dupla na Av. Ayrton Senna, 18-21h."
              value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
            />
            <span className={`aviso-contador${restantes < 20 ? ' no-limite' : ''}`}>
              {restantes} caractere(s) restante(s) — escreva como orientação prática.
            </span>
          </div>

          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="aviso-categoria">Categoria</label>
              <input
                type="text" id="aviso-categoria" placeholder="Ex: Roubo de motos" maxLength={60}
                value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              />
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="aviso-prioridade">Prioridade</label>
              <select
                id="aviso-prioridade" value={form.prioridade}
                onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
              >
                {PRIORIDADES_AVISO.map((p) => (
                  <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Escopo: bairro, Companhia, ou os dois — a constraint aviso_tem_escopo
              do banco exige ao menos um. */}
          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="aviso-bairro">Bairro</label>
              <select
                id="aviso-bairro" value={form.bairro_id}
                onChange={(e) => setForm({ ...form, bairro_id: e.target.value })}
              >
                <option value="">Sem bairro específico</option>
                {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome_bairro}</option>)}
              </select>
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="aviso-companhia">Companhia</label>
              <select
                id="aviso-companhia" value={form.companhia}
                onChange={(e) => setForm({ ...form, companhia: e.target.value })}
              >
                <option value="">Todas as Companhias</option>
                {COMPANHIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="aviso-inicio">Início da vigência</label>
              <input
                type="date" id="aviso-inicio" value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="aviso-fim">Fim da vigência</label>
              <input
                type="date" id="aviso-fim" value={form.data_fim} disabled={form.permanente}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
              <span className="aviso-contador">
                {form.permanente ? 'Alerta permanente: não vence.' : 'Em branco = 30 dias a partir do início.'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-inline" htmlFor="aviso-permanente">
              <input
                type="checkbox" id="aviso-permanente" checked={form.permanente}
                onChange={(e) => setForm({ ...form, permanente: e.target.checked })}
              />
              Alerta permanente (sem prazo de validade)
            </label>
          </div>

          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> {aviso ? 'Salvar Alerta' : 'Cadastrar Alerta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
