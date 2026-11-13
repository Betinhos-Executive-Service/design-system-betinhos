import { Children, Fragment, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { useOptionalToast } from '../components/Alert'
import { AuditButton } from '../components/Audit'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field, Input } from '../components/Field'
import { Menu, type MenuAction } from '../components/Menu'
import { useMediaQuery } from '../useMediaQuery'
import type { ViewColumnDef } from './config'
import { ColumnsPanel, type ColumnCatalog } from './ColumnsPanel'
import { FilterChips } from './FilterChips'
import type { LookupSearch } from './FilterEditors'
import { COLUMN_FILTER_EVENT } from './ColumnMenu'
import { countActiveFilters, emptyFilters, readFilters, storedFilters, type FilterField, type TableFilters } from './filters'
import { FiltersPanel, type FiltersPanelTab } from './FiltersPanel'
import { SelectionBar, SelectionInline, countLabel, inlineActions, selectionOverflow, type ViewBarSelection } from './Selection'
import { fitZone, planFit, type FitPlan, type FitSize, type ZoneFit } from './viewBarFit'
import { icons } from './icons'
import type { TableViewEntry } from './store'
import type { TableDensity } from '../components/Table'
import { VIEW_DISCARD_DELAY_MS, type TableViewState } from './useTableView'

/** Explica o selo "Alterada" (§10.9.1): o que difere e onde resolver, sem abrir o menu para descobrir. */
const DIRTY_HINT = 'Colunas, ordem ou filtros diferentes da visão salva. No menu: Salvar, Salvar como ou Restaurar padrão.'

export const VIEW_NAME_MAX = 100

export type ViewBarProps = {
  /** Estado de `useTableView`. */
  view: TableViewState
  /** Colunas da tabela (`tableViewColumns(columns)`), para o painel. */
  columns: ViewColumnDef[]
  /** Liga "Adicionar coluna" no painel: campos da tabela e das relações N:1 (§10.9.1). */
  catalog?: ColumnCatalog
  /** Liga as colunas fixas no painel (seção "Fixas" e alfinete). Passe o mesmo `pinnable` à `view` do `Table`. */
  pinnable?: boolean
  /** Comandos da tela depois de Colunas, Filtros e Auditoria. Com `search`, `more`, `primary` ou `selection`, fica depois da
   * busca e nunca encolhe nem sai da linha (selo, aviso). Comando que precisa ficar sempre visível vai em `primary`. */
  children?: ReactNode
  /** Busca por palavra-chave (`SearchBox`): de 140 a 320 px no espaço flexível. Sem espaço vira lupa, que abre a busca por
   * cima da linha e fecha quando ela perde o foco vazia. Nunca sai da linha, nem com seleção. */
  search?: ReactNode
  /** "⋮ Mais ações": comandos raros da tela (atalhos, modo de exibição). Fica no mesmo lugar com ou sem seleção; em cima
   * entram as ações da seleção que não couberam na linha e, embaixo, Colunas, Auditoria e Densidade quando saem da linha. */
  more?: MenuAction[]
  /** A ação primária da lista (§10.9.1): sempre a última à direita, fora da superfície. Nada aqui sai da linha; sem espaço,
   * botão com ícone perde o texto (fica no nome acessível e no `title`). Botão `secondary`/`ghost` ou só ícone (ex.: Atualizar)
   * entra na superfície, depois do ⋮; o resto (botão primário, o padrão do `Button`) fica fora.
   * Ex.: `<><Button variant="secondary" icon={…} aria-label="Atualizar" /><Button icon={…}>Criar</Button></>`. */
  primary?: ReactNode
  /** Modo seleção (§10.9.6): com `count > 0`, contador e ações `inline` entram no espaço reservado antes da busca; o que não
   * couber vai para o ⋮. Passe as mesmas `actions` com ou sem seleção (a reserva é medida com elas). No celular, barra no rodapé. */
  selection?: ViewBarSelection
  /** Liga o botão "Auditoria" (§10.9.4), depois de "Filtros": abre as alterações recentes da tabela (ou da seleção). */
  onAudit?: () => void
  /** Erro ao gravar; sem isso usa o toast do `ToastProvider`. */
  onError?: (message: string) => void
  /** Filtros da lista (§10.9.2): mostra "Filtros", "Filtro rápido", o painel e os chips. Os filtros moram em `view.config.filters`. */
  filters?: {
    fields: FilterField[]
    search?: LookupSearch
    countPreview?: (filters: TableFilters) => Promise<number | null>
    /** Chaves/ids que a tela não conseguiu aplicar (chip com alerta). */
    notApplied?: string[]
  }
}

