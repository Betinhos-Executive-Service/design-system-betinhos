import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export type ProgressRingTone = 'action' | 'ok' | 'warn' | 'danger'

export type ProgressRingProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Progresso de 0 a 1; fora da faixa (ou inválido) é limitado a 0 e 1. */
  value: number
  tone?: ProgressRingTone
  /** Diâmetro em px. */
  size?: number
  /** Texto grande no centro: "12%". */
  label?: ReactNode
  /** Texto pequeno sob o `label`: "recebido". */
  caption?: ReactNode
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const STROKE_RATIO = 0.1

/** Anel de progresso em SVG: trilha na cor de grade, arco no tom com ponta redonda e texto central. Leitor de tela recebe `aria-label` (padrão: label e caption). */
export function ProgressRing({ value, tone = 'action', size = 150, label, caption, className, style, ...rest }: ProgressRingProps) {
  const progress = clamp01(value)
  const stroke = size * STROKE_RATIO
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const spoken = [label, caption].filter((part) => typeof part === 'string' || typeof part === 'number').join(' ')
  return (
    <div
      role="img"
      aria-label={spoken || `${Math.round(progress * 100)}%`}
      className={['bt-ring', `bt-ring--${tone}`, className].filter(Boolean).join(' ')}
      style={{ '--bt-ring-size': `${size}px`, ...style } as CSSProperties}
      {...rest}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false">
        <circle className="bt-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="bt-ring__arc" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke}
          strokeDasharray={`${circumference * progress} ${circumference}`}
        />
      </svg>
      {label != null || caption != null ? (
        <div className="bt-ring__text">
          {label != null ? <strong className="bt-ring__label">{label}</strong> : null}
          {caption != null ? <span className="bt-ring__caption">{caption}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
