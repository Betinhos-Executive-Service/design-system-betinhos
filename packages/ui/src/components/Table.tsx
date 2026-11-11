import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react'
import { isExtraColumn, moveVisibleColumn, pinColumn, resizeColumn, unpinColumn, sortBy, toggleColumn, visibleColumns, type ViewColumnDef, type ViewConfig } from '../tableView/config'
import { ColumnFilter } from '../tableView/ColumnFilter'
import { COLUMN_FILTER_EVENT, ColumnMenu } from '../tableView/ColumnMenu'
import type { LookupSearch } from '../tableView/FilterEditors'
import type { FilterCondition, FilterField } from '../tableView/filters'
import { icons } from '../tableView/icons'
import { Checkbox } from './Choice'
import { useContextMenu, wantsNativeMenu, type MenuAction } from './Menu'

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
  /** Começa fixa na visão padrão (só com `view`). */
  defaultPinned?: boolean
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
  /** Liga "Fixar coluna" no menu do título; a escolha vai na visão (`pinned`). Passe o mesmo `pinnable` ao `ViewBar`. */
  pinnable?: boolean
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

/** Seleção de linhas (§10.9.3): estado controlado pela tela, pelas chaves de `rowKey`. */
export type TableSelection<Row> = {
  /** Chaves (`rowKey`) selecionadas. */
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  /** Texto do checkbox para leitor de tela. Padrão: "Selecionar linha". */
  label?: (row: Row) => string
}

export type TableProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  columns: TableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Linha inteira clicável: vira um `button` com seta à direita. Com `selection`, abre no duplo clique, no Enter, na seta e em "Abrir". */
  onRowClick?: (row: Row) => void
  /**
   * Liga a seleção: checkbox fixo à esquerda e no cabeçalho (linhas carregadas); clique sozinho substitui, Ctrl/Cmd alterna,
   * Shift seleciona o intervalo desde o último clique; Esc limpa. O Table não poda a seleção quando as linhas mudam.
   */
  selection?: TableSelection<Row>
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
  /**
   * Ações do clique direito na linha (§10.9.3). Sem ela, a linha com `onRowClick` oferece "Abrir"; `[]` desliga o menu.
   * `selection` traz as linhas sobre as quais o menu age: com `selection` ligada, todas as selecionadas
   * (clique direito fora da seleção seleciona só a linha); sem ela, sempre `[row]`.
   */
  rowActions?: (row: Row, selection: Row[]) => MenuAction[]
  /** Contêiner de rolagem (`.bt-table__scroll`), raiz do observador da rolagem infinita. Sem `view`, passa a existir com esta prop. */
  scrollRef?: Ref<HTMLDivElement>
  /** Conteúdo logo depois da última linha, dentro da rolagem (ex.: o sentinela de "carregar mais"). */
  afterRows?: ReactNode
}

/** Largura da coluna de seleção (checkbox), sempre fixa e fora do limite das fixas. */
export const SELECT_COLUMN_WIDTH = 40

/** Trilhas do grid: `full` com todas as colunas e `compact` (até 1120px) sem as colunas `hideBelow: 'compact'`. */
export function tableTemplates<Row>(columns: TableColumn<Row>[], chevron: boolean, selection = false) {
  const build = (visible: TableColumn<Row>[]) => [selection ? `${SELECT_COLUMN_WIDTH}px` : null, ...visible.map((column) => column.width ?? 'minmax(0, 1fr)'), chevron ? '24px' : null].filter(Boolean).join(' ')
  return { full: build(columns), compact: build(columns.filter((column) => column.hideBelow !== 'compact')) }
}

/** Colunas da tabela no formato do modelo de visão (`useTableView`, `ColumnsPanel`). */
export function tableViewColumns<Row>(columns: TableColumn<Row>[]): ViewColumnDef[] {
  return columns.map((c) => ({ key: c.key, label: c.label ?? (typeof c.header === 'string' ? c.header : c.key), defaultHidden: c.defaultHidden, defaultPinned: c.defaultPinned }))
}

