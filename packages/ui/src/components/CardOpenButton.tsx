import { icons } from '../tableView/icons'

/** Drill-down de card: chevron de 28 px no canto; o ::after estica o clique pelo card inteiro (mouse e toque). O card precisa de `position: relative`. */
export function CardOpenButton({ label, text, onOpen }: { label: string; text: string; onOpen: () => void }) {
  return (
    <button type="button" className="bt-card-open" aria-label={`${label}: ${text}`} title={text} onClick={onOpen}>
      {icons.chevronRight}
    </button>
  )
}
