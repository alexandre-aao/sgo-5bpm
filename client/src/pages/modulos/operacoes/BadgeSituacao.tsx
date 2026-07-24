// Badge de situação da operação — Planejada (alerta) x Executada (sucesso). Espelha
// badgeSituacaoOperacao() em public/app.js.
export function BadgeSituacao({ situacao }: { situacao: string }) {
  const classe = situacao === 'Executada' ? 'situacao-executada' : 'situacao-planejada';
  return <span className={`badge ${classe}`}>{situacao || 'Planejada'}</span>;
}
