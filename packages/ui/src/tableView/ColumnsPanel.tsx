import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '../components/Button'
import { Checkbox } from '../components/Choice'
import { Dialog } from '../components/Dialog'
import { Drawer } from '../components/Drawer'
import { Spinner } from '../components/Misc'
import { SearchBox } from '../components/SearchBox'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'
import { addColumn, EXTRA_COLUMN_PREFIX, isExtraColumn, moveColumn, removeColumn, sameConfig, toggleColumn, visibleColumns, type ViewColumnDef, type ViewConfig } from './config'
import { icons } from './icons'

/** Um item do catálogo: campo que vira coluna ou relação (N:1) que abre os campos da tabela ligada. */
export type ColumnCatalogEntry = { id: string; label: string; relation?: boolean; description?: string }

/**
 * Campos que o usuário pode adicionar como coluna (§10.9.1). `load([])` lista a tabela da tela; `load(['nav'])` lista a
 * tabela ligada pela relação `nav`, e assim por diante. A coluna nasce com a chave `x:` + caminho (`x:nav/campo`).
 */
export type ColumnCatalog = {
  load: (path: string[]) => Promise<ColumnCatalogEntry[]>
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

type Crumb = { id: string; label: string }
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
    if (open) { setDraft(config); setAdding(false); setGrabbed(null) }
  }

  const labels = new Map(columns.map((c) => [c.key, c.label]))
  const labelOf = (key: string) => labels.get(key) ?? draft.columns.find((c) => c.key === key)?.label ?? key
  const first = columns[0]?.key
  const changed = !sameConfig(draft, config)
  const visibleCount = visibleColumns(draft).length
  const total = draft.columns.length

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
    const base = current.current
    const next = moveColumn(base, columns, key, to)
    if (next === base) return
    current.current = next
    setDraft(next)
    setAnnounce(`Coluna ${labelOf(key)} na posição ${next.columns.findIndex((c) => c.key === key) + 1} de ${total}`)
  }

  // O item muda de lugar no DOM ao reordenar e perde a captura do ponteiro: o arraste ouve a janela.
  function onHandlePointerDown(event: PointerEvent<HTMLElement>, key: string) {
    if (event.button !== 0) return
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
    if (current.current.columns.findIndex((c) => c.key === state.key) !== target) move(state.key, target)
  }

  // Teclado na alça: Espaço/Enter pega e solta, ↑/↓ move, Esc devolve ao lugar de origem.
  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: string, index: number) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (grabbed === key) {
        setGrabbed(null)
        setAnnounce(`${labelOf(key)} solta na posição ${index + 1} de ${total}`)
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

  const list = (
    <>
      {catalog ? <Button className="bt-columns__add" variant="secondary" icon={icons.plus} onClick={() => setAdding(true)}>Adicionar coluna</Button> : null}
      <p id="bt-columns-hint" className="bt-columns__hint">Arraste pela alça ou, com foco nela, Espaço e as setas.</p>
      <ul ref={listRef} className={['bt-columns', dragging && 'is-sorting'].filter(Boolean).join(' ')} aria-label="Colunas">
        {draft.columns.map((state, index) => {
          const label = labelOf(state.key)
          const fixed = state.key === first
          const extra = isExtraColumn(state.key)
          return (
            <li key={state.key} data-col={state.key} className={['bt-columns__item', (dragging === state.key || grabbed === state.key) && 'is-dragging'].filter(Boolean).join(' ')}>
              {fixed ? <span className="bt-columns__handle bt-columns__handle--fixed" aria-hidden="true" title="Coluna fixa">{icons.lock}</span> : (
                <button
                  type="button"
                  className="bt-columns__handle"
                  aria-label={`Mover ${label}, posição ${index + 1} de ${total}`}
                  aria-pressed={grabbed === state.key}
                  aria-describedby="bt-columns-hint"
                  title="Arraste para mudar a ordem"
                  onPointerDown={(event) => onHandlePointerDown(event, state.key)}
                  onKeyDown={(event) => onHandleKeyDown(event, state.key, index)}
                  onBlur={() => { if (grabbed === state.key) setGrabbed(null) }}
                >{icons.grip}</button>
              )}
              <Checkbox
                className="bt-columns__check"
                label={label}
                description={fixed ? 'Coluna fixa' : extra ? 'Adicionada' : undefined}
                checked={state.visible}
                disabled={fixed || (state.visible && visibleCount === 1)}
                onChange={() => setDraft((d) => toggleColumn(d, columns, state.key))}
              />
              {fixed ? null : (
                <span className="bt-columns__move">
                  <Button variant="ghost" size="compact" icon={icons.up} aria-label={`Mover ${label} para cima`} disabled={index <= 1} onClick={() => move(state.key, index - 1)} />
                  <Button variant="ghost" size="compact" icon={icons.down} aria-label={`Mover ${label} para baixo`} disabled={index === total - 1} onClick={() => move(state.key, index + 1)} />
                  {extra ? <Button variant="ghost" size="compact" icon={icons.close} aria-label={`Remover ${label}`} onClick={() => setDraft((d) => removeColumn(d, state.key))} /> : null}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )

  const content = adding && catalog
    ? <AddColumn catalog={catalog} has={(key) => draft.columns.some((c) => c.key === key && c.visible)} onAdd={add} onBack={() => setAdding(false)} />
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
}

/** Catálogo de campos: trilha das relações abertas, busca no nível atual e "+" para adicionar. */
function AddColumn({ catalog, has, onAdd, onBack }: AddColumnProps) {
  const maxDepth = catalog.maxDepth ?? 3
  const [trail, setTrail] = useState<Crumb[]>([])
  const [query, setQuery] = useState('')
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
  const words = fold(query).split(/\s+/).filter(Boolean)
  const entries = level.status === 'ready'
    ? level.entries
      .filter((e) => !e.relation || trail.length < maxDepth)
      .filter((e) => words.every((w) => fold(`${e.label} ${e.description ?? ''}`).includes(w)))
    : []
  const fields = entries.filter((e) => !e.relation)
  const relations = entries.filter((e) => e.relation)
  const here = trail.length ? trail[trail.length - 1].label : null

  return (
    <div className="bt-columns-add">
      <nav className="bt-columns-add__trail" aria-label="Caminho">
        <Button variant="ghost" size="compact" icon={icons.back} aria-label={trail.length ? 'Voltar um nível' : 'Voltar às colunas'} onClick={trail.length ? () => go(trail.slice(0, -1)) : onBack} />
        <ol>
          <li><button type="button" className="bt-columns-add__crumb" aria-current={trail.length ? undefined : 'location'} onClick={() => go([])}>Esta lista</button></li>
          {trail.map((c, i) => (
            <li key={c.id}>
              <span aria-hidden="true">›</span>
              <button type="button" className="bt-columns-add__crumb" aria-current={i === trail.length - 1 ? 'location' : undefined} onClick={() => go(trail.slice(0, i + 1))}>{c.label}</button>
            </li>
          ))}
        </ol>
      </nav>
      <SearchBox value={query} onChange={setQuery} placeholder={here ? `Buscar em ${here}` : 'Buscar campo'} aria-label="Buscar campo" />
      {level.status === 'loading' ? <div className="bt-columns-add__state"><Spinner label="Carregando campos" /></div> : null}
      {level.status === 'error' ? (
        <div className="bt-columns-add__state">
          <span>Não foi possível carregar os campos.</span>
          <Button variant="secondary" size="compact" onClick={() => setAttempt((n) => n + 1)}>Tentar de novo</Button>
        </div>
      ) : null}
      {level.status === 'ready' && !entries.length ? <div className="bt-columns-add__state">Nenhum campo encontrado.</div> : null}
      {fields.length ? (
        <section className="bt-columns-add__section" aria-label="Campos">
          <h3 className="bt-columns-add__group">{here ? `Campos de ${here}` : 'Campos'}</h3>
          <ul className="bt-columns-add__list">
            {fields.map((e) => {
              const key = `${EXTRA_COLUMN_PREFIX}${[...path, e.id].join('/')}`
              const label = [...trail.map((c) => c.label), e.label].join(' › ')
              const added = has(key)
              return (
                <li key={e.id}>
                  <button type="button" className="bt-columns-add__entry" disabled={added} aria-label={added ? `${label}: já está nas colunas` : `Adicionar ${label}`} onClick={() => onAdd(key, label)}>
                    <span className="bt-columns-add__label">{e.label}{e.description ? <small>{e.description}</small> : null}</span>
                    <span className="bt-columns-add__icon" aria-hidden="true">{added ? icons.check : icons.plus}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {relations.length ? (
        <section className="bt-columns-add__section" aria-label="Tabelas relacionadas">
          <h3 className="bt-columns-add__group">Tabelas relacionadas</h3>
          <ul className="bt-columns-add__list">
            {relations.map((e) => (
              <li key={e.id}>
                <button type="button" className="bt-columns-add__entry" aria-label={`Abrir campos de ${e.label}`} onClick={() => go([...trail, { id: e.id, label: e.label }])}>
                  <span className="bt-columns-add__label">{e.label}{e.description ? <small>{e.description}</small> : null}</span>
                  <span className="bt-columns-add__icon" aria-hidden="true">{icons.chevronRight}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
