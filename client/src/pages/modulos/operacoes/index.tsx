import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { apiFetch } from '../../../lib/api';
import { FiltrosOperacoesBar } from './FiltrosOperacoesBar';
import { TabelaOperacoes } from './TabelaOperacoes';
import { DrawerOperacao } from './DrawerOperacao';
import { ModalOperacao } from './ModalOperacao';
import { filtrosVazios, getOperacoesFiltradas, type FiltrosOperacoes } from './filtros';
import { FiltrosAtivos, type FiltroAtivo } from '../../../components/tabela/FiltrosAtivos';
import { paraDataBr } from '../../../lib/periodo';
import type { OperacaoPayload } from './useOperacaoDrawer';

// Aba Operações (P3) — lista + filtros + Nova/Editar Operação, reaproveitando
// a gaveta já pronta da Fase 3.3. Espelha #tab-operacoes em public/index.html
// + renderOperacoesTab()/handleSalvarOperacao() em public/app.js.
export default function OperacoesPage() {
  const { dados, recarregar } = useAppData();
  const [filtros, setFiltros] = useState<FiltrosOperacoes>(filtrosVazios);
  const [operacaoAbertaId, setOperacaoAbertaId] = useState<string | null>(null);
  const [modalNovaAberto, setModalNovaAberto] = useState(false);

  const operacoesFiltradas = getOperacoesFiltradas(dados.operacoes, dados.escalas, filtros);

  async function handleCriarOperacao(payload: OperacaoPayload) {
    try {
      const res = await apiFetch('/api/operacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const corpo = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) return { ok: false as const, mensagem: corpo.error || 'Falha ao criar a operação.' };
      await recarregar();
      if (corpo.id) setOperacaoAbertaId(corpo.id);
      return { ok: true as const };
    } catch (erro) {
      console.error('Erro ao criar operação:', erro);
      return { ok: false as const, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }

  function handleOperacaoAlterada() {
    void recarregar();
  }

  // Chips do indicador de filtros ativos (Etapa 1, item 6)
  const filtrosAtivos: FiltroAtivo[] = [
    filtros.situacao && {
      rotulo: `Situação: ${filtros.situacao}`,
      onRemover: () => setFiltros({ ...filtros, situacao: '' }),
    },
    filtros.dataInicio && {
      rotulo: `A partir de ${paraDataBr(filtros.dataInicio)}`,
      onRemover: () => setFiltros({ ...filtros, dataInicio: '' }),
    },
    filtros.dataFim && {
      rotulo: `Até ${paraDataBr(filtros.dataFim)}`,
      onRemover: () => setFiltros({ ...filtros, dataFim: '' }),
    },
    filtros.busca.trim() && {
      rotulo: `Texto: "${filtros.busca.trim()}"`,
      onRemover: () => setFiltros({ ...filtros, busca: '' }),
    },
  ].filter(Boolean) as FiltroAtivo[];

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <ShieldAlert />
            <h2>Operações (Diárias)</h2>
          </div>
          <FiltrosOperacoesBar filtros={filtros} onMudar={setFiltros} onNova={() => setModalNovaAberto(true)} />
        </div>
        <p style={{ padding: '12px 20px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Operações nascem <strong>Planejadas</strong> (reservam cota via diárias estimadas) e viram{' '}
          <strong>Executadas</strong>. A diária mostrada é a real quando há efetivo escalado, ou a estimativa
          enquanto ainda não há.
        </p>
        <FiltrosAtivos filtros={filtrosAtivos} onLimparTudo={() => setFiltros(filtrosVazios())} />

        <TabelaOperacoes
          operacoes={operacoesFiltradas} temFiltro={filtrosAtivos.length > 0}
          onAbrir={setOperacaoAbertaId} onLimparFiltros={() => setFiltros(filtrosVazios())}
        />
      </div>

      {operacaoAbertaId && (
        <DrawerOperacao
          operacaoId={operacaoAbertaId}
          pessoal={dados.pessoal}
          operacoesTodas={dados.operacoes}
          escalasTodas={dados.escalas}
          cotaMensal={dados.config.cota_mensal_diarias}
          onFechar={() => setOperacaoAbertaId(null)}
          onAlterado={handleOperacaoAlterada}
        />
      )}

      {modalNovaAberto && (
        <ModalOperacao
          onFechar={() => setModalNovaAberto(false)}
          onSalvar={handleCriarOperacao}
        />
      )}
    </>
  );
}
