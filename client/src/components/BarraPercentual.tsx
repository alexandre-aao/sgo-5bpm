interface BarraPercentualProps {
  valor: number;
  tom?: 'primary' | 'info' | 'roxo' | 'evento-1' | 'evento-4' | 'neutro';
  ariaLabel?: string;
}

/** Barra vetorial sem `style` inline. O valor variável vive no atributo SVG
 * `width`, enquanto a cor continua controlada pelo design system no CSS. */
export function BarraPercentual({ valor, tom = 'primary', ariaLabel }: BarraPercentualProps) {
  const percentual = Math.max(0, Math.min(100, valor));
  return (
    <svg
      className={`barra-percentual barra-percentual-${tom}`}
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <rect className="barra-percentual-track" width="100" height="8" rx="4" />
      <rect className="barra-percentual-fill" width={percentual} height="8" rx="4" />
    </svg>
  );
}