export const columnDefaultWidth = <Row,>(column: TableColumn<Row>, index: number) => column.defaultWidth ?? (index === 0 ? 240 : 160)

/** Coluna que gruda na rolagem: `left` em px desde o início da linha e quantos espaços entre colunas vêm antes dela. */
export type TablePin = { left: number; gaps: number; last: boolean }

type Placed<Row> = { column: TableColumn<Row>; width: number; label: string; pinned: boolean; pin?: TablePin }

/** `lead`: coluna antes dos dados (seleção), sempre fixa e fora do limite. `maxPinned`: largura máxima em px das fixas. */
export type ViewLayoutOptions = { lead?: number; maxPinned?: number }

/** Colunas do código mais as adicionadas pelo usuário na visão (`x:`), com o rótulo guardado na visão. */
export function withExtraColumns<Row>(columns: TableColumn<Row>[], config: ViewConfig, cell: (row: Row, key: string) => ReactNode): TableColumn<Row>[] {
  const known = new Set(columns.map((c) => c.key))
  const extras = config.columns.filter((c) => isExtraColumn(c.key) && !known.has(c.key)).map((c): TableColumn<Row> => ({
    key: c.key, header: c.label ?? c.key, label: c.label ?? c.key, sortable: true, cell: (row) => cell(row, c.key),
  }))
  return extras.length ? [...columns, ...extras] : columns
}

/**
 * Colunas visíveis da visão, na ordem e com a largura em px; a última trilha estica até a borda.
 * As fixas recebem `pin` com o deslocamento acumulado; a que passaria de `maxPinned` deixa de grudar, e as seguintes também.
 * `pinnedWidth` soma as larguras de todas as fixas pedidas na visão (grudando ou não).
 */
export function viewLayout<Row>(columns: TableColumn<Row>[], config: ViewConfig, chevron: boolean, { lead = 0, maxPinned }: ViewLayoutOptions = {}) {
  const defs = tableViewColumns(columns)
  const byKey = new Map(columns.map((c, i) => [c.key, { column: c, index: i }]))
  const placed: Placed<Row>[] = visibleColumns(config).flatMap((state) => {
    const found = byKey.get(state.key)
    return found ? [{ column: found.column, width: state.width ?? columnDefaultWidth(found.column, found.index), label: defs[found.index].label, pinned: state.pinned === true }] : []
  })
  let pinnedWidth = 0
  let sticking = true
  placed.forEach((p, index) => {
    if (!p.pinned) return
    sticking = sticking && (maxPinned === undefined || pinnedWidth + p.width <= maxPinned)
    if (sticking) p.pin = { left: lead + pinnedWidth, gaps: index + (lead ? 1 : 0), last: false }
    pinnedWidth += p.width
  })
  const lastPin = placed.filter((p) => p.pin).pop()
  if (lastPin?.pin) lastPin.pin.last = true
  const template = [lead ? `${lead}px` : null, ...placed.map((p) => `${p.width}px`), chevron ? 'minmax(24px, 1fr)' : 'minmax(0, 1fr)'].filter(Boolean).join(' ')
  return { defs, placed, template, pinnedWidth }
}

/** Estilo da célula fixa: `left` em px mais os espaços entre colunas e o recuo da linha. */
export function pinStyle(pin: TablePin | undefined): CSSProperties | undefined {
  if (!pin) return undefined
  return {
    ['--bt-pin-left' as string]: `calc(var(--bt-table-pad) + ${pin.left}px + ${pin.gaps} * var(--bt-table-gap))`,
    ...(pin.gaps === 0 ? { ['--bt-pin-cover' as string]: 'var(--bt-table-pad)' } : {}),
  }
}

