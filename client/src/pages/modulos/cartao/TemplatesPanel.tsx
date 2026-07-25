import { useState } from 'react';
import { LayoutTemplate, FolderOpen, Trash2 } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import type { TipoCartao } from '../../../lib/cartaoConflitos';
import { useTemplatesCartao } from './useTemplatesCartao';

interface TemplatesPanelProps {
  onAbrir: (id: string) => void;
  /** Chamado após excluir com sucesso, com o id excluído — o pai fecha o
   * editor se for o modelo que estava aberto (espelha handleExcluirTemplate). */
  onExcluido: (id: string) => void;
}

/** Painel "Modelos de Cartão" (P3-only), com abas por tipo: modelos de policiamento
 * ordinário e padrões de reforço. Mesmo CRUD para os dois — só muda o `tipo` enviado e
 * as colunas que fazem sentido em cada um (período/frota-base só existem no ordinário). */
export function TemplatesPanel({ onAbrir, onExcluido }: TemplatesPanelProps) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoCartao>('padrao');
  const { templates, carregando, excluirTemplate } = useTemplatesCartao(tipo);

  const ehReforco = tipo === 'reforco';

  async function handleExcluir(id: string) {
    if (!window.confirm('Excluir este modelo de cartão?')) return;
    const resultado = await excluirTemplate(id);
    if (resultado.ok) {
      toast('Modelo excluído.', 'info');
      onExcluido(id);
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="panel cartao-historico-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title">
          <LayoutTemplate />
          <h2>Modelos de Cartão</h2>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {ehReforco
            ? 'Padrões de reforço: roteiro modelo e observações padrão, aplicados pelo Adjunto ao gerar o cartão.'
            : 'Modelos reutilizáveis de setores/viaturas por período e quantidade de frota.'}
        </p>
      </div>

      <div className="sub-abas" role="tablist" aria-label="Tipo de modelo">
        <button
          type="button" className={`sub-aba${!ehReforco ? ' ativo' : ''}`}
          role="tab" aria-selected={!ehReforco} onClick={() => setTipo('padrao')}
        >
          Ordinário
        </button>
        <button
          type="button" className={`sub-aba${ehReforco ? ' ativo' : ''}`}
          role="tab" aria-selected={ehReforco} onClick={() => setTipo('reforco')}
        >
          Reforço
        </button>
      </div>

      <div className="table-responsive">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Nome do Modelo</th>
              {!ehReforco && <th>Período</th>}
              {!ehReforco && <th className="text-center">Qtd. VTRs Base</th>}
              {ehReforco && <th>Observações padrão</th>}
              <th className="text-center">Viaturas Cadastradas</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? null : templates.length === 0 ? (
              <tr>
                <td colSpan={ehReforco ? 4 : 5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  {ehReforco
                    ? 'Nenhum padrão de reforço cadastrado ainda.'
                    : 'Nenhum modelo de cartão cadastrado ainda.'}
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.nome_template}</strong></td>
                  {!ehReforco && <td>{t.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</td>}
                  {!ehReforco && <td className="text-center">{t.qtd_viaturas_base}</td>}
                  {ehReforco && (
                    <td style={{ color: 'var(--text-muted)' }}>
                      {t.observacoes ? t.observacoes.slice(0, 90) + (t.observacoes.length > 90 ? '…' : '') : '-'}
                    </td>
                  )}
                  <td className="text-center">{t.qtd_viaturas}</td>
                  <td className="text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => onAbrir(t.id)}>
                      <FolderOpen style={{ width: 12, height: 12 }} /> Abrir
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => void handleExcluir(t.id)}>
                      <Trash2 style={{ width: 12, height: 12 }} /> Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
