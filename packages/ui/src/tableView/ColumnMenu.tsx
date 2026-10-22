import type { KeyboardEvent, ReactNode } from 'react'
import { Menu, type MenuAction } from '../components/Menu'
import { icons } from './icons'

/** Evento disparado no gatilho `.bt-colhead` para reabrir o painel "Filtrar por" daquela coluna (chip de filtro ativo). Quem o trata chama `preventDefault()`. */
export const COLUMN_FILTER_EVENT = 'bt-colfilter'

export type ColumnMenuProps = {
  label: string
  /** Chave da coluna: vai em `data-col` no gatilho, para o foco voltar ao cabeçalho depois de mover ou ocultar. */
  columnKey?: string
  /** Seta de ordenação atual (ou nada). */
  sortIcon?: ReactNode
  /** `false` esconde "Ordenar A→Z" e "Z→A". Padrão: `true`. */
  sortable?: boolean
  /** `false` em coluna que não filtra (calculada, link-entity, tipo sem filtro): só ordenar e ocultar. */
  filterable: boolean
  /** Coluna com filtro valendo: ▾ sempre visível, em azul, com ponto, e "Limpar filtro" no menu. */
  filtered: boolean
  /** Não deixa ocultar a última coluna visível. */
  canHide: boolean
  onSort?: (descending: boolean) => void
  onFilter: () => void
  onClearFilter: () => void
  onHide: () => void
  /** Clique no gatilho que não deve abrir o menu (ex.: fim de um arraste). */
  suppressClick?: () => boolean
  /** Teclas do cabeçalho além das do menu (Alt+setas movem a coluna). */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/** Título da coluna como gatilho de menu (§10.9.2): Ordenar A→Z, Z→A, Filtrar por…, Limpar filtro e Ocultar coluna. O ▾ aparece no hover/foco e sempre que a coluna está filtrada (com ponto de ação). */
export function ColumnMenu({ label, columnKey, sortIcon, sortable = true, filterable, filtered, canHide, onSort, onFilter, onClearFilter, onHide, suppressClick, onKeyDown }: ColumnMenuProps) {
  const actions: MenuAction[] = [
    ...(sortable && onSort ? [
      { id: 'asc', label: 'Ordenar A→Z', icon: icons.arrowUp, onSelect: () => onSort(false) },
      { id: 'desc', label: 'Ordenar Z→A', icon: icons.arrowDown, onSelect: () => onSort(true) },
    ] : []),
    ...(filterable ? [{ id: 'filter', label: 'Filtrar por…', icon: icons.filter, onSelect: onFilter }] : []),
    ...(filterable && filtered ? [{ id: 'clear', label: 'Limpar filtro', icon: icons.filterX, onSelect: onClearFilter }] : []),
    { id: 'hide', label: 'Ocultar coluna', icon: icons.eyeOff, onSelect: onHide, disabled: !canHide },
  ]
  return (
    <Menu
      align="start"
      actions={actions}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className={filtered ? 'bt-colhead is-filtered' : 'bt-colhead'}
          data-col={columnKey}
          onClick={() => { if (!suppressClick?.()) props.onClick() }}
          onKeyDown={(event) => { onKeyDown?.(event); if (!event.defaultPrevented) props.onKeyDown(event) }}
        >
          <span className="bt-colhead__label">{label}</span>
          {sortIcon}
          <span className="bt-colhead__chevron" aria-hidden="true">
            {icons.chevronDown}
            {filtered ? <span className="bt-colhead__dot" /> : null}
          </span>
        </button>
      )}
    />
  )
}
