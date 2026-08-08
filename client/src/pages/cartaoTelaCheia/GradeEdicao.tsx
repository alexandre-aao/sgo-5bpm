import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { CartaoDetalhado, CartaoViatura } from '../../lib/cartaoConflitos';
import { formatHoraCartao } from '../../lib/cartaoConflitos';
import { marcarViradaDeDia } from '../../lib/janelaCartao';
import { useToast } from '../../context/useToast';
import { useItensRoteiro, type ItemPayload } from '../modulos/cartao/useItensRoteiro';
import { ATIVIDADES_CARTAO, atividadeBadgeClass } from '../modulos/cartao/constantes';

interface GradeEdicaoProps {
  cartao: CartaoDetalhado;
  podeEditar: boolean;
  recarregar: () => Promise<void>;
}

const ITEM_VAZIO: ItemPayload = { inicio: '', fim: '', local: '', atividade: ATIVIDADES_CARTAO[0] };

/**
 * Modo Edição (desktop): colunas fixas horário → local/bairro → missão →
 * efetivo, uma seção por viatura, com rolagem horizontal em vez de comprimir
 * coluna. "Efetivo" não existe no item de roteiro — mostra o comandante da
 * viatura (repetido em cada linha da seção), nunca inventa campo novo no JSONB.
 * Edição inline tem o mesmo alcance de ViaturaRoteiroCard (incluir/remover
 * item, mudar missão) — não introduz edição de horário/local de item existente.
 */
export function GradeEdicao({ cartao, podeEditar, recarregar }: GradeEdicaoProps) {
  const { toast } = useToast();
  const { adicionarItem, removerItem, atualizarAtividade } = useItensRoteiro(cartao, recarregar);

  const [editando, setEditando] = useState<{ vtrId: string; itemId: string } | null>(null);
  const [missaoEmEdicao, setMissaoEmEdicao] = useState('');
  const [novoItemPorVtr, setNovoItemPorVtr] = useState<Record<string, ItemPayload>>({});

  function itemEmEdicao(vtrId: string): ItemPayload {
    return novoItemPorVtr[vtrId] || ITEM_VAZIO;
  }

  function atualizarNovoItem(vtrId: string, patch: Partial<ItemPayload>) {
    setNovoItemPorVtr((atual) => ({ ...atual, [vtrId]: { ...itemEmEdicao(vtrId), ...patch } }));
  }

  async function handleIncluir(vtr: CartaoViatura) {
    const item = itemEmEdicao(vtr.id);
    if (!item.inicio || !item.local.trim()) {
      toast('Informe pelo menos o horário de início e o local.', 'warning');
      return;
    }
    const resultado = await adicionarItem(vtr.id, { ...item, local: item.local.trim() });
    if (resultado.ok) {
      toast('Item incluído no roteiro.', 'success');
      setNovoItemPorVtr((atual) => ({ ...atual, [vtr.id]: ITEM_VAZIO }));
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleRemover(vtrId: string, itemId: string) {
    const resultado = await removerItem(vtrId, itemId);
    toast(resultado.ok ? 'Item removido do roteiro.' : resultado.mensagem, resultado.ok ? 'info' : 'danger');
  }

  async function handleSalvarMissao(vtrId: string, itemId: string) {
    const resultado = await atualizarAtividade(vtrId, itemId, missaoEmEdicao);
    if (resultado.ok) {
      toast('Missão atualizada.', 'success');
      setEditando(null);
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="ctc-grade-lista">
      {cartao.viaturas.map((vtr) => (
        <section className="ctc-grade-secao" key={vtr.id}>
          <h3 className="ctc-grade-titulo">VTR {vtr.prefixo} — {vtr.setor}</h3>

          <div className="ctc-grade-scroll">
            <table className="ctc-grade">
              <thead>
                <tr>
                  <th className="ctc-col-horario">Horário</th>
                  <th className="ctc-col-local">Local / Bairro</th>
                  <th className="ctc-col-missao">Missão</th>
                  <th className="ctc-col-efetivo">Efetivo</th>
                  {podeEditar && <th className="ctc-col-acoes"></th>}
                </tr>
              </thead>
              <tbody>
                {vtr.itens.length === 0 ? (
                  <tr>
                    <td className="ctc-vazio-linha" colSpan={podeEditar ? 5 : 4}>Sem itens de roteiro.</td>
                  </tr>
                ) : (
                  marcarViradaDeDia(vtr.itens, cartao.data || '').map((entrada) => {
                    if (entrada.tipo === 'virada') {
                      return (
                        <tr className="ctc-virada" key={`virada-${vtr.id}`}>
                          <td colSpan={podeEditar ? 5 : 4}>{entrada.rotulo}</td>
                        </tr>
                      );
                    }

                    const item = entrada.item;
                    const emEdicao = editando?.vtrId === vtr.id && editando?.itemId === item.id;
                    return (
                      <tr key={item.id}>
                        <td className="ctc-col-horario">
                          {formatHoraCartao(item.inicio)}{item.fim ? ` às ${formatHoraCartao(item.fim)}` : ''}
                        </td>
                        <td className="ctc-col-local">{item.local}</td>
                        <td className="ctc-col-missao">
                          {emEdicao ? (
                            <select value={missaoEmEdicao} onChange={(e) => setMissaoEmEdicao(e.target.value)}>
                              {ATIVIDADES_CARTAO.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                          ) : (
                            <span className={`badge ${atividadeBadgeClass(item.atividade)}`}>{item.atividade}</span>
                          )}
                        </td>
                        <td className="ctc-col-efetivo">{vtr.comandante || '—'}</td>
                        {podeEditar && (
                          <td className="ctc-col-acoes">
                            {emEdicao ? (
                              <>
                                <button className="btn-icon btn-sm" title="Salvar missão" aria-label="Salvar missão" onClick={() => handleSalvarMissao(vtr.id, item.id)}>
                                  <Check />
                                </button>
                                <button className="btn-icon btn-sm" title="Cancelar" aria-label="Cancelar" onClick={() => setEditando(null)}>
                                  <X />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn-icon btn-sm" title="Mudar missão" aria-label="Mudar missão"
                                  onClick={() => { setMissaoEmEdicao(item.atividade); setEditando({ vtrId: vtr.id, itemId: item.id }); }}
                                >
                                  <Pencil />
                                </button>
                                <button className="btn-icon btn-sm" title="Remover item" aria-label="Remover item" onClick={() => handleRemover(vtr.id, item.id)}>
                                  <Trash2 />
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {podeEditar && (
            <div className="ctc-grade-form">
              <input
                type="time" aria-label="Início" value={itemEmEdicao(vtr.id).inicio}
                onChange={(e) => atualizarNovoItem(vtr.id, { inicio: e.target.value })}
              />
              <input
                type="time" aria-label="Fim" value={itemEmEdicao(vtr.id).fim}
                onChange={(e) => atualizarNovoItem(vtr.id, { fim: e.target.value })}
              />
              <input
                type="text" aria-label="Local / Itinerário" placeholder="Local / Itinerário"
                value={itemEmEdicao(vtr.id).local}
                onChange={(e) => atualizarNovoItem(vtr.id, { local: e.target.value })}
              />
              <select
                aria-label="Missão" value={itemEmEdicao(vtr.id).atividade}
                onChange={(e) => atualizarNovoItem(vtr.id, { atividade: e.target.value })}
              >
                {ATIVIDADES_CARTAO.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleIncluir(vtr)}>
                <Plus style={{ width: 14, height: 14 }} /> Incluir
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
