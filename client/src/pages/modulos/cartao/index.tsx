import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Route, ClipboardX, Plus, MoreHorizontal, LayoutTemplate, FilePlus2, Printer, Trash2, Maximize2 } from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { apiFetch } from '../../../lib/api';
import type { CartaoViatura, CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { calcularAlertasCartao } from '../../../lib/cartaoConflitos';
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
import { CriarDoPadrao } from './CriarDoPadrao';
import { ModalConfirmarExclusaoForte } from '../../../components/ModalConfirmarExclusaoForte';
import { podeExcluirCartao, proximoDiaISO, dataBr } from '../../../lib/janelaCartao';
import { useBairros } from '../../../hooks/useBairros';
import { useAvisos } from '../../../hooks/useAvisos';

export default function CartaoProgramaPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const { dados } = useAppData();
  const { toast } = useToast();
  // Cadastro de bairros: alimenta o vínculo da viatura que traz os Avisos
  // Operacionais. Fica no hook próprio (não no state global) porque só o Cartão
  // e o Mapa usam — mesma fonte do painel Gerenciar Bairros.
  const { bairros } = useBairros();
  const { avisos } = useAvisos();
  const {
    dataSelecionada,
    setDataSelecionada,
    deslocarDia,
    cartao,
    temCartao,
    criarCartao,
    atualizarCabecalho,
    recarregar,
  } = useCartaoPrograma();

  // Cartão padrão aberto para edição no mesmo editor de viaturas/roteiro —
  // espelha exibirCartaoNoEditor() recebendo tanto um cartão do dia quanto um
  // template em public/app.js. Trocar a data sempre sai do modo template.
  const [templateAberto, setTemplateAberto] = useState<CartaoDetalhado | null>(null);
  const [dataAnterior, setDataAnterior] = useState(dataSelecionada);
  if (dataSelecionada !== dataAnterior) {
    setDataAnterior(dataSelecionada);
    setTemplateAberto(null);
  }

  const cartaoEditando = templateAberto ?? cartao;

  const recarregarAtivo = useCallback(async () => {
    if (templateAberto) {
      try {
        const res = await apiFetch(`/api/cartoes/${templateAberto.id}`);
        const detalhe = (await res.json()) as CartaoDetalhado;
        setTemplateAberto(detalhe);
      } catch (erro) {
        console.error('Erro ao recarregar cartão padrão:', erro);
      }
    } else {
      await recarregar();
    }
  }, [templateAberto, recarregar]);

  const { adicionarViatura, editarViatura, removerViatura } = useViaturasCartao(cartaoEditando?.id, recarregarAtivo);
  const { adicionarItem, removerItem, atualizarItem, duplicarItem, copiarRoteiro, aplicarAtividade } = useItensRoteiro(cartaoEditando?.id, recarregarAtivo);

  const [aba, setAba] = useState<'viaturas' | 'roteiro'>('viaturas');
  const [vtrEmEdicao, setVtrEmEdicao] = useState<CartaoViatura | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [mostrarTemplatesPanel, setMostrarTemplatesPanel] = useState(false);
  const [modalNovoTemplateAberto, setModalNovoTemplateAberto] = useState(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    function handleClickFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [menuAberto]);

  // Cartão Programa é a única tela que Adjunto/Oficial podem editar — a gestão
  // de templates segue P3-only.
  const podeEditar = usuario?.role === 'P3' || usuario?.role === 'Adjunto';
  const ehP3 = usuario?.role === 'P3';
  // Exclusão: P3 sempre; Adjunto só o cartão do dia e até 07h00 do dia seguinte
  // à data do serviço. O servidor refaz essa checagem no DELETE — aqui é só UI.
  const podeExcluir = podeExcluirCartao(usuario?.role, cartaoEditando);

  async function handleCriarCartao() {
    const resultado = await criarCartao();
    if (resultado.ok) {
      toast('Cartão Programa criado. Adicione as viaturas e roteiros.', 'success');
    } else {
      toast(resultado.mensagem, 'warning');
    }
  }

  async function handleAbrirTemplate(id: string) {
    try {
      const res = await apiFetch(`/api/cartoes/${id}`);
      const detalhe = (await res.json()) as CartaoDetalhado;
      setTemplateAberto(detalhe);
      setMostrarTemplatesPanel(false);
    } catch (erro) {
      console.error('Erro ao abrir cartão padrão:', erro);
      toast('Falha ao abrir o cartão padrão.', 'danger');
    }
  }

  function handleTemplateExcluido(id: string) {
    if (templateAberto?.id === id) setTemplateAberto(null);
  }

  function abrirCentralEmissao(viaturaId?: string) {
    if (!cartaoEditando || cartaoEditando.viaturas.length === 0) {
      toast('Adicione ao menos uma viatura ao cartão antes de emitir.', 'warning');
      return;
    }
    const busca = new URLSearchParams({ cartao: cartaoEditando.id });
    if (viaturaId) busca.set('viatura', viaturaId);
    navigate(`/impressao?${busca.toString()}`);
  }

  function handleAbrirExcluir() {
    if (!cartaoEditando) {
      toast('Não há Cartão Programa nesta data para excluir.', 'warning');
      return;
    }
    setModalExcluirAberto(true);
  }

  async function handleConfirmarExclusao() {
    if (!cartaoEditando) return;
    try {
      const res = await apiFetch(`/api/cartoes/${cartaoEditando.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        toast(corpo.error || 'Falha ao excluir o Cartão Programa.', 'danger');
        return;
      }
      setModalExcluirAberto(false);
      const eraTemplate = !!templateAberto;
      toast(eraTemplate ? 'Cartão padrão excluído.' : 'Cartão Programa excluído.', 'info');
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
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCriarCartao}>
              <Plus /> Criar Cartão
            </button>
            {cartaoEditando && !cartaoEditando.is_template && (
              <>
                <Link to={`/cartao/${cartaoEditando.id}`} className="btn btn-secondary btn-sm">
                  <Maximize2 /> Tela Cheia
                </Link>
                <Link to={`/impressao?cartao=${cartaoEditando.id}`} className="btn btn-primary btn-sm">
                  <Printer /> Central de Emissão
                </Link>
              </>
            )}
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
                    <LayoutTemplate /> Cartões Padrão
                  </button>
                  <button
                    type="button" className="dropdown-item"
                    onClick={() => { setModalNovoTemplateAberto(true); setMenuAberto(false); }}
                  >
                    <FilePlus2 /> Novo Cartão Padrão
                  </button>
                </div>
              </div>
            )}
            {podeExcluir && (
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

      <CartoesRecentes dataSelecionada={dataSelecionada} onAbrir={setDataSelecionada} />

      {temCartao === false && !templateAberto && (
        <div className="cartao-empty-state">
          <ClipboardX />
          <h3>Nenhum Cartão Programa para esta data</h3>
          <p>O cartão do dia nasce a partir do cartão padrão ativo — as viaturas e o roteiro base já vêm preenchidos.</p>
          {/* key força um novo fetch ao fechar "Cartões Padrão" — o P3 pode ter trocado o
              padrão ativo ali, e este bloco só busca no mount. */}
          <CriarDoPadrao key={String(mostrarTemplatesPanel)} onCriar={() => void handleCriarCartao()} />
        </div>
      )}

      {cartaoEditando && (
        <>
          <ConflitoBanner alertas={calcularAlertasCartao(cartaoEditando, dados.pessoal)} />
          <div className="dash-layout">
          <div className="dash-main">
            <CartaoHeader
              cartao={cartaoEditando}
              pessoal={dados.pessoal}
              viaturasCadastradas={dados.viaturas}
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
                  onEditar={setVtrEmEdicao}
                  onExcluir={handleExcluirViatura}
                  onVerCartao={(vtr) => abrirCentralEmissao(vtr.id)}
                />
              ) : (
                <RoteiroGrid
                  viaturas={cartaoEditando.viaturas}
                  dataCartao={cartaoEditando.data || dataSelecionada}
                  eventos={dados.eventos}
                  podeEditar={podeEditar}
                  onAdicionarItem={adicionarItem}
                  onExcluirItem={removerItem}
                  onAtualizarItem={atualizarItem}
                  onDuplicarItem={duplicarItem}
                  onCopiarRoteiro={copiarRoteiro}
                  onAplicarAtividade={aplicarAtividade}
                  onEditarViatura={setVtrEmEdicao}
                  onExcluirViatura={handleExcluirViatura}
                />
              )}
            </div>

            {podeEditar && (
              <FormAdicionarViatura
                viaturasCadastradas={dados.viaturas}
                pessoal={dados.pessoal}
                bairros={bairros}
                avisos={avisos}
                onAdicionar={adicionarViatura}
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
          pessoal={dados.pessoal}
          bairros={bairros}
          avisos={avisos}
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

      {modalExcluirAberto && cartaoEditando && (
        <ModalConfirmarExclusaoForte
          titulo={templateAberto ? 'Excluir Cartão Padrão' : 'Excluir Cartão Programa'}
          aviso={
            templateAberto
              ? 'Isso excluirá permanentemente este cartão padrão, com todas as viaturas e roteiros associados.'
              : `Isso excluirá permanentemente o Cartão Programa desta data, com todas as viaturas e roteiros associados.${
                  ehP3 || !cartaoEditando.data
                    ? ''
                    : ` Seu prazo para excluir este cartão termina às 07h00 de ${dataBr(proximoDiaISO(cartaoEditando.data))}.`
                }`
          }
          label={`Digite "${templateAberto ? cartaoEditando.nome_template : cartaoEditando.data?.split('-').reverse().join('/')}" para confirmar`}
          valorEsperado={(templateAberto ? cartaoEditando.nome_template : cartaoEditando.data?.split('-').reverse().join('/')) || ''}
          onFechar={() => setModalExcluirAberto(false)}
          onConfirmar={() => void handleConfirmarExclusao()}
        />
      )}
    </>
  );
}
