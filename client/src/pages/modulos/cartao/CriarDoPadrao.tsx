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
}

// Bloco do estado vazio: mostra qual é o cartão padrão ativo (único no sistema,
// ver PUT /api/cartoes/:id/padrao-ativo) e oferece "Criar Cartão do Padrão".
// Substitui o antigo SugestaoTemplate, que buscava por tipo de período/quantidade
// de viaturas quando havia múltiplos templates concorrentes.
export function CriarDoPadrao({ onCriar }: CriarDoPadraoProps) {
  const [padrao, setPadrao] = useState<PadraoAtivoResumo | null | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/cartoes/padrao-ativo')
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
  }, []);

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

  return (
    <div className="template-sugerido-box encontrado">
      <span>
        <LayoutTemplate style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> Cartão padrão ativo:{' '}
        <strong>{padrao.nome_template}</strong> ({padrao.viaturas.length} viatura(s))
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={onCriar}>
        <Plus /> Criar Cartão do Padrão
      </button>
    </div>
  );
}
