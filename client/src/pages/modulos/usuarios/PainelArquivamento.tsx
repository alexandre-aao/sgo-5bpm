import { useState } from 'react';
import { Archive, Download, TriangleAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';
import { ModalConfirmarExclusaoForte } from '../../../components/ModalConfirmarExclusaoForte';

interface Contagens {
  eventos: number;
  operacoes: number;
  escalas: number;
  alocacoes: number;
}

interface ExportPronto {
  ate: string;
  comprovante: string;
  contagens: Contagens;
}

const ROTULOS: Record<keyof Contagens, string> = {
  eventos: 'Eventos',
  operacoes: 'Operações',
  escalas: 'Escalas (efetivo)',
  alocacoes: 'Alocações',
};

function baixarJson(nome: string, conteudo: unknown) {
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Arquivar dados antigos (P3). O banco só cresce, e este é o caminho para
 * recortar histórico consolidado — sempre DEPOIS de baixá-lo.
 *
 * A exclusão só é aceita pelo servidor com o comprovante devolvido pelo export,
 * então não existe caminho de tela que apague sem ter gerado o arquivo. Se algo
 * for cadastrado entre o export e a confirmação, o comprovante deixa de bater e
 * o servidor recusa — é preciso exportar de novo.
 */
export function PainelArquivamento() {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [ate, setAte] = useState('');
  const [previa, setPrevia] = useState<Contagens | null>(null);
  const [exportPronto, setExportPronto] = useState<ExportPronto | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Trocar a data invalida o export anterior: ele vale para um recorte específico.
  function mudarData(valor: string) {
    setAte(valor);
    setPrevia(null);
    setExportPronto(null);
  }

  async function verPrevia() {
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/arquivamento/previa?ate=${encodeURIComponent(ate)}`);
      const corpo = await res.json();
      if (!res.ok) {
        toast(corpo.error || 'Não foi possível calcular a prévia.', 'danger');
        return;
      }
      setPrevia(corpo.contagens as Contagens);
      setExportPronto(null);
    } finally {
      setOcupado(false);
    }
  }

  async function exportar() {
    setOcupado(true);
    try {
      const res = await apiFetch('/api/arquivamento/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ate }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        toast(corpo.error || 'Falha ao gerar o arquivo.', 'danger');
        return;
      }
      baixarJson(`sgo-arquivo-ate-${ate}.json`, corpo);
      setExportPronto({ ate, comprovante: corpo.comprovante, contagens: corpo.contagens });
      toast('Arquivo baixado. Guarde-o antes de arquivar.', 'success');
    } finally {
      setOcupado(false);
    }
  }

  async function executar() {
    if (!exportPronto) return;
    setOcupado(true);
    try {
      const res = await apiFetch('/api/arquivamento/executar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ate: exportPronto.ate, comprovante: exportPronto.comprovante }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        toast(corpo.error || 'Falha ao arquivar.', 'danger');
        return;
      }
      toast('Dados antigos arquivados.', 'success');
      setConfirmando(false);
      setPrevia(null);
      setExportPronto(null);
      setAte('');
    } finally {
      setOcupado(false);
    }
  }

  const total = previa ? Object.values(previa).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="panel">
      <button type="button" className="central-historico-toggle" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        {aberto ? <ChevronDown /> : <ChevronRight />}
        <Archive />
        <span>Arquivar dados antigos</span>
        <small>Baixe o histórico consolidado e remova-o do banco</small>
      </button>

      {aberto && (
        <div className="arquivamento-corpo">
          <p className="texto-auxiliar">
            Remove <strong>eventos, operações, escalas e alocações</strong> anteriores à data de corte.
            O Cartão Programa e todos os cadastros (pessoal, viaturas, bairros, usuários) <strong>não</strong> são
            tocados. A data precisa ser anterior a 6 meses atrás.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="arquivo-ate">Arquivar tudo ANTES de</label>
              <input
                type="date" id="arquivo-ate" value={ate}
                onChange={(e) => mudarData(e.target.value)}
              />
            </div>
            <div className="form-group alinhar-fim">
              <button type="button" className="btn btn-secondary" disabled={!ate || ocupado} onClick={() => void verPrevia()}>
                Ver o que será arquivado
              </button>
            </div>
          </div>

          {previa && (
            <>
              <table className="styled-table table-cards-mobile">
                <thead><tr><th>Tabela</th><th className="text-right">Registros</th></tr></thead>
                <tbody>
                  {(Object.keys(ROTULOS) as (keyof Contagens)[]).map((chave) => (
                    <tr key={chave}>
                      <td className="card-title-cell">{ROTULOS[chave]}</td>
                      <td className="text-right celula-numero" data-label="Registros">{previa[chave]}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="card-title-cell"><strong>Total</strong></td>
                    <td className="text-right celula-numero" data-label="Total"><strong>{total}</strong></td>
                  </tr>
                </tbody>
              </table>

              {total === 0 ? (
                <p className="texto-auxiliar">Nada a arquivar antes dessa data.</p>
              ) : (
                <div className="arquivamento-acoes">
                  {/* O botão de arquivar só existe depois do download: é o servidor
                      que exige o comprovante, e a tela reflete a mesma ordem. */}
                  <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void exportar()}>
                    <Download /> {exportPronto ? 'Baixar novamente' : '1. Baixar o arquivo (JSON)'}
                  </button>
                  <button
                    type="button" className="btn btn-danger"
                    disabled={!exportPronto || ocupado}
                    title={exportPronto ? undefined : 'Baixe o arquivo antes de arquivar'}
                    onClick={() => setConfirmando(true)}
                  >
                    <TriangleAlert /> 2. Arquivar definitivamente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {confirmando && exportPronto && (
        <ModalConfirmarExclusaoForte
          titulo="Arquivar dados antigos"
          aviso={`Serão apagados do banco ${Object.values(exportPronto.contagens).reduce((a, b) => a + b, 0)} registro(s) anteriores a ${exportPronto.ate.split('-').reverse().join('/')}. Isso não pode ser desfeito — a recuperação depende do arquivo que você acabou de baixar.`}
          label="Digite ARQUIVAR para confirmar:"
          valorEsperado="ARQUIVAR"
          onFechar={() => setConfirmando(false)}
          onConfirmar={() => void executar()}
        />
      )}
    </div>
  );
}
