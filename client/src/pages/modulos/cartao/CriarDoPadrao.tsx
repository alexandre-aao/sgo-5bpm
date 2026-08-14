import { useEffect, useState } from 'react';
import { AlertTriangle, LayoutTemplate, Plus } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

interface PadraoAtivoResumo {
  id: string;
  nome_template: string;
  viaturas: unknown[];
}

interface CriarDoPadraoProps {
  onCriar: () => void;
  /** Data mantida para atualizar a consulta quando o operador navega entre dias. */
  data: string;
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
          <AlertTriangle className="icone-inline-md icone-alinhado" /> Nenhum cartão padrão ativo. Peça
          ao P3 para definir um em &quot;Cartões Padrão&quot;.
        </span>
      </div>
    );
  }

  return (
    <div className="template-sugerido-box encontrado">
      <span>
        <LayoutTemplate className="icone-inline-md icone-alinhado" /> Cartão padrão:{' '}
        <strong>{padrao.nome_template}</strong> ({padrao.viaturas.length} viatura(s))
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={onCriar}>
        <Plus /> Criar Cartão do Padrão
      </button>
    </div>
  );
}
