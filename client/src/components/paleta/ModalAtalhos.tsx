import { Keyboard, X } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

const ATALHOS: { teclas: string[]; descricao: string }[] = [
  { teclas: ['Ctrl', 'K'], descricao: 'Abrir a busca e os comandos' },
  { teclas: ['N'], descricao: 'Criar o novo item da tela ativa' },
  { teclas: ['←', '→'], descricao: 'Dia anterior / próximo dia no Cartão Programa' },
  { teclas: ['?'], descricao: 'Mostrar esta lista' },
  { teclas: ['Esc'], descricao: 'Fechar a janela aberta' },
];

export function ModalAtalhos({ onFechar }: { onFechar: () => void }) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><Keyboard /> Atalhos de teclado</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>

        <ul className="lista-atalhos">
          {ATALHOS.map((a) => (
            <li key={a.descricao}>
              <span className="atalho-teclas">
                {a.teclas.map((t) => <kbd key={t}>{t}</kbd>)}
              </span>
              <span>{a.descricao}</span>
            </li>
          ))}
        </ul>

        <p className="texto-auxiliar">
          As teclas simples não funcionam enquanto você digita num campo — só <kbd>Ctrl</kbd>+<kbd>K</kbd>.
        </p>
      </div>
    </div>
  );
}
