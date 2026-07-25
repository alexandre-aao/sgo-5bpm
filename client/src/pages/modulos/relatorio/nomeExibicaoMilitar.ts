import { abreviarPosto } from '../../../lib/abrevPosto';
import type { MilitarDiario } from './useRelatorioDiario';

export function nomeExibicaoMilitarDiario(m: MilitarDiario): string {
  const nome = (m.nome_guerra || '').trim() || (m.militar_nome || '').trim() || 'Militar';
  const grad = abreviarPosto(m.posto_graduacao);
  return grad ? `${grad} ${nome}` : nome;
}
