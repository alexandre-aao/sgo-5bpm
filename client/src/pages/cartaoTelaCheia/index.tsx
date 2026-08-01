import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { CartaoDetalhado } from '../../lib/cartaoConflitos';
import { janela24h } from '../../lib/janelaCartao';
import { Carregando } from '../../components/estado/Carregando';
import { useModoCartao } from './useModoCartao';

/**
 * Cartão Programa em tela cheia — sem sidebar/topbar/bottom-tabs (rota fora de
 * NAV_SECTIONS, ver routes/RotaCartaoTelaCheia.tsx). Resolve o "espremido no
 * layout" trocando o container geral pela largura total da janela.
 *
 * A grade de roteiro (modo Edição/Operação) entra no Lote 8; esta casca só
 * carrega o cartão e monta a barra superior mínima.
 */
export default function CartaoTelaCheiaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { modo, setModo } = useModoCartao();

  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    setCarregando(true);
    setErro(false);

    apiFetch(`/api/cartoes/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Cartão não encontrado');
        return res.json() as Promise<CartaoDetalhado>;
      })
      .then((dados) => {
        if (!cancelado) setCartao(dados);
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [id]);

  return (
    <div className="ctc-shell">
      <header className="ctc-barra">
        <button type="button" className="btn-icon" aria-label="Voltar ao Cartão Programa" onClick={() => navigate('/cartao')}>
          <ArrowLeft />
        </button>

        <div className="ctc-barra-info">
          {cartao && (
            <>
              <span className="ctc-barra-janela">{janela24h(cartao.data)}</span>
              {cartao.delta07_viatura && <span className="ctc-barra-fracao">Delta 07: {cartao.delta07_viatura}</span>}
            </>
          )}
        </div>

        <div className="ctc-barra-acoes">
          <div className="dia-switch" role="radiogroup" aria-label="Modo de exibição">
            <button
              type="button"
              className={`dia-opcao${modo === 'edicao' ? ' ativo' : ''}`}
              aria-pressed={modo === 'edicao'}
              onClick={() => setModo('edicao')}
            >
              Edição
            </button>
            <button
              type="button"
              className={`dia-opcao${modo === 'operacao' ? ' ativo' : ''}`}
              aria-pressed={modo === 'operacao'}
              onClick={() => setModo('operacao')}
            >
              Operação
            </button>
          </div>
          {/* Lote 9: troca para link a /impressao?cartao={id}, quando a Central existir. */}
          <button type="button" className="btn-icon" aria-label="Imprimir" title="Imprimir" onClick={() => window.print()}>
            <Printer />
          </button>
        </div>
      </header>

      <div className="ctc-conteudo">
        {carregando ? (
          <Carregando mensagem="Carregando Cartão Programa..." />
        ) : erro || !cartao ? (
          <div className="ctc-vazio">
            <p>Cartão Programa não encontrado.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/cartao')}>
              Voltar
            </button>
          </div>
        ) : (
          <div className="ctc-placeholder">
            <p>
              Modo <strong>{modo === 'edicao' ? 'Edição' : 'Operação'}</strong> — grade de roteiro entra no próximo lote.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