const DENSITIES: { value: TableDensity; label: string; icon: ReactNode }[] = [
  { value: 'default', label: 'Confortável', icon: icons.rows },
  { value: 'dense', label: 'Compacta', icon: icons.rowsDense },
  { value: 'minimal', label: 'Mínima', icon: icons.rowsMinimal },
]

/** Largura da busca no espaço flexível (§10.9.1). Os fixos recolhem para manter `SEARCH_MIN`; com linhas marcadas a caixa
 * ainda fica até `SEARCH_COMPACT` (ícone + texto legível) antes de virar lupa (1.32). `SEARCH_MAX` é a busca aberta pela lupa. */
const SEARCH_MIN = 140
const SEARCH_COMPACT = 96
const SEARCH_MAX = 320

type Fit = { plan: FitPlan; zone: ZoneFit | null }

const cssPx = (element: Element | null, read: (style: CSSStyleDeclaration) => number, fallback: number) => {
  const value = element ? read(getComputedStyle(element)) : NaN
  return Number.isFinite(value) ? value : fallback
}
const cssGap = (element: Element | null, fallback: number) => cssPx(element, (style) => parseFloat(style.columnGap), fallback)
const cssFrame = (element: Element | null, fallback: number) => cssPx(element, (style) => parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth), fallback)

/** Separa `primary` (§10.9.1): botão `secondary`/`ghost` ou só ícone vai para a superfície (depois do ⋮); o resto (botão
 * primário, padrão do `Button`) fica fora, à direita. Só o `Button` do DS é lido: outro componente fica fora. Fragmentos são
 * abertos; o prefixo da chave evita chaves repetidas entre fragmentos aninhados. */
function splitPrimary(node: ReactNode) {
  type Props = { variant?: string; children?: ReactNode }
  const flat = (value: ReactNode, prefix = ''): ReactNode[] => Children.toArray(value).flatMap((child) => {
    if (!isValidElement(child)) return [child]
    if (child.type === Fragment) return flat((child as ReactElement<Props>).props.children, `${prefix}${String(child.key)}/`)
    return [prefix ? cloneElement(child, { key: `${prefix}${String(child.key)}` }) : child]
  })
  const tools: ReactNode[] = []
  const main: ReactNode[] = []
  for (const child of flat(node)) {
    const props = isValidElement(child) && child.type === Button ? (child as ReactElement<Props>).props : null
    const tool = props != null && (props.variant === 'secondary' || props.variant === 'ghost' || props.children == null || props.children === false)
    ;(tool ? tools : main).push(child)
  }
  return { tools, main }
}

const cloneFor = (element: HTMLElement, compact: boolean) => {
  const copy = element.cloneNode(true) as HTMLElement
  copy.hidden = false
  copy.removeAttribute('style')
  copy.removeAttribute('id')
  copy.classList.toggle('is-compact', compact)
  copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
  return copy
}

/** Larguras naturais de cada item `[data-vb]`, com e sem texto, medidas em cópias numa camada invisível da própria barra
 * (mesmo CSS). Medir cópias, e não os itens, deixa a medida igual em qualquer degrau: não há laço nem piscada. Cada cópia
 * fica num contêiner com a classe do original (superfície ou fim da linha), para herdar as mesmas regras de altura. */
