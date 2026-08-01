import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, FileText, FileStack } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { janela24h } from '../../../lib/janelaCartao';
import { Carregando } from '../../../components/estado/Carregando';
import {
  filtrarPorConteudo,
  agruparPorRecorte,
  ROTULO_CONTEUDO,
  ROTULO_RECORTE,
  type ConteudoCartao,
  type RecorteCartao,
} from '../cartao/pdf/geracaoCartao';

type TipoSaida = 'individual' | 'consolidado';

const OPCOES_CONTEUDO: ConteudoCartao[] = ['ordinario', 'reforco', 'completo'];
const OPCOES_RECORTE: RecorteCartao[] = ['viatura', 'companhia', 'geral'];

/**
 * Central de Impressão — concentra as saídas oficiais do Cartão Programa num
 * lugar só (Item D da especificação). Só as saídas 1 (Cartão individual) e 2
 * (Consolidado do dia) existem por ora: o SGO não tem os dados de efetivo
 * previsto/disponível/indisponível nem guarnição completa por viatura que as
 * saídas 3-5 exigiriam.
 *
 * Esta entrega é o "shell" navegável — filtros, seleção de data e seleção
 * múltipla já funcionam de ponta a ponta. A pré-visualização com a folha real
 * de impressão (CabecalhoImpressao + Saída 1/2) entra no próximo lote, mesmo
 * padrão faseado usado na tela cheia do Cartão (Lote 7 → Lote 8).
 */
export default function ImpressaoPage() {
  const [searchParams] = useSearchParams();
  const cartaoIdInicial = searchParams.get('cartao');

  const [data, setData] = useState('');
  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const [tipoSaida, setTipoSaida] = useState<TipoSaida>('individual');
  const [conteudo, setConteudo] = useState<ConteudoCartao>('ordinario');
  const [recorte, setRecorte] = useState<RecorteCartao>('viatura');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const carregarPorId = useCallback(async (id: string) => {
    setCarregando(true);
    setNaoEncontrado(false);
    try {
      const res = await apiFetch(`/api/cartoes/${id}`);
      if (!res.ok) throw new Error('não encontrado');
      const dados = (await res.json()) as CartaoDetalhado;
      setCartao(dados);
      setData(dados.data || '');
    } catch {
      setCartao(null);
      setNaoEncontrado(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarPorData = useCallback(async (dataAlvo: string) => {
    if (!dataAlvo) {
      setCartao(null);
      return;
    }
    setCarregando(true);
    setNaoEncontrado(false);
    try {
      const res = await apiFetch(`/api/cartoes?data=${dataAlvo}`);
      const lista = (await res.json()) as { id: string }[];
      if (!Array.isArray(lista) || lista.length === 0) {
        setCartao(null);
        setNaoEncontrado(true);
        return;
      }
      const resDetalhe = await apiFetch(`/api/cartoes/${lista[0].id}`);
      const dados = (await resDetalhe.json()) as CartaoDetalhado;
      setCartao(dados);
    } catch {
      setCartao(null);
      setNaoEncontrado(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  // ?cartao=<id> (atalho da tela cheia do Cartão) tem prioridade na primeira carga.
  useEffect(() => {
    if (cartaoIdInicial) {
      void carregarPorId(cartaoIdInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cartaoIdInicial) void carregarPorData(data);
  }, [data, cartaoIdInicial, carregarPorData]);

  const grupos =
    cartao && tipoSaida === 'individual'
      ? agruparPorRecorte(filtrarPorConteudo(cartao.viaturas, conteudo), recorte)
      : [];

  // Toda vez que a lista de grupos muda (troca de cartão/conteúdo/recorte),
  // a seleção recomeça com tudo marcado — é o caminho mais comum (imprimir tudo).
  useEffect(() => {
    setSelecionados(new Set(grupos.map((g) => g.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartao?.id, tipoSaida, conteudo, recorte]);

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Printer />
            <h2>Central de Impressão</h2>
          </div>
        </div>

        <div className="form-group" style={{ padding: '0 20px 20px' }}>
          <label htmlFor="impressao-data">Data do Cartão Programa</label>
          <input
            type="date" id="impressao-data" value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><FileText /><h2>Tipo de Saída</h2></div>
        </div>
        <div className="report-filters" style={{ padding: '0 20px 20px' }}>
          <div className="dia-switch" role="radiogroup" aria-label="Tipo de saída">
            <button
              type="button" className={`dia-opcao${tipoSaida === 'individual' ? ' ativo' : ''}`}
              aria-pressed={tipoSaida === 'individual'} onClick={() => setTipoSaida('individual')}
            >
              Cartão Individual
            </button>
            <button
              type="button" className={`dia-opcao${tipoSaida === 'consolidado' ? ' ativo' : ''}`}
              aria-pressed={tipoSaida === 'consolidado'} onClick={() => setTipoSaida('consolidado')}
            >
              Consolidado do Dia
            </button>
          </div>
        </div>

        {tipoSaida === 'individual' && (
          <div className="report-filters" style={{ padding: '0 20px 20px' }}>
            <div className="filter-group">
              <label htmlFor="impressao-conteudo">Conteúdo</label>
              <select id="impressao-conteudo" value={conteudo} onChange={(e) => setConteudo(e.target.value as ConteudoCartao)}>
                {OPCOES_CONTEUDO.map((c) => <option key={c} value={c}>{ROTULO_CONTEUDO[c]}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="impressao-recorte">Recorte</label>
              <select id="impressao-recorte" value={recorte} onChange={(e) => setRecorte(e.target.value as RecorteCartao)}>
                {OPCOES_RECORTE.map((r) => <option key={r} value={r}>{ROTULO_RECORTE[r]}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><FileStack /><h2>Pré-visualização</h2></div>
        </div>

        {carregando ? (
          <Carregando mensagem="Carregando Cartão Programa..." />
        ) : naoEncontrado ? (
          <p style={{ padding: '0 20px 20px', color: 'var(--text-muted)' }}>
            Nenhum Cartão Programa lançado para esta data.
          </p>
        ) : !cartao ? (
          <p style={{ padding: '0 20px 20px', color: 'var(--text-muted)' }}>
            Selecione uma data com Cartão Programa lançado.
          </p>
        ) : (
          <div style={{ padding: '0 20px 20px' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
              {janela24h(cartao.data)} — Nº {cartao.numero ? `${String(cartao.numero).padStart(6, '0')}/${cartao.ano}` : 'sem numeração'}
            </p>

            {tipoSaida === 'consolidado' ? (
              <p>Documento único com todas as {cartao.viaturas.length} viatura(s) do dia.</p>
            ) : (
              <ul className="cp-geracao-lista" style={{ listStyle: 'none', padding: 0 }}>
                {grupos.map((g) => (
                  <li key={g.id} className="cp-geracao-item">
                    <label className="checkbox-inline">
                      <input
                        type="checkbox" checked={selecionados.has(g.id)}
                        onChange={() => alternarSelecao(g.id)}
                      />
                      <span className="cp-geracao-identificacao">
                        <strong>{g.titulo}</strong>
                        <span>{g.subtitulo}</span>
                      </span>
                    </label>
                  </li>
                ))}
                {grupos.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhuma viatura para este conteúdo.</p>}
              </ul>
            )}

            <p style={{ marginTop: 16, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              A folha de impressão com o padrão institucional (saídas 1 e 2) chega no próximo lote.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
