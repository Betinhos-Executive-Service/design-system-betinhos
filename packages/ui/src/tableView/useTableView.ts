import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TableDensity } from '../components/Table'
import { defaultConfig, sameConfig, serializeConfig, type ViewColumnDef, type ViewConfig, type ViewFilters, type ViewSort } from './config'
import { buildEntries, DEFAULT_VIEW_ID, pickInitial, type TableViewEntry, type ViewStore } from './store'

type KV = Pick<Storage, 'getItem' | 'setItem'>

export type UseTableViewOptions = {
  /** Id estável da lista (`pessoas`, `frota.veiculos`…): separa visões e a última usada. */
  tela: string
  columns: ViewColumnDef[]
  store: ViewStore
  defaultSort?: ViewSort
  defaultFilters?: ViewFilters
  /**
   * Nome da visão padrão, que também é o título da lista (§10.9.1). Use o nome da tela ("Todas as OPs", "Pessoas")
   * para o usuário saber onde está; sem ele, "Visão padrão".
   */
  defaultName?: string
  /** Onde lembrar a última visão; padrão `localStorage` (falha silenciosa). */
  storage?: KV | null
}

export type TableViewState = {
  status: 'loading' | 'ready' | 'error'
  error: unknown
  views: TableViewEntry[]
  active: TableViewEntry
  /** O que está na tela: parte da visão ativa e muda com colunas, ordenação e filtros. */
  config: ViewConfig
  /** A tela difere da visão ativa (rótulo "Alterada"). */
  dirty: boolean
  canPublish: boolean
  setConfig: (update: (config: ViewConfig) => ViewConfig) => void
  /** Densidade das linhas (botão "Densidade" da `ViewBar`); passe à `Table` em `view.density`. */
  density: TableDensity
  setDensity: (density: TableDensity) => void
  select: (id: string) => void
  /** Volta à visão padrão, descartando o que estiver na tela. */
  restore: () => void
  /** Ações que gravam: rejeitam com o erro do store; quem chama avisa o usuário. */
  save: () => Promise<void>
  saveAs: (name: string) => Promise<void>
  rename: (name: string) => Promise<void>
  remove: () => Promise<void>
  /**
   * Lixeira de uma visão pessoal (§10.9.1): some da lista na hora e só é excluída no store depois de
   * `VIEW_DISCARD_DELAY_MS` (ou ao desmontar a lista). `undo` cancela e a devolve; `done` rejeita se o store falhar
   * (a visão volta à lista) e resolve quando ela é excluída ou o usuário desfaz. `undo` devolve `false` quando já é
   * tarde (prazo vencido ou lista desmontada). Opcional: sem ela o `ViewBar` exclui a visão pessoal pelo diálogo.
   */
  discard?: (id: string) => { undo: () => boolean; done: Promise<void> }
  publish: () => Promise<void>
  reload: () => Promise<void>
}

/** Tempo para desfazer a exclusão de uma visão (o mesmo do toast "Desfazer"). */
export const VIEW_DISCARD_DELAY_MS = 6000

type PendingDiscard = { timer: ReturnType<typeof setTimeout>; commit: () => void }

const storageKey = (tela: string) => `betinhos.visao.${tela}`
const densityKey = (tela: string) => `betinhos.densidade.${tela}`

function defaultStorage(): KV | null {
  try { return window.localStorage } catch { return null }
}
function readLast(kv: KV | null, tela: string) {
  try { return kv?.getItem(storageKey(tela)) ?? null } catch { return null }
}
function readDensity(kv: KV | null, tela: string): TableDensity {
  try {
    const v = kv?.getItem(densityKey(tela))
    return v === 'dense' || v === 'minimal' ? v : 'default'
  } catch { return 'default' }
}
function writeLast(kv: KV | null, tela: string, id: string) {
  try { kv?.setItem(storageKey(tela), id) } catch { /* sem armazenamento: só não lembra */ }
}

