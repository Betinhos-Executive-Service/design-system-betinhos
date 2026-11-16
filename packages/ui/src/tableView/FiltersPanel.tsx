import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Drawer } from '../components/Drawer'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'
import { type LookupSearch } from './FilterEditors'
import { FilterFieldPicker } from './FilterFieldPicker'
import { FilterRow } from './FilterRow'
import {
  appendTo, countIncomplete, fromPanelList, needsValue, newCondition, newGroup, newId, removeNode, toPanelList, updateNode,
  type FilterCondition, type FilterField, type FilterGroup, type TableFilters,
} from './filters'

/** @deprecated Sem abas desde 1.35; mantido só para não quebrar quem importa. */
export type FiltersPanelTab = 'coluna' | 'avancado'

/** Condição que a tela não sabe editar (vinda da visão nativa): sempre vale, fica no topo, só leitura. */
export type FilterLocked = { id: string; label: string; reason?: string }

export type FiltersPanelProps = {
  open: boolean
  onClose: () => void
  fields: FilterField[]
  /** Filtros na tela; o painel edita um rascunho. */
  value: TableFilters
  onApply: (filters: TableFilters) => void
  search?: LookupSearch
  /** Quando a fonte conta sem custo: resultado previsto no primário (§10.9.2). `null` = não mostra. */
  countPreview?: (filters: TableFilters) => Promise<number | null>
  /** @deprecated Sem abas desde 1.35; ignorado. */
  initialTab?: FiltersPanelTab
  /** Filtros da visão salva: liga "Filtros diferentes da visão salva · Restaurar". */
  saved?: TableFilters
  /** Condições que a tela não sabe editar (sempre valem). */
  locked?: FilterLocked[]
  /** Remove uma condição só leitura (aplica na hora). Sem ela, sem ×. */
  onRemoveLocked?: (id: string) => void
  /** Substantivo da lista; padrão { one: 'registro', other: 'registros' }. */
  noun?: { one: string; other: string }
}

type Node = FilterCondition | FilterGroup
/** Onde o seletor de campo põe a condição escolhida. */
type PickTarget = { kind: 'root' } | { kind: 'new-group' } | { kind: 'group'; id: string }

const DEFAULT_NOUN = { one: 'registro', other: 'registros' }
const ROOT = 'raiz'
const EXIT_MS = 120
const emptyList = (): FilterGroup => ({ type: 'group', id: ROOT, logic: 'and', items: [] })

/** Comparação sem depender da ordem das chaves (a ordem do `quick` muda na ida e volta). */
const stable = (value: unknown) => JSON.stringify(value, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))
const same = (a: TableFilters, b: TableFilters) => stable(a) === stable(b)

const icon = (d: string, size = 16) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const X = 'M18 6 6 18M6 6l12 12'
const LOCK = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z'
const INFO = 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
const CHEVRON = 'm6 9 6 6 6-6'

/** Ids das linhas na ordem da tela (para levar o foco à seguinte ao remover). */
const rowIds = (group: FilterGroup): string[] => group.items.flatMap((i) => (i.type === 'group' ? rowIds(i) : [i.id]))
/** Grupo que ficou sem filtro some (a raiz fica). */
const pruneEmpty = (group: FilterGroup): FilterGroup => ({
  ...group,
  items: group.items.flatMap((i): Node[] => (i.type === 'group' ? (i.items.length ? [pruneEmpty(i)] : []) : [i])),
})
const without = (group: FilterGroup, ids: Iterable<string>): FilterGroup => {
  let next = group
  for (const id of ids) next = removeNode(next, id)
  return pruneEmpty(next)
}
const findNode = (group: FilterGroup, id: string): Node | undefined => {
  for (const item of group.items) {
    if (item.id === id) return item
    if (item.type === 'group') { const found = findNode(item, id); if (found) return found }
  }
  return undefined
}
const toggleLogic = (list: FilterGroup, id: string): FilterGroup => {
  const flip = (g: FilterGroup): FilterGroup => ({ ...g, logic: g.logic === 'and' ? 'or' : 'and' })
  return id === ROOT ? flip(list) : updateNode(list, id, (g) => (g.type === 'group' ? flip(g) : g))
}
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Painel "Filtros" (§10.9.2): lista única de condições em frase, com grupos de um nível, condições só leitura da visão e
 * aviso de visão alterada. Drawer largo no desktop, Sheet no celular; só vale no primário ("Mostrar N …").
 */
