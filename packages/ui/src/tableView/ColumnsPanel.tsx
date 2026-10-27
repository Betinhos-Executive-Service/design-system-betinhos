import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { Checkbox } from '../components/Choice'
import { Dialog } from '../components/Dialog'
import { Drawer } from '../components/Drawer'
import { Spinner } from '../components/Misc'
import { SearchBox } from '../components/SearchBox'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'
import { addColumn, EXTRA_COLUMN_PREFIX, isExtraColumn, moveVisibleColumn, removeColumn, sameConfig, toggleColumn, visibleColumns, type ViewColumnDef, type ViewConfig } from './config'
import { icons } from './icons'

/** Tipo do campo, para o ícone do catálogo (texto, número, data, escolha, vínculo). */
export type ColumnCatalogType = 'text' | 'number' | 'date' | 'choice' | 'lookup'

/**
 * Um item do catálogo: campo que vira coluna ou relação (N:1) que abre a tabela ligada.
 * Na relação, `description` é o nome da tabela de destino ("Funcionários").
 */
export type ColumnCatalogEntry = { id: string; label: string; relation?: boolean; description?: string; type?: ColumnCatalogType }

/**
 * Campos que o usuário pode adicionar como coluna (§10.9.1). `load([])` lista a tabela da tela; `load(['nav'])` lista a
 * tabela ligada pela relação `nav`, e assim por diante. A coluna nasce com a chave `x:` + caminho (`x:nav/campo`).
 */
export type ColumnCatalog = {
  load: (path: string[]) => Promise<ColumnCatalogEntry[]>
  /** Nome da tabela da lista ("Reservas"), no início da trilha. Padrão: "Esta lista". */
  label?: string
  /** Quantas relações seguidas o usuário pode abrir. Padrão: 3. */
  maxDepth?: number
}

export type ColumnsPanelProps = {
  open: boolean
  onClose: () => void
  columns: ViewColumnDef[]
  /** Configuração na tela; o painel edita um rascunho das colunas. */
  config: ViewConfig
  /** Colunas da visão padrão, para "Restaurar colunas". */
  defaults: ViewConfig
  /** Recebe a configuração com as colunas novas; filtros não mudam (a ordenação sai se a coluna dela foi removida). */
  onApply: (config: ViewConfig) => void
  /** Liga "Adicionar coluna": campos da tabela e das relações N:1. */
  catalog?: ColumnCatalog
}

/** Passo da trilha: relação aberta (`label` = campo de vínculo, `table` = tabela de destino). */
type Crumb = { id: string; label: string; table?: string }
type Level = { status: 'loading' } | { status: 'error' } | { status: 'ready'; entries: ColumnCatalogEntry[] }

const EDGE = 48
const SCROLL_STEP = 12
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * Painel de colunas (§10.9.1): mostrar/ocultar, reordenar (arraste, ↑/↓ ou teclado na alça) e adicionar campos da tabela
 * e das relações N:1; só vale em "Aplicar". Drawer no desktop, Sheet no mobile.
 */
