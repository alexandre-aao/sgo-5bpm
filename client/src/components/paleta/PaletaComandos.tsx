import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { useAppData } from '../../context/useAppData';
import { useAuth } from '../../context/useAuth';
import { useBairros } from '../../hooks/useBairros';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useResultadosPaleta, type ResultadoPaleta } from './useResultadosPaleta';

interface PaletaComandosProps {
  onFechar: () => void;
}

/** Paleta de comandos (Ctrl+K): busca eventos, operações, pessoal e bairros,
 *  navega entre telas e dispara ações rápidas. Os resultados já vêm filtrados
 *  pelo perfil — ver useResultadosPaleta. */
export function PaletaComandos({ onFechar }: PaletaComandosProps) {
  const navigate = useNavigate();
  const { dados } = useAppData();
  const { usuario } = useAuth();
  const { bairros } = useBairros();
  const [termo, setTermo] = useState('');
  const [indice, setIndice] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const resultados = useResultadosPaleta(termo, dados, bairros, usuario?.role);

  // Digitar muda a lista inteira: manter o índice antigo deixaria a seleção num
  // item que não existe mais. Ajuste durante o render, mesmo padrão do AppLayout.
  const [termoAnterior, setTermoAnterior] = useState(termo);
  if (termo !== termoAnterior) {
    setTermoAnterior(termo);
    setIndice(0);
  }

  const grupos = useMemo(() => {
    const mapa = new Map<string, ResultadoPaleta[]>();
    for (const r of resultados) {
      mapa.set(r.grupo, [...(mapa.get(r.grupo) || []), r]);
    }
    return [...mapa.entries()];
  }, [resultados]);

  function escolher(resultado: ResultadoPaleta | undefined) {
    if (!resultado) return;
    navigate(resultado.destino);
    onFechar();
  }

  function handleTeclado(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => (resultados.length ? (i + 1) % resultados.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => (resultados.length ? (i - 1 + resultados.length) % resultados.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolher(resultados[indice]);
    }
    // Esc é tratado pelo useModalA11y.
  }

  // Mantém o item selecionado visível ao navegar com as setas por uma lista que
  // rola — sem isso a seleção "some" para fora da caixa.
  useEffect(() => {
    const ativo = listaRef.current?.querySelector('[data-ativo="true"]');
    ativo?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  let contador = -1;

  return (
    <div className="modal-overlay paleta-overlay" {...propsOverlay}>
      <div className="modal-box paleta-box" ref={refCaixa}>
        <h3 id={idTitulo} className="sr-only">Pesquisa e comandos</h3>

        <div className="paleta-campo">
          <Search aria-hidden="true" />
          <input
            type="text"
            autoFocus
            autoComplete="off"
            placeholder="Buscar evento, operação, militar, bairro… ou uma tela"
            aria-label="Buscar no sistema"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={handleTeclado}
          />
        </div>

        <div className="paleta-resultados" ref={listaRef} role="listbox" aria-label="Resultados">
          {resultados.length === 0 ? (
            <p className="texto-auxiliar paleta-vazio">
              Nada encontrado para “{termo}”.
            </p>
          ) : (
            grupos.map(([grupo, itens]) => (
              <div className="paleta-grupo" key={grupo}>
                <span className="paleta-grupo-titulo">{grupo}</span>
                {itens.map((r) => {
                  contador += 1;
                  const ativo = contador === indice;
                  const posicao = contador;
                  const Icone = r.icone;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      role="option"
                      aria-selected={ativo}
                      data-ativo={ativo}
                      className={`paleta-item${ativo ? ' ativo' : ''}`}
                      onMouseEnter={() => setIndice(posicao)}
                      onClick={() => escolher(r)}
                    >
                      <Icone aria-hidden="true" />
                      <span className="paleta-item-texto">
                        <strong>{r.rotulo}</strong>
                        {r.detalhe && <small>{r.detalhe}</small>}
                      </span>
                      {ativo && <CornerDownLeft aria-hidden="true" className="paleta-item-enter" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="paleta-rodape texto-auxiliar">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
