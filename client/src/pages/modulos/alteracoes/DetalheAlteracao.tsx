import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, MessageSquareWarning, Printer, ShieldCheck, UserRound, X } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import type { AlteracaoServico } from './types';
import { classeSituacao, dataBr, dataHoraBr, rotuloPeriodo } from './utils';
import { apiFetch } from '../../../lib/api';

interface Props {
  alteracao: AlteracaoServico;
  podeCiencia: boolean;
  podeDivergencia: boolean;
  onFechar: () => void;
  onCiencia: () => Promise<{ ok: boolean; mensagem?: string }>;
  onDivergencia: (texto: string) => Promise<{ ok: boolean; mensagem?: string }>;
  onImprimir: () => void;
}

export function DetalheAlteracao({ alteracao, podeCiencia, podeDivergencia, onFechar, onCiencia, onDivergencia, onImprimir }: Props) {
  const { toast } = useToast();
  const [enviandoCiencia, setEnviandoCiencia] = useState(false);
  const [divergenciaAberta, setDivergenciaAberta] = useState(false);
  const [textoDivergencia, setTextoDivergencia] = useState('');
  const [enviandoDivergencia, setEnviandoDivergencia] = useState(false);
  const [historico, setHistorico] = useState<{ id: string; acao: string; usuario_nome: string; criado_em: string }[]>([]);

  useEffect(() => {
    let ativo = true;
    void apiFetch(`/api/alteracoes-servico/${alteracao.id}/historico`).then(async (res) => {
      if (!res.ok || !ativo) return;
      const lista = await res.json() as typeof historico;
      if (ativo && Array.isArray(lista)) setHistorico(lista);
    });
    return () => { ativo = false; };
  }, [alteracao.id]);

  async function marcarCiente() {
    setEnviandoCiencia(true);
    const resultado = await onCiencia();
    setEnviandoCiencia(false);
    toast(resultado.ok ? 'Ciência registrada.' : (resultado.mensagem || 'Não foi possível registrar ciência.'), resultado.ok ? 'success' : 'danger');
  }

  async function registrarDivergencia() {
    if (!textoDivergencia.trim()) {
      toast('Descreva a divergência observada.', 'warning');
      return;
    }
    setEnviandoDivergencia(true);
    const resultado = await onDivergencia(textoDivergencia.trim());
    setEnviandoDivergencia(false);
    if (resultado.ok) {
      setTextoDivergencia('');
      setDivergenciaAberta(false);
      toast('Divergência registrada sem alterar o lançamento original.', 'success');
    } else toast(resultado.mensagem || 'Não foi possível registrar a divergência.', 'danger');
  }

  const ciente = !!(alteracao.ciencia || alteracao.ciente_por);

  return (
    <div className="drawer open">
      <div className="drawer-overlay" onClick={onFechar} />
      <aside className="drawer-content" role="dialog" aria-modal="true" aria-label="Detalhes da alteração">
        <header className="drawer-header">
          <div className="drawer-title-area"><h2>{alteracao.tipo}</h2><p>{alteracao.unidade} · {alteracao.turno} · {rotuloPeriodo(alteracao)}</p></div>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </header>
        <div className="drawer-body">
          <div className="alteracoes-detalhe-topo">
            <span className={classeSituacao(alteracao.situacao)}><span className="status-dot" />{alteracao.situacao}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onImprimir}><Printer /> Imprimir registro</button>
          </div>

          <section className="drawer-section"><h3><UserRound /> Efetivo</h3><dl className="drawer-dl"><dt>Policial afetado</dt><dd><strong>{alteracao.policial_nome || 'Não informado'}</strong>{alteracao.policial_matricula ? ` · Mat. ${alteracao.policial_matricula}` : ''}</dd><dt>Substituto</dt><dd>{alteracao.substituto_nome || 'Não informado'}{alteracao.substituto_matricula ? ` · Mat. ${alteracao.substituto_matricula}` : ''}</dd><dt>Motivo</dt><dd>{alteracao.motivo || '—'}</dd></dl></section>

          <section className="drawer-section"><h3><FileText /> Período e documentação</h3><dl className="drawer-dl"><dt>Período</dt><dd>{rotuloPeriodo(alteracao)}</dd><dt>SEI/documento</dt><dd>{alteracao.numero_sei || alteracao.documento || '—'}</dd><dt>Observação</dt><dd>{alteracao.observacao || '—'}</dd></dl></section>

          <section className="drawer-section"><h3><AlertTriangle /> Situação projetada</h3>{alteracao.impacto ? <><div className="alteracoes-impacto-metricas"><div className="panel-subsection"><strong>{alteracao.impacto.dias_corridos ?? '—'}</strong><span className="texto-auxiliar">dias corridos</span></div><div className="panel-subsection"><strong>{alteracao.impacto.servicos_atingidos ?? 0}</strong><span className="texto-auxiliar">serviços 24x72 atingidos</span></div></div><dl className="drawer-dl alteracoes-impacto-dl"><dt>Serviços atingidos</dt><dd>{alteracao.impacto.datas_servicos?.length ? alteracao.impacto.datas_servicos.map(dataBr).join(' · ') : 'Nenhum serviço projetado'}</dd><dt>Próximo serviço</dt><dd>{dataBr(alteracao.impacto.proximo_servico)}</dd></dl></> : <p className="panel-nota">O cálculo de impacto estará disponível após a composição da unidade ser informada.</p>}</section>

          <section className="drawer-section"><h3><ShieldCheck /> Ciência</h3>{ciente ? <div className="panel-nota"><CheckCircle2 /> Ciente por <strong>{alteracao.ciencia?.nome || alteracao.ciencia?.usuario || alteracao.ciente_por}</strong> em {dataHoraBr(alteracao.ciencia?.data_hora || alteracao.ciencia?.criado_em || alteracao.ciente_em)}</div> : <div className="acoes-linha"><span className="texto-auxiliar">Ainda sem ciência registrada para este turno.</span>{podeCiencia && <button type="button" className="btn btn-primary btn-sm" onClick={() => void marcarCiente()} disabled={enviandoCiencia}><CheckCircle2 /> Marcar como ciente</button>}</div>}</section>

          {podeDivergencia && <section className="drawer-section"><h3><MessageSquareWarning /> Divergência</h3>{!divergenciaAberta ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDivergenciaAberta(true)}>Informar divergência</button> : <div className="form-group"><label htmlFor="alteracao-divergencia">Relato da divergência</label><textarea id="alteracao-divergencia" rows={4} value={textoDivergencia} onChange={(e) => setTextoDivergencia(e.target.value)} placeholder="Ex.: substituto não compareceu ao serviço." /><div className="form-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDivergenciaAberta(false)}>Cancelar</button><button type="button" className="btn btn-primary btn-sm" disabled={enviandoDivergencia} onClick={() => void registrarDivergencia()}>Registrar</button></div></div>}{(alteracao.divergencias || []).length > 0 && <div className="alteracoes-divergencias-lista">{alteracao.divergencias?.map((item, index) => <div className="panel-nota" key={item.id || `${item.criado_em}-${index}`}><strong>{item.descricao || item.texto || item.motivo || item.observacao}</strong><br /><span className="texto-auxiliar">{item.criado_por_nome || item.autor || item.usuario || item.criado_por || 'Usuário'} · {dataHoraBr(item.criado_em)}</span></div>)}</div>}</section>}

          <section className="drawer-section"><h3><ShieldCheck /> Histórico administrativo</h3>{historico.length ? <div className="alteracoes-divergencias-lista">{historico.map((item) => <div className="panel-nota" key={item.id}><strong>{item.acao}</strong><br /><span className="texto-auxiliar">{item.usuario_nome} · {dataHoraBr(item.criado_em)}</span></div>)}</div> : <p className="texto-auxiliar">Nenhuma movimentação adicional registrada.</p>}</section>

          <p className="texto-auxiliar alteracoes-detalhe-auditoria">Criado por {alteracao.criado_por || '—'} em {dataHoraBr(alteracao.criado_em)} · Atualizado por {alteracao.atualizado_por || alteracao.criado_por || '—'} em {dataHoraBr(alteracao.atualizado_em || alteracao.criado_em)}</p>
        </div>
        <footer className="drawer-footer"><button type="button" className="btn btn-secondary drawer-acao-fechar" onClick={onFechar}>Fechar</button></footer>
      </aside>
    </div>
  );
}
