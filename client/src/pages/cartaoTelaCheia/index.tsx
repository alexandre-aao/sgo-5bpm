import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { CartaoDetalhado } from '../../lib/cartaoConflitos';
import { janela24h } from '../../lib/janelaCartao';
import { Carregando } from '../../components/estado/Carregando';
import { useAuth } from '../../context/useAuth';
import { useModoCartao } from './useModoCartao';
import { GradeEdicao } from './GradeEdicao';
import { BlocosOperacao } from './BlocosOperacao';

/**
 * Cartão Programa em tela cheia — sem sidebar/topbar/bottom-tabs (rota fora de
 * NAV_SECTIONS, ver routes/RotaCartaoTelaCheia.tsx). Resolve o "espremido no
 * layout" trocando o container geral pela largura total da janela.
 */
export default function CartaoTelaCheiaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { modo, setModo } = useModoCartao();

  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  // Cartão Programa é a única tela que Adjunto edita — Oficial só lê (mesma
  // regra do editor compacto em pages/modulos/cartao/index.tsx).
  const podeEditar = usuario?.role === 'P3' || usuario?.role === 'Adjunto';

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    setErro(false);
    try {
      const res = await apiFetch(`/api/cartoes/${id}`);
      if (!res.ok) throw new Error('Cartão não encontrado');
      const dados = (await res.json()) as CartaoDetalhado;
      setCartao(dados);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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
          <Link to={`/impressao?cartao=${id}`} className="btn-icon" aria-label="Imprimir" title="Imprimir">
            <Printer />
          </Link>
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
        ) : modo === 'edicao' ? (
          <GradeEdicao cartao={cartao} podeEditar={podeEditar} recarregar={carregar} />
        ) : (
          <BlocosOperacao cartao={cartao} />
        )}
      </div>
    </div>
  );
}
