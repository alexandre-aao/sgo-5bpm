import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErroAoCarregarProps {
  mensagem?: string;
  onTentarDeNovo?: () => void;
}

// Estado de erro explícito (Etapa 1, item 7). Antes a falha de rede só ia para
// o console e a tela ficava vazia, sem o operador saber que os dados estavam
// desatualizados.
export function ErroAoCarregar({ mensagem, onTentarDeNovo }: ErroAoCarregarProps) {
  return (
    <div className="estado-erro" role="alert">
      <span className="estado-erro-icone"><AlertTriangle /></span>
      <div className="estado-erro-texto">
        <strong>Não foi possível carregar os dados.</strong>
        <span>{mensagem || 'Verifique a conexão e tente novamente.'}</span>
      </div>
      {onTentarDeNovo && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onTentarDeNovo}>
          <RotateCw /> Tentar de novo
        </button>
      )}
    </div>
  );
}
