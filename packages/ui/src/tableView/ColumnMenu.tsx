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
  /** Coluna fixa na rolagem horizontal: o item vira "Desafixar coluna". */
  pinned?: boolean
  /** Liga "Fixar coluna" / "Desafixar coluna"; sem ele o item não aparece. */
  onTogglePin?: () => void
  /** `false` desabilita "Fixar coluna" quando as fixas já ocupam metade da tabela. Padrão: `true`. */
  canPin?: boolean
  /**
   * Agrupar a lista por esta coluna (§10.9.1). `date` oferece mês e ano; `active` é o agrupamento valendo nesta coluna
   * (`null` quando a lista não está agrupada por ela). Sem ele os itens não aparecem.
   */
  group?: { date: boolean; active: ColumnGroupBy | null; onChange: (next: ColumnGroupBy | null) => void }
  /** Clique no gatilho que não deve abrir o menu (ex.: fim de um arraste). */
  suppressClick?: () => boolean
  /** Teclas do cabeçalho além das do menu (Alt+setas movem a coluna). */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/** Como a coluna agrupa: pelo valor ou, em data, por mês ou ano. */
export type ColumnGroupBy = 'value' | 'month' | 'year'

export const PIN_LIMIT_HINT = 'As colunas fixas já ocupam metade da tabela'

/** Título da coluna como gatilho de menu (§10.9.2): Ordenar A→Z, Z→A, Filtrar por…, Limpar filtro, Agrupar, Fixar coluna e Ocultar coluna. O ▾ aparece no hover/foco e sempre que a coluna está filtrada (com ponto de ação). */
export function ColumnMenu({ label, columnKey, sortIcon, sortable = true, filterable, filtered, canHide, onSort, onFilter, onClearFilter, onHide, pinned = false, onTogglePin, canPin = true, group, suppressClick, onKeyDown }: ColumnMenuProps) {
  const actions: MenuAction[] = [
    ...(sortable && onSort ? [
      { id: 'asc', label: 'Ordenar A→Z', icon: icons.arrowUp, onSelect: () => onSort(false) },
      { id: 'desc', label: 'Ordenar Z→A', icon: icons.arrowDown, onSelect: () => onSort(true) },
    ] : []),
    ...(filterable ? [{ id: 'filter', label: 'Filtrar por…', icon: icons.filter, onSelect: onFilter }] : []),
    ...(filterable && filtered ? [{ id: 'clear', label: 'Limpar filtro', icon: icons.filterX, onSelect: onClearFilter }] : []),
    ...(group ? groupActions(group) : []),
    ...(onTogglePin ? [pinned
      ? { id: 'unpin', label: 'Desafixar coluna', icon: icons.pinOff, onSelect: onTogglePin }
      : { id: 'pin', label: 'Fixar coluna', icon: icons.pin, onSelect: onTogglePin, disabled: !canPin, title: canPin ? undefined : PIN_LIMIT_HINT }] : []),
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

function groupActions({ date, active, onChange }: NonNullable<ColumnMenuProps['group']>): MenuAction[] {
  const options: { by: ColumnGroupBy; label: string }[] = date
    ? [{ by: 'month', label: 'Agrupar por mês' }, { by: 'year', label: 'Agrupar por ano' }]
    : [{ by: 'value', label: 'Agrupar por esta coluna' }]
  return [
    ...options.filter((o) => o.by !== active).map((o) => ({ id: `group-${o.by}`, label: o.label, icon: icons.group, onSelect: () => onChange(o.by) })),
    ...(active ? [{ id: 'ungroup', label: 'Desagrupar', icon: icons.ungroup, onSelect: () => onChange(null) }] : []),
  ]
}
