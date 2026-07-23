import { useEffect, useState } from 'react';
import { History, FolderOpen } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

interface CartaoResumo {
  id: string;
  data: string;
  fiscal: string | null;
  adjunto: string | null;
  qtd_viaturas: number;
}

interface CartoesRecentesProps {
  dataSelecionada: string;
  onAbrir: (data: string) => void;
}

// Últimos 5 cartões anteriores à data selecionada — espelha renderHistoricoRecente().
export function CartoesRecentes({ dataSelecionada, onAbrir }: CartoesRecentesProps) {
  const [lista, setLista] = useState<CartaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function buscar() {
      setCarregando(true);
      try {
        const res = await apiFetch('/api/cartoes');
        const dados = (await res.json()) as CartaoResumo[];
        if (!cancelado) setLista(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error('Erro ao carregar histórico de cartões:', erro);
        if (!cancelado) setLista([]);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      cancelado = true;
    };
    // Refaz a busca a cada troca de data — mesmo gatilho do app antigo (chamada
    // ao fim de todo renderCartaoTab()), pra refletir cartões criados/apagados.
  }, [dataSelecionada]);

  const recentes = (dataSelecionada ? lista.filter((c) => c.data < dataSelecionada) : lista).slice(0, 5);

  return (
    <div id="cartao-historico-recente" className="panel cartao-historico-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title">
          <History />
          <h2>Cartões Recentes</h2>
        </div>
      </div>
      <div className="table-responsive">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Fiscal de Operações</th>
              <th>Adjunto</th>
              <th className="text-center">Viaturas</th>
              <th className="text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? null : recentes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  Nenhum Cartão Programa anterior lançado.
                </td>
              </tr>
            ) : (
              recentes.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.data.split('-').reverse().join('/')}</strong></td>
                  <td>{c.fiscal || '-'}</td>
                  <td>{c.adjunto || '-'}</td>
                  <td className="text-center">{c.qtd_viaturas}</td>
                  <td className="text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => onAbrir(c.data)}>
                      <FolderOpen /> Abrir
                    </button>
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
