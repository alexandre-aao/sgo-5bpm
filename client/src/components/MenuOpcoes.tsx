import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ItemMenuOpcoes {
  rotulo: string;
  icone?: LucideIcon;
  onClick: () => void;
  /** Ação destrutiva — fica em vermelho, e sempre por último na lista. */
  perigo?: boolean;
}

interface MenuOpcoesProps {
  itens: ItemMenuOpcoes[];
  /** Rótulo acessível do botão; o gatilho é sempre o ícone de três pontos. */
  rotulo?: string;
  /** Alinha o painel pela direita (padrão) ou pela esquerda do gatilho. */
  alinhamento?: 'direita' | 'esquerda';
}

// Menu de opções (Etapa 1, item 2): recolhe as ações pouco frequentes de uma
// tela ou linha de tabela num gatilho só, em vez de enfileirar botões.
export function MenuOpcoes({ itens, rotulo = 'Mais opções', alinhamento = 'direita' }: MenuOpcoesProps) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou no Esc — só escuta enquanto está aberto.
  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }

    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div className="menu-opcoes" ref={wrapRef}>
      <button
        type="button"
        className="btn-icon btn-sm"
        aria-label={rotulo}
        title={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation(); // a linha da tabela abre a gaveta ao clique
          setAberto((a) => !a);
        }}
      >
        <MoreVertical />
      </button>

      {aberto && (
        <div className={`menu-opcoes-painel${alinhamento === 'esquerda' ? ' alinha-esquerda' : ''}`} role="menu">
          {itens.map((item) => {
            const Icone = item.icone;
            return (
              <button
                key={item.rotulo}
                type="button"
                role="menuitem"
                className={`menu-opcoes-item${item.perigo ? ' perigo' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setAberto(false);
                  item.onClick();
                }}
              >
                {Icone && <Icone />}
                <span>{item.rotulo}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
