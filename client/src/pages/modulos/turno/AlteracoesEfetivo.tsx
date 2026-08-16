import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, RefreshCcw, Users } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../context/useToast';

interface AlteracaoTurno {
  id: string;
  policial_nome: string;
  policial_matricula?: string | null;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  substituto_nome?: string | null;
  projecao: { servicosAfetados: string[]; quantidadeServicosAfetados: number; proximoServicoProjetado?: string | null };
  ciencias?: { usuario: string }[];
}
interface UnidadeTurno {
  unidade: string;
  composicao: { qtd_viaturas_previstas: number; policiais_por_viatura: number; qtd_extras: number } | null;
  alteracoes: AlteracaoTurno[];
  resumo: { totalPrevisto: number; permutas: number; ausenciasSemSubstituicao: number; viaturasCompletasPossiveis: number; policiaisRemanescentes: number } | null;
}

const dataBr = (valor?: string | null) => valor ? valor.split('-').reverse().join('/') : '—';

export function AlteracoesEfetivo({ data }: { data: string }) {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [unidades, setUnidades] = useState<UnidadeTurno[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const turno = '24H';

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const res = await apiFetch(`/api/alteracoes-servico/resumo?data=${encodeURIComponent(data)}&turno=${turno}`);
      if (!res.ok) throw new Error('Não foi possível consultar as alterações de efetivo.');
      const corpo = await res.json() as { unidades?: UnidadeTurno[] };
      setUnidades(Array.isArray(corpo.unidades) ? corpo.unidades : []);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao carregar alterações.');
    } finally {
      setCarregando(false);
    }
  }, [data]);

  // A troca da data do Meu Turno precisa reiniciar e sincronizar a consulta remota.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar(); }, [carregar]);

  async function marcarCiencia(alteracao: AlteracaoTurno) {
    const res = await apiFetch(`/api/alteracoes-servico/${alteracao.id}/ciencia`, { method: 'POST' });
    if (!res.ok) return toast('Não foi possível registrar a ciência.', 'danger');
    toast('Ciência registrada.', 'success');
    await carregar();
  }

  async function informarDivergencia(alteracao: AlteracaoTurno) {
    const descricao = window.prompt('Descreva objetivamente a divergência observada:');
    if (!descricao?.trim()) return;
    const res = await apiFetch(`/api/alteracoes-servico/${alteracao.id}/divergencias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descricao: descricao.trim() }),
    });
    if (!res.ok) return toast('Não foi possível registrar a divergência.', 'danger');
    toast('Divergência vinculada ao registro original.', 'success');
    await carregar();
  }

  return (
    <section className="panel alteracoes-turno-panel" aria-labelledby="alteracoes-efetivo-titulo">
      <div className="panel-header">
        <div><h3 id="alteracoes-efetivo-titulo"><RefreshCcw /> Alterações de Efetivo</h3><p>Projeção baseada na composição e nas alterações informadas pelas Sargenteações.</p></div>
      </div>
      {carregando && <p className="turno-vazio">Consultando as unidades...</p>}
      {erro && <div className="alert-box danger"><AlertTriangle /><span>{erro}</span><button className="btn btn-secondary btn-sm" onClick={() => void carregar()}>Tentar novamente</button></div>}
      {!carregando && !erro && (
        <div className="alteracoes-turno-grid">
          {unidades.map((grupo) => (
            <article className="alteracoes-unidade-card" key={grupo.unidade}>
              <header><div><h4>{grupo.unidade}</h4><span>Composição informada pela unidade</span></div><Users /></header>
              {!grupo.composicao || !grupo.resumo ? (
                <p className="turno-vazio">Sem composição informada para este turno.</p>
              ) : (
                <>
                  <div className="alteracoes-resumo-linha"><span>Previsto</span><strong>{grupo.composicao.qtd_viaturas_previstas} viaturas / {grupo.resumo.totalPrevisto} policiais</strong></div>
                  <div className="alteracoes-resumo-linha"><span>Alterações</span><strong>{grupo.alteracoes.length} · {grupo.resumo.permutas} permuta(s)</strong></div>
                  <div className="alteracoes-resumo-linha"><span>Sem substituição</span><strong>{grupo.resumo.ausenciasSemSubstituicao}</strong></div>
                  <div className="situacao-projetada"><span>Situação projetada</span><strong>{grupo.resumo.viaturasCompletasPossiveis} viaturas completas + {grupo.resumo.policiaisRemanescentes} policiais disponíveis</strong></div>
                </>
              )}
              <div className="alteracoes-individuais">
                {grupo.alteracoes.map((alteracao) => {
                  const ciente = alteracao.ciencias?.some((item) => item.usuario === usuario?.usuario);
                  return (
                    <div className="alteracao-individual" key={alteracao.id}>
                      <div><strong>{alteracao.policial_nome}</strong><span className="badge">{alteracao.tipo}</span></div>
                      <p>Período: {dataBr(alteracao.data_inicio)} a {dataBr(alteracao.data_fim)}</p>
                      <p>Serviço atual afetado: <strong>SIM</strong> · Serviços projetados: {alteracao.projecao.servicosAfetados.map(dataBr).join(', ') || '—'}</p>
                      <p>Substituto: {alteracao.substituto_nome || 'não informado'}</p>
                      {['Adjunto', 'Oficial'].includes(usuario?.role || '') && (
                        <div className="acoes-linha">
                          <button className="btn btn-secondary btn-sm" disabled={ciente} onClick={() => void marcarCiencia(alteracao)}><Check /> {ciente ? 'Ciente' : 'Marcar como ciente'}</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => void informarDivergencia(alteracao)}><AlertTriangle /> Informar divergência</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
