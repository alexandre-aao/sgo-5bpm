import { useEffect, useState } from 'react';
import { AlertTriangle, LayoutTemplate, Plus } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

interface PadraoAtivoResumo {
  id: string;
  nome_template: string;
  tipo_periodo: string | null;
  viaturas: unknown[];
}

interface CriarDoPadraoProps {
  onCriar: () => void;
  /** Data do cartão a criar. O padrão é escolhido por período (sáb/dom = fim de
   *  semana), então a tela precisa dizer de qual padrão o cartão vai NASCER —
   *  sem isso a escolha ficaria implícita e o Adjunto só descobriria depois. */
  data: string;
}

const ROTULO_PERIODO: Record<string, string> = {
  semana: 'dia útil',
  fim_de_semana: 'fim de semana',
};

function ehFimDeSemana(dataIso: string): boolean {
  if (!dataIso) return false;
  const dia = new Date(`${dataIso}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

// Bloco do estado vazio: mostra qual cartão padrão originará o cartão desta data
// e oferece "Criar Cartão do Padrão".
export function CriarDoPadrao({ onCriar, data }: CriarDoPadraoProps) {
  const [padrao, setPadrao] = useState<PadraoAtivoResumo | null | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    apiFetch(`/api/cartoes/padrao-ativo?data=${encodeURIComponent(data)}`)
      .then((res) => res.json())
      .then((corpo: { padrao: PadraoAtivoResumo | null }) => {
        if (!cancelado) setPadrao(corpo.padrao);
      })
      .catch((erro) => {
        console.error('Erro ao buscar cartão padrão ativo:', erro);
        if (!cancelado) setPadrao(null);
      });
    return () => {
      cancelado = true;
    };
  }, [data]);

  if (padrao === undefined) return null;

  if (!padrao) {
    return (
      <div className="template-sugerido-box nao-encontrado">
        <span>
          <AlertTriangle style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> Nenhum cartão padrão ativo. Peça
          ao P3 para definir um em &quot;Cartões Padrão&quot;.
        </span>
      </div>
    );
  }

  // O servidor cai no padrão do outro período quando não há do tipo certo. Dizer
  // isso é mais honesto que exibir só o nome: o Adjunto entende por que o cartão
  // de sábado veio com o desenho de dia útil.
  const periodoEsperado = ehFimDeSemana(data) ? 'fim_de_semana' : 'semana';
  const ehFallback = !!padrao.tipo_periodo && padrao.tipo_periodo !== periodoEsperado;

  return (
    <div className="template-sugerido-box encontrado">
      <span>
        <LayoutTemplate style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> Cartão padrão:{' '}
        <strong>{padrao.nome_template}</strong> ({padrao.viaturas.length} viatura(s))
        {ehFallback && (
          <>
            {' '}— não há padrão de {ROTULO_PERIODO[periodoEsperado]} ativo, será usado o de{' '}
            {ROTULO_PERIODO[padrao.tipo_periodo as string] || 'outro período'}.
          </>
        )}
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={onCriar}>
        <Plus /> Criar Cartão do Padrão
      </button>
    </div>
  );
}
