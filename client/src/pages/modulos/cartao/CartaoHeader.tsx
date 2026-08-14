import { useState } from 'react';
import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import { janela24h } from '../../../lib/janelaCartao';
import { abreviarPosto } from '../../../lib/abrevPosto';
import type { ResultadoAcao } from './useCartaoPrograma';

interface CartaoHeaderProps {
  cartao: CartaoDetalhado;
  pessoal: Tables<'pessoal'>[];
  viaturasCadastradas: Tables<'viaturas'>[];
  onAtualizar: (patch: {
    fiscal?: string;
    adjunto?: string;
    oficial_sobreaviso?: string;
    fiscal_pessoal_id?: string;
    adjunto_pessoal_id?: string;
    delta07_viatura?: string;
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
  /** Devolve o nome (fonte compatível com os cartões antigos) e o id do cadastro,
   *  que passa a ser a fonte de verdade para o PDF resolver posto + nome de guerra. */
  onChange: (valor: string, pessoalId: string) => void;
}) {
  // Espelha popularSelectPessoal(): filtra pessoal pela categoria; se o valor
  // salvo não estiver na lista (texto livre antigo, ou pessoa desativada),
  // mantém como opção extra pra não perder o dado já gravado.
  const pessoasDaCategoria = pessoal.filter((p) => (p.categorias || []).includes(categoria));
  const valorFaltante = valorAtual && !pessoasDaCategoria.some((p) => p.nome === valorAtual);

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={valorAtual}
        onChange={(e) => {
          const nome = e.target.value;
          const pessoa = pessoasDaCategoria.find((p) => p.nome === nome);
          onChange(nome, pessoa?.id || '');
        }}
      >
        <option value="">Selecione...</option>
        {pessoasDaCategoria.map((p) => (
          <option key={p.id} value={p.nome}>
            {abreviarPosto(p.posto_graduacao)} · {p.nome_guerra || p.nome}
          </option>
        ))}
        {valorFaltante && <option value={valorAtual}>{valorAtual} (não cadastrado)</option>}
      </select>
    </div>
  );
}

// Cabeçalho oficial do cartão: Tipo de Cartão + Fiscal/Adjunto/Oficial de
// Sobreaviso (selects do Cadastro de Pessoal) — espelha exibirCartaoNoEditor() +
// handleSalvarCabecalhoCartao() em public/app.js.
export function CartaoHeader({ cartao, pessoal, viaturasCadastradas, onAtualizar }: CartaoHeaderProps) {
  const { toast } = useToast();
  // Texto livre com sugestão: a guarnição do Delta 07 nem sempre é uma das
  // viaturas do cartão do dia. Salva no blur, não a cada tecla.
  const [delta07Viatura, setDelta07Viatura] = useState(cartao.delta07_viatura || '');

  async function salvar(patch: Parameters<CartaoHeaderProps['onAtualizar']>[0]) {
    const resultado = await onAtualizar(patch);
    if (resultado.ok) {
      toast('Cabeçalho do cartão atualizado.', 'success');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  // Formato completo (05/08/2026 07h00 às 06/08/2026 07h00), nunca a data isolada
  // — a janela do cartão é de 24h, ancorada às 07h (ver ordenarPorTurno em server.js).
  const periodo = janela24h(cartao.data);

  // Na impressão, o campo Sobreaviso vira um rótulo dinâmico: se o Fiscal já é
  // Oficial, o sobreaviso é redundante e mostra "Oficial de Serviço" com o
  // próprio Fiscal — espelha atualizarCampoSobreavisoPrint().
  const fiscalPessoa = pessoal.find((p) => p.nome === cartao.fiscal);
  const fiscalEhOficial = fiscalPessoa?.tipo === 'Oficial';
  const sobreavisoPrintLabel = fiscalEhOficial ? 'Oficial de Serviço' : 'Sobreaviso';
  const sobreavisoPrintValor = (fiscalEhOficial ? cartao.fiscal : cartao.oficial_sobreaviso) || '-';

  // Template não tem data/fiscal/adjunto/sobreaviso próprios — só o cabeçalho de
  // identificação aparece, igual a exibirCartaoNoEditor() quando is_template.
  if (cartao.is_template) {
    return (
      <div className="panel cartao-header-panel">
        <div className="cartao-print-title">
          <h2>{cartao.tipo_modelo === 'operacao' ? 'MODELO DE OPERAÇÃO' : 'MODELO ORDINÁRIO'}: {cartao.nome_template}</h2>
          <span>
            {cartao.qtd_viaturas_base} viatura(s) base
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel cartao-header-panel">
      <div className="cartao-print-title">
        <h2>
          CARTÃO PROGRAMA {cartao.numero ? `Nº ${String(cartao.numero).padStart(6, '0')}/${cartao.ano} ` : ''}
          - 5º BPM
        </h2>
        <span>Policiamento Ostensivo Diário · {periodo}</span>
      </div>
      <div className="cartao-header-fields">
        {/* "Delta 07" é o indicativo operacional do Fiscal de Operações — mesmo
            campo, rótulo que o comandante de viatura reconhece no PDF. O seletor
            não filtra por posto: o Delta 07 pode ser oficial ou praça. */}
        <SelectPessoal
          id="cartao-fiscal"
          label="Delta 07 (Fiscal de Operações)"
          categoria="Fiscal de Operações"
          valorAtual={cartao.fiscal || ''}
          pessoal={pessoal}
          onChange={(valor, pessoalId) => salvar({ fiscal: valor, fiscal_pessoal_id: pessoalId })}
        />
        <div className="form-group">
          <label htmlFor="cartao-delta07-viatura">Guarnição do Delta 07</label>
          <input
            type="text"
            id="cartao-delta07-viatura"
            placeholder="Ex: VTR 0987"
            list="lista-prefixos-delta07"
            value={delta07Viatura}
            onChange={(e) => setDelta07Viatura(e.target.value)}
            onBlur={() => {
              const valor = delta07Viatura.trim();
              if (valor !== (cartao.delta07_viatura || '')) void salvar({ delta07_viatura: valor });
            }}
          />
          <datalist id="lista-prefixos-delta07">
            {viaturasCadastradas.map((v) => <option key={v.id} value={v.prefixo} />)}
          </datalist>
        </div>
        <SelectPessoal
          id="cartao-adjunto"
          label="Adjunto"
          categoria="Adjunto"
          valorAtual={cartao.adjunto || ''}
          pessoal={pessoal}
          onChange={(valor, pessoalId) => salvar({ adjunto: valor, adjunto_pessoal_id: pessoalId })}
        />
        <div id="cartao-sobreaviso-grupo">
          <SelectPessoal
            id="cartao-sobreaviso"
            label="Oficial de Sobreaviso"
            categoria="Oficial de Sobreaviso"
            valorAtual={cartao.oficial_sobreaviso || ''}
            pessoal={pessoal}
            onChange={(valor) => salvar({ oficial_sobreaviso: valor })}
          />
        </div>
        <div className="form-group cartao-sobreaviso-print-only">
          <label>{sobreavisoPrintLabel}</label>
          <span>{sobreavisoPrintValor}</span>
        </div>
      </div>
    </div>
  );
}
