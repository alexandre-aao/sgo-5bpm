import { useState } from 'react';
import { Wallet, CheckCircle, Clock, PiggyBank, Save } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { periodoInicial } from '../../../lib/periodo';
import { FiltroMesAno } from '../../../components/FiltroMesAno';
import { usePlanejadorDiarias } from './usePlanejadorDiarias';
import { OcupacaoCota } from './OcupacaoCota';
import { OperacoesDoMes } from './OperacoesDoMes';
import { DiariasPorTipo } from './DiariasPorTipo';
import { CalendarioDiarias } from './CalendarioDiarias';
import { ModalMissaoAvulsa } from './ModalMissaoAvulsa';
import { DrawerOperacao } from '../operacoes/DrawerOperacao';

function dataHojeStr(): string {
  const hoje = new Date();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${m}-${d}`;
}

// Painel Planejador de Diárias — espelha renderPlanejadorTab() em public/app.js.
// Fase 3.3 Lote 4 (final): + gaveta de Operação (Detalhes, Marcar como
// Executada, Excluir, Efetivo Escalado com autocomplete de militar).
export default function PlanejadorPage() {
  const { dados, recarregar: recarregarAppData } = useAppData();
  const { toast } = useToast();
  const [{ mes, ano }, setPeriodo] = useState(periodoInicial);
  const { resumo, salvarCota, recarregar } = usePlanejadorDiarias(mes, ano);

  const [modalMissaoAberto, setModalMissaoAberto] = useState(false);
  const [dataMissaoPrefill, setDataMissaoPrefill] = useState(dataHojeStr);
  const [recarregarCalendarioSinal, setRecarregarCalendarioSinal] = useState(0);
  const [operacaoAbertaId, setOperacaoAbertaId] = useState<string | null>(null);

  function handleClickDiaCalendario(dataStr: string) {
    setDataMissaoPrefill(dataStr);
    setModalMissaoAberto(true);
  }

  function handleMissaoCriada(operacaoId: string) {
    setModalMissaoAberto(false);
    setRecarregarCalendarioSinal((s) => s + 1);
    void recarregar();
    setOperacaoAbertaId(operacaoId);
  }

  // Chamado pela gaveta após marcar executada / escalar / remover escala —
  // atualiza KPIs, tabela do mês, calendário e o cache global (Dashboard etc.),
  // igual ao await fetchData() do app antigo depois dessas ações.
  function handleOperacaoAlterada() {
    void recarregar();
    void recarregarAppData();
    setRecarregarCalendarioSinal((s) => s + 1);
  }

  const [cotaServidorAnterior, setCotaServidorAnterior] = useState(resumo.cota_mensal);
  const [cotaValor, setCotaValor] = useState(String(resumo.cota_mensal));
  const [cotaDirty, setCotaDirty] = useState(false);
  const [salvandoCota, setSalvandoCota] = useState(false);

  // Não sobrescreve o campo enquanto o usuário edita — mesma proteção do
  // dataset.dirty do app antigo, via "ajustar estado durante o render".
  if (resumo.cota_mensal !== cotaServidorAnterior) {
    setCotaServidorAnterior(resumo.cota_mensal);
    if (!cotaDirty) setCotaValor(String(resumo.cota_mensal));
  }

  async function handleSalvarCota() {
    const valor = parseInt(cotaValor, 10);
    if (isNaN(valor) || valor < 0) {
      toast('Informe uma cota válida (número inteiro maior ou igual a 0).', 'warning');
      return;
    }
    setSalvandoCota(true);
    const resultado = await salvarCota(valor);
    setSalvandoCota(false);
    if (resultado.ok) {
      setCotaDirty(false);
      toast(`Cota mensal atualizada para ${valor} diárias.`, 'success');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  const totalPlanejado = resumo.total_planejado || 0;
  const estourou = resumo.saldo < 0;
  const pctSaldo = resumo.cota_mensal > 0 ? Math.round((resumo.saldo / resumo.cota_mensal) * 100) : null;

  return (
    <>
      <div className="plan-toolbar">
        <div className="plan-toolbar-filtros">
          <FiltroMesAno
            idPrefix="plan-filter"
            mes={mes}
            ano={ano}
            onMesChange={(novoMes) => setPeriodo({ mes: novoMes, ano })}
            onAnoChange={(novoAno) => setPeriodo({ mes, ano: novoAno })}
          />
          <div className="cota-inline">
            <label htmlFor="input-cota">Cota mensal</label>
            <input
              type="number" id="input-cota" min={0} placeholder="Ex: 240"
              value={cotaValor}
              onChange={(e) => { setCotaValor(e.target.value); setCotaDirty(true); }}
            />
            <button
              className={`btn btn-primary btn-sm${salvandoCota ? ' btn-carregando' : ''}`}
              disabled={salvandoCota} onClick={handleSalvarCota}
            >
              <Save /> Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="kpi-row plan-kpis">
        <div className="kpi-card">
          <div className="kpi-topo">
            <span className="kpi-label texto-primary">Cota Mensal</span>
            <span className="kpi-icone fundo-primary tom-primary">
              <Wallet />
            </span>
          </div>
          <div className="kpi-valor-linha"><span className="kpi-valor">{resumo.cota_mensal}</span></div>
          <div className="kpi-rodape"><span className="stat-sub">diárias no mês</span></div>
        </div>

        <div className="kpi-card">
          <div className="kpi-topo">
            {/* Medida de consumo, não situação — azul institucional. */}
            <span className="kpi-label texto-primary">Consumido</span>
            <span className="kpi-icone fundo-primary tom-primary">
              <CheckCircle />
            </span>
          </div>
          <div className="kpi-valor-linha"><span className="kpi-valor">{resumo.total_consumido}</span></div>
          <div className="kpi-rodape"><span className="stat-sub">escalas reais</span></div>
        </div>

        <div className="kpi-card">
          <div className="kpi-topo">
            <span className="kpi-label texto-info">Planejado</span>
            <span className="kpi-icone fundo-info tom-info">
              <Clock />
            </span>
          </div>
          <div className="kpi-valor-linha"><span className="kpi-valor">{totalPlanejado}</span></div>
          <div className="kpi-rodape"><span className="stat-sub">estimado, sem escala</span></div>
        </div>

        <div className="kpi-card">
          <div className="kpi-topo">
            {/* Único KPI de situação da tela: cota estourada (vermelho) x saldo
                positivo (verde). O amarelo do estado normal era decorativo. */}
            <span className={`kpi-label ${estourou ? 'texto-danger' : 'texto-success'}`}>
              Disponível
            </span>
            <span className={`kpi-icone ${estourou ? 'fundo-danger tom-danger' : 'fundo-success tom-success'}`}>
              <PiggyBank />
            </span>
          </div>
          <div className="kpi-valor-linha">
            <span className={`kpi-valor${estourou ? ' texto-danger' : ''}`}>
              {resumo.saldo}
            </span>
            {pctSaldo !== null && <span className="kpi-sufixo">{pctSaldo}% da cota</span>}
          </div>
          <div className="kpi-rodape"><span className="stat-sub">da cota do mês</span></div>
        </div>
      </div>

      <div className="dash-layout dash-layout-360">
        <div className="dash-main">
          <OcupacaoCota resumo={resumo} />
          <OperacoesDoMes operacoes={resumo.operacoes} onAbrir={setOperacaoAbertaId} />
        </div>
        <aside className="dash-rail dash-rail-360">
          <CalendarioDiarias recarregarSinal={recarregarCalendarioSinal} onClickDia={handleClickDiaCalendario} />
          <DiariasPorTipo operacoes={resumo.operacoes} />
        </aside>
      </div>

      {modalMissaoAberto && (
        <ModalMissaoAvulsa
          dataPreenchida={dataMissaoPrefill}
          onFechar={() => setModalMissaoAberto(false)}
          onCriada={handleMissaoCriada}
        />
      )}

      {operacaoAbertaId && (
        <DrawerOperacao
          operacaoId={operacaoAbertaId}
          pessoal={dados.pessoal}
          operacoesTodas={dados.operacoes}
          escalasTodas={dados.escalas}
          cotaMensal={resumo.cota_mensal}
          onFechar={() => setOperacaoAbertaId(null)}
          onAlterado={handleOperacaoAlterada}
        />
      )}
    </>
  );
}
