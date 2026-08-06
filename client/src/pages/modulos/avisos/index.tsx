import { useCallback, useMemo, useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, RefreshCw, CalendarClock, Ban } from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { useAtalhoNovo } from '../../../hooks/useAtalhosGlobais';
import { useToast } from '../../../context/useToast';
import { useBairros } from '../../../hooks/useBairros';
import { useAvisos, type AvisoPayload } from '../../../hooks/useAvisos';
import type { Tables } from '../../../types/supabase';
import { COMPANHIAS } from '../../../lib/categoriasViatura';
import { Carregando } from '../../../components/estado/Carregando';
import { ErroAoCarregar } from '../../../components/estado/ErroAoCarregar';
import { SemDados } from '../../../components/estado/SemDados';
import { ModalAviso } from './ModalAviso';
import {
  avisoVigente,
  diasParaVencer,
  vencendoEm,
  ordenarPorPrioridade,
  prioridadeBadgeClass,
  ROTULO_PRIORIDADE,
  PRIORIDADES_AVISO,
  type PrioridadeAviso,
} from '../../../lib/avisos';

function dataBr(iso: string | null): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

export default function AvisosPage() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const { bairros } = useBairros();
  const { avisos, carregando, erro, recarregar, criarAviso, atualizarAviso, renovarAviso, excluirAviso } = useAvisos();

  const ehP3 = usuario?.role === 'P3';

  const [filtroBairro, setFiltroBairro] = useState('');
  const [filtroCompanhia, setFiltroCompanhia] = useState('');
  const [filtroPrioridade, setFiltroPrioridade] = useState('');
  const [soVigentes, setSoVigentes] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [avisoEmEdicao, setAvisoEmEdicao] = useState<Tables<'avisos'> | null>(null);

  // Tecla N: novo alerta. Só P3 cria — mesma condição do botão da tela.
  useAtalhoNovo(
    useCallback(() => { setAvisoEmEdicao(null); setModalAberto(true); }, []),
    ehP3 && !modalAberto,
  );

  const filtrados = useMemo(() => {
    const lista = avisos.filter((a) => {
      if (soVigentes && !avisoVigente(a)) return false;
      if (filtroBairro && a.bairro_id !== filtroBairro) return false;
      if (filtroCompanhia && a.companhia !== filtroCompanhia) return false;
      if (filtroPrioridade && a.prioridade !== filtroPrioridade) return false;
      return true;
    });
    return ordenarPorPrioridade(lista);
  }, [avisos, soVigentes, filtroBairro, filtroCompanhia, filtroPrioridade]);

  // Fila de trabalho da P3: o que sai do ar em até 7 dias se ninguém renovar.
  const vencendo = useMemo(() => ordenarPorPrioridade(avisos.filter((a) => vencendoEm(a, 7))), [avisos]);

  const nomeBairro = (id: string | null) => bairros.find((b) => b.id === id)?.nome_bairro || '';

  function escopoDoAviso(aviso: Tables<'avisos'>): string {
    const partes = [nomeBairro(aviso.bairro_id), aviso.companhia || ''].filter(Boolean);
    return partes.length ? partes.join(' · ') : 'Sem escopo';
  }

  function vigenciaDoAviso(aviso: Tables<'avisos'>): string {
    if (aviso.permanente) return 'Permanente';
    if (!aviso.data_fim) return `Desde ${dataBr(aviso.data_inicio)}`;
    const restantes = diasParaVencer(aviso);
    if (restantes === null) return `Até ${dataBr(aviso.data_fim)}`;
    if (restantes < 0) return `Vencido em ${dataBr(aviso.data_fim)}`;
    if (restantes === 0) return 'Vence hoje';
    return `${restantes} dia(s) — até ${dataBr(aviso.data_fim)}`;
  }

  async function handleSalvar(payload: AvisoPayload) {
    return avisoEmEdicao ? atualizarAviso(avisoEmEdicao.id, payload) : criarAviso(payload);
  }

  async function handleRenovar(aviso: Tables<'avisos'>) {
    const resultado = await renovarAviso(aviso.id, 30);
    toast(resultado.ok ? 'Vigência renovada por mais 30 dias.' : resultado.mensagem, resultado.ok ? 'success' : 'danger');
  }

  async function handleEncerrar(aviso: Tables<'avisos'>) {
    if (!window.confirm('Encerrar este alerta? Ele deixa de aparecer nos cartões, mas continua no histórico.')) return;
    const resultado = await atualizarAviso(aviso.id, { ativo: false });
    toast(resultado.ok ? 'Alerta encerrado.' : resultado.mensagem, resultado.ok ? 'info' : 'danger');
  }

  async function handleExcluir(aviso: Tables<'avisos'>) {
    if (!window.confirm('Excluir permanentemente este alerta? Os cartões já gerados não são alterados.')) return;
    const resultado = await excluirAviso(aviso.id);
    toast(resultado.ok ? 'Alerta excluído.' : resultado.mensagem, resultado.ok ? 'info' : 'danger');
  }

  if (carregando) return <Carregando />;
  if (erro) return <ErroAoCarregar onTentarDeNovo={() => void recarregar()} />;

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Megaphone />
            <h2>Alertas</h2>
          </div>
          <div className="report-filters">
            <select value={filtroBairro} onChange={(e) => setFiltroBairro(e.target.value)} aria-label="Filtrar por bairro">
              <option value="">Todos os bairros</option>
              {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome_bairro}</option>)}
            </select>
            <select value={filtroCompanhia} onChange={(e) => setFiltroCompanhia(e.target.value)} aria-label="Filtrar por Companhia">
              <option value="">Todas as Companhias</option>
              {COMPANHIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} aria-label="Filtrar por prioridade">
              <option value="">Todas as prioridades</option>
              {PRIORIDADES_AVISO.map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
            </select>
            <label className="checkbox-inline" htmlFor="aviso-so-vigentes">
              <input
                type="checkbox" id="aviso-so-vigentes" checked={soVigentes}
                onChange={(e) => setSoVigentes(e.target.checked)}
              />
              Só vigentes
            </label>
            {ehP3 && (
              <button
                type="button" className="btn btn-primary btn-sm"
                onClick={() => { setAvisoEmEdicao(null); setModalAberto(true); }}
              >
                <Plus /> Novo Alerta
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visão de renovação: só faz sentido para quem pode renovar. */}
      {ehP3 && vencendo.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <CalendarClock />
              <h2>Vencendo nos próximos 7 dias ({vencendo.length})</h2>
            </div>
          </div>
          <div className="avisos-vencendo">
            {vencendo.map((aviso) => (
              <div key={aviso.id} className="aviso-vencendo-item">
                <div>
                  <span className={`badge ${prioridadeBadgeClass(aviso.prioridade)}`}>
                    {ROTULO_PRIORIDADE[aviso.prioridade as PrioridadeAviso]}
                  </span>
                  <strong>{escopoDoAviso(aviso)}</strong>
                  <span className="aviso-vigencia">{vigenciaDoAviso(aviso)}</span>
                </div>
                <div className="acoes-linha">
                  <button className="btn btn-secondary btn-sm" onClick={() => void handleRenovar(aviso)}>
                    <RefreshCw /> Renovar 30 dias
                  </button>
                  <button className="btn-icon" title="Encerrar alerta" aria-label="Encerrar alerta" onClick={() => void handleEncerrar(aviso)}>
                    <Ban />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="table-responsive">
          <table className="styled-table table-cards-mobile">
            <thead>
              <tr>
                <th>Prioridade</th>
                <th>Escopo</th>
                <th>Categoria</th>
                <th>Orientação</th>
                <th>Vigência</th>
                {ehP3 && <th className="text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={ehP3 ? 6 : 5}>
                    <SemDados
                      icone={Megaphone}
                      titulo="Nenhum alerta"
                      orientacao={
                        soVigentes
                          ? 'Não há alertas vigentes com esses filtros. Desmarque "Só vigentes" para ver os encerrados e vencidos.'
                          : ehP3
                            ? 'Cadastre um alerta para orientar as viaturas alocadas num bairro.'
                            : 'A P3 ainda não cadastrou alertas para esses filtros.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtrados.map((aviso) => (
                  <tr key={aviso.id} className={avisoVigente(aviso) ? '' : 'linha-inativa'}>
                    <td className="card-title-cell" data-label="Prioridade">
                      <span className={`badge ${prioridadeBadgeClass(aviso.prioridade)}`}>
                        {ROTULO_PRIORIDADE[aviso.prioridade as PrioridadeAviso]}
                      </span>
                    </td>
                    <td data-label="Escopo"><strong>{escopoDoAviso(aviso)}</strong></td>
                    <td data-label="Categoria">{aviso.categoria || '-'}</td>
                    <td data-label="Orientação" className="aviso-texto-celula">{aviso.texto}</td>
                    <td data-label="Vigência">{vigenciaDoAviso(aviso)}</td>
                    {ehP3 && (
                      <td className="text-right" data-label="Ações">
                        <div className="acoes-linha">
                          <button
                            className="btn-icon" title="Editar alerta" aria-label="Editar alerta"
                            onClick={() => { setAvisoEmEdicao(aviso); setModalAberto(true); }}
                          >
                            <Pencil />
                          </button>
                          {avisoVigente(aviso) && (
                            <button className="btn-icon" title="Encerrar alerta" aria-label="Encerrar alerta" onClick={() => void handleEncerrar(aviso)}>
                              <Ban />
                            </button>
                          )}
                          <button
                            className="btn-icon btn-icon-danger" title="Excluir alerta" aria-label="Excluir alerta"
                            onClick={() => void handleExcluir(aviso)}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && (
        <ModalAviso
          aviso={avisoEmEdicao}
          bairros={bairros}
          onFechar={() => { setModalAberto(false); setAvisoEmEdicao(null); }}
          onSalvar={handleSalvar}
        />
      )}
    </>
  );
}