export function ColumnsPanel({ open, onClose, columns, config, defaults, onApply, catalog }: ColumnsPanelProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const [draft, setDraft] = useState(config)
  const [confirming, setConfirming] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const [dragging, setDragging] = useState<string | null>(null)
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [adding, setAdding] = useState(false)
  // Busca única do painel: filtra as colunas da lista e oferece os campos desta tabela para adicionar ali mesmo.
  const [query, setQuery] = useState('')
  const [rootFields, setRootFields] = useState<ColumnCatalogEntry[] | null>(null)
  // Campos das tabelas relacionadas (1 nível), para a busca achar "Motorista › Telefone" sem abrir o catálogo.
  const [related, setRelated] = useState<{ key: string; label: string }[] | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const drag = useRef<{ key: string; y: number; frame: number } | null>(null)
  const tops = useRef(new Map<string, number>())
  const origin = useRef(0)
  // O arraste ouve a janela com o fechamento do pointerdown: lê o rascunho mais recente daqui.
  const current = useRef(draft)
  current.current = draft

  // Cada abertura começa do que está na tela.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setDraft(config); setAdding(false); setGrabbed(null); setQuery('') }
  }

  const labels = new Map(columns.map((c) => [c.key, c.label]))
  const labelOf = (key: string) => labels.get(key) ?? draft.columns.find((c) => c.key === key)?.label ?? key
  const first = columns[0]?.key
  const changed = !sameConfig(draft, config)
  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = (text: string) => words.every((w) => fold(text).includes(w))
  // Campos desta tabela para a busca: carregados uma vez, na primeira busca.
  useEffect(() => {
    if (!catalog || !words.length || rootFields) return
    let live = true
    catalog.load([]).then((entries) => { if (live) setRootFields(entries) }).catch(() => { if (live) setRootFields([]) })
    return () => { live = false }
  }, [catalog, words.length, rootFields])
  useEffect(() => {
    if (!catalog || !rootFields || related || fold(query).trim().length < 2) return
    let live = true
    const relations = rootFields.filter((e) => e.relation)
    void Promise.all(relations.map((rel) => catalog.load([rel.id])
      .then((fields) => fields.filter((f) => !f.relation).map((f) => ({ key: `${EXTRA_COLUMN_PREFIX}${rel.id}/${f.id}`, label: `${rel.label} › ${f.label}` })))
      .catch(() => [])))
      .then((groups) => { if (live) setRelated(groups.flat()) })
    return () => { live = false }
  }, [catalog, rootFields, related, query])
  const visible = visibleColumns(draft)
  const visibleCount = visible.length

  // Vizinhas deslizam até o novo lugar (FLIP, 150 ms); com movimento reduzido trocam de lugar direto.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) { tops.current.clear(); return }
    const animate = !reducedMotion()
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('[data-col]'))) {
      const key = el.dataset.col ?? ''
      const top = el.offsetTop
      const before = tops.current.get(key)
      tops.current.set(key, top)
      if (!animate || before === undefined || before === top) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${before - top}px)`
      requestAnimationFrame(() => { el.style.transition = ''; el.style.transform = '' })
    }
  }, [draft.columns, adding])

  // O botão da alça muda de lugar no DOM ao mover pelo teclado: devolve o foco a ele.
  useLayoutEffect(() => {
    if (grabbed) listRef.current?.querySelector<HTMLElement>(`[data-col="${CSS.escape(grabbed)}"] .bt-columns__handle`)?.focus()
  }, [draft.columns, grabbed])

  useEffect(() => () => { if (drag.current) cancelAnimationFrame(drag.current.frame) }, [])

  function requestClose() {
    if (changed) setConfirming(true)
    else onClose()
  }
  function discard() {
    setConfirming(false)
    onClose()
  }
  function apply() {
    onApply({ ...config, columns: draft.columns, sort: draft.sort })
    onClose()
  }
  function move(key: string, to: number) {
    // `to` é a posição entre as visíveis ("Na tabela"); as ocultas não contam.
    const base = current.current
    const next = moveVisibleColumn(base, columns, key, Math.max(1, to))
    if (next === base) return
    current.current = next
    setDraft(next)
    const shown = visibleColumns(next)
    setAnnounce(`Coluna ${labelOf(key)} na posição ${shown.findIndex((c) => c.key === key) + 1} de ${shown.length}`)
  }

  // O item muda de lugar no DOM ao reordenar e perde a captura do ponteiro: o arraste ouve a janela.
  function onHandlePointerDown(event: PointerEvent<HTMLElement>, key: string) {
    // Com a lista filtrada pela busca a posição não corresponde à ordem real: reordenar só sem busca.
    if (event.button !== 0 || words.length) return
    event.preventDefault()
    const pointerId = event.pointerId
    const scroller = scrollParent(listRef.current)
    // Rolagem automática enquanto o ponteiro estiver perto da borda do painel.
    const tick = () => {
      const state = drag.current
      if (!state) return
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const delta = state.y < box.top + EDGE ? -SCROLL_STEP : state.y > box.bottom - EDGE ? SCROLL_STEP : 0
        if (delta) { scroller.scrollTop += delta; dragMove(state.y) }
      }
      state.frame = requestAnimationFrame(tick)
    }
    drag.current = { key, y: event.clientY, frame: requestAnimationFrame(tick) }
    setDragging(key)
    document.body.classList.add('bt-columns-grabbing')
    const onMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId || !drag.current) return
      drag.current.y = e.clientY
      dragMove(e.clientY)
    }
    const onUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (drag.current) cancelAnimationFrame(drag.current.frame)
      drag.current = null
      document.body.classList.remove('bt-columns-grabbing')
      setDragging(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  function dragMove(clientY: number) {
    const state = drag.current
    const list = listRef.current
    if (!state || !list) return
    // Posição final: quantos itens (fora o arrastado) têm o meio acima do ponteiro; o primeiro é fixo.
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-col]')).filter((el) => el.dataset.col !== state.key)
    const target = Math.max(1, items.filter((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 < clientY }).length)
    if (visibleColumns(current.current).findIndex((c) => c.key === state.key) !== target) move(state.key, target)
  }

  // Teclado na alça: Espaço/Enter pega e solta, ↑/↓ move, Esc devolve ao lugar de origem.
  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: string, index: number) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (grabbed === key) {
        setGrabbed(null)
        setAnnounce(`${labelOf(key)} solta na posição ${index + 1} de ${visibleCount}`)
      } else {
        origin.current = index
        setGrabbed(key)
        setAnnounce(`${labelOf(key)} selecionada. Use as setas para mover e Espaço para soltar.`)
      }
    } else if (grabbed === key && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      move(key, index + (event.key === 'ArrowUp' ? -1 : 1))
    } else if (grabbed === key && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      move(key, origin.current)
      setGrabbed(null)
    }
  }

  function add(key: string, label: string) {
    setDraft((d) => addColumn(d, key, label))
    setAnnounce(`Coluna ${label} adicionada no fim`)
  }
  // Ocultar leva a coluna para "Ocultas"; mostrar a devolve ao fim de "Na tabela".
  function toggle(key: string, show: boolean) {
    setDraft((d) => {
      const next = toggleColumn(d, columns, key)
      return show ? moveVisibleColumn(next, columns, key, visibleColumns(next).length) : next
    })
    setAnnounce(show ? `Coluna ${labelOf(key)} mostrada no fim` : `Coluna ${labelOf(key)} oculta`)
  }

  const footer = adding ? (
    <div className="bt-columns__footer">
      <span className="bt-columns__footer-end">
        <Button onClick={() => setAdding(false)}>Concluir</Button>
      </span>
    </div>
  ) : (
    <div className="bt-columns__footer">
      <Button variant="ghost" icon={icons.reset} onClick={() => setDraft((d) => ({ ...d, columns: defaults.columns }))}>Restaurar colunas</Button>
      <span className="bt-columns__footer-end">
        <Button variant="secondary" onClick={requestClose}>Cancelar</Button>
        <Button onClick={apply} disabled={!changed}>Aplicar</Button>
      </span>
    </div>
  )

  const searching = words.length > 0
  const isShown = (key: string) => draft.columns.some((c) => c.key === key && c.visible)
  const addable = searching
    ? [
      ...(rootFields ?? []).filter((e) => !e.relation).map((e) => ({ key: `${EXTRA_COLUMN_PREFIX}${e.id}`, label: e.label })),
      ...(related ?? []),
    ].filter((e) => matches(e.label) && !isShown(e.key) && !draft.columns.some((c) => c.key === e.key && !c.visible))
    : []
  const onTable = visible.filter((c) => !searching || matches(labelOf(c.key)))
  const hidden = draft.columns.filter((c) => !c.visible && (!searching || matches(labelOf(c.key))))
  const loadingDeep = searching && catalog && (!rootFields || (fold(query).trim().length >= 2 && !related))

  const row = (state: ViewConfig['columns'][number], index: number) => {
    const label = labelOf(state.key)
    const fixed = state.key === first
    const extra = isExtraColumn(state.key)
    const onTableRow = state.visible
    return (
      <li key={state.key} data-col={onTableRow ? state.key : undefined} className={['bt-columns__item', !onTableRow && 'is-hidden', (dragging === state.key || grabbed === state.key) && 'is-dragging'].filter(Boolean).join(' ')}>
        {fixed ? <span className="bt-columns__handle bt-columns__handle--fixed" aria-hidden="true" title="Coluna fixa">{icons.lock}</span> : onTableRow ? (
          <button
            type="button"
            className="bt-columns__handle"
            aria-label={`Mover ${label}, posição ${index + 1} de ${visibleCount}`}
            aria-pressed={grabbed === state.key}
            aria-describedby="bt-columns-hint"
            title="Arraste para mudar a ordem"
            onPointerDown={(event) => onHandlePointerDown(event, state.key)}
            onKeyDown={(event) => onHandleKeyDown(event, state.key, index)}
            onBlur={() => { if (grabbed === state.key) setGrabbed(null) }}
          >{icons.grip}</button>
        ) : <span className="bt-columns__handle bt-columns__handle--fixed" aria-hidden="true" />}
        <Checkbox
          className="bt-columns__check"
          label={label}
          description={fixed ? 'Coluna fixa' : extra ? 'Adicionada' : undefined}
          checked={state.visible}
          disabled={fixed || (state.visible && visibleCount === 1)}
          onChange={() => toggle(state.key, !state.visible)}
        />
        {fixed ? null : (
          <span className="bt-columns__move">
            {onTableRow ? <>
              <Button variant="ghost" size="compact" icon={icons.up} aria-label={`Mover ${label} para cima`} disabled={index <= 1} onClick={() => move(state.key, index - 1)} />
              <Button variant="ghost" size="compact" icon={icons.down} aria-label={`Mover ${label} para baixo`} disabled={index === visibleCount - 1} onClick={() => move(state.key, index + 1)} />
            </> : null}
            {extra ? <Button variant="ghost" size="compact" icon={icons.close} aria-label={`Remover ${label}`} onClick={() => setDraft((d) => removeColumn(d, state.key))} /> : null}
          </span>
        )}
      </li>
    )
  }

  const list = (
    <>
      <div className="bt-columns__top">
        <SearchBox value={query} onChange={setQuery} placeholder={catalog ? 'Buscar ou adicionar coluna' : 'Buscar coluna'} aria-label={catalog ? 'Buscar ou adicionar coluna' : 'Buscar coluna'} />
      </div>
      <p id="bt-columns-hint" className="bt-columns__live">Arraste pela alça ou, com foco nela, use Espaço e as setas.</p>

      {addable.length || loadingDeep ? (
        <section className="bt-columns__section bt-columns__section--add" aria-label="Adicionar">
          <h3 className="bt-columns__heading">Adicionar</h3>
          <ul className="bt-columns-add__list">
            {addable.slice(0, 10).map((e) => (
              <li key={e.key}>
                <button type="button" className="bt-columns-add__entry" aria-label={`Adicionar ${e.label}`} onClick={() => add(e.key, e.label)}>
                  <span className="bt-columns-add__label">{e.label}</span>
                  <span className="bt-columns-add__icon" aria-hidden="true">{icons.plus}</span>
                </button>
              </li>
            ))}
          </ul>
          {loadingDeep ? <div className="bt-columns-add__state"><Spinner size={16} label="Buscando nas tabelas relacionadas" /> Buscando nas tabelas relacionadas…</div> : null}
        </section>
      ) : null}

      {searching && !onTable.length && !hidden.length && !addable.length && !loadingDeep ? <div className="bt-columns-add__state">Nenhuma coluna com “{query.trim()}”.</div> : null}

      {onTable.length ? (
        <section className="bt-columns__section" aria-label="Na tabela">
          <h3 className="bt-columns__heading">Na tabela <span>{visibleCount}</span></h3>
          <ul ref={listRef} className={['bt-columns', dragging && 'is-sorting', searching && 'is-filtered'].filter(Boolean).join(' ')} aria-label="Colunas na tabela">
            {onTable.map((state) => row(state, visible.indexOf(state)))}
          </ul>
        </section>
      ) : null}

      {hidden.length ? (
        <section className="bt-columns__section" aria-label="Ocultas">
          <h3 className="bt-columns__heading">
            Ocultas <span>{hidden.length}</span>
            {!searching ? <button type="button" className="bt-columns__link" onClick={() => setDraft((d) => ({ ...d, columns: [...visibleColumns(d), ...d.columns.filter((c) => !c.visible).map((c) => ({ ...c, visible: true }))] }))}>Mostrar todas</button> : null}
          </h3>
          <ul className="bt-columns" aria-label="Colunas ocultas">
            {hidden.map((state) => row(state, -1))}
          </ul>
        </section>
      ) : null}

      {catalog ? (
        <button type="button" className="bt-columns__more" onClick={() => setAdding(true)}>
          <span className="bt-columns-add__icon" aria-hidden="true">{icons.plus}</span>
          <span>{searching ? `Procurar “${query.trim()}” em todas as tabelas` : 'Adicionar coluna de outra tabela'}</span>
          <span className="bt-columns-add__icon" aria-hidden="true">{icons.chevronRight}</span>
        </button>
      ) : null}
    </>
  )

  const content = adding && catalog
    ? <AddColumn catalog={catalog} initialQuery={query} has={(key) => draft.columns.some((c) => c.key === key && c.visible)} onAdd={add} onBack={() => setAdding(false)} />
    : list
  const title = adding ? 'Adicionar coluna' : 'Colunas'

  return (
    <>
      {mobile
        ? <Sheet open={open} onClose={requestClose} title={title} footer={footer}>{content}</Sheet>
        : <Drawer open={open} onClose={requestClose} title={title} footer={footer}>{content}</Drawer>}
      {open ? <span className="bt-columns__live" role="status" aria-live="polite">{announce}</span> : null}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={discard}>Descartar</Button>
        </>}
      >
        As mudanças nas colunas ainda não foram aplicadas.
      </Dialog>
    </>
  )
}

type AddColumnProps = {
  catalog: ColumnCatalog
  has: (key: string) => boolean
  onAdd: (key: string, label: string) => void
  onBack: () => void
  /** Texto já digitado na busca do painel. */
  initialQuery?: string
}

const TYPE_ICON: Record<ColumnCatalogType, ReactNode> = {
  text: icons.typeText, number: icons.typeNumber, date: icons.typeDate, choice: icons.typeChoice, lookup: icons.typeLookup,
}
const TYPE_LABEL: Record<ColumnCatalogType, string> = { text: 'texto', number: 'número', date: 'data', choice: 'opção', lookup: 'vínculo' }

/**
 * Catálogo de colunas de outras tabelas (§10.9.1). Coluna e tabela nunca se confundem: coluna tem ícone do tipo e "+";
 * tabela tem ícone de tabela em fundo azul-claro, nome em negrito, a tabela de destino e "Abrir". A trilha diz onde se está.
 */
function AddColumn({ catalog, has, onAdd, onBack, initialQuery = '' }: AddColumnProps) {
  const maxDepth = catalog.maxDepth ?? 3
  const root = catalog.label ?? 'Esta lista'
  const [trail, setTrail] = useState<Crumb[]>([])
  const [query, setQuery] = useState(initialQuery)
  const [level, setLevel] = useState<Level>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const path = trail.map((c) => c.id)
  const pathKey = path.join('/')

  useEffect(() => {
    let live = true
    setLevel({ status: 'loading' })
    catalog.load(pathKey ? pathKey.split('/') : [])
      .then((entries) => { if (live) setLevel({ status: 'ready', entries }) })
      .catch(() => { if (live) setLevel({ status: 'error' }) })
    return () => { live = false }
  }, [catalog, pathKey, attempt])

  const go = (next: Crumb[]) => { setTrail(next); setQuery('') }
  // Cada tabela aberta começa do topo: a rolagem da anterior não vale para a nova lista.
  const boxRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const scroller = scrollParent(boxRef.current) ?? boxRef.current?.parentElement
    if (scroller) scroller.scrollTop = 0
  }, [pathKey])
  const last = trail[trail.length - 1]
  const words = fold(query).split(/\s+/).filter(Boolean)
  const hit = (e: ColumnCatalogEntry) => words.every((w) => fold(`${e.label} ${e.description ?? ''}`).includes(w))
  const all = level.status === 'ready' ? level.entries : []
  const fields = all.filter((e) => !e.relation && hit(e))
  const atLimit = trail.length >= maxDepth
  const relations = atLimit ? [] : all.filter((e) => e.relation && hit(e))
  const here = trail.length ? trail[trail.length - 1].label : root

  return (
    <div ref={boxRef} className="bt-columns-add">
      <nav className="bt-columns-add__trail" aria-label="Você está em">
        <Button variant="ghost" size="compact" icon={icons.back} aria-label={trail.length ? 'Voltar uma tabela' : 'Voltar às colunas'} onClick={trail.length ? () => go(trail.slice(0, -1)) : onBack} />
        <ol>
          {[{ id: '', label: root }, ...trail].map((c, i, list) => (
            <li key={c.id || 'raiz'}>
              {i ? <span className="bt-columns-add__sep" aria-hidden="true">›</span> : null}
              <button type="button" className="bt-columns-add__crumb" aria-current={i === list.length - 1 ? 'location' : undefined} onClick={() => go(trail.slice(0, i))}>
                <span className="bt-columns-add__crumb-icon" aria-hidden="true">{icons.table}</span>{c.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {last ? null : <p className="bt-columns-add__hint">Clique numa <strong>coluna</strong> para adicionar. Abra uma <strong>tabela</strong> ligada para ver as colunas dela.</p>}
      <SearchBox value={query} onChange={setQuery} placeholder={`Buscar em ${here}`} aria-label={`Buscar em ${here}`} />
      {level.status === 'loading' ? <div className="bt-columns-add__state"><Spinner size={16} label="Carregando" /> Carregando {here}…</div> : null}
      {level.status === 'error' ? (
        <div className="bt-columns-add__state">
          <span>Não foi possível carregar {here}.</span>
          <Button variant="secondary" size="compact" onClick={() => setAttempt((n) => n + 1)}>Tentar de novo</Button>
        </div>
      ) : null}
      {level.status === 'ready' && !fields.length && !relations.length ? <div className="bt-columns-add__state">Nada encontrado em {here}.</div> : null}

      {fields.length ? (
        <section className="bt-columns__section" aria-label={`Colunas de ${here}`}>
          <h3 className="bt-columns__heading">{last ? <>Colunas de {here}{last.table && last.table !== last.label ? ` · ${last.table}` : ''}</> : <>Colunas de {here}</>} <span>{fields.length}</span></h3>
          <ul className="bt-columns-add__list">
            {fields.map((e) => {
              const key = `${EXTRA_COLUMN_PREFIX}${[...path, e.id].join('/')}`
              const label = [...trail.map((c) => c.label), e.label].join(' › ')
              const added = has(key)
              return (
                <li key={e.id}>
                  <button type="button" className="bt-columns-add__entry bt-columns-add__entry--field" disabled={added} aria-label={added ? `${label}: já está na tabela` : `Adicionar a coluna ${label}`} onClick={() => onAdd(key, label)}>
                    <span className="bt-columns-add__type" title={e.type ? TYPE_LABEL[e.type] : undefined} aria-hidden="true">{e.type ? TYPE_ICON[e.type] : icons.typeText}</span>
                    <span className="bt-columns-add__label">{e.label}</span>
                    <span className="bt-columns-add__action" aria-hidden="true">{added ? <>{icons.check}Na tabela</> : icons.plus}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {relations.length ? (
        <section className="bt-columns__section" aria-label={`Tabelas ligadas a ${here}`}>
          <h3 className="bt-columns__heading">Tabelas ligadas a {here} <span>{relations.length}</span></h3>
          <ul className="bt-columns-add__list">
            {relations.map((e) => (
              <li key={e.id}>
                <button type="button" className="bt-columns-add__entry bt-columns-add__entry--table" aria-label={`Abrir a tabela ${e.label}`} onClick={() => go([...trail, { id: e.id, label: e.label, table: e.description }])}>
                  <span className="bt-columns-add__table-icon" aria-hidden="true">{icons.table}</span>
                  <span className="bt-columns-add__label"><strong>{e.label}</strong>{e.description && e.description !== e.label ? <small>tabela {e.description}</small> : null}</span>
                  <span className="bt-columns-add__open" aria-hidden="true">Abrir{icons.chevronRight}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {atLimit && level.status === 'ready' ? <p className="bt-columns-add__hint">Limite de {maxDepth} tabelas seguidas. Volte pela trilha para abrir outra.</p> : null}
    </div>
  )
}
