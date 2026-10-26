import { useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { isExtraColumn, moveVisibleColumn, resizeColumn, sortBy, toggleColumn, visibleColumns, type ViewColumnDef, type ViewConfig } from '../tableView/config'
import { ColumnFilter } from '../tableView/ColumnFilter'
import { COLUMN_FILTER_EVENT, ColumnMenu } from '../tableView/ColumnMenu'
import type { LookupSearch } from '../tableView/FilterEditors'
import type { FilterCondition, FilterField } from '../tableView/filters'
import { icons } from '../tableView/icons'
import { useContextMenu, type MenuAction } from './Menu'

export type TableColumn<Row> = {
  key: string
  header: ReactNode
  /** Conteúdo da célula; a primeira coluna recebe mais espaço e a hierarquia. */
  cell: (row: Row) => ReactNode
  /** Largura em CSS grid: `minmax(130px, .8fr)`, `100px`. Padrão: `minmax(0, 1fr)`. Sem efeito com `view`. */
  width?: string
  /** Some abaixo de 1120px (`compact`) ou de 820px (`mobile`). Sem efeito com `view`: quem decide é a visão. */
  hideBelow?: 'compact' | 'mobile'
  align?: 'start' | 'end'
  /** Nome da coluna no painel de colunas e nos anúncios. Padrão: `header`, quando é texto. */
  label?: string
  /** Largura inicial em px com `view`. Padrão: 240 na primeira coluna e 160 nas outras. */
  defaultWidth?: number
  /** Começa oculta na visão padrão. */
  defaultHidden?: boolean
  /** Com `view`, o menu do título oferece "Ordenar A→Z" e "Z→A"; a tela ordena as linhas por `config.sort`. */
  sortable?: boolean
}

/**
 * Liga a tabela a uma visão (§10.9.1): ordem, visibilidade, largura e ordenação vêm de `config`.
 * `extraCell` desenha as colunas adicionadas pelo usuário (`x:`), recebendo o `rowKey` da linha; sem ele elas não aparecem.
 */
export type TableView = {
  config: ViewConfig
  onChange: (update: (config: ViewConfig) => ViewConfig) => void
  extraCell?: (rowKey: string, key: string) => ReactNode
}

/** Filtro por coluna (§10.9.2): "Filtrar por…" no menu do título abre o painel ancorado ao cabeçalho. Exige `view`. */
export type TableQuickFilters = {
  fields: FilterField[]
  value: Record<string, FilterCondition>
  onChange: (key: string, condition: FilterCondition | null) => void
  search?: LookupSearch
  /** Colunas com qualquer filtro valendo (por coluna ou avançado): ▾ azul com ponto no título e "Limpar filtro" no menu. */
  filtered?: string[]
}

export type TableProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  columns: TableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Linha inteira clicável: vira um `button` com seta à direita. */
  onRowClick?: (row: Row) => void
  /** Cor da barra de gravidade à esquerda da linha, com o rótulo acessível. */
  severity?: (row: Row) => { tone: 'success' | 'warning' | 'danger'; label: string } | null
  /** Mostrado quando `rows` está vazio (um `EmptyState`). */
  empty?: ReactNode
  /** Rodapé com contagem e paginação. */
  footer?: ReactNode
  /** Mostra linhas de carregamento no lugar dos dados. */
  loading?: boolean
  /** Visão salva: reordenar e ajustar largura no cabeçalho, ordenar e rolar na horizontal. */
  view?: TableView
  /** Filtro por coluna no menu do título; exige `view`. */
  quickFilters?: TableQuickFilters
  /** Ações do clique direito na linha (§10.9.3). Sem ela, a linha com `onRowClick` oferece "Abrir"; `[]` desliga o menu. */
  rowActions?: (row: Row) => MenuAction[]
}

