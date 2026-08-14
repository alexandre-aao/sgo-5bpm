import { useState, type FormEvent } from 'react';
import { Calculator, ClipboardPaste, Minus, Plus, TriangleAlert, Wallet, X } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { useToast } from '../../../context/useToast';
import { SeletorMilitares } from './SeletorMilitares';
import type { ResultadoAcao } from './useOperacaoDrawer';
import {
  ESCOPOS,
  TETO_DIARIAS_MILITAR_MES,
  calcularImpacto,
  chaveMilitar,
  operacoesDoEscopo,
  resolverMatriculasColadas,
  rotuloMes,
  type EscopoReplicacao,
  type MilitarDoLote,
  type OperacaoDoGrupo,
} from '../../../lib/escalaLote';

interface FormEscalarMilitarProps {
  operacao: Tables<'operacoes'>;
  pessoal: Tables<'pessoal'>[];
  operacoesTodas: Tables<'operacoes'>[];
  escalasTodas: Tables<'escalas'>[];
  cotaMensal: number;
  /** Ocorrências do grupo de recorrência, ou null se a operação é avulsa. */
  grupo: OperacaoDoGrupo[] | null;
  onEscalarLote: (operacaoIds: string[], militares: MilitarDoLote[]) => Promise<ResultadoAcao>;
  onFechar: () => void;
}

