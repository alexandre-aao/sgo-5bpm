import { useState } from 'react';
import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { tipoDoCartao } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import type { ResultadoAcao } from './useCartaoPrograma';

interface CartaoHeaderProps {
  cartao: CartaoDetalhado;
  pessoal: Tables<'pessoal'>[];
  /** Operações disponíveis para o vínculo OPCIONAL do cartão de reforço. */
  operacoes: Tables<'operacoes'>[];
  /** false trava os campos (fora do prazo, ou perfil sem permissão). */
  podeEditar: boolean;
  onAtualizar: (patch: {
    fiscal?: string;
    adjunto?: string;
    oficial_sobreaviso?: string;
    tipo_periodo?: string;
    titulo?: string;
    observacoes?: string;
    operacao_id?: string;
  }) => Promise<ResultadoAcao>;
}

function SelectPessoal({
  id,
  label,
  categoria,
  valorAtual,
  pessoal,
  desabilitado,
  onChange,
}: {
  id: string;
  label: string;
  categoria: string;
  valorAtual: string;
  pessoal: Tables<'pessoal'>[];
  desabilitado: boolean;
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
      <select id={id} value={valorAtual} disabled={desabilitado} onChange={(e) => onChange(e.target.value)}>
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
export function CartaoHeader({ cartao, pessoal, operacoes, podeEditar, onAtualizar }: CartaoHeaderProps) {
  const { toast } = useToast();
  const ehReforco = tipoDoCartao(cartao) === 'reforco';
  // Título e observações são texto livre: estado local + salvamento no blur, pra não
  // disparar um PUT por tecla digitada (os selects continuam salvando no change).
  const [titulo, setTitulo] = useState(cartao.titulo || '');
  const [observacoes, setObservacoes] = useState(cartao.observacoes || '');

  async function salvar(patch: Parameters<CartaoHeaderProps['onAtualizar']>[0]) {
    const resultado = await onAtualizar(patch);
    if (resultado.ok) {
      toast('Cabeçalho do cartão atualizado.', 'success');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  const dataBr = cartao.data ? cartao.data.split('-').reverse().join('/') : '';

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
          <h2>{ehReforco ? 'MODELO DE REFORÇO' : 'MODELO DE CARTÃO'}: {cartao.nome_template}</h2>
          <span>
            {ehReforco
              ? 'Roteiro modelo reutilizável — o Adjunto aplica e ajusta ao gerar o cartão do dia'
              : `${cartao.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'} · ${cartao.qtd_viaturas_base} viatura(s) base`}
          </span>
        </div>
        {ehReforco && (
          <div className="form-group" style={{ padding: '0 20px 16px' }}>
            <label htmlFor="modelo-observacoes">Observações padrão (herdadas pelo cartão gerado)</label>
            <textarea
              id="modelo-observacoes" rows={3} disabled={!podeEditar}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              onBlur={() => { if (observacoes !== (cartao.observacoes || '')) void salvar({ observacoes }); }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel cartao-header-panel">
      <div className="cartao-print-title">
        <h2>
          {ehReforco ? 'CARTÃO PROGRAMA — REFORÇO' : 'CARTÃO PROGRAMA'} {dataBr} - 5º BPM
        </h2>
        <span>{ehReforco ? (titulo || 'Reforço Operacional') : 'Policiamento Ostensivo Diário'}</span>
      </div>
      <div className="cartao-header-fields">
        {ehReforco ? (
          <>
            <div className="form-group">
              <label htmlFor="cartao-titulo">Título do Reforço</label>
              <input
                type="text" id="cartao-titulo" placeholder="Ex: Reforço Carnaval — Ponta Negra"
                disabled={!podeEditar} value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => { if (titulo !== (cartao.titulo || '')) void salvar({ titulo }); }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="cartao-operacao">Operação vinculada (opcional)</label>
              <select
                id="cartao-operacao" disabled={!podeEditar} value={cartao.operacao_id || ''}
                onChange={(e) => salvar({ operacao_id: e.target.value })}
              >
                <option value="">Sem vínculo</option>
                {operacoes.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.nome_operacao} ({op.data_inicio.split('-').reverse().join('/')})
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="form-group">
            <label htmlFor="cartao-tipo-periodo">Tipo de Cartão</label>
            <select
              id="cartao-tipo-periodo" disabled={!podeEditar}
              value={cartao.tipo_periodo || ''}
              onChange={(e) => salvar({ tipo_periodo: e.target.value })}
            >
              <option value="">Selecione...</option>
              <option value="semana">Dia Útil</option>
              <option value="fim_de_semana">Fim de Semana</option>
            </select>
          </div>
        )}
        <SelectPessoal
          id="cartao-fiscal"
          label="Fiscal de Operações"
          categoria="Fiscal de Operações"
          valorAtual={cartao.fiscal || ''}
          pessoal={pessoal}
          desabilitado={!podeEditar}
          onChange={(valor) => salvar({ fiscal: valor })}
        />
        <SelectPessoal
          id="cartao-adjunto"
          label="Adjunto"
          categoria="Adjunto"
          valorAtual={cartao.adjunto || ''}
          pessoal={pessoal}
          desabilitado={!podeEditar}
          onChange={(valor) => salvar({ adjunto: valor })}
        />
        <div id="cartao-sobreaviso-grupo">
          <SelectPessoal
            id="cartao-sobreaviso"
            label="Oficial de Sobreaviso"
            categoria="Oficial de Sobreaviso"
            valorAtual={cartao.oficial_sobreaviso || ''}
            pessoal={pessoal}
            desabilitado={!podeEditar}
            onChange={(valor) => salvar({ oficial_sobreaviso: valor })}
          />
        </div>
        <div className="form-group cartao-sobreaviso-print-only">
          <label>{sobreavisoPrintLabel}</label>
          <span>{sobreavisoPrintValor}</span>
        </div>
      </div>
      <div className="form-group cartao-observacoes-campo">
        <label htmlFor="cartao-observacoes">Observações / orientações da P3 para este cartão</label>
        <textarea
          id="cartao-observacoes" rows={2} disabled={!podeEditar}
          placeholder="Texto livre — sai no PDF, no bloco de observações"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          onBlur={() => { if (observacoes !== (cartao.observacoes || '')) void salvar({ observacoes }); }}
        />
      </div>
    </div>
  );
}
