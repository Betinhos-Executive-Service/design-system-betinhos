import type { HTMLAttributes, ReactNode } from 'react'
import type { StatTone } from './StatCard'

export type MetricTone = StatTone

export type MetricCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Ícone Lucide de 20px, sobre fundo suave do tom. */
  icon?: ReactNode
  /** Cor do ícone; o número é sempre navy. */
  tone?: MetricTone
  /** O que o número mede: "Ocorrências abertas". */
  label: ReactNode
  /** O número, com separador pt-BR já formatado. */
  value: ReactNode
  /** Linha de apoio: período, comparação. */
  hint?: ReactNode
  /** Mostra barras no lugar do valor enquanto carrega. */
  loading?: boolean
}

/**
 * Card de KPI: ícone em fundo suave, rótulo, valor em navy e uma linha de apoio.
 * @deprecated Desde a 3.1.0: use `StatCard` (com `icon` e `tone`), que também tem selo, barra, sparkline e drill-down. Sai numa major futura.
 */
export function MetricCard({ icon, tone = 'info', label, value, hint, loading = false, className, ...rest }: MetricCardProps) {
  return (
    <article className={['bt-metric', `bt-metric--${tone}`, loading && 'bt-metric--loading', className].filter(Boolean).join(' ')} aria-busy={loading || undefined} {...rest}>
      {icon != null ? <span className="bt-metric__icon" aria-hidden="true">{icon}</span> : null}
      <div className="bt-metric__body">
        <span className="bt-metric__label">{label}</span>
        <strong className="bt-metric__value">{loading ? <span className="bt-metric__skeleton" /> : value}</strong>
        {hint != null ? <small className="bt-metric__hint">{loading ? <span className="bt-metric__skeleton bt-metric__skeleton--hint" /> : hint}</small> : null}
      </div>
    </article>
  )
}
