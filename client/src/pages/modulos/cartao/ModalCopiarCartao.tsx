import { useEffect, useState } from 'react';
import { Copy, X, CopyPlus } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';

interface CartaoResumo {
  id: string;
  data: string;
  qtd_viaturas: number;
}

interface ModalCopiarCartaoProps {
  dataAlvo: string;
  onFechar: () => void;
  onCopiado: () => void;
}

// Espelha #modal-copiar-cartao + abrirModalCopiarCartao()/handleConfirmarCopiaCartao()
// em public/app.js — origem pode ser qualquer cartão existente (não só o dia anterior).
export function ModalCopiarCartao({ dataAlvo, onFechar, onCopiado }: ModalCopiarCartaoProps) {
  const { toast } = useToast();
  const [origens, setOrigens] = useState<CartaoResumo[] | null>(null);
  const [origemId, setOrigemId] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function buscar() {
      try {
        const res = await apiFetch('/api/cartoes');
        const lista = (await res.json()) as CartaoResumo[];
        if (cancelado) return;
        if (!res.ok || !Array.isArray(lista)) {
          setOrigens([]);
          return;
        }
        const filtradas = lista.filter((c) => c.data && c.data !== dataAlvo).sort((a, b) => b.data.localeCompare(a.data));
        setOrigens(filtradas);
      } catch (erro) {
        console.error('Erro ao listar cartões para cópia:', erro);
        if (!cancelado) setOrigens([]);
      }
    }
    void buscar();
    return () => {
      cancelado = true;
    };
  }, [dataAlvo]);

  async function handleConfirmar() {
    if (!origemId) {
      toast('Escolha um cartão de origem para copiar.', 'warning');
      return;
    }
    setEnviando(true);
    try {
      const res = await apiFetch('/api/cartoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataAlvo, copiar_de: origemId }),
      });
      if (res.status === 409) {
        toast('Já existe um Cartão Programa para esta data.', 'warning');
        return;
      }
      if (res.ok) {
        const criado = (await res.json()) as { viaturas: unknown[] };
        toast(`Cópia criada com ${(criado.viaturas || []).length} viatura(s).`, 'success');
        onCopiado();
      } else {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        toast(corpo.error || 'Falha ao criar a cópia do Cartão Programa.', 'danger');
      }
    } catch (erro) {
      console.error('Erro ao copiar cartão:', erro);
      toast('Falha ao criar a cópia do Cartão Programa.', 'danger');
    } finally {
      setEnviando(false);
    }
  }

  const dataAlvoBr = dataAlvo ? dataAlvo.split('-').reverse().join('/') : '-';

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><Copy /> Copiar Cartão Programa</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Cria uma cópia (viaturas e roteiros) de um cartão existente para a data <strong>{dataAlvoBr}</strong>.
        </p>
        <div className="form-group">
          <label htmlFor="copiar-origem-select">Copiar de qual cartão?</label>
          <select id="copiar-origem-select" value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
            {origens === null ? (
              <option value="">Carregando...</option>
            ) : origens.length === 0 ? (
              <option value="">Nenhum outro cartão disponível para copiar.</option>
            ) : (
              <>
                <option value="">Selecione...</option>
                {origens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.data.split('-').reverse().join('/')} — {c.qtd_viaturas} viatura(s)
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button
            type="button" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}
            onClick={handleConfirmar}
          >
            <CopyPlus /> Criar Cópia
          </button>
        </div>
      </div>
    </div>
  );
}
