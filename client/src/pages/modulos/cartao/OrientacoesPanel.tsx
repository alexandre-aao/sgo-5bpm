import { useState, type FormEvent } from 'react';
import { ClipboardList, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import { useOrientacoesCartao } from '../../../hooks/useOrientacoesCartao';
import type { TipoCartao } from '../../../lib/cartaoConflitos';

/** Gestão das orientações permanentes da P3 (P3-only). Elas aparecem no bloco de
 * observações da VIATURA, no cartão e no PDF — nunca na linha do roteiro. Controle só
 * por ativo/inativo, sem vigência por data: desativar tira de todos os cartões na hora,
 * inclusive nas reimpressões.
 *
 * Fica como painel colapsável dentro do Cartão Programa (mesmo padrão de "Gerenciar
 * Bairros" no Mapa) em vez de virar aba própria — não gasta espaço no menu nem um dos
 * 4 destinos da barra inferior do mobile. */
export function OrientacoesPanel() {
  const { toast } = useToast();
  const { orientacoes, carregando, criar, atualizar, excluir } = useOrientacoesCartao();
  const [texto, setTexto] = useState('');
  const [tipoCartao, setTipoCartao] = useState<'' | TipoCartao>('');
  const [enviando, setEnviando] = useState(false);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    const resultado = await criar({ texto: texto.trim(), tipo_cartao: tipoCartao || null, ativo: true });
    setEnviando(false);
    if (resultado.ok) {
      toast('Orientação incluída.', 'success');
      setTexto('');
      setTipoCartao('');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleAlternarAtivo(id: string, ativoAtual: boolean) {
    const resultado = await atualizar(id, { ativo: !ativoAtual });
    if (resultado.ok) {
      toast(ativoAtual ? 'Orientação desativada — sai dos cartões.' : 'Orientação ativada.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleExcluir(id: string) {
    if (!window.confirm('Excluir esta orientação definitivamente? Para apenas tirá-la dos cartões, use "desativar".')) return;
    const resultado = await excluir(id);
    if (resultado.ok) {
      toast('Orientação excluída.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  function rotuloEscopo(tipo: string | null): string {
    if (tipo === 'padrao') return 'Só ordinário';
    if (tipo === 'reforco') return 'Só reforço';
    return 'Ordinário e reforço';
  }

  return (
    <div className="panel cartao-historico-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title">
          <ClipboardList />
          <h2>Orientações Permanentes da P3</h2>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Aparecem no bloco de observações de cada viatura, no cartão e no PDF. Desativar tira de todos os cartões.
        </p>
      </div>

      <form className="styled-form" style={{ paddingTop: 8 }} onSubmit={handleCriar}>
        <div className="form-row">
          <div className="form-group col-md-8">
            <label htmlFor="orientacao-texto">Texto da orientação *</label>
            <input
              type="text" id="orientacao-texto" required maxLength={500}
              placeholder="Ex: Informar ao COPOM toda entrada e saída de setor."
              value={texto} onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="orientacao-tipo">Aplica-se a</label>
            <select id="orientacao-tipo" value={tipoCartao} onChange={(e) => setTipoCartao(e.target.value as '' | TipoCartao)}>
              <option value="">Ordinário e reforço</option>
              <option value="padrao">Só ordinário</option>
              <option value="reforco">Só reforço</option>
            </select>
          </div>
          <div className="form-group col-md-1" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Plus /> Incluir
            </button>
          </div>
        </div>
      </form>

      <div className="table-responsive">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Orientação</th>
              <th>Aplica-se a</th>
              <th className="text-center">Situação</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? null : orientacoes.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  Nenhuma orientação cadastrada.
                </td>
              </tr>
            ) : (
              orientacoes.map((o) => (
                <tr key={o.id} style={o.ativo ? undefined : { opacity: 0.55 }}>
                  <td>{o.texto}</td>
                  <td>{rotuloEscopo(o.tipo_cartao)}</td>
                  <td className="text-center">
                    <span className={`badge-diaria ${o.ativo ? 'tem-diaria' : 'sem-diaria'}`}>
                      {o.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="acoes-linha">
                      <button
                        className="btn-icon"
                        title={o.ativo ? 'Desativar' : 'Ativar'}
                        aria-label={o.ativo ? 'Desativar orientação' : 'Ativar orientação'}
                        onClick={() => void handleAlternarAtivo(o.id, o.ativo)}
                      >
                        {o.ativo ? <ToggleRight /> : <ToggleLeft />}
                      </button>
                      <button
                        className="btn-icon btn-icon-danger" title="Excluir" aria-label="Excluir orientação"
                        onClick={() => void handleExcluir(o.id)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
