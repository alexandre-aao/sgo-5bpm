import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import type { ResultadoAcao } from './useCartaoPrograma';

interface CartaoHeaderProps {
  cartao: CartaoDetalhado;
  pessoal: Tables<'pessoal'>[];
  onAtualizar: (patch: {
    fiscal?: string;
    adjunto?: string;
    oficial_sobreaviso?: string;
    tipo_periodo?: string;
  }) => Promise<ResultadoAcao>;
}

function SelectPessoal({
  id,
  label,
  categoria,
  valorAtual,
  pessoal,
  onChange,
}: {
  id: string;
  label: string;
  categoria: string;
  valorAtual: string;
  pessoal: Tables<'pessoal'>[];
  onChange: (valor: string) => void;
}) {
  // Espelha popularSelectPessoal(): filtra pessoal pela categoria; se o valor
  // salvo não estiver na lista (texto livre antigo, ou pessoa desativada),
  // mantém como opção extra pra não perder o dado já gravado.
  const pessoasDaCategoria = pessoal.filter((p) => (p.categorias || []).includes(categoria));
  const valorFaltante = valorAtual && !pessoasDaCategoria.some((p) => p.nome === valorAtual);

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={valorAtual} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione...</option>
        {pessoasDaCategoria.map((p) => (
          <option key={p.id} value={p.nome}>{p.nome} ({p.posto_graduacao})</option>
        ))}
        {valorFaltante && <option value={valorAtual}>{valorAtual} (não cadastrado)</option>}
      </select>
    </div>
  );
}

// Cabeçalho oficial do cartão: Tipo de Cartão + Fiscal/Adjunto/Oficial de
// Sobreaviso (selects do Cadastro de Pessoal) — espelha exibirCartaoNoEditor() +
// handleSalvarCabecalhoCartao() em public/app.js.
export function CartaoHeader({ cartao, pessoal, onAtualizar }: CartaoHeaderProps) {
  const { toast } = useToast();

  async function salvar(patch: Parameters<CartaoHeaderProps['onAtualizar']>[0]) {
    const resultado = await onAtualizar(patch);
    if (resultado.ok) {
      toast('Cabeçalho do cartão atualizado.', 'success');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  const dataBr = cartao.data ? cartao.data.split('-').reverse().join('/') : '';

  return (
    <div className="panel cartao-header-panel">
      <div className="cartao-print-title">
        <h2>CARTÃO PROGRAMA {dataBr} - 5º BPM</h2>
        <span>Policiamento Ostensivo Diário</span>
      </div>
      <div className="cartao-header-fields">
        <div className="form-group">
          <label htmlFor="cartao-tipo-periodo">Tipo de Cartão</label>
          <select
            id="cartao-tipo-periodo"
            value={cartao.tipo_periodo || ''}
            onChange={(e) => salvar({ tipo_periodo: e.target.value })}
          >
            <option value="">Selecione...</option>
            <option value="semana">Dia Útil</option>
            <option value="fim_de_semana">Fim de Semana</option>
          </select>
        </div>
        <SelectPessoal
          id="cartao-fiscal"
          label="Fiscal de Operações"
          categoria="Fiscal de Operações"
          valorAtual={cartao.fiscal || ''}
          pessoal={pessoal}
          onChange={(valor) => salvar({ fiscal: valor })}
        />
        <SelectPessoal
          id="cartao-adjunto"
          label="Adjunto"
          categoria="Adjunto"
          valorAtual={cartao.adjunto || ''}
          pessoal={pessoal}
          onChange={(valor) => salvar({ adjunto: valor })}
        />
        <SelectPessoal
          id="cartao-sobreaviso"
          label="Oficial de Sobreaviso"
          categoria="Oficial de Sobreaviso"
          valorAtual={cartao.oficial_sobreaviso || ''}
          pessoal={pessoal}
          onChange={(valor) => salvar({ oficial_sobreaviso: valor })}
        />
      </div>
    </div>
  );
}