// "Escalar Efetivo": inclusão em LOTE (N militares de uma vez) com replicação para as
// demais ocorrências do grupo de recorrência. Substituiu o formulário unitário — um
// militar por confirmação —, que obrigava a repetir o fluxo inteiro por pessoa e por
// ocorrência: escalar 3 militares num grupo de 26 dias eram 78 confirmações.
export function FormEscalarMilitar({
  operacao,
  pessoal,
  operacoesTodas,
  escalasTodas,
  cotaMensal,
  grupo,
  onEscalarLote,
  onFechar,
}: FormEscalarMilitarProps) {
  const { toast } = useToast();
  const [selecionados, setSelecionados] = useState<MilitarDoLote[]>([]);
  const [aparicoesPadrao, setAparicoesPadrao] = useState('1');
  const [escopo, setEscopo] = useState<EscopoReplicacao>('somente_esta');
  const [colarAberto, setColarAberto] = useState(false);
  const [textoColado, setTextoColado] = useState('');
  const [naoEncontradas, setNaoEncontradas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const padrao = Math.max(1, parseInt(aparicoesPadrao, 10) || 1);
  const temGrupo = !!grupo && grupo.length > 1;
  const operacoesAlvo = operacoesDoEscopo(temGrupo ? grupo : null, operacao, escopo);
  const impacto = calcularImpacto(operacoesAlvo, selecionados, escalasTodas, operacoesTodas, cotaMensal);

  function adicionar(militar: MilitarDoLote) {
    setSelecionados((atual) => (atual.some((m) => m.chave === militar.chave) ? atual : [...atual, militar]));
  }

  function adicionarPessoa(p: Tables<'pessoal'>) {
    adicionar({
      chave: chaveMilitar(p.matricula, p.nome),
      militar_id: (p.matricula || '').trim(),
      militar_nome: p.nome,
      qtd_aparicoes: padrao,
      total_diarias: 2,
    });
  }

  function adicionarLivre(nome: string) {
    adicionar({ chave: chaveMilitar('', nome), militar_id: '', militar_nome: nome, qtd_aparicoes: padrao, total_diarias: 2 });
  }

  function remover(chave: string) {
    setSelecionados((atual) => atual.filter((m) => m.chave !== chave));
  }

  function mudarAparicoes(chave: string, valor: string) {
    const qtd = Math.max(1, parseInt(valor, 10) || 1);
    setSelecionados((atual) => atual.map((m) => (m.chave === chave ? { ...m, qtd_aparicoes: qtd } : m)));
  }

  function mudarDiarias(chave: string, valor: number) {
    const qtd = Math.max(0, Math.trunc(valor));
    setSelecionados((atual) => atual.map((m) => (m.chave === chave ? { ...m, total_diarias: qtd } : m)));
  }

  function handleResolverColados() {
    const { encontrados, naoEncontradas: faltantes } = resolverMatriculasColadas(textoColado, pessoal);
    encontrados.forEach(adicionarPessoa);
    setNaoEncontradas(faltantes);
    if (encontrados.length > 0) {
      toast(`${encontrados.length} militar(es) adicionado(s) da lista colada.`, 'success');
      setTextoColado('');
    } else {
      toast('Nenhuma matrícula da lista foi encontrada no cadastro.', 'warning');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selecionados.length === 0) {
      toast('Adicione ao menos um militar.', 'danger');
      return;
    }
    if (operacoesAlvo.length === 0) {
      toast('Nenhuma ocorrência a escalar: as do escopo escolhido já estão executadas.', 'danger');
      return;
    }
    setEnviando(true);
    const resultado = await onEscalarLote(operacoesAlvo.map((o) => o.id), selecionados);
    setEnviando(false);
    if (resultado.ok) {
      toast(
        operacoesAlvo.length === 1
          ? `${selecionados.length} militar(es) escalado(s).`
          : `${selecionados.length} militar(es) escalado(s) em ${operacoesAlvo.length} ocorrências.`,
        'success',
      );
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  // Executadas ficam de fora da replicação (o servidor as ignora), então mostrar o
  // número aqui evita a tela prometer mais ocorrências do que grava.
  const executadasNoGrupo = temGrupo ? grupo!.filter((o) => o.situacao === 'Executada').length : 0;

  return (
    <div className="sub-form-panel">
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <SeletorMilitares
            pessoal={pessoal}
            chavesSelecionadas={selecionados.map((m) => m.chave)}
            onSelecionar={adicionarPessoa}
            onAdicionarLivre={adicionarLivre}
          />
        </div>

        <div className="form-row">
          <div className="form-group col-md-4">
            <label htmlFor="esc_aparicoes_padrao">Nº Aparições (padrão)</label>
            <input
              type="number" id="esc_aparicoes_padrao" min={1}
              value={aparicoesPadrao} onChange={(e) => setAparicoesPadrao(e.target.value)}
            />
            <span className="texto-auxiliar">Aplicado a quem for adicionado depois; cada militar é editável abaixo.</span>
          </div>
          <div className="form-group col-md-8">
            <label htmlFor="esc_colar">Colar matrículas</label>
            {!colarAberto ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setColarAberto(true)}>
                <ClipboardPaste /> Colar lista de matrículas
              </button>
            ) : (
              <>
                <textarea
                  id="esc_colar" rows={2} placeholder="Ex: 2066181, 2105241, 2271214"
                  value={textoColado} onChange={(e) => setTextoColado(e.target.value)}
                />
                <div className="escala-colar-acoes">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleResolverColados} disabled={!textoColado.trim()}>
                    Resolver matrículas
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setColarAberto(false); setTextoColado(''); setNaoEncontradas([]); }}>
                    Fechar
                  </button>
                </div>
                {naoEncontradas.length > 0 && (
                  <span className="escala-nao-encontradas">
                    <TriangleAlert /> Não encontradas no cadastro: {naoEncontradas.join(', ')}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {selecionados.length > 0 && (
          <div className="escala-chips">
            {selecionados.map((m) => (
              <div className="escala-chip" key={m.chave}>
                <div className="escala-chip-nome">
                  <strong>{m.militar_nome}</strong>
                  <span>{m.militar_id || 'sem matrícula'}</span>
                </div>
                <label className="escala-chip-aparicoes">
                  <span>Aparições</span>
                  <input
                    type="number" min={1} value={m.qtd_aparicoes}
                    aria-label={`Aparições de ${m.militar_nome}`}
                    onChange={(e) => mudarAparicoes(m.chave, e.target.value)}
                  />
                </label>
                <div className="escala-chip-diarias" aria-label={`Diárias de ${m.militar_nome}`}>
                  <span>Diárias</span>
                  <div className="controle-quantidade">
                    <button type="button" aria-label={`Diminuir diárias de ${m.militar_nome}`} onClick={() => mudarDiarias(m.chave, m.total_diarias - 1)} disabled={m.total_diarias === 0}><Minus /></button>
                    <input type="number" min={0} step={1} value={m.total_diarias} onChange={(e) => mudarDiarias(m.chave, Number(e.target.value))} />
                    <button type="button" aria-label={`Aumentar diárias de ${m.militar_nome}`} onClick={() => mudarDiarias(m.chave, m.total_diarias + 1)}><Plus /></button>
                  </div>
                </div>
                <button
                  type="button" className="btn-icon btn-danger btn-sm"
                  aria-label={`Remover ${m.militar_nome} do lote`} title="Remover do lote"
                  onClick={() => remover(m.chave)}
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}

        {temGrupo && (
          <div className="escala-escopo">
            <span className="escala-escopo-rotulo" id="rot-escopo-escala">Aplicar este efetivo a</span>
            <div className="escala-escopo-opcoes" role="radiogroup" aria-labelledby="rot-escopo-escala">
              {ESCOPOS.map((opcao) => (
                <label className={`escala-escopo-opcao${escopo === opcao.valor ? ' ativo' : ''}`} key={opcao.valor}>
                  {/* aria-label explícito: sem ele o leitor anuncia o VALUE
                      ("esta_e_futuras") em vez do rótulo visível. */}
                  <input
                    type="radio" name="escopo-escala" value={opcao.valor}
                    aria-label={`Aplicar a: ${opcao.rotulo}`}
                    checked={escopo === opcao.valor} onChange={() => setEscopo(opcao.valor)}
                  />
                  <span>{opcao.rotulo}</span>
                </label>
              ))}
            </div>
            {executadasNoGrupo > 0 && (
              <span className="texto-auxiliar">
                {executadasNoGrupo} ocorrência(s) já executada(s) do grupo ficam de fora — não são alteradas.
              </span>
            )}
          </div>
        )}

        <div className="calculation-preview">
          <Calculator />
          <span>
            {selecionados.length === 0 ? (
              <>Adicione militares para ver o impacto em diárias.</>
            ) : (
              <>
                Aplicará a <strong>{impacto.totalOperacoes} operação(ões)</strong> ·{' '}
                <strong>{impacto.totalDiarias} diária(s)</strong> ({selecionados.length} militar(es), valor inicial de 2 por escala).
              </>
            )}
          </span>
        </div>

        {selecionados.length > 0 && impacto.porMes.map((m) => (
          <div className={`calculation-preview budget${m.saldoApos < 0 ? ' exceeded' : ''}`} key={m.mes}>
            <Wallet />
            <span>
              {cotaMensal <= 0 ? (
                <>Nenhuma cota mensal definida. Configure no <strong>Planejador de Diárias</strong>.</>
              ) : m.saldoApos < 0 ? (
                <>Atenção: excede a cota de <strong>{rotuloMes(m.mes)}</strong> em <strong>{Math.abs(m.saldoApos)} diária(s)</strong>.</>
              ) : (
                <>Saldo da cota de <strong>{rotuloMes(m.mes)}</strong> após esta escala: <strong>{m.saldoApos}</strong> diária(s).</>
              )}
            </span>
          </div>
        ))}

        {/* Teto por militar: ALERTA, nunca bloqueio — quem decide escalar além disso
            é a P3, e o botão de confirmar segue habilitado. */}
        {impacto.acimaDoTeto.length > 0 && (
          <div className="escala-alerta-teto">
            <TriangleAlert />
            <span>
              Acima de {TETO_DIARIAS_MILITAR_MES} diárias no mês:{' '}
              {impacto.acimaDoTeto.map((m) => `${m.militar_nome} (${m.total_diarias} em ${rotuloMes(m.mes)})`).join('; ')}.
              Isso não impede a confirmação.
            </span>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}>Cancelar</button>
          <button
            type="submit" className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`}
            disabled={enviando || selecionados.length === 0 || operacoesAlvo.length === 0}
          >
            Confirmar Escala
            {selecionados.length > 0 && operacoesAlvo.length > 1 ? ` em ${operacoesAlvo.length} Ocorrências` : ''}
          </button>
        </div>
      </form>
    </div>
  );
}