export function FiltersPanel({ open, onClose, fields, value, onApply, search, countPreview, saved, locked = [], onRemoveLocked, noun = DEFAULT_NOUN }: FiltersPanelProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const [draft, setDraft] = useState<FilterGroup>(() => toPanelList(value, fields))
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const [pick, setPick] = useState<{ target: PickTarget; anchor: HTMLElement | null } | null>(null)
  const [autoOpen, setAutoOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const [preview, setPreview] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<string | null>(null)
  const timers = useRef<number[]>([])

  const reset = (list: FilterGroup) => { setDraft(list); setLeaving(new Set()); setAutoOpen(null) }
  // Cada abertura começa do que está na tela.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { reset(toPanelList(value, fields)); setPick(null); setPreview(null) }
  }
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t) }, [])

  // O rascunho que vale: a linha que está saindo (animação do ×) já não conta.
  const effective = leaving.size ? without(draft, leaving) : draft
  // O que já estava no avançado (gravado ou salvo) continua lá: abrir e mostrar sem mexer não muda o formato.
  const origin: TableFilters = { quick: {}, advanced: { ...emptyList(), items: [value.advanced, ...(saved ? [saved.advanced] : [])] } }
  const out = fromPanelList(effective, fields, origin)
  const outKey = stable(out)
  const changed = !same(out, value)
  const differsFromSaved = saved ? !same(out, saved) : false
  const incomplete = countIncomplete(effective, fields)

  useEffect(() => {
    if (!open || !countPreview) return
    let live = true
    setStale(true)
    const filters = JSON.parse(outKey) as TableFilters
    const timer = window.setTimeout(() => {
      countPreview(filters)
        .then((n) => { if (live) { setPreview(n); setStale(false) } })
        .catch(() => { if (live) { setPreview(null); setStale(false) } })
    }, 400)
    return () => { live = false; window.clearTimeout(timer) }
  }, [open, outKey, countPreview])

  // Depois de remover, o foco vai para a linha seguinte (ou para "+ Adicionar filtro").
  useLayoutEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = null
    const row = id === 'add' ? null : bodyRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] .bt-frow`)
    ;(row ?? addRef.current)?.focus()
  })

  const requestClose = () => (changed ? setConfirming(true) : onClose())
  const apply = () => { onApply(out); onClose() }
  const update = (fn: (list: FilterGroup) => FilterGroup) => setDraft(fn)

  const remove = (id: string, viaPointer = false) => {
    const ids = rowIds(effective)
    const at = ids.indexOf(id)
    focusNext.current = ids[at + 1] ?? ids[at - 1] ?? 'add'
    if (!viaPointer || reducedMotion()) { update((d) => without(d, [id])); return }
    setLeaving((s) => new Set(s).add(id))
    timers.current.push(window.setTimeout(() => {
      update((d) => without(d, [id]))
      setLeaving((s) => { const n = new Set(s); n.delete(id); return n })
    }, EXIT_MS))
  }

  const onPicked = (field: FilterField) => {
    if (!pick) return
    const condition = newCondition(field)
    const { target } = pick
    if (target.kind === 'root') update((d) => appendTo(d, ROOT, condition))
    else if (target.kind === 'group') update((d) => appendTo(d, target.id, condition))
    else update((d) => appendTo(d, ROOT, { ...newGroup('or'), items: [condition] }))
    setAutoOpen(needsValue(condition.op) ? condition.id : null)
    setPick(null)
  }

  const wrap = (id: string) => {
    const node = findNode(draft, id)
    if (!node || node.type !== 'condition') return
    const group: FilterGroup = { ...newGroup('or'), items: [node] }
    update((d) => updateNode(d, id, () => group))
    setPick({ target: { kind: 'group', id: group.id }, anchor: null })
  }

  const duplicate = (c: FilterCondition) => update((d) => {
    const copy: FilterCondition = { ...c, id: newId() }
    const insert = (g: FilterGroup): FilterGroup => ({ ...g, items: g.items.flatMap((i) => (i.id === c.id ? [i, copy] : i.type === 'group' ? [insert(i)] : [i])) })
    return insert(d)
  })

  // Teclado no painel: Esc pede para fechar (os popovers param o Esc antes), Ctrl/Cmd+Enter mostra.
  const keys = useRef({ requestClose, apply, changed })
  keys.current = { requestClose, apply, changed }
  useEffect(() => {
    if (!open || confirming) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); keys.current.requestClose() }
      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (keys.current.changed) keys.current.apply() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, confirming])

  // Ação de teclado não anima (§10.9.2): o último tipo de entrada fica marcado no corpo.
  const markInput = (kind: 'kbd' | 'pointer') => { if (bodyRef.current) bodyRef.current.dataset.input = kind }
  const openPicker = (target: PickTarget) => (event: { currentTarget: HTMLElement }) => setPick({ target, anchor: event.currentTarget })

  const connector = (group: FilterGroup, index: number) => {
    const word = group.logic === 'and' ? 'e' : 'ou'
    if (index === 0) return <span className="bt-filters__conn">Onde</span>
    if (index > 1) return <span className="bt-filters__conn">{word}</span>
    return (
      <button type="button" className="bt-filters__conn bt-filters__conn--toggle" aria-label={group.logic === 'and' ? 'Trocar para ou' : 'Trocar para e'} onClick={() => update((d) => toggleLogic(d, group.id))}>
        {word}{icon(CHEVRON, 12)}
      </button>
    )
  }

  const renderItems = (group: FilterGroup, depth: number): ReactNode => group.items.map((item, index) => {
    const cls = leaving.has(item.id) ? 'bt-filters__item is-leaving' : 'bt-filters__item'
    if (item.type === 'group') {
      return (
        <li key={item.id} className={cls} data-row={item.id}>
          {connector(group, index)}
          <section className="bt-filters__group" aria-label="Grupo de filtros">
            <header className="bt-filters__group-head">
              <span>{item.logic === 'or' ? 'Qualquer uma destas' : 'Todas estas'}</span>
              <button type="button" className="bt-frow__icon" aria-label="Remover grupo" onClick={() => update((d) => removeNode(d, item.id))}>{icon(X)}</button>
            </header>
            <ul className="bt-filters__list">{renderItems(item, depth + 1)}</ul>
            <button type="button" className="bt-filters__addbtn" disabled={!fields.length} onClick={openPicker({ kind: 'group', id: item.id })}>+ Filtro</button>
          </section>
        </li>
      )
    }
    return (
      <li key={item.id} className={cls} data-row={item.id}>
        {connector(group, index)}
        <FilterRow
          condition={item}
          fields={fields}
          search={search}
          autoOpen={autoOpen === item.id ? 'value' : undefined}
          onChange={(next) => update((d) => updateNode(d, item.id, () => next))}
          onRemove={(viaPointer) => remove(item.id, viaPointer)}
          onDuplicate={() => duplicate(item)}
          onWrap={depth === 1 ? () => wrap(item.id) : undefined}
        />
      </li>
    )
  })

  const many = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? noun.one : noun.other}`
  const empty = !draft.items.length && !locked.length

  const footer = (
    <div className="bt-filters__footer">
      <Button variant="ghost" onClick={() => reset(emptyList())}>Limpar</Button>
      <span className="bt-filters__footer-end">
        {incomplete ? <span className="bt-filters__note">{incomplete === 1 ? '1 filtro sem valor não entra' : `${incomplete} filtros sem valor não entram`}</span> : null}
        <Button onClick={apply} disabled={!changed}>
          <span aria-live="polite" className={stale && preview != null ? 'bt-filters__count is-stale' : 'bt-filters__count'}>{preview != null ? `Mostrar ${many(preview)}` : 'Mostrar resultados'}</span>
        </Button>
      </span>
    </div>
  )

  const body = (
    <div ref={bodyRef} className="bt-filters" onKeyDownCapture={() => markInput('kbd')} onPointerDownCapture={() => markInput('pointer')}>
      {differsFromSaved ? (
        <div className="bt-filters__alt" role="status">
          <span>Filtros diferentes da visão salva</span>
          <span aria-hidden="true">·</span>
          <button type="button" className="bt-filters__link" onClick={() => { if (saved) reset(toPanelList(saved, fields)) }}>Restaurar</button>
        </div>
      ) : null}
      {empty ? (
        <div className="bt-filters__empty">
          <p className="bt-filters__empty-title">Nenhum filtro</p>
          {preview != null ? <p className="bt-filters__empty-text">Mostrando todas as {many(preview)}.</p> : null}
          <button ref={addRef} type="button" className="bt-filters__addbtn bt-filters__addbtn--lead" disabled={!fields.length} onClick={openPicker({ kind: 'root' })}>+ Adicionar filtro</button>
        </div>
      ) : (
        <>
          <ul className="bt-filters__list" aria-label="Filtros">
            {locked.map((l) => (
              <li key={`locked-${l.id}`} className="bt-filters__item">
                <span className="bt-filters__conn">Sempre</span>
                <div className="bt-filters__locked" role="group" aria-label={`${l.label} (só leitura)`}>
                  <span className="bt-filters__lock">{icon(LOCK, 14)}</span>
                  <span className="bt-filters__locked-text" title={l.label}>{l.label}</span>
                  <span className="bt-filters__ro" title={l.reason}>só leitura{l.reason ? <span className="bt-filters__info" role="img" aria-label={l.reason}>{icon(INFO, 13)}</span> : null}</span>
                  {onRemoveLocked ? <button type="button" className="bt-frow__icon" aria-label="Remover condição da visão" onClick={() => onRemoveLocked(l.id)}>{icon(X)}</button> : null}
                </div>
              </li>
            ))}
            {renderItems(draft, 1)}
          </ul>
          <div className="bt-filters__add">
            <button ref={addRef} type="button" className="bt-filters__addbtn" disabled={!fields.length} onClick={openPicker({ kind: 'root' })}>+ Adicionar filtro</button>
            <button type="button" className="bt-filters__addbtn" disabled={!fields.length} onClick={openPicker({ kind: 'new-group' })}>+ Adicionar grupo</button>
          </div>
        </>
      )}
      {pick ? <FilterFieldPicker anchor={pick.anchor} fields={fields} onPick={onPicked} onClose={() => setPick(null)} /> : null}
    </div>
  )

  return (
    <>
      {/* O conteúdo só existe aberto: fechado, os editores pesariam na lista. */}
      {mobile
        ? <Sheet open={open} onClose={requestClose} title="Filtros" footer={footer}>{open ? body : null}</Sheet>
        : <Drawer open={open} onClose={requestClose} title="Filtros" size="wide" footer={footer}>{open ? body : null}</Drawer>}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirming(false); onClose() }}>Descartar</Button>
        </>}
      >
        As mudanças nos filtros ainda não foram aplicadas.
      </Dialog>
    </>
  )
}