const pinClass = (pin: TablePin | undefined) => pin ? ['bt-table__cell--pinned', pin.last && 'bt-table__cell--pin-last'].filter(Boolean).join(' ') : ''

/** Largura visível do contêiner de rolagem, para o limite das fixas; 0 enquanto não mede (ou sem ResizeObserver). */
function useViewportWidth(ref: { current: HTMLElement | null }, active: boolean) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!active || !node || typeof ResizeObserver === 'undefined') return
    setWidth(node.clientWidth)
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, active])
  return width
}

/** Fixas ocupam no máximo metade da largura visível da tabela. */
export const PINNED_MAX_RATIO = 0.5

/** Cliques nestes elementos dentro da linha não mexem na seleção nem abrem o registro. */
const INTERACTIVE = 'button, input, select, textarea, a, label, [role="listbox"], [role="option"], [role="dialog"], [role="menu"]'
const fromControl = (event: { target: EventTarget; currentTarget: EventTarget }) => {
  const hit = (event.target as HTMLElement).closest?.(INTERACTIVE)
  return Boolean(hit && hit !== event.currentTarget && (event.currentTarget as HTMLElement).contains(hit))
}

/** Próxima seleção pelo clique: sozinho substitui, Ctrl/Cmd alterna, Shift vai da âncora até a linha (sem âncora, só a linha). */
export function nextSelection(selected: ReadonlySet<string>, keys: string[], key: string, anchor: string | null, mode: 'only' | 'toggle' | 'range'): Set<string> {
  if (mode === 'toggle') {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  const from = mode === 'range' && anchor !== null ? keys.indexOf(anchor) : -1
  const to = keys.indexOf(key)
  if (from < 0 || to < 0) return new Set([key])
  return new Set(keys.slice(Math.min(from, to), Math.max(from, to) + 1))
}

const RESIZE_STEP = 16
const DRAG_THRESHOLD = 4
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Lista operacional em linhas: cabeçalho off-white, barra de gravidade, linha clicável e cabeçalho que some no mobile. */
export function Table<Row>({ columns: own, rows, rowKey, onRowClick, severity, empty, footer, loading = false, view, quickFilters, rowActions, selection, scrollRef: outerScrollRef, afterRows, className, style, onKeyDown, ...rest }: TableProps<Row>) {
  const extraCell = view?.extraCell
  const columns = view && extraCell ? withExtraColumns(own, view.config, (row: Row, key) => extraCell(rowKey(row), key)) : own
  const context = useContextMenu()
  const actionsOf = rowActions ?? (onRowClick ? (row: Row, _selection: Row[]) => [{ id: 'abrir', label: 'Abrir', icon: icons.open, onSelect: () => onRowClick(row) }] : null)
  const chevron = Boolean(onRowClick)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node
    if (typeof outerScrollRef === 'function') outerScrollRef(node)
    else if (outerScrollRef) (outerScrollRef as { current: HTMLDivElement | null }).current = node
  }, [outerScrollRef])
  const viewport = useViewportWidth(scrollRef, Boolean(view))
  const [scrolled, setScrolled] = useState(false)
  const maxPinned = viewport > 0 ? viewport * PINNED_MAX_RATIO : undefined
  const lead = selection ? SELECT_COLUMN_WIDTH : 0
  const layout = view ? viewLayout(columns, view.config, chevron, { lead, maxPinned }) : null
  const placed: Placed<Row>[] = layout ? layout.placed : columns.map((column, index) => ({ column, width: 0, label: tableViewColumns(columns)[index].label, pinned: false }))
  const template = layout ? { full: layout.template, compact: layout.template } : tableTemplates(columns, chevron, Boolean(selection))
  // Âncora do Shift: a última linha clicada sem Shift.
  const anchor = useRef<string | null>(null)
  const keys = selection ? rows.map(rowKey) : []
  const selectedCount = selection ? keys.filter((k) => selection.selected.has(k)).length : 0
  const allSelected = keys.length > 0 && selectedCount === keys.length
  const select = (key: string, mode: 'only' | 'toggle' | 'range') => {
    if (!selection) return
    selection.onChange(nextSelection(selection.selected, keys, key, anchor.current, mode))
    if (mode !== 'range' || anchor.current === null) anchor.current = key
  }
  const leadPin: TablePin = { left: 0, gaps: 0, last: !placed.some((p) => p.pin) }
  const leadCell = (content: ReactNode, role: string) => (
    <span role={role} className={['bt-table__cell', 'bt-table__cell--select', view && pinClass(leadPin)].filter(Boolean).join(' ')} style={view ? pinStyle(leadPin) : undefined}>{content}</span>
  )
  const headCheck = selection ? leadCell(
    <Checkbox
      className="bt-table__check"
      label="Selecionar linhas carregadas"
      checked={allSelected}
      ref={(node) => { if (node) node.indeterminate = selectedCount > 0 && !allSelected }}
      disabled={!keys.length}
      onChange={() => { selection.onChange(allSelected ? new Set() : new Set(keys)); anchor.current = null }}
    />, 'columnheader') : null
  const cellClass = (column: TableColumn<Row>, index: number) => ['bt-table__cell',
    !view && column.hideBelow && `bt-table__cell--hide-${column.hideBelow}`,
    view && index >= 3 && 'bt-table__cell--extra',
    column.align === 'end' && 'bt-table__cell--end',
    pinClass(placed[index]?.pin)].filter(Boolean).join(' ')
  const RowTag = onRowClick ? 'button' : 'div'

  const body = (
    <>
      {view && layout ? <ViewHead placed={placed} defs={layout.defs} view={view} chevron={chevron} cellClass={cellClass} quick={quickFilters} lead={headCheck} pinRoom={maxPinned === undefined ? Infinity : maxPinned - layout.pinnedWidth} /> : (
        <div className="bt-table__head" role="row">
          {headCheck}
          {placed.map(({ column }, index) => <span key={column.key} role="columnheader" className={cellClass(column, index)}>{column.header}</span>)}
          {chevron ? <span aria-hidden="true" /> : null}
        </div>
      )}
      {loading ? [0, 1, 2].map((index) => (
        <div key={index} className="bt-table__row bt-table__row--loading" role="row" aria-hidden="true">
          {selection ? leadCell(null, 'gridcell') : null}
          {placed.map(({ column, pin }, i) => <span key={column.key} className={cellClass(column, i)} style={pinStyle(pin)}><span className="bt-table__skeleton" /></span>)}
        </div>
      )) : null}
      {!loading && rows.length === 0 ? <div className="bt-table__empty">{empty}</div> : null}
      {!loading ? rows.map((row) => {
        const mark = severity?.(row)
        if (selection) {
          const key = rowKey(row)
          const checked = selection.selected.has(key)
          return (
            <div
              key={key}
              className={['bt-table__row', 'bt-table__row--selectable', checked && 'is-selected'].filter(Boolean).join(' ')}
              role="row"
              tabIndex={0}
              aria-selected={checked}
              // Shift+clique não seleciona texto.
              onMouseDown={(event) => { if (event.shiftKey && !fromControl(event)) event.preventDefault() }}
              onClick={(event) => { if (!fromControl(event)) select(key, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'only') }}
              onDoubleClick={onRowClick ? (event) => { if (!fromControl(event)) onRowClick(row) } : undefined}
              onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); onRowClick(row) } } : undefined}
              onContextMenu={actionsOf ? (event) => {
                if (wantsNativeMenu(event)) return
                const targets = checked ? rows.filter((other) => selection.selected.has(rowKey(other))) : [row]
                const actions = actionsOf(row, targets)
                if (actions.length === 0) return
                if (!checked) { selection.onChange(new Set([key])); anchor.current = key }
                context.onContextMenu(event, actions)
              } : undefined}
            >
              {leadCell(<Checkbox className="bt-table__check" label={selection.label?.(row) ?? 'Selecionar linha'} checked={checked} onChange={() => select(key, 'toggle')} />, 'gridcell')}
              {placed.map(({ column, pin }, index) => (
                <span key={column.key} role="gridcell" className={cellClass(column, index)} style={pinStyle(pin)}>
                  {index === 0 && mark ? <i className={`bt-table__severity bt-table__severity--${mark.tone}`} role="img" aria-label={mark.label} /> : null}
                  {column.cell(row)}
                </span>
              ))}
              {onRowClick ? (
                <button type="button" className="bt-table__open" aria-label="Abrir" title="Abrir" onClick={() => onRowClick(row)}>
                  <svg className="bt-table__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              ) : null}
            </div>
          )
        }
        return (
          <RowTag
            key={rowKey(row)}
            type={onRowClick ? 'button' : undefined}
            className="bt-table__row"
            role="row"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onContextMenu={actionsOf ? (event) => { context.onContextMenu(event, actionsOf(row, [row])) } : undefined}
          >
            {placed.map(({ column, pin }, index) => (
              <span key={column.key} role="cell" className={cellClass(column, index)} style={pinStyle(pin)}>
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
      {afterRows}
    </>
  )

  return (
    <div
      className={['bt-table', view && 'bt-table--view', selection && 'bt-table--selectable', scrolled && 'is-scrolled', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--bt-table-columns' as string]: template.full, ['--bt-table-columns-compact' as string]: template.compact }}
      role={selection ? 'grid' : 'table'}
      aria-multiselectable={selection ? true : undefined}
      aria-busy={loading || undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        // Esc com o foco na tabela limpa a seleção (menu, filtro e diálogo tratam o próprio Esc).
        if (selection && event.key === 'Escape' && !event.defaultPrevented && selection.selected.size && !(event.target as HTMLElement).closest('[role="menu"], [role="dialog"], .bt-colfilter')) {
          selection.onChange(new Set())
          anchor.current = null
        }
      }}
      {...rest}
    >
      {view || outerScrollRef ? <div ref={setScrollNode} className="bt-table__scroll" onScroll={(event) => { const next = event.currentTarget.scrollLeft > 0; if (next !== scrolled) setScrolled(next) }}>{body}</div> : body}
      {footer != null ? <div className="bt-table__footer">{footer}</div> : null}
      {context.menu}
    </div>
  )
}

type Drag = { key: string; pointerId: number; startX: number; grab: number; started: boolean; x: number }
type Resize = { key: string; pointerId: number; startX: number; startWidth: number }

/** Cabeçalho com visão: o título abre o menu (ordenar, filtrar, ocultar), arrastar reordena, alça de largura e atalhos de teclado, com anúncio em `aria-live`. */
function ViewHead<Row>({ placed, defs, view, chevron, cellClass, quick, pinRoom, lead }: { placed: Placed<Row>[]; defs: ViewColumnDef[]; view: TableView; chevron: boolean; cellClass: (column: TableColumn<Row>, index: number) => string; quick?: TableQuickFilters; pinRoom: number; lead?: ReactNode }) {
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
  const togglePin = (key: string, label: string, pinned: boolean) => {
    update((config) => (pinned ? unpinColumn : pinColumn)(config, defs, key))
    setMessage(pinned ? `Coluna ${label} solta` : `Coluna ${label} fixada`)
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
    const target = Math.max(0, others.filter((k) => { const c = cellOf(k); return c ? c.offsetLeft + c.offsetWidth / 2 < x : false }).length)
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
      {lead}
      {placed.map(({ column, width, label, pin, pinned }, index) => {
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
            style={pinStyle(pin)}
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
              pinned={pinned}
              onTogglePin={view.pinnable ? () => togglePin(column.key, label, pinned) : undefined}
              canPin={pinned || width <= pinRoom}
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
