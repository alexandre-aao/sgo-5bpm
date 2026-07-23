import { useState } from 'react';
import { Search, AlertTriangle, LayoutTemplate, CopyPlus } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';
import type { TemplateResumo } from './useTemplatesCartao';

interface SugestaoTemplateProps {
  dataSelecionada: string;
  onClonado: () => void;
}

// Bloco "Buscar Cartão Padrão Sugerido" do estado vazio — espelha
// handleBuscarTemplateSugerido()/handleImportarClonarTemplate() em public/app.js.
// Aberto a todos que podem editar o Cartão Programa (a clonagem não exige P3).
export function SugestaoTemplate({ dataSelecionada, onClonado }: SugestaoTemplateProps) {
  const { toast } = useToast();
  const [tipoPeriodo, setTipoPeriodo] = useState('semana');
  const [qtdViaturas, setQtdViaturas] = useState('5');
  const [buscando, setBuscando] = useState(false);
  const [clonando, setClonando] = useState(false);
  const [resultado, setResultado] = useState<'nenhum' | TemplateResumo | null>(null);

  async function handleBuscar() {
    if (!dataSelecionada) {
      toast('Selecione a data do Cartão Programa.', 'warning');
      return;
    }
    setBuscando(true);
    setResultado(null);
    try {
      const res = await apiFetch(`/api/cartoes/templates?tipo_periodo=${tipoPeriodo}&qtd_viaturas_base=${qtdViaturas}`);
      const templates = (await res.json()) as TemplateResumo[];
      setResultado(templates.length > 0 ? templates[0] : 'nenhum');
    } catch (erro) {
      console.error('Erro ao buscar template sugerido:', erro);
      toast('Falha ao buscar cartão padrão.', 'danger');
    } finally {
      setBuscando(false);
    }
  }

  async function handleImportarClonar(templateId: string) {
    setClonando(true);
    try {
      const res = await apiFetch(`/api/cartoes/${templateId}/clonar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataSelecionada }),
      });
      if (res.status === 409) {
        toast('Já existe um Cartão Programa para esta data.', 'warning');
        onClonado();
        return;
      }
      if (res.ok) {
        const criado = (await res.json()) as { viaturas: unknown[] };
        toast(`Cartão criado a partir do cartão padrão, com ${criado.viaturas.length} viatura(s). Preencha os comandantes.`, 'success');
        onClonado();
      } else {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        toast(corpo.error || 'Falha ao importar o cartão padrão.', 'danger');
      }
    } catch (erro) {
      console.error('Erro ao clonar template:', erro);
      toast('Falha na comunicação com o servidor.', 'danger');
    } finally {
      setClonando(false);
    }
  }

  return (
    <div className="cartao-sugestao-template">
      <div className="cartao-sugestao-linha">
        <div className="filter-group">
          <label htmlFor="sugestao-tipo-periodo">Tipo de Cartão</label>
          <select id="sugestao-tipo-periodo" value={tipoPeriodo} onChange={(e) => setTipoPeriodo(e.target.value)}>
            <option value="semana">Dia Útil</option>
            <option value="fim_de_semana">Fim de Semana</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="sugestao-qtd-viaturas">Quantidade de Viaturas</label>
          <select id="sugestao-qtd-viaturas" value={qtdViaturas} onChange={(e) => setQtdViaturas(e.target.value)}>
            <option value="5">5 viaturas</option>
            <option value="6">6 viaturas</option>
            <option value="7">7 viaturas</option>
          </select>
        </div>
        <button type="button" className={`btn btn-secondary btn-sm${buscando ? ' btn-carregando' : ''}`} disabled={buscando} onClick={handleBuscar}>
          <Search /> Buscar Cartão Padrão Sugerido
        </button>
      </div>
      <div id="cartao-sugestao-resultado">
        {resultado === 'nenhum' && (
          <div className="template-sugerido-box nao-encontrado">
            <span>
              <AlertTriangle style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> Nenhum cartão padrão cadastrado para{' '}
              <strong>{tipoPeriodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</strong> com <strong>{qtdViaturas}</strong> viaturas.
              Crie o cartão manualmente abaixo, ou cadastre um cartão padrão em "Novo Cartão Padrão".
            </span>
          </div>
        )}
        {resultado && resultado !== 'nenhum' && (
          <div className="template-sugerido-box encontrado">
            <span>
              <LayoutTemplate style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> Cartão padrão sugerido:{' '}
              <strong>{resultado.nome_template}</strong> ({resultado.qtd_viaturas} viatura(s) cadastradas)
            </span>
            <button
              type="button" className={`btn btn-primary btn-sm${clonando ? ' btn-carregando' : ''}`} disabled={clonando}
              onClick={() => handleImportarClonar(resultado.id)}
            >
              <CopyPlus /> Importar e Clonar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
