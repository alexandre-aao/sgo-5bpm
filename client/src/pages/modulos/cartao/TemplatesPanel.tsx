import { LayoutTemplate, FolderOpen, Trash2 } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import { useTemplatesCartao } from './useTemplatesCartao';

interface TemplatesPanelProps {
  onAbrir: (id: string) => void;
  /** Chamado após excluir com sucesso, com o id excluído — o pai fecha o
   * editor se for o template que estava aberto (espelha handleExcluirTemplate). */
  onExcluido: (id: string) => void;
}

// Painel "Cartões Padrão" (P3-only) — espelha #cartao-templates-panel +
// renderTemplatesTab()/handleExcluirTemplate() em public/app.js.
export function TemplatesPanel({ onAbrir, onExcluido }: TemplatesPanelProps) {
  const { toast } = useToast();
  const { templates, carregando, excluirTemplate } = useTemplatesCartao();

  async function handleExcluir(id: string) {
    if (!window.confirm('Excluir permanentemente este cartão padrão?')) return;
    const resultado = await excluirTemplate(id);
    if (resultado.ok) {
      toast('Cartão padrão excluído.', 'info');
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
          <h2>Cartões Padrão de Patrulhamento</h2>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Modelos reutilizáveis de setores/viaturas por período e quantidade de frota.
        </p>
      </div>
      <div className="table-responsive">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Nome do Cartão Padrão</th>
              <th>Período</th>
              <th className="text-center">Qtd. VTRs Base</th>
              <th className="text-center">Viaturas Cadastradas</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? null : templates.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  Nenhum cartão padrão cadastrado ainda.
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.nome_template}</strong></td>
                  <td>{t.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</td>
                  <td className="text-center">{t.qtd_viaturas_base}</td>
                  <td className="text-center">{t.qtd_viaturas}</td>
                  <td className="text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => onAbrir(t.id)}>
                      <FolderOpen style={{ width: 12, height: 12 }} /> Abrir
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleExcluir(t.id)}>
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
