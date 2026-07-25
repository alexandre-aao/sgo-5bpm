import { useEffect, useState, type FormEvent } from 'react';
import { ShieldPlus, X, Check } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';
import type { TemplateResumo } from './useTemplatesCartao';

interface ModalNovoReforcoProps {
  dataAlvo: string;
  operacoes: Tables<'operacoes'>[];
  onFechar: () => void;
  onCriado: () => void;
}

/** Fluxo do Adjunto para gerar um cartão de reforço: escolhe um PADRÃO DE REFORÇO
 * (modelo criado pela P3) ou começa em branco, dá um título e, se quiser, vincula a
 * uma operação. O roteiro vem pronto do modelo e é ajustado no editor normal —
 * é a mesma rota /clonar do ordinário, sem duplicar lógica. */
export function ModalNovoReforco({ dataAlvo, operacoes, onFechar, onCriado }: ModalNovoReforcoProps) {
  const { toast } = useToast();
  const [modelos, setModelos] = useState<TemplateResumo[]>([]);
  const [modeloId, setModeloId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [operacaoId, setOperacaoId] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const res = await apiFetch('/api/cartoes/templates?tipo=reforco');
        const dados = (await res.json()) as TemplateResumo[];
        if (!cancelado) setModelos(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error('Erro ao carregar padrões de reforço:', erro);
      }
    }
    void carregar();
    return () => { cancelado = true; };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      // Com modelo: clona (roteiro + observações padrão). Sem modelo: cartão em branco.
      const url = modeloId ? `/api/cartoes/${modeloId}/clonar` : '/api/cartoes';
      const corpo: Record<string, unknown> = {
        data: dataAlvo,
        titulo: titulo.trim(),
        operacao_id: operacaoId || null,
      };
      if (!modeloId) corpo.tipo = 'reforco';

      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const erro = (await res.json().catch(() => ({}))) as { error?: string };
        toast(erro.error || 'Falha ao criar o cartão de reforço.', 'danger');
        return;
      }
      const criado = (await res.json()) as { viaturas: unknown[] };
      toast(
        modeloId
          ? `Reforço criado a partir do padrão, com ${criado.viaturas.length} viatura(s). Ajuste o roteiro e preencha os comandantes.`
          : 'Reforço criado. Adicione as viaturas e o roteiro.',
        'success',
      );
      onCriado();
    } catch (erro) {
      console.error('Erro ao criar cartão de reforço:', erro);
      toast('Falha na comunicação com o servidor.', 'danger');
    } finally {
      setEnviando(false);
    }
  }

  const dataBr = dataAlvo.split('-').reverse().join('/');

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><ShieldPlus /> Novo Cartão de Reforço — {dataBr}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reforco-modelo">Padrão de reforço</label>
            <select id="reforco-modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Começar em branco</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome_template} ({m.qtd_viaturas} viatura(s))
                </option>
              ))}
            </select>
            {modelos.length === 0 && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Nenhum padrão de reforço cadastrado ainda — a P3 cria em &quot;Modelos de Cartão&quot;.
              </p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="reforco-titulo">Título do reforço *</label>
            <input
              type="text" id="reforco-titulo" required placeholder="Ex: Reforço Carnaval — Ponta Negra"
              value={titulo} onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="reforco-operacao">Operação vinculada (opcional)</label>
            <select id="reforco-operacao" value={operacaoId} onChange={(e) => setOperacaoId(e.target.value)}>
              <option value="">Sem vínculo</option>
              {operacoes.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.nome_operacao} ({op.data_inicio.split('-').reverse().join('/')})
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Criar Reforço
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
