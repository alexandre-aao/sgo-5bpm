// Conteúdo real de cada módulo chega na Fase 3/4 da migração — por enquanto todo
// módulo aponta pra este mesmo placeholder (arquivos próprios por módulo em
// src/pages/modulos/*.tsx só pra já existir um ponto de lazy-loading por rota).
export function ModuloEmConstrucao() {
  return (
    <p style={{ color: 'var(--text-muted)' }}>
      Em construção — conteúdo desta aba chega na Fase 3/4 da migração.
    </p>
  );
}