/** Trilhas do grid: `full` com todas as colunas e `compact` (até 1120px) sem as colunas `hideBelow: 'compact'`. */
export function tableTemplates<Row>(columns: TableColumn<Row>[], chevron: boolean) {
  const build = (visible: TableColumn<Row>[]) => [...visible.map((column) => column.width ?? 'minmax(0, 1fr)'), chevron ? '24px' : null].filter(Boolean).join(' ')
  return { full: build(columns), compact: build(columns.filter((column) => column.hideBelow !== 'compact')) }
}

/** Colunas da tabela no formato do modelo de visão (`useTableView`, `ColumnsPanel`). */
export function tableViewColumns<Row>(columns: TableColumn<Row>[]): ViewColumnDef[] {
  return columns.map((c) => ({ key: c.key, label: c.label ?? (typeof c.header === 'string' ? c.header : c.key), defaultHidden: c.defaultHidden }))
}

export const columnDefaultWidth = <Row,>(column: TableColumn<Row>, index: number) => column.defaultWidth ?? (index === 0 ? 240 : 160)

type Placed<Row> = { column: TableColumn<Row>; width: number; label: string }

/** Colunas do código mais as adicionadas pelo usuário na visão (`x:`), com o rótulo guardado na visão. */
export function withExtraColumns<Row>(columns: TableColumn<Row>[], config: ViewConfig, cell: (row: Row, key: string) => ReactNode): TableColumn<Row>[] {
  const known = new Set(columns.map((c) => c.key))
  const extras = config.columns.filter((c) => isExtraColumn(c.key) && !known.has(c.key)).map((c): TableColumn<Row> => ({
    key: c.key, header: c.label ?? c.key, label: c.label ?? c.key, sortable: true, cell: (row) => cell(row, c.key),
  }))
  return extras.length ? [...columns, ...extras] : columns
}

/** Colunas visíveis da visão, na ordem e com a largura em px; a última trilha estica até a borda. */
export function viewLayout<Row>(columns: TableColumn<Row>[], config: ViewConfig, chevron: boolean) {
  const defs = tableViewColumns(columns)
  const byKey = new Map(columns.map((c, i) => [c.key, { column: c, index: i }]))
  const placed: Placed<Row>[] = visibleColumns(config).flatMap((state) => {
    const found = byKey.get(state.key)
    return found ? [{ column: found.column, width: state.width ?? columnDefaultWidth(found.column, found.index), label: defs[found.index].label }] : []
  })
  const template = [...placed.map((p) => `${p.width}px`), chevron ? 'minmax(24px, 1fr)' : 'minmax(0, 1fr)'].join(' ')
  return { defs, placed, template }
}

