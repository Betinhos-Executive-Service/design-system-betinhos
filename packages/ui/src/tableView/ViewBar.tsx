import { useRef, useState, type ReactNode } from 'react'
import { useOptionalToast } from '../components/Alert'
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
import { icons } from './icons'
import type { TableViewEntry } from './store'
import type { TableViewState } from './useTableView'

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
  /** Comandos à direita, depois de "Colunas": Filtros, busca e a ação primária, nessa ordem. */
  children?: ReactNode
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

type Mode = 'create' | 'rename' | 'delete' | 'publish' | null

const scopeIcon = (entry: TableViewEntry) => (entry.scope === 'publica' ? icons.users : entry.scope === 'pessoal' ? icons.user : icons.table)
const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Tente de novo em instantes.')

/**
 * Linha de comando da lista (§10.9.1): o seletor de visão é o título da página; à direita, "Colunas" e os comandos da tela.
 * Gravar, renomear, excluir e publicar abrem diálogo e avisam por toast.
 */
export function ViewBar({ view, columns, catalog, children, onError, filters }: ViewBarProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
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

  const viewItems = (scope: TableViewEntry['scope'], group: string): MenuAction[] => view.views.filter((v) => v.scope === scope).map((v) => ({
    id: `visao-${v.id}`, label: v.name, icon: scopeIcon(v), group, selected: v.id === active.id, onSelect: () => view.select(v.id),
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
    ...(active.canEdit ? [{ id: 'excluir', label: 'Excluir visão…', icon: icons.trash, group: '', tone: 'danger' as const, onSelect: () => open('delete') }] : []),
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

  return (
    <>
    <div className="bt-viewbar">
      <div className="bt-viewbar__start">
        <Menu
          align="start"
          actions={actions}
          trigger={(props) => (
            <button {...props} type="button" className="bt-viewbar__trigger" title={dirty ? DIRTY_HINT : undefined} aria-label={`Visão: ${active.name}${dirty ? ` (alterada: ${DIRTY_HINT})` : ''}. Trocar ou salvar visão`}>
              {active.scope === 'padrao' ? null : <span className="bt-viewbar__scope" aria-hidden="true">{scopeIcon(active)}</span>}
              <span className="bt-viewbar__name">{active.name}</span>
              <span className="bt-viewbar__chevron" aria-hidden="true">{icons.chevronDown}</span>
              {dirty ? <span className="bt-viewbar__dirty" aria-hidden="true">Alterada</span> : null}
            </button>
          )}
        />
      </div>
      <div className="bt-viewbar__end">
        <Button variant="secondary" size={mobile ? 'touch' : 'default'} icon={icons.columns} aria-haspopup="dialog" aria-label={mobile ? 'Colunas' : undefined} onClick={() => setPanel(true)}>
          {mobile ? null : 'Colunas'}
        </Button>
        {filters ? (
          <>
            <Button variant="secondary" size={mobile ? 'touch' : 'default'} icon={icons.filter} aria-haspopup="dialog" aria-label={mobile ? `Filtros${activeCount ? ` (${activeCount})` : ''}` : undefined} onClick={() => setFiltersTab('coluna')}>
              {mobile ? null : <>Filtros{activeCount ? <span className="bt-viewbar__count">{activeCount}</span> : null}</>}
            </Button>
          </>
        ) : null}
        {children}
      </div>

      <ColumnsPanel
        open={panel}
        onClose={() => setPanel(false)}
        columns={columns}
        config={view.config}
        defaults={defaults}
        onApply={(next) => view.setConfig(() => next)}
        catalog={catalog}
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
    </div>
    {filters && current ? (
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
    ) : null}
    </>
  )
}