function measureItems(bar: HTMLElement, layer: HTMLElement, sampleCounter: string) {
  const copies: Array<[string, HTMLElement, HTMLElement]> = []
  const box = (className: string) => Object.assign(document.createElement('div'), { className })
  const surfaceBox = box('bt-viewbar__surface')
  const endBox = box('bt-viewbar__end')
  const loose: HTMLElement[] = []
  bar.querySelectorAll<HTMLElement>('[data-vb]').forEach((element) => {
    const key = element.dataset.vb ?? ''
    // Itens com a mesma chave (os fios) são iguais: mede um só.
    if (layer.contains(element) || copies.some(([seen]) => seen === key)) return
    const pair: [string, HTMLElement, HTMLElement] = [key, cloneFor(element, false), cloneFor(element, true)]
    const extra: Array<[string, HTMLElement, HTMLElement]> = []
    if (key === 'sel-count') {
      const sample = cloneFor(element, false)
      const label = sample.querySelector('.bt-selection__label')
      if (label) label.textContent = sampleCounter
      extra.push(['sel-count-sample', sample, sample])
    }
    const target = element.closest('.bt-viewbar__surface') ? surfaceBox : element.closest('.bt-viewbar__end') ? endBox : null
    for (const [, full, compact] of [pair, ...extra]) for (const copy of full === compact ? [full] : [full, compact]) (target ? target.append(copy) : loose.push(copy))
    copies.push(pair, ...extra)
  })
  layer.replaceChildren(...loose, surfaceBox, endBox)
  const width = (element: HTMLElement) => Math.ceil(element.getBoundingClientRect().width)
  const sizes = new Map<string, FitSize>(copies.map(([key, full, compact]) => [key, { full: width(full), compact: width(compact) }]))
  layer.replaceChildren()
  return sizes
}

type Mode = 'create' | 'rename' | 'delete' | 'publish' | null

const scopeIcon = (entry: TableViewEntry) => (entry.scope === 'publica' ? icons.users : entry.scope === 'pessoal' ? icons.user : icons.table)
const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Tente de novo em instantes.')

/**
 * Linha de comando da lista (§10.9.1): o seletor de visão é o título da página; à direita, "Colunas" e os comandos da tela.
 * Gravar, renomear, excluir e publicar abrem diálogo e avisam por toast.
 */
