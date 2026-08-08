import { useEffect, useState } from 'react';
import {
  LayoutTemplate, FolderOpen, Trash2, CheckCircle2, Copy, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useToast } from '../../../context/useToast';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { useTemplatesCartao, type TemplateResumo } from './useTemplatesCartao';
import { LinhaTabelaVazia } from '../../../components/tabela/LinhaTabelaVazia';
import { ModalConfirmarExclusaoForte } from '../../../components/ModalConfirmarExclusaoForte';

interface TemplatesPanelProps {
  onAbrir: (id: string) => void;
  /** Chamado após excluir com sucesso, com o id excluído — o pai fecha o
   * editor se for o template que estava aberto. */
  onExcluido: (id: string) => void;
}

/** Conteúdo do padrão sem abrir o editor: viaturas, setores e resumo do roteiro.
 *  Busca sob demanda (só ao expandir) — a listagem de templates é resumida de
 *  propósito e trazer o JSONB de todos infla a resposta à toa. */
function PreviaTemplate({ id }: { id: string }) {
  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const res = await apiFetch(`/api/cartoes/${id}`);
        if (!res.ok) throw new Error('falha');
        const dados = (await res.json()) as CartaoDetalhado;
        if (ativo) setCartao(dados);
      } catch {
        if (ativo) setErro('Não foi possível carregar a prévia deste padrão.');
      }
    })();
    // Expandir outra linha antes da resposta chegar não deve pintar o padrão errado.
    return () => { ativo = false; };
  }, [id]);

  if (erro) return <p className="texto-auxiliar">{erro}</p>;
  if (!cartao) return <p className="texto-auxiliar">Carregando prévia…</p>;

  const viaturas = cartao.viaturas || [];
  if (viaturas.length === 0) return <p className="texto-auxiliar">Este padrão ainda não tem viaturas.</p>;

  return (
    <div className="template-previa">
      {viaturas.map((vtr) => (
        <div className="template-previa-vtr" key={vtr.id}>
          <div className="template-previa-vtr-cabecalho">
            <strong>{vtr.prefixo}</strong>
            <span>{vtr.setor || 'sem setor'}</span>
            {vtr.companhia && <span className="badge">{vtr.companhia}</span>}
          </div>
          <span className="texto-auxiliar">
            {(vtr.itens || []).length === 0
              ? 'sem roteiro'
              : `${vtr.itens.length} item(ns): ${vtr.itens.slice(0, 4).map((i) => `${i.inicio} ${i.atividade}`).join(' · ')}${vtr.itens.length > 4 ? ' …' : ''}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// Painel "Cartões Padrão" (P3-only). Um só padrão fica ativo por vez: é o que
// POST /api/cartoes clona para o cartão do dia.
export function TemplatesPanel({ onAbrir, onExcluido }: TemplatesPanelProps) {
  const { toast } = useToast();
  const {
    templates, carregando, excluirTemplate, definirPadraoAtivo, duplicarTemplate,
  } = useTemplatesCartao();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [aExcluir, setAExcluir] = useState<TemplateResumo | null>(null);

  async function handleExcluir() {
    if (!aExcluir) return;
    const resultado = await excluirTemplate(aExcluir);
    if (resultado.ok) {
      toast('Cartão padrão excluído.', 'info');
      onExcluido(aExcluir.id);
      setAExcluir(null);
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleDefinirPadrao(id: string) {
    const resultado = await definirPadraoAtivo(id);
    toast(resultado.ok ? 'Cartão padrão ativo definido.' : resultado.mensagem, resultado.ok ? 'success' : 'danger');
  }

  async function handleDuplicar(template: TemplateResumo) {
    const resultado = await duplicarTemplate(template.id);
    if (!resultado.ok) {
      toast(resultado.mensagem, 'danger');
      return;
    }
    toast(`Cópia criada: "${resultado.template?.nome_template}". O padrão ativo não mudou.`, 'success');
    if (resultado.template) onAbrir(resultado.template.id);
  }

  return (
    <div className="panel cartao-historico-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title">
          <LayoutTemplate />
          <h2>Cartões Padrão de Patrulhamento</h2>
        </div>
        <p className="texto-auxiliar">
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
              <th className="text-center">Padrão</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? null : templates.length === 0 ? (
              <LinhaTabelaVazia colunas={6}>
                Nenhum cartão padrão cadastrado ainda.
              </LinhaTabelaVazia>
            ) : (
              templates.map((t) => {
                const aberto = expandido === t.id;
                return [
                  <tr key={t.id}>
                    <td>
                      <button
                        type="button" className="btn-expandir-linha"
                        aria-expanded={aberto}
                        aria-label={aberto ? `Ocultar prévia de ${t.nome_template}` : `Ver prévia de ${t.nome_template}`}
                        onClick={() => setExpandido(aberto ? null : t.id)}
                      >
                        {aberto ? <ChevronDown /> : <ChevronRight />}
                        <strong>{t.nome_template}</strong>
                      </button>
                    </td>
                    <td>{t.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</td>
                    <td className="text-center">{t.qtd_viaturas_base}</td>
                    <td className="text-center">{t.qtd_viaturas}</td>
                    <td className="text-center">
                      {t.padrao_ativo ? (
                        <span className="badge status-ativa">
                          <CheckCircle2 style={{ width: 12, height: 12 }} /> Ativo
                        </span>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => void handleDefinirPadrao(t.id)}>
                          Definir como padrão
                        </button>
                      )}
                    </td>
                    <td className="text-right">
                      <button className="btn btn-secondary btn-sm" onClick={() => onAbrir(t.id)}>
                        <FolderOpen style={{ width: 12, height: 12 }} /> Abrir
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => void handleDuplicar(t)}>
                        <Copy style={{ width: 12, height: 12 }} /> Duplicar
                      </button>
                      {/* O padrão ativo não pode ser excluído: sem ele o Adjunto toma
                          409 ao criar o cartão do dia. O servidor também recusa. */}
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={t.padrao_ativo}
                        title={t.padrao_ativo ? 'Ative outro padrão antes de excluir este' : 'Excluir cartão padrão'}
                        onClick={() => setAExcluir(t)}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} /> Excluir
                      </button>
                    </td>
                  </tr>,
                  aberto ? (
                    <tr key={`${t.id}-previa`} className="linha-previa">
                      <td colSpan={6}><PreviaTemplate id={t.id} /></td>
                    </tr>
                  ) : null,
                ];
              })
            )}
          </tbody>
        </table>
      </div>

      {aExcluir && (
        <ModalConfirmarExclusaoForte
          titulo="Excluir cartão padrão"
          aviso={`O padrão "${aExcluir.nome_template}" será apagado com suas ${aExcluir.qtd_viaturas} viatura(s) e todo o roteiro. Os cartões do dia já criados a partir dele não são afetados.`}
          label="Digite o nome do padrão para confirmar:"
          valorEsperado={aExcluir.nome_template}
          onFechar={() => setAExcluir(null)}
          onConfirmar={() => void handleExcluir()}
        />
      )}
    </div>
  );
}
