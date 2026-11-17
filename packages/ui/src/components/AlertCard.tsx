import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { StatusBadge, type StatusTone } from './StatusBadge'
import { CardOpenButton } from './CardOpenButton'
import { icons } from '../tableView/icons'

export type AlertCardTone = StatusTone

/** Ícone do selo e prefixo lido pelo leitor de tela quando o texto do selo não diz o estado. */
const SIGNAL: Partial<Record<AlertCardTone, { icon: ReactNode; prefix: string }>> = {
  danger: { icon: icons.triangleAlert, prefix: 'Atenção' },
  warning: { icon: icons.triangleAlert, prefix: 'Atenção' },
  success: { icon: icons.circleCheck, prefix: 'OK' },
}

export type AlertCardProps = Omit<HTMLAttributes<HTMLElement>, 'title' | 'children'> & {
  /** Número já formatado: "12". */
  value: ReactNode
  /** O que o número conta: "Serviços sem motorista". */
  label: string
  /** Texto do selo: "Resolver hoje", "Em dia". */
  status: string
  /** Cor do número e do selo; danger e warning ganham triângulo, success ganha check. */
  tone?: AlertCardTone
  /** Drill-down: chevron à direita e o card inteiro clicável. */
  onOpen?: () => void
  openLabel?: string
  /** `li` dentro de uma lista de alertas; `article` sozinho. */
  as?: 'article' | 'li'
}

/** Alerta numa fileira (~56 px): número colorido pelo tom, rótulo e selo de status com ícone. */
export function AlertCard({ value, label, status, tone = 'neutral', onOpen, openLabel = 'Ver detalhes', as: Tag = 'article', className, ...rest }: AlertCardProps) {
  const signal = SIGNAL[tone]
  const labelId = useId()
  return (
    <Tag className={['bt-alert-card', `bt-alert-card--${tone}`, onOpen && 'bt-alert-card--open', className].filter(Boolean).join(' ')} aria-labelledby={rest['aria-label'] ? undefined : labelId} {...rest}>
      <strong className="bt-alert-card__value">{value}</strong>
      <span className="bt-alert-card__label" id={labelId}>{label}</span>
      <span className="bt-alert-card__status">
        <StatusBadge tone={tone} icon={signal?.icon} title={status}>
          {signal && !status.toLowerCase().startsWith(signal.prefix.toLowerCase()) ? <span className="bt-sr-only">{signal.prefix}: </span> : null}{status}
        </StatusBadge>
      </span>
      {onOpen ? <CardOpenButton label={label} text={openLabel} onOpen={onOpen} /> : null}
    </Tag>
  )
}
