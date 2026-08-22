function atividadeEhPB(atividade) {
  return String(atividade || '').trim().toLocaleUpperCase('pt-BR') === 'PB';
}

function contarPbsComponentes(componentes) {
  return (Array.isArray(componentes) ? componentes : []).reduce((total, componente) => {
    const itens = componente && typeof componente === 'object' && Array.isArray(componente.itens)
      ? componente.itens
      : [];
    return total + itens.filter((item) => atividadeEhPB(item?.atividade)).length;
  }, 0);
}

function listaBairrosUnica(valor) {
  return [...new Set((Array.isArray(valor) ? valor : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))];
}

module.exports = { atividadeEhPB, contarPbsComponentes, listaBairrosUnica };