/** Visões salvas e estado das colunas de uma lista (Design System §10.9.1). */
export function useTableView({ tela, columns, store, defaultSort = null, defaultFilters, defaultName, storage }: UseTableViewOptions): TableViewState {
  const kv = storage === undefined ? defaultStorage() : storage
  // A tela declara as colunas a cada render; a identidade estável vem das chaves.
  const signature = columns.map((c) => `${c.key}:${c.defaultHidden ? 0 : 1}`).join('|')
  const defs = useMemo(() => columns, [signature])
  const filtersKey = JSON.stringify(defaultFilters ?? {})
  const fallback = useMemo(() => defaultConfig(defs, defaultSort, defaultFilters ?? {}), [defs, defaultSort?.key, defaultSort?.dir, filtersKey])

  const [status, setStatus] = useState<TableViewState['status']>('loading')
  const [error, setError] = useState<unknown>(null)
  const [canPublish, setCanPublish] = useState(false)
  const [allViews, setViews] = useState<TableViewEntry[]>(() => buildEntries([], defs, fallback, false, defaultName))
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const views = useMemo(() => (hidden.size ? allViews.filter((v) => !hidden.has(v.id)) : allViews), [allViews, hidden])
  const pending = useRef(new Map<string, PendingDiscard>())
  const [activeId, setActiveId] = useState(DEFAULT_VIEW_ID)
  const [config, setConfigState] = useState<ViewConfig>(fallback)
  const [density, setDensityState] = useState<TableDensity>(() => readDensity(kv, tela))
  const live = useRef(true)
  // Volta a `true` na remontagem do StrictMode; só a desmontagem real deixa `false`.
  useEffect(() => {
    live.current = true
    const discards = pending.current
    return () => {
      live.current = false
      // Saiu da lista antes do prazo: a exclusão pedida vale.
      for (const p of discards.values()) { clearTimeout(p.timer); p.commit() }
    }
  }, [])

  const active = views.find((v) => v.id === activeId) ?? views[0]

  const load = useCallback(async (selectId?: string) => {
    try {
      const [stored, publisher] = await Promise.all([store.list(tela), store.canPublish().catch(() => false)])
      if (!live.current) return
      const entries = buildEntries(stored, defs, fallback, publisher, defaultName)
      const chosen = selectId ? entries.find((e) => e.id === selectId) ?? entries[0] : pickInitial(entries, readLast(kv, tela))
      setViews(entries)
      setCanPublish(publisher)
      setActiveId(chosen.id)
      setConfigState(chosen.config)
      setStatus('ready')
      setError(null)
    } catch (err) {
      if (!live.current) return
      // Sem visões salvas a tela continua na padrão; o erro fica exposto para o aviso.
      setStatus('error')
      setError(err)
    }
  }, [store, tela, defs, fallback, kv, defaultName])

  useEffect(() => { void load() }, [load])

  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const activate = (id: string, next: ViewConfig) => {
    setActiveId(id)
    setConfigState(next)
    writeLast(kv, tela, id)
  }
  const select = useCallback((id: string) => {
    const entry = views.find((v) => v.id === id)
    if (entry) activate(entry.id, entry.config)
  }, [views, kv, tela])

  const setConfig = useCallback((update: (c: ViewConfig) => ViewConfig) => setConfigState((c) => update(c)), [])
  const restore = useCallback(() => select(DEFAULT_VIEW_ID), [select])
  const setDensity = useCallback((next: TableDensity) => {
    setDensityState(next)
    try { kv?.setItem(densityKey(tela), next) } catch { /* sem armazenamento: só não lembra */ }
  }, [kv, tela])

  const requireEditable = () => {
    if (!active.canEdit) throw new Error('Esta visão não pode ser alterada.')
  }
  const save = useCallback(async () => {
    requireEditable()
    await store.update(active.id, { config: serializeConfig(config) })
    await load(active.id)
  }, [active, config, store, load])
  const saveAs = useCallback(async (name: string) => {
    const created = await store.create(tela, name.trim(), serializeConfig(config))
    writeLast(kv, tela, created.id)
    await load(created.id)
  }, [store, tela, config, kv, load])
  const rename = useCallback(async (name: string) => {
    requireEditable()
    await store.update(active.id, { name: name.trim() })
    await load(active.id)
  }, [active, store, load])
  const remove = useCallback(async () => {
    requireEditable()
    await store.remove(active.id)
    writeLast(kv, tela, DEFAULT_VIEW_ID)
    await load(DEFAULT_VIEW_ID)
  }, [active, store, kv, tela, load])
  const discard = useCallback((id: string) => {
    const entry = views.find((v) => v.id === id)
    if (!entry || entry.scope !== 'pessoal') throw new Error('Só visões pessoais vão para a lixeira.')
    const wasActive = id === activeId
    // O que estava na tela (com alterações não salvas) volta no Desfazer.
    const shown = config
    const unhide = () => setHidden((set) => { const next = new Set(set); next.delete(id); return next })
    setHidden((set) => new Set(set).add(id))
    if (wasActive) activate(DEFAULT_VIEW_ID, views[0].config)
    let settle = () => {}
    const done = new Promise<void>((resolve, reject) => {
      settle = resolve
      const commit = () => {
        pending.current.delete(id)
        store.remove(id).then(() => {
          if (live.current) { setViews((list) => list.filter((v) => v.id !== id)); unhide() }
          resolve()
        }, (err: unknown) => {
          if (live.current) unhide()
          reject(err)
        })
      }
      pending.current.set(id, { timer: setTimeout(commit, VIEW_DISCARD_DELAY_MS), commit })
    })
    const undo = () => {
      const p = pending.current.get(id)
      if (!p) return false
      clearTimeout(p.timer)
      pending.current.delete(id)
      unhide()
      // Volta a ser a ativa só se o usuário não escolheu outra visão nesse meio-tempo.
      if (wasActive && activeIdRef.current === DEFAULT_VIEW_ID) activate(id, shown)
      settle()
      return true
    }
    return { undo, done }
  }, [views, activeId, config, kv, tela, store])
  const publish = useCallback(async () => {
    if (!canPublish || active.scope !== 'pessoal') throw new Error('Só gestores publicam visões pessoais.')
    await store.publish(active.id)
    await load(active.id)
  }, [active, canPublish, store, load])
  const reload = useCallback(() => load(activeId), [load, activeId])

  return {
    status, error, views, active, config, dirty: !sameConfig(config, active.config), canPublish,
    setConfig, density, setDensity, select, restore, save, saveAs, rename, remove, discard, publish, reload,
  }
}
