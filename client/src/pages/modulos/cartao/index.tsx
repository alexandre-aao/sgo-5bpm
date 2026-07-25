import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Route, ClipboardX, Plus, Copy, MoreHorizontal, LayoutTemplate, FilePlus2, Printer, Trash2,
  ClipboardList, Lock,
} from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { apiFetch } from '../../../lib/api';
import type { CartaoViatura, CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { calcularAlertasCartao } from '../../../lib/cartaoConflitos';
import { tipoDoCartao } from '../../../lib/cartaoConflitos';
import { dentroDoPrazoCartao, motivoBloqueioCartao, podeEditarCartao } from '../../../lib/prazoCartao';
import { useOrientacoesCartao, orientacoesDoTipo } from '../../../hooks/useOrientacoesCartao';
import { useCartaoPrograma } from './useCartaoPrograma';
import { useViaturasCartao } from './useViaturasCartao';
import { useItensRoteiro } from './useItensRoteiro';
import { NavegadorData } from './NavegadorData';
import { QuadroResumo } from './QuadroResumo';
import { CartoesRecentes } from './CartoesRecentes';
import { CartaoHeader } from './CartaoHeader';
import { ViaturasTabela } from './ViaturasTabela';
import { RoteiroGrid } from './RoteiroGrid';
import { FormAdicionarViatura } from './FormAdicionarViatura';
import { ModalEditarViatura } from './ModalEditarViatura';
import { ConflitoBanner } from './ConflitoBanner';
import { TrilhoCartao } from './TrilhoCartao';
import { TemplatesPanel } from './TemplatesPanel';
import { ModalNovoTemplate } from './ModalNovoTemplate';
import { SugestaoTemplate } from './SugestaoTemplate';
import { ModalCopiarCartao } from './ModalCopiarCartao';
import { TipoCartaoSwitch } from './TipoCartaoSwitch';
import { FaixaReforcos } from './FaixaReforcos';
import { ModalNovoReforco } from './ModalNovoReforco';
import { OrientacoesPanel } from './OrientacoesPanel';
import { ModalExcluirCartao } from './ModalExcluirCartao';
import { CartaoProgramaPdf } from './CartaoProgramaPdf';

export default function CartaoProgramaPage() {
  const { usuario } = useAuth();
  const { dados } = useAppData();
  const { toast } = useToast();
  const {
    dataSelecionada,
    setDataSelecionada,
    deslocarDia,
    tipoAtivo,
    setTipoAtivo,
    cartaoOrdinario,
    reforcos,
    reforcoSelecionadoId,
    selecionarReforco,
    cartao,
    temCartao,
    criarCartao,
    atualizarCabecalho,
    recarregar,
  } = useCartaoPrograma();

  // Modelo aberto para edição no MESMO editor de viaturas/roteiro — espelha
  // exibirCartaoNoEditor() recebendo tanto um cartão do dia quanto um modelo em
  // public/app.js. Trocar a data ou o tipo sempre sai do modo modelo.
  const [templateAberto, setTemplateAberto] = useState<CartaoDetalhado | null>(null);
  const [dataAnterior, setDataAnterior] = useState(dataSelecionada);
  if (dataSelecionada !== dataAnterior) {
    setDataAnterior(dataSelecionada);
    setTemplateAberto(null);
  }

  const cartaoEditando = templateAberto ?? cartao;

  // Orientações permanentes da P3 (só as ativas) — entram no bloco de observações de
  // cada viatura, na tela e no PDF.
  const { orientacoes } = useOrientacoesCartao(true);
  const tipoEmEdicao = cartaoEditando ? tipoDoCartao(cartaoEditando) : tipoAtivo;
  const textosOrientacoes = orientacoesDoTipo(orientacoes, tipoEmEdicao).map((o) => o.texto);

  const recarregarAtivo = useCallback(async () => {
    if (templateAberto) {
      try {
        const res = await apiFetch(`/api/cartoes/${templateAberto.id}`);
        const detalhe = (await res.json()) as CartaoDetalhado;
        setTemplateAberto(detalhe);
      } catch (erro) {
        console.error('Erro ao recarregar modelo de cartão:', erro);
      }
    } else {
      await recarregar();
    }
  }, [templateAberto, recarregar]);

  const { adicionarViatura, editarViatura, removerViatura } = useViaturasCartao(cartaoEditando?.id, recarregarAtivo);
  const { adicionarItem, removerItem, atualizarAtividade } = useItensRoteiro(cartaoEditando?.id, recarregarAtivo);

  const [aba, setAba] = useState<'viaturas' | 'roteiro'>('viaturas');
  const [vtrEmEdicao, setVtrEmEdicao] = useState<CartaoViatura | null>(null);

  const [menuAberto, setMenuAberto] = useState(false);
  const [mostrarTemplatesPanel, setMostrarTemplatesPanel] = useState(false);
  const [mostrarOrientacoesPanel, setMostrarOrientacoesPanel] = useState(false);
  const [modalNovoTemplateAberto, setModalNovoTemplateAberto] = useState(false);
  const [modalCopiarAberto, setModalCopiarAberto] = useState(false);
  const [modalNovoReforcoAberto, setModalNovoReforcoAberto] = useState(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false);
  const [modalPdfAberto, setModalPdfAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    function handleClickFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [menuAberto]);

  const ehP3 = usuario?.role === 'P3';
  // Adjunto e Oficial têm exatamente os mesmos poderes no Cartão Programa, limitados
  // pelo prazo (08h do dia seguinte, America/Fortaleza). A P3 não tem prazo. A checagem
  // real é do servidor (403) — isto trava a UI antes e explica o motivo.
  const podeEditar = cartaoEditando
    ? podeEditarCartao(cartaoEditando, usuario?.role)
    : usuario?.role === 'P3' || usuario?.role === 'Adjunto' || usuario?.role === 'Oficial';
  const motivoBloqueio = cartaoEditando ? motivoBloqueioCartao(cartaoEditando, usuario?.role) : null;
  const ehModelo = !!cartaoEditando?.is_template;

  async function handleCriarCartao() {
    const resultado = await criarCartao();
    if (resultado.ok) {
      toast('Cartão Programa criado. Adicione as viaturas e roteiros.', 'success');
    } else {
      toast(resultado.mensagem, 'warning');
    }
  }

  function handleAbrirCopiar() {
    if (!dataSelecionada) {
      toast('Selecione a data do Cartão Programa (destino da cópia).', 'warning');
      return;
    }
    setModalCopiarAberto(true);
  }

  async function handleAbrirTemplate(id: string) {
    try {
      const res = await apiFetch(`/api/cartoes/${id}`);
      const detalhe = (await res.json()) as CartaoDetalhado;
      setTemplateAberto(detalhe);
      setMostrarTemplatesPanel(false);
    } catch (erro) {
      console.error('Erro ao abrir modelo de cartão:', erro);
      toast('Falha ao abrir o modelo de cartão.', 'danger');
    }
  }

  function handleTemplateExcluido(id: string) {
    if (templateAberto?.id === id) setTemplateAberto(null);
  }

  function handleTrocarTipo(tipo: typeof tipoAtivo) {
    setTemplateAberto(null);
    setTipoAtivo(tipo);
  }

  function handleImprimir() {
    if (!cartaoOrdinario && reforcos.length === 0) {
      toast('Não há Cartão Programa nesta data para imprimir.', 'warning');
      return;
    }
    setModalPdfAberto(true);
  }

  function handleAbrirExcluir() {
    if (!cartaoEditando) {
      toast('Não há Cartão Programa nesta data para excluir.', 'warning');
      return;
    }
    setModalExcluirAberto(true);
  }

  async function handleConfirmarExclusao(justificativa: string) {
    if (!cartaoEditando) return;
    try {
      const res = await apiFetch(`/api/cartoes/${cartaoEditando.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        toast(corpo.error || 'Falha ao excluir o Cartão Programa.', 'danger');
        return;
      }
      setModalExcluirAberto(false);
      const eraTemplate = !!templateAberto;
      toast(eraTemplate ? 'Modelo excluído.' : 'Cartão Programa excluído.', 'info');
      if (eraTemplate) {
        setTemplateAberto(null);
        setMostrarTemplatesPanel(false);
      } else {
        await recarregar();
      }
    } catch (erro) {
      console.error('Erro ao excluir Cartão Programa:', erro);
      toast('Falha na comunicação com o servidor.', 'danger');
    }
  }

  async function handleExcluirViatura(vtr: CartaoViatura) {
    if (!window.confirm('Remover esta viatura e todo o seu roteiro do cartão?')) return;
    const resultado = await removerViatura(vtr.id);
    if (resultado.ok) {
      toast('Viatura removida do cartão.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  const ehReforcoAtivo = tipoAtivo === 'reforco' && !templateAberto;

  return (
    <>
      <div className="panel cartao-toolbar-panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Route />
            <h2>Cartão Programa de Patrulhamento</h2>
          </div>
          <div className="report-filters cartao-toolbar">
            <NavegadorData
              dataSelecionada={dataSelecionada}
              onMudarData={setDataSelecionada}
              onDeslocarDia={deslocarDia}
              temCartao={temCartao}
            />
            <TipoCartaoSwitch tipoAtivo={tipoAtivo} onTrocar={handleTrocarTipo} qtdReforcos={reforcos.length} />
            {!ehReforcoAtivo && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCriarCartao}>
                <Plus /> Criar Cartão
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAbrirCopiar}>
              <Copy /> Copiar
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleImprimir}>
              <Printer /> Imprimir
            </button>
            {ehP3 && (
              <div className="dropdown" ref={menuRef}>
                <button
                  type="button" className="btn-icon" aria-haspopup="true" aria-expanded={menuAberto}
                  aria-label="Mais ações" title="Mais ações" onClick={() => setMenuAberto((a) => !a)}
                >
                  <MoreHorizontal />
                </button>
                <div className={`dropdown-menu${menuAberto ? '' : ' hidden'}`}>
                  <button
                    type="button" className="dropdown-item"
                    onClick={() => { setMostrarTemplatesPanel((v) => !v); setMenuAberto(false); }}
                  >
                    <LayoutTemplate /> Modelos de Cartão
                  </button>
                  <button
                    type="button" className="dropdown-item"
                    onClick={() => { setModalNovoTemplateAberto(true); setMenuAberto(false); }}
                  >
                    <FilePlus2 /> Novo Modelo de Cartão
                  </button>
                  <button
                    type="button" className="dropdown-item"
                    onClick={() => { setMostrarOrientacoesPanel((v) => !v); setMenuAberto(false); }}
                  >
                    <ClipboardList /> Orientações da P3
                  </button>
                </div>
              </div>
            )}
            {cartaoEditando && podeEditar && (
              <button type="button" className="btn btn-danger btn-sm" onClick={handleAbrirExcluir}>
                <Trash2 /> Excluir
              </button>
            )}
          </div>
        </div>
      </div>

      {mostrarTemplatesPanel && (
        <TemplatesPanel onAbrir={handleAbrirTemplate} onExcluido={handleTemplateExcluido} />
      )}

      {mostrarOrientacoesPanel && ehP3 && <OrientacoesPanel />}

      {ehReforcoAtivo && (
        <FaixaReforcos
          reforcos={reforcos}
          selecionadoId={reforcoSelecionadoId}
          operacoes={dados.operacoes}
          podeCriar={usuario?.role === 'P3' || usuario?.role === 'Adjunto' || usuario?.role === 'Oficial'}
          onSelecionar={selecionarReforco}
          onNovo={() => setModalNovoReforcoAberto(true)}
        />
      )}

      <CartoesRecentes dataSelecionada={dataSelecionada} onAbrir={setDataSelecionada} />

      {temCartao === false && !templateAberto && (
        <div className="cartao-empty-state">
          <ClipboardX />
          {ehReforcoAtivo ? (
            <>
              <h3>Nenhum cartão de reforço nesta data</h3>
              <p>
                Use &quot;Novo Reforço&quot; para gerar um a partir de um padrão da P3 — ou em branco. Vários
                reforços podem coexistir na mesma data.
              </p>
            </>
          ) : (
            <>
              <h3>Nenhum Cartão Programa para esta data</h3>
              <p>Crie um cartão em branco, copie a estrutura do dia anterior, ou importe um modelo pronto.</p>
              <SugestaoTemplate dataSelecionada={dataSelecionada} onClonado={() => void recarregar()} />
            </>
          )}
        </div>
      )}

      {cartaoEditando && (
        <>
          {motivoBloqueio && (
            <div className="cartao-prazo-aviso" role="status">
              <Lock />
              <span>
                <strong>Somente leitura.</strong> {motivoBloqueio}
              </span>
            </div>
          )}
          <ConflitoBanner alertas={calcularAlertasCartao(cartaoEditando, dados.pessoal)} />
          <div className="dash-layout">
          <div className="dash-main">
            <CartaoHeader
              cartao={cartaoEditando}
              pessoal={dados.pessoal}
              operacoes={dados.operacoes}
              podeEditar={podeEditar}
              onAtualizar={atualizarCabecalho}
            />
            <QuadroResumo viaturas={cartaoEditando.viaturas} />

            <div className="panel cartao-abas-panel">
              <div className="sub-abas" role="tablist" aria-label="Conteúdo do cartão">
                <button
                  type="button"
                  className={`sub-aba${aba === 'viaturas' ? ' ativo' : ''}`}
                  role="tab"
                  aria-selected={aba === 'viaturas'}
                  onClick={() => setAba('viaturas')}
                >
                  Viaturas
                </button>
                <button
                  type="button"
                  className={`sub-aba${aba === 'roteiro' ? ' ativo' : ''}`}
                  role="tab"
                  aria-selected={aba === 'roteiro'}
                  onClick={() => setAba('roteiro')}
                >
                  Roteiro
                </button>
              </div>

              {aba === 'viaturas' ? (
                <ViaturasTabela
                  viaturas={cartaoEditando.viaturas}
                  podeEditar={podeEditar}
                  ehModelo={ehModelo}
                  onEditar={setVtrEmEdicao}
                  onExcluir={handleExcluirViatura}
                />
              ) : (
                <RoteiroGrid
                  viaturas={cartaoEditando.viaturas}
                  dataCartao={cartaoEditando.data || dataSelecionada}
                  eventos={dados.eventos}
                  podeEditar={podeEditar}
                  ehModelo={ehModelo}
                  orientacoes={textosOrientacoes}
                  onAdicionarItem={adicionarItem}
                  onExcluirItem={removerItem}
                  onSalvarAtividade={atualizarAtividade}
                  onEditarViatura={setVtrEmEdicao}
                  onExcluirViatura={handleExcluirViatura}
                />
              )}
            </div>

            {podeEditar && (
              <FormAdicionarViatura
                viaturasCadastradas={dados.viaturas}
                onAdicionar={adicionarViatura}
                ehModelo={ehModelo}
              />
            )}
          </div>

          <TrilhoCartao viaturas={cartaoEditando.viaturas} alertas={calcularAlertasCartao(cartaoEditando, dados.pessoal)} />
          </div>
        </>
      )}

      {vtrEmEdicao && (
        <ModalEditarViatura
          viatura={vtrEmEdicao}
          ehModelo={ehModelo}
          onFechar={() => setVtrEmEdicao(null)}
          onSalvar={editarViatura}
        />
      )}

      {modalNovoTemplateAberto && (
        <ModalNovoTemplate
          onFechar={() => setModalNovoTemplateAberto(false)}
          onCriado={(t) => { setModalNovoTemplateAberto(false); setTemplateAberto(t); }}
        />
      )}

      {modalNovoReforcoAberto && (
        <ModalNovoReforco
          dataAlvo={dataSelecionada}
          operacoes={dados.operacoes}
          onFechar={() => setModalNovoReforcoAberto(false)}
          onCriado={() => { setModalNovoReforcoAberto(false); void recarregar(); }}
        />
      )}

      {modalCopiarAberto && (
        <ModalCopiarCartao
          dataAlvo={dataSelecionada}
          onFechar={() => setModalCopiarAberto(false)}
          onCopiado={() => { setModalCopiarAberto(false); setTemplateAberto(null); void recarregar(); }}
        />
      )}

      {modalPdfAberto && (
        <CartaoProgramaPdf
          dataSelecionada={dataSelecionada}
          cartaoOrdinario={cartaoOrdinario}
          reforcos={reforcos}
          orientacoes={orientacoes}
          operacoes={dados.operacoes}
          onFechar={() => setModalPdfAberto(false)}
        />
      )}

      {modalExcluirAberto && cartaoEditando && (
        <ModalExcluirCartao
          titulo={templateAberto ? 'Excluir Modelo de Cartão' : 'Excluir Cartão Programa'}
          aviso={
            templateAberto
              ? 'Isso excluirá este modelo, com todas as viaturas e roteiros associados.'
              : 'O cartão sai das listagens e das estatísticas. O registro é preservado no banco com autor, data e justificativa da exclusão.'
          }
          valorEsperado={
            (templateAberto ? cartaoEditando.nome_template : cartaoEditando.data?.split('-').reverse().join('/')) || ''
          }
          foraDoPrazo={!cartaoEditando.is_template && !dentroDoPrazoCartao(cartaoEditando.data)}
          dataCartao={cartaoEditando.data}
          onFechar={() => setModalExcluirAberto(false)}
          onConfirmar={(justificativa) => void handleConfirmarExclusao(justificativa)}
        />
      )}
    </>
  );
}