export function ViewBar({ view, columns, catalog, pinnable, children, onError, filters, onAudit, search, more, primary, selection }: ViewBarProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
  // Com os espaços nomeados a linha tem lugar fixo para cada coisa; só `children` soltos mantém o desenho antigo.
  const slotted = search !== undefined || more !== undefined || primary !== undefined || selection !== undefined
  const selecting = selection != null && selection.count > 0
  const toast = useOptionalToast()
  const [mode, setMode] = useState<Mode>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState(false)
  const [filtersTab, setFiltersTab] = useState<FiltersPanelTab | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // O texto do diálogo não esvazia enquanto ele fecha.
  const lastName = useRef(view.active.name)
  if (mode === null) lastName.current = view.active.name

  const { active, dirty, canPublish } = view
  const defaults = view.views[0].config

  const fail = (title: string, error: unknown) => {
    const message = `${title} ${messageOf(error)}`
    if (onError) onError(message)
    else toast?.({ tone: 'danger', message })
  }
  const run = async (action: () => Promise<void>, failure: string, success?: string) => {
    setBusy(true)
    try {
      await action()
      setMode(null)
      if (success) toast?.({ tone: 'success', message: success })
    } catch (error) {
      fail(failure, error)
    } finally {
      setBusy(false)
    }
  }
  const open = (next: Exclude<Mode, null>) => {
    setName(next === 'rename' ? active.name : '')
    setMode(next)
  }
  const close = () => { if (!busy) setMode(null) }
  const trimmed = name.trim()
  const submitName = () => {
    if (!trimmed || busy) return
    if (mode === 'rename') void run(() => view.rename(trimmed), 'Não foi possível renomear a visão.', 'Visão renomeada.')
    else void run(() => view.saveAs(trimmed), 'Não foi possível salvar a visão.', 'Visão salva. Ela fica só para você.')
  }

  // Lixeira das visões pessoais (§10.9.1): exclui sem diálogo, com "Desfazer" no toast enquanto o store espera.
  // Sem `discard` no estado (adaptadores próprios da tela), a visão pessoal segue pelo diálogo "Excluir visão…".
  const trashable = view.discard !== undefined
  const discard = (v: TableViewEntry) => {
    if (!view.discard) return
    const { undo, done } = view.discard(v.id)
    const onUndo = () => { if (!undo()) toast?.({ tone: 'info', message: `A visão “${v.name}” já foi excluída.` }) }
    toast?.({ tone: 'success', message: `Visão “${v.name}” excluída.`, duration: VIEW_DISCARD_DELAY_MS, action: { label: 'Desfazer', onClick: onUndo } })
    done.catch((error: unknown) => fail('Não foi possível excluir a visão.', error))
  }
  const viewItems = (scope: TableViewEntry['scope'], group: string): MenuAction[] => view.views.filter((v) => v.scope === scope).map((v) => ({
    id: `visao-${v.id}`, label: v.name, icon: scopeIcon(v), group, selected: v.id === active.id, onSelect: () => view.select(v.id),
    secondary: scope === 'pessoal' && trashable ? { icon: icons.trash, label: `Excluir “${v.name}”`, onSelect: () => discard(v) } : undefined,
  }))
  const actions: MenuAction[] = [
    ...viewItems('padrao', 'Padrão'),
    ...viewItems('publica', 'Públicas'),
    ...viewItems('pessoal', 'Minhas'),
    ...(active.canEdit && dirty ? [{ id: 'salvar', label: 'Salvar', icon: icons.save, group: '', onSelect: () => { void run(view.save, 'Não foi possível salvar a visão.', 'Visão salva.') } }] : []),
    { id: 'salvar-como', label: 'Salvar como…', icon: icons.saveAs, group: '', onSelect: () => open('create') },
    ...(active.canEdit ? [{ id: 'renomear', label: 'Renomear…', icon: icons.pencil, group: '', onSelect: () => open('rename') }] : []),
    ...(canPublish && active.scope === 'pessoal' ? [{ id: 'publicar', label: 'Tornar pública…', icon: icons.share, group: '', onSelect: () => open('publish') }] : []),
    ...(active.scope !== 'padrao' || dirty ? [{ id: 'restaurar', label: 'Restaurar padrão', icon: icons.reset, group: '', onSelect: view.restore }] : []),
    ...(active.canEdit && (active.scope === 'publica' || !trashable) ? [{ id: 'excluir', label: 'Excluir visão…', icon: icons.trash, group: '', tone: 'danger' as const, onSelect: () => open('delete') }] : []),
  ]

  const current = filters ? readFilters(view.config.filters, filters.fields) : null
  // Filtro que a tela não conseguiu aplicar (campos indisponíveis) some no `readFilters`; o chip dele precisa continuar
  // visível, com o alerta "não aplicado" (§10.9.2). Nesse caso os chips mostram o que está gravado.
  const raw = view.config.filters as Partial<TableFilters> | undefined
  const shown = filters?.notApplied?.length && raw?.quick && typeof raw.quick === 'object'
    ? { quick: raw.quick, advanced: raw.advanced?.type === 'group' ? raw.advanced : emptyFilters().advanced }
    : current
  const activeCount = filters && current ? countActiveFilters(current, filters.fields) : 0
  const setFilters = (next: TableFilters) => view.setConfig((config) => ({ ...config, filters: storedFilters(next) }))
  // O chip de filtro por coluna reabre o painel "Filtrar por" no título da coluna (evento tratado pelo cabeçalho, que
  // cancela o evento). Coluna fora da visão, cabeçalho escondido (mobile) ou ninguém tratando: painel na aba "Por coluna".
  const editQuick = (key: string) => {
    const target = mobile ? null : document.querySelector<HTMLElement>(`.bt-colhead[data-col="${CSS.escape(key)}"]`)
    const handled = target ? !target.dispatchEvent(new CustomEvent(COLUMN_FILTER_EVENT, { bubbles: true, cancelable: true })) : false
    if (!handled) setFiltersTab('coluna')
  }

  const densityActions: MenuAction[] = DENSITIES.map((d) => ({ id: `densidade-${d.value}`, label: d.label, icon: d.icon, group: 'Densidade das linhas', selected: view.density === d.value, onSelect: () => view.setDensity(d.value) }))
  const densityIcon = DENSITIES.find((d) => d.value === view.density)?.icon ?? icons.rows
  const size = mobile ? 'touch' : 'default'

  // Medida e degrau de encolhimento (§10.9.1). Só no modo de espaços nomeados; o legado não mede nada.
  const barRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const lupaRef = useRef<HTMLButtonElement>(null)
  const [fit, setFit] = useState<Fit | null>(null)
  const [searchOpen, setSearchOpen] = useState<{ right: number; width: number } | null>(null)
  const inSelection = selection !== undefined && !mobile
  const hasSearch = search != null && search !== false
  const split = splitPrimary(primary)
  const hasPrimary = split.main.length > 0
  const hasTools = split.tools.length > 0
  const hasExtra = children != null && children !== false
  const measure = useRef<() => void>(() => undefined)
  measure.current = () => {
    const bar = barRef.current
    const layer = layerRef.current
    if (!slotted || !bar || !layer) return
    const avail = bar.getBoundingClientRect().width
    if (!avail) return // escondida (aba, display: none): mantém o último degrau
    const sizes = measureItems(bar, layer, countLabel({ count: 88, label: selection?.label }))
    const surface = bar.querySelector('.bt-viewbar__surface')
    const gap = cssGap(surface, 2)
    const square = sizes.get('density')?.full || (mobile ? 44 : 34)
    const box = (key: string) => sizes.get(key) ?? { full: square, compact: square }
    const inline = inSelection && selection ? inlineActions(selection) : []
    const plan = planFit({
      avail, gap, startGap: cssGap(bar, 12), endGap: cssGap(bar.querySelector('.bt-viewbar__end'), 8), frame: cssFrame(surface, 6),
      sep: sizes.get('sep')?.full ?? 9, start: sizes.get('view') ?? { full: 0, compact: 0 }, square,
      colunas: box('colunas'),
      filtros: filters ? box('filtros') : undefined,
      audit: onAudit ? box('audit') : undefined,
      tools: hasTools ? sizes.get('tools') : undefined,
      primary: hasPrimary ? sizes.get('primary') : undefined,
      extra: hasExtra ? sizes.get('extra')?.full ?? 0 : 0,
      search: hasSearch, searchMin: SEARCH_MIN,
      menu: Boolean(more?.length) || selection !== undefined,
      selection: inSelection ? { counter: sizes.get('sel-count-sample')?.full ?? 0 } : undefined,
    })
    // Seleção e busca dividem a zona; as ações da seleção nunca tiram espaço dos fixos (1.32).
    const zone = inSelection ? fitZone(plan.flex, selecting ? sizes.get('sel-count')?.full ?? 0 : 0, inline.map((action) => box(`sel:${action.id}`)), gap, hasSearch ? { min: SEARCH_MIN, compact: SEARCH_COMPACT, square } : null) : null
    const next: Fit = { plan, zone }
    setFit((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }
  // Antes da pintura: o primeiro quadro já sai no degrau certo.
  useLayoutEffect(() => { measure.current() })
  useEffect(() => {
    const bar = barRef.current
    const layer = layerRef.current
    if (!slotted || !bar) return
    const run = () => measure.current()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run)
    resize?.observe(bar)
    // Texto que muda sem renderizar o ViewBar (contador dentro de `primary`, selo em `children`); ignora a camada de medida.
    const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => { if (records.some((record) => !layer?.contains(record.target))) run() })
    mutation?.observe(bar, { childList: true, characterData: true, subtree: true })
    void document.fonts?.ready.then(run, () => undefined)
    return () => { resize?.disconnect(); mutation?.disconnect() }
  }, [slotted])

  const plan = fit?.plan
  const labels = plan?.labels ?? true
  const primaryLabel = plan?.primaryLabel ?? true
  const fold = plan?.fold ?? { audit: false, density: false, colunas: false }
  // Com reserva da seleção, quem decide caixa ou lupa é a divisão da zona (sem linhas marcadas a busca ocupa a reserva).
  const lupa = (fit?.zone ? fit.zone.search === 'lupa' : plan?.lupa) ?? false
  const startCompact = plan?.startCompact ?? false
  const inlineCount = selection ? inlineActions(selection).length : 0
  const selShown = fit?.zone?.shown ?? inlineCount
  const floating = lupa && searchOpen !== null

  // Ação principal só ícone: o rótulo continua como nome acessível e vira a dica (`title`) se a tela não deu uma.
  useLayoutEffect(() => {
    barRef.current?.querySelectorAll<HTMLElement>('.bt-viewbar__end > [data-vb="primary"] .bt-button, .bt-viewbar__surface > [data-vb="tools"] .bt-button').forEach((button) => {
      const text = button.querySelector('.bt-button__label')?.textContent?.trim()
      if (!primaryLabel && text && !button.title) { button.title = text; button.dataset.vbTitle = '' }
      else if (primaryLabel && button.dataset.vbTitle !== undefined) { button.removeAttribute('title'); delete button.dataset.vbTitle }
    })
  })
  useEffect(() => { if (floating) searchRef.current?.querySelector<HTMLInputElement>('input')?.focus() }, [floating])
  // Voltou espaço para a busca: a lupa some e a próxima vez que ela aparecer começa fechada.
  useEffect(() => { if (!lupa) setSearchOpen(null) }, [lupa])
  const openSearch = () => {
    const bar = barRef.current?.getBoundingClientRect()
    const anchor = lupaRef.current?.getBoundingClientRect()
    if (!bar || !anchor) return
    setSearchOpen({ right: Math.max(0, bar.right - anchor.right), width: Math.min(SEARCH_MAX, anchor.right - bar.left) })
  }
  const searchValue = () => searchRef.current?.querySelector<HTMLInputElement>('input')?.value ?? ''
  const onSearchBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!floating || event.currentTarget.contains(event.relatedTarget as Node | null)) return
    if (!searchValue()) setSearchOpen(null)
  }
  const onSearchKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (floating && event.key === 'Escape' && !searchValue()) { event.preventDefault(); setSearchOpen(null); lupaRef.current?.focus() }
  }

  // Menu único do ⋮ (§10.9.6): seleção que não coube em cima, ações da tela e, embaixo, o que saiu da linha.
  const selItems = selecting && !mobile && selection ? selectionOverflow(selection, selShown) : []
  const screenItems = (more ?? []).map((action) => (selItems.length && action.group === undefined ? { ...action, group: '' } : action))
  const foldItems: MenuAction[] = [
    ...(fold.colunas ? [{ id: 'viewbar-colunas', label: 'Colunas', icon: icons.columns, group: 'Lista', onSelect: () => setPanel(true) }] : []),
    ...(fold.audit && onAudit ? [{ id: 'viewbar-auditoria', label: 'Auditoria', icon: icons.history, group: 'Lista', onSelect: onAudit }] : []),
    ...(fold.density ? densityActions : []),
  ]
  const menuItems = [...selItems, ...screenItems, ...foldItems]
  const menuShown = Boolean(more?.length) || selection !== undefined || foldItems.length > 0
  const slot = (compact: boolean) => (compact ? 'bt-viewbar__slot is-compact' : 'bt-viewbar__slot')

  const viewMenu = (
    <Menu
      align="start"
      actions={actions}
      trigger={(props) => (
        <button {...props} type="button" data-vb="view" className={`bt-viewbar__trigger${startCompact ? ' is-compact' : ''}`} title={startCompact ? `${active.name}${dirty ? ` (alterada). ${DIRTY_HINT}` : ''}` : dirty ? DIRTY_HINT : undefined} aria-label={`Visão: ${active.name}${dirty ? ` (alterada: ${DIRTY_HINT})` : ''}. Trocar ou salvar visão`}>
          {/* Ícone da visão (padrão = lista): na padrão só aparece no modo compacto (§10.9.1). */}
          {active.scope === 'padrao' && !slotted ? null : <span className={`bt-viewbar__scope${active.scope === 'padrao' ? ' bt-viewbar__scope--compact' : ''}`} aria-hidden="true">{scopeIcon(active)}</span>}
          <span className="bt-viewbar__name">{active.name}</span>
          <span className="bt-viewbar__chevron" aria-hidden="true">{icons.chevronDown}</span>
          {dirty ? <span className="bt-viewbar__dirty" aria-hidden="true">Alterada</span> : null}
        </button>
      )}
    />
  )

  const overlays = (
    <>
      <ColumnsPanel
        open={panel}
        onClose={() => setPanel(false)}
        columns={columns}
        config={view.config}
        defaults={defaults}
        onApply={(next) => view.setConfig(() => next)}
        catalog={catalog}
        pinnable={pinnable}
        groupFields={filters?.fields}
      />

      <Dialog
        open={mode === 'create' || mode === 'rename'}
        onClose={close}
        title={mode === 'rename' ? 'Renomear visão' : 'Salvar como visão'}
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button>
          <Button loading={busy} disabled={!trimmed} onClick={submitName}>{mode === 'rename' ? 'Renomear' : 'Salvar visão'}</Button>
        </>}
      >
        <div className="bt-viewbar__form">
          {mode === 'create' ? <p>A visão guarda as colunas, a ordem, as larguras, a ordenação e os filtros que estão na tela. Fica só para você.</p> : null}
          <Field label="Nome da visão" required>
            <Input ref={inputRef} value={name} maxLength={VIEW_NAME_MAX} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitName() } }} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={mode === 'publish'}
        onClose={close}
        title="Tornar esta visão pública?"
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button>
          <Button loading={busy} onClick={() => { void run(view.publish, 'Não foi possível publicar a visão.', 'Visão pública.') }}>Tornar pública</Button>
        </>}
      >
        <div className="bt-viewbar__form">
          <p>Todos passam a ver “{lastName.current}” nesta lista. Depois disso, só gestores alteram ou excluem a visão.</p>
        </div>
      </Dialog>

      <Dialog
        open={mode === 'delete'}
        onClose={close}
        tone="danger"
        title="Excluir esta visão?"
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={close}>Manter visão</Button>
          <Button variant="danger" loading={busy} onClick={() => { void run(view.remove, 'Não foi possível excluir a visão.', 'Visão excluída.') }}>Excluir visão</Button>
        </>}
      >
        <div className="bt-viewbar__form">
          <p>A visão “{lastName.current}” será excluída{active.scope === 'publica' ? ' para todos' : ''} e não pode ser recuperada. Os registros não são afetados.</p>
        </div>
      </Dialog>
    </>
  )

  const chips = filters && current ? (
    <>
      <FilterChips
        filters={shown ?? current}
        fields={filters.fields}
        notApplied={filters.notApplied}
        onChange={setFilters}
        onEditQuick={editQuick}
        onEditAdvanced={() => setFiltersTab('avancado')}
      />
      <FiltersPanel
        open={filtersTab !== null}
        initialTab={filtersTab ?? 'coluna'}
        onClose={() => setFiltersTab(null)}
        fields={filters.fields}
        value={current}
        search={filters.search}
        countPreview={filters.countPreview}
        onApply={setFilters}
      />
    </>
  ) : null

  // Modo legado (`children` sem espaços nomeados): o desenho de antes, sem medir.
  if (!slotted) return (
    <>
    <div className="bt-viewbar">
      <div className="bt-viewbar__start">{viewMenu}</div>
      <div className="bt-viewbar__end">
        <Button variant="secondary" size={size} icon={icons.columns} aria-haspopup="dialog" aria-label={mobile ? 'Colunas' : undefined} onClick={() => setPanel(true)}>
          {mobile ? null : 'Colunas'}
        </Button>
        {filters ? (
          <>
            <Button variant="secondary" size={size} icon={icons.filter} aria-haspopup="dialog" aria-label={mobile ? `Filtros${activeCount ? ` (${activeCount})` : ''}` : undefined} onClick={() => setFiltersTab('coluna')}>
              {mobile ? null : <>Filtros{activeCount ? <span className="bt-viewbar__count">{activeCount}</span> : null}</>}
            </Button>
          </>
        ) : null}
        <Menu
          actions={densityActions}
          trigger={(props) => (
            <Button {...props} variant="secondary" size={size} icon={densityIcon} aria-label="Densidade das linhas" title="Densidade das linhas" />
          )}
        />
        {onAudit ? <AuditButton iconOnly={mobile} size={size} onClick={onAudit} /> : null}
        {children}
      </div>
      {overlays}
    </div>
    {chips}
    </>
  )

  // Fora da lupa a busca não tem largura fixa: ocupa na zona o que a seleção não usa (CSS).
  const searchStyle = floating && searchOpen ? { right: searchOpen.right, width: searchOpen.width } : undefined
  // A zona estica quando a busca está aberta ou há reserva da seleção (fixos parados); só com a lupa, a superfície abraça
  // os itens. Sem nada visível dentro, a zona não ganha fios (nunca fio ao lado de vazio).
  const zoneGrows = inSelection || (hasSearch && !lupa)
  const zoneShown = hasSearch || hasExtra || (inSelection && selecting)
  // O trecho da seleção abraça o conteúdo e a sobra vai para a busca: a caixa estica e, no degrau da lupa, a lupa também
  // (1.32). Só sem busca o trecho ocupa a sobra, para não sobrar vão entre o fio e a seleção.
  const zoneFill = inSelection && selecting && !hasSearch
  const lupaFill = inSelection && lupa
  // Superfície única (§10.9.1): os grupos na ordem, com um fio entre cada par visível. Grupo dobrado continua no DOM
  // (escondido, para ser medido) e sem fio.
  const groups: Array<[string, boolean, ReactNode]> = [
    ['colunas', !fold.colunas, (
      <div className={slot(!labels)} data-vb="colunas" hidden={fold.colunas}>
        <Button variant="secondary" size={size} icon={icons.columns} aria-haspopup="dialog" title={labels ? undefined : 'Colunas'} onClick={() => setPanel(true)}>Colunas</Button>
      </div>
    )],
    ['filtros', true, filters ? (
      <div className={slot(!labels)} data-vb="filtros">
        <Button variant="secondary" size={size} icon={icons.filter} iconEnd={activeCount ? <span className="bt-viewbar__count">{activeCount}</span> : null} aria-haspopup="dialog" title={labels ? undefined : `Filtros${activeCount ? ` (${activeCount})` : ''}`} onClick={() => setFiltersTab('coluna')}>Filtros</Button>
      </div>
    ) : null],
    ['density', !fold.density, (
      <div className="bt-viewbar__slot" hidden={fold.density}>
        <Menu
          actions={densityActions}
          trigger={(props) => (
            <Button {...props} variant="secondary" size={size} icon={densityIcon} data-vb="density" aria-label="Densidade das linhas" title="Densidade das linhas" />
          )}
        />
      </div>
    )],
    ['audit', !fold.audit, onAudit ? (
      <div className={slot(!labels)} data-vb="audit" hidden={fold.audit}>
        <AuditButton size={size} onClick={onAudit} />
      </div>
    ) : null],
    ['zone', zoneShown, (
        <div className={['bt-viewbar__zone', zoneFill && 'is-fill', lupaFill && 'is-lupa-fill'].filter(Boolean).join(' ')}>
          {inSelection && selection ? <SelectionInline selection={selection} shown={selShown} compact={!(fit?.zone?.labels ?? true)} /> : null}
          {hasSearch ? (
            <>
              {lupa ? <Button ref={lupaRef} variant="secondary" size={size} icon={icons.search} className="bt-viewbar__lupa" aria-label="Buscar" title="Buscar" aria-expanded={floating} onClick={() => (floating ? setSearchOpen(null) : openSearch())} /> : null}
              <div ref={searchRef} className={['bt-viewbar__search', floating && 'is-floating', searchStyle && 'is-sized'].filter(Boolean).join(' ')} hidden={lupa && !floating} style={searchStyle} onBlur={onSearchBlur} onKeyDown={onSearchKeyDown}>
                {search}
              </div>
            </>
          ) : null}
          {hasExtra ? <div className="bt-viewbar__slot" data-vb="extra">{children}</div> : null}
        </div>
    )],
    ['menu', true, menuShown ? (
      <Menu
        actions={menuItems}
        trigger={(props) => (
          <Button {...props} variant="secondary" size={size} icon={icons.more} className="bt-viewbar__more" disabled={!menuItems.length} aria-label={selItems.length ? `Mais ações (${selItems.length} da seleção)` : 'Mais ações'} title="Mais ações" />
        )}
      />
    ) : null],
    ['tools', true, hasTools ? <div className={slot(!primaryLabel)} data-vb="tools">{split.tools}</div> : null],
  ]
  let seen = false
  const surfaceItems = groups.map(([key, visible, node]) => {
    if (node == null) return null
    const sep = visible && seen
    if (visible) seen = true
    // Reserva vazia (seleção sem busca nem `children`, nada marcado): o grupo seguinte também fica sem fio.
    else if (key === 'zone' && zoneGrows) seen = false
    return <Fragment key={key}>{sep ? <span className="bt-viewbar__sep" data-vb="sep" aria-hidden="true" /> : null}{node}</Fragment>
  })
  return (
    <>
    <div ref={barRef} className={`bt-viewbar bt-viewbar--slots${selecting ? ' is-selecting' : ''}`}>
      <div className="bt-viewbar__start">{viewMenu}</div>
      <div className="bt-viewbar__end">
        <div className={`bt-viewbar__surface${zoneGrows ? '' : ' is-hug'}`}>{surfaceItems}</div>
        {hasPrimary ? <div className={slot(!primaryLabel)} data-vb="primary">{split.main}</div> : null}
      </div>
      <div ref={layerRef} className="bt-viewbar__measure" aria-hidden="true" />
      {selecting && mobile && selection ? <SelectionBar selection={selection} menu={[...(more ?? []), ...foldItems]} /> : null}
      {overlays}
    </div>
    {chips}
    </>
  )
}