const RESIZE_STEP = 16
const DRAG_THRESHOLD = 4
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Lista operacional em linhas: cabeçalho off-white, barra de gravidade, linha clicável e cabeçalho que some no mobile. */
export function Table<Row>({ columns: own, rows, rowKey, onRowClick, severity, empty, footer, loading = false, view, quickFilters, rowActions, className, style, ...rest }: TableProps<Row>) {
  const extraCell = view?.extraCell
  const columns = view && extraCell ? withExtraColumns(own, view.config, (row: Row, key) => extraCell(rowKey(row), key)) : own
  const context = useContextMenu()
  const actionsOf = rowActions ?? (onRowClick ? (row: Row) => [{ id: 'abrir', label: 'Abrir', icon: icons.open, onSelect: () => onRowClick(row) }] : null)
  const chevron = Boolean(onRowClick)
  const layout = view ? viewLayout(columns, view.config, chevron) : null
  const placed: Placed<Row>[] = layout ? layout.placed : columns.map((column, index) => ({ column, width: 0, label: tableViewColumns(columns)[index].label }))
  const template = layout ? { full: layout.template, compact: layout.template } : tableTemplates(columns, chevron)
  const cellClass = (column: TableColumn<Row>, index: number) => ['bt-table__cell',
    !view && column.hideBelow && `bt-table__cell--hide-${column.hideBelow}`,
    view && index >= 3 && 'bt-table__cell--extra',
    column.align === 'end' && 'bt-table__cell--end'].filter(Boolean).join(' ')
  const RowTag = onRowClick ? 'button' : 'div'

  const body = (
    <>
      {view && layout ? <ViewHead placed={placed} defs={layout.defs} view={view} chevron={chevron} cellClass={cellClass} quick={quickFilters} /> : (
        <div className="bt-table__head" role="row">
          {placed.map(({ column }, index) => <span key={column.key} role="columnheader" className={cellClass(column, index)}>{column.header}</span>)}
          {chevron ? <span aria-hidden="true" /> : null}
        </div>
      )}
      {loading ? [0, 1, 2].map((index) => (
        <div key={index} className="bt-table__row bt-table__row--loading" role="row" aria-hidden="true">
          {placed.map(({ column }, i) => <span key={column.key} className={cellClass(column, i)}><span className="bt-table__skeleton" /></span>)}
        </div>
      )) : null}
      {!loading && rows.length === 0 ? <div className="bt-table__empty">{empty}</div> : null}
      {!loading ? rows.map((row) => {
        const mark = severity?.(row)
        return (
          <RowTag
            key={rowKey(row)}
            type={onRowClick ? 'button' : undefined}
            className="bt-table__row"
            role="row"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onContextMenu={actionsOf ? (event) => { context.onContextMenu(event, actionsOf(row)) } : undefined}
          >
            {placed.map(({ column }, index) => (
              <span key={column.key} role="cell" className={cellClass(column, index)}>
                {index === 0 && mark ? <i className={`bt-table__severity bt-table__severity--${mark.tone}`} role="img" aria-label={mark.label} /> : null}
                {column.cell(row)}
              </span>
            ))}
            {onRowClick ? (
              <svg className="bt-table__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            ) : null}
          </RowTag>
        )
      }) : null}
    </>
  )

  return (
    <div className={['bt-table', view && 'bt-table--view', className].filter(Boolean).join(' ')} style={{ ...style, ['--bt-table-columns' as string]: template.full, ['--bt-table-columns-compact' as string]: template.compact }} role="table" aria-busy={loading || undefined} {...rest}>
      {view ? <div className="bt-table__scroll">{body}</div> : body}
      {footer != null ? <div className="bt-table__footer">{footer}</div> : null}
      {context.menu}
    </div>
  )
}

type Drag = { key: string; pointerId: number; startX: number; grab: number; started: boolean; x: number }
type Resize = { key: string; pointerId: number; startX: number; startWidth: number }

/** Cabeçalho com visão: o título abre o menu (ordenar, filtrar, ocultar), arrastar reordena, alça de largura e atalhos de teclado, com anúncio em `aria-live`. */
function ViewHead<Row>({ placed, defs, view, chevron, cellClass, quick }: { placed: Placed<Row>[]; defs: ViewColumnDef[]; view: TableView; chevron: boolean; cellClass: (column: TableColumn<Row>, index: number) => string; quick?: TableQuickFilters }) {
  const headRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const resize = useRef<Resize | null>(null)
  const suppressClick = useRef(false)
  const positions = useRef(new Map<string, number>())
  const [dragging, setDragging] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const first = defs[0]?.key
  const order = placed.map((p) => p.column.key).join('|')
  const sort = view.config.sort
  // Coluna com o painel "Filtrar por" aberto; o painel ancora no gatilho do menu dessa coluna.
  const [filterAt, setFilterAt] = useState<string | null>(null)
  const closeFilter = useCallback(() => setFilterAt(null), [])
  const filterField = filterAt ? quick?.fields.find((f) => f.key === filterAt && !f.advancedOnly) : undefined
  const filterAnchor = filterAt ? headRef.current?.querySelector<HTMLElement>(`.bt-colhead[data-col="${CSS.escape(filterAt)}"]`) ?? null : null
  // O chip de filtro ativo pede para reabrir o painel da coluna.
  useEffect(() => {
    const head = headRef.current
    if (!head) return
    const open = (event: Event) => {
      const key = (event.target as HTMLElement).closest<HTMLElement>('.bt-colhead')?.dataset.col
      if (key && quick?.fields.some((f) => f.key === key && !f.advancedOnly)) { event.preventDefault(); setFilterAt(key) }
    }
    head.addEventListener(COLUMN_FILTER_EVENT, open)
    return () => head.removeEventListener(COLUMN_FILTER_EVENT, open)
  }, [quick])

  const cellOf = (key: string) => headRef.current?.querySelector<HTMLElement>(`[data-col="${CSS.escape(key)}"]`) ?? null
  const announce = (key: string, config: ViewConfig) => {
    const visible = visibleColumns(config)
    const label = defs.find((d) => d.key === key)?.label ?? key
    setMessage(`Coluna ${label} na posição ${visible.findIndex((c) => c.key === key) + 1} de ${visible.length}`)
  }

  // FLIP só no cabeçalho: as colunas vizinhas deslizam para o novo lugar; a arrastada segue o ponteiro.
  useLayoutEffect(() => {
    const head = headRef.current
    if (!head) return
    const animate = !reducedMotion()
    for (const cell of Array.from(head.querySelectorAll<HTMLElement>('[data-col]'))) {
      const key = cell.dataset.col as string
      const before = positions.current.get(key)
      positions.current.set(key, cell.offsetLeft)
      if (key === drag.current?.key) {
        // A arrastada continua sob o ponteiro depois que trocou de lugar.
        if (drag.current.started) cell.style.transform = `translateX(${drag.current.x - drag.current.grab - cell.offsetLeft}px)`
        continue
      }
      if (!animate || before === undefined || before === cell.offsetLeft) continue
      cell.animate([{ transform: `translateX(${before - cell.offsetLeft}px)` }, { transform: 'none' }], { duration: 150, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
    }
  }, [order])

  const update = (fn: (config: ViewConfig) => ViewConfig) => view.onChange(fn)
  const moveBy = (key: string, step: -1 | 1) => {
    const index = placed.findIndex((p) => p.column.key === key)
    const next = moveVisibleColumn(view.config, defs, key, index + step)
    update(() => next)
    announce(key, next)
  }

  // O React move o nó da coluna ao reordenar, o que solta a captura do ponteiro: o arraste ouve a janela e lê o estado mais recente.
  const latest = useRef({ placed, view })
  latest.current = { placed, view }

  function onCellPointerDown(event: PointerEvent<HTMLElement>, key: string) {
    if (key === first || event.pointerType === 'touch' || event.button !== 0 || (event.target as HTMLElement).closest('.bt-table__resize')) return
    const pointerId = event.pointerId
    drag.current = { key, pointerId, startX: event.clientX, grab: event.clientX - event.currentTarget.getBoundingClientRect().left, started: false, x: 0 }
    const onMove = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) dragMove(e.clientX) }
    const onUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragEnd()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  function dragMove(clientX: number) {
    const state = drag.current
    const head = headRef.current
    if (!state || !head) return
    if (!state.started) {
      if (Math.abs(clientX - state.startX) < DRAG_THRESHOLD) return
      state.started = true
      setDragging(state.key)
    }
    const x = clientX - head.getBoundingClientRect().left
    state.x = x
    const cell = cellOf(state.key)
    if (cell) cell.style.transform = `translateX(${x - state.grab - cell.offsetLeft}px)`
    // Posição final: quantas colunas (fora a arrastada) têm o meio à esquerda do ponteiro.
    const { placed: current, view: bound } = latest.current
    const others = current.map((p) => p.column.key).filter((k) => k !== state.key)
    const target = Math.max(1, others.filter((k) => { const c = cellOf(k); return c ? c.offsetLeft + c.offsetWidth / 2 < x : false }).length)
    if (current.findIndex((p) => p.column.key === state.key) !== target) bound.onChange((config) => moveVisibleColumn(config, defs, state.key, target))
  }
  function dragEnd() {
    const state = drag.current
    drag.current = null
    if (!state?.started) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    const cell = cellOf(state.key)
    if (cell) cell.style.transform = ''
    setDragging(null)
    announce(state.key, latest.current.view.config)
  }

  function onResizePointerDown(event: PointerEvent<HTMLElement>, key: string, width: number) {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resize.current = { key, pointerId: event.pointerId, startX: event.clientX, startWidth: width }
  }
  function onResizePointerMove(event: PointerEvent<HTMLElement>) {
    const state = resize.current
    if (!state || state.pointerId !== event.pointerId) return
    const width = state.startWidth + event.clientX - state.startX
    update((config) => resizeColumn(config, state.key, width))
  }
  function onResizePointerUp(event: PointerEvent<HTMLElement>) {
    if (resize.current?.pointerId !== event.pointerId) return
    resize.current = null
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
  }
  function onResizeKeyDown(event: KeyboardEvent<HTMLElement>, key: string, width: number) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    update((config) => resizeColumn(config, key, width + (event.key === 'ArrowRight' ? RESIZE_STEP : -RESIZE_STEP)))
  }
  function onCellKeyDown(event: KeyboardEvent<HTMLElement>, key: string) {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || key === first) return
    event.preventDefault()
    moveBy(key, event.key === 'ArrowRight' ? 1 : -1)
  }

  return (
    <>
    <div ref={headRef} className="bt-table__head" role="row">
      {placed.map(({ column, width, label }, index) => {
        const sorted = sort?.key === column.key ? sort.dir : null
        const movable = column.key !== first
        return (
          <span
            key={column.key}
            data-col={column.key}
            role="columnheader"
            aria-sort={column.sortable ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
            aria-label={movable ? `${label}. Alt e setas movem a coluna.` : undefined}
            className={[cellClass(column, index), 'bt-table__headcell', movable && 'bt-table__headcell--movable', dragging === column.key && 'is-dragging'].filter(Boolean).join(' ')}
            onPointerDown={(event) => onCellPointerDown(event, column.key)}
            onKeyDown={(event) => onCellKeyDown(event, column.key)}
          >
            <ColumnMenu
              label={label}
              columnKey={column.key}
              sortable={Boolean(column.sortable)}
              sortIcon={sorted ? <span className={['bt-colhead__sort', sorted === 'desc' && 'is-desc'].filter(Boolean).join(' ')} aria-hidden="true">{icons.up}</span> : null}
              filterable={Boolean(quick?.fields.some((f) => f.key === column.key && !f.advancedOnly))}
              filtered={Boolean(quick?.filtered?.includes(column.key))}
              canHide={placed.length > 1}
              suppressClick={() => suppressClick.current}
              onSort={(descending) => update((config) => sortBy(config, column.key, descending ? 'desc' : 'asc'))}
              onFilter={() => setFilterAt(column.key)}
              onClearFilter={() => quick?.onChange(column.key, null)}
              onHide={() => update((config) => toggleColumn(config, defs, column.key))}
            />
            <span
              className="bt-table__resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Largura de ${label}`}
              aria-valuenow={width}
              aria-valuemin={90}
              aria-valuemax={1200}
              tabIndex={0}
              onPointerDown={(event) => onResizePointerDown(event, column.key, width)}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={() => update((config) => resizeColumn(config, column.key, null))}
              onKeyDown={(event) => onResizeKeyDown(event, column.key, width)}
            />
          </span>
        )
      })}
      {chevron ? <span aria-hidden="true" /> : null}
    </div>
    <span className="bt-table__live" aria-live="polite">{message}</span>
    {quick && filterField && filterAnchor ? (
      <ColumnFilter anchor={filterAnchor} field={filterField} value={quick.value[filterField.key]} search={quick.search} onChange={(condition) => quick.onChange(filterField.key, condition)} onClose={closeFilter} />
    ) : null}
    </>
  )
}

/** Título e identificador para a primeira coluna: título em uma linha, apoio em 11px. */
export function TableTitle({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="bt-table__title">
      <strong>{title}</strong>
      {meta != null ? <span>{meta}</span> : null}
    </span>
  )
}
