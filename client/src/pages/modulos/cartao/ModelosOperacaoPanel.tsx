import { useEffect, useState } from 'react';
import { Layers3, Plus } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { apiFetch } from '../../../lib/api';
import { cabecalhosVersaoCartao } from '../../../lib/concorrenciaCartao';
import { useToast } from '../../../context/useToast';

interface ModeloOperacaoResumo { id: string; nome_template: string; qtd_viaturas: number; versao_publicada: number | null }

interface Props {
  cartao: CartaoDetalhado;
  operacoes: Tables<'operacoes'>[];
  podeEditar: boolean;
  onAtualizado: () => Promise<void>;
}

export function ModelosOperacaoPanel({ cartao, operacoes, podeEditar, onAtualizado }: Props) {
  const { toast } = useToast();
  const [modelos, setModelos] = useState<ModeloOperacaoResumo[]>([]);
  const [modeloId, setModeloId] = useState('');
  const [operacaoId, setOperacaoId] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const operacoesDoDia = operacoes.filter((op) => op.data_inicio === cartao.data);
  const blocos = [...new Map(cartao.viaturas.filter((v) => v.modelo_operacao_id).map((v) => [v.modelo_operacao_id, { id: v.modelo_operacao_id!, nome: v.modelo_operacao_nome || 'Operação' }])).values()];

  useEffect(() => {
    let ativo = true;
    void apiFetch('/api/cartoes/modelos-operacao').then((res) => res.json()).then((dados: ModeloOperacaoResumo[]) => {
      if (ativo) setModelos(Array.isArray(dados) ? dados : []);
    }).catch((erro) => console.error('Erro ao carregar Modelos de Operação:', erro));
    return () => { ativo = false; };
  }, []);

  async function aplicar() {
    if (!modeloId) return;
    setAplicando(true);
    const res = await apiFetch(`/api/cartoes/${cartao.id}/aplicar-modelo-operacao/${modeloId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
      body: JSON.stringify({ operacao_id: operacaoId || null }),
    });
    const corpo = (await res.json().catch(() => ({}))) as { error?: string };
    setAplicando(false);
    if (!res.ok) return toast(corpo.error || 'Não foi possível adicionar o Cartão de Operação.', 'danger');
    toast('Cartão de Operação adicionado ao serviço.', 'success');
    setModeloId(''); setOperacaoId('');
    await onAtualizado();
  }

  return (
    <div className="panel cartao-operacoes-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title"><Layers3 /><h2>Cartões de Operação do Dia</h2></div>
        {blocos.length > 0 && <span className="contador-pill">{blocos.length} aplicado(s)</span>}
      </div>
      {blocos.length > 0 && <div className="chips-selecao cartao-operacoes-aplicadas">{blocos.map((b) => <span className="badge badge-info" key={b.id}>{b.nome}</span>)}</div>}
      {podeEditar && (
        <div className="form-row cartao-operacoes-form">
          <div className="form-group col-md-5">
            <label htmlFor="modelo-operacao-dia">Modelo de Operação</label>
            <select id="modelo-operacao-dia" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Selecione um modelo publicado…</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome_template} · {m.qtd_viaturas} equipe(s)</option>)}
            </select>
          </div>
          <div className="form-group col-md-5">
            <label htmlFor="operacao-vinculada-dia">Operação planejada (opcional)</label>
            <select id="operacao-vinculada-dia" value={operacaoId} onChange={(e) => setOperacaoId(e.target.value)}>
              <option value="">Sem vínculo específico</option>
              {operacoesDoDia.map((op) => <option key={op.id} value={op.id}>{op.nome_operacao}</option>)}
            </select>
          </div>
          <div className="form-group col-md-2 cartao-operacoes-acao">
            <button type="button" className="btn btn-primary btn-sm" disabled={!modeloId || aplicando} onClick={() => void aplicar()}><Plus /> Adicionar</button>
          </div>
        </div>
      )}
      {modelos.length === 0 && <p className="texto-auxiliar">Nenhum Modelo de Operação publicado. A P3 pode criá-lo em Modelos de Cartão.</p>}
    </div>
  );
}
