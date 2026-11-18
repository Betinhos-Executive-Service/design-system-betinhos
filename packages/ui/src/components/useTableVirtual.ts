import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Até aqui a tabela desenha todas as linhas, mesmo com `virtual`. */
export const VIRTUAL_FROM = 100

const scrolls = (node: HTMLElement) => /(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)

/**
 * A área da própria tabela quando ela rola na vertical (`stickyHeader`/`fill` acima de 820 px); senão o primeiro ancestral
 * que rola. Só o `overflow` não basta: com visão a área tem `overflow-x: auto`, que faz o `overflow-y` calculado virar `auto`
 * mesmo sem altura limitada, e a janela viraria a lista inteira.
 */
function findScroller(root: HTMLElement | null, own: HTMLElement | null, ownScrolls: boolean) {
  const desktop = typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 821px)').matches
  if (own && ownScrolls && desktop && scrolls(own)) return own
  let node = root?.parentElement ?? null
  while (node && node !== document.body && node !== document.documentElement) {
    if (scrolls(node)) return node
    node = node.parentElement
  }
  return null
}

type Options<Row> = {
  rows: Row[]
  rowKey: (row: Row) => string
  enabled: boolean
  root: RefObject<HTMLElement | null>
  own: RefObject<HTMLElement | null>
  /** A área própria rola na vertical (`stickyHeader`/`fill`). */
  ownScrolls: boolean
  /** Altura estimada da linha (px) até ser medida. */
  estimate: number
}

type Window<Row> = { visible: Row[]; start: number; before: number; after: number; measure?: (node: Element | null) => void }

/**
 * Janela de linhas perto da tela. `before`/`after` são as alturas (px) das linhas que ficaram de fora, para a área manter a
 * altura total e a barra de rolagem. Sem área com altura (jsdom, aba oculta), com poucas linhas ou desligada, devolve a lista inteira.
 */
export function useTableVirtual<Row>({ rows, rowKey, enabled, root, own, ownScrolls, estimate }: Options<Row>): Window<Row> {
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // A área de rolagem muda com a largura (no mobile a da tabela não rola na vertical): reavalia ao redimensionar a janela.
  useLayoutEffect(() => {
    if (!enabled) { setScroller(null); return }
    const update = () => setScroller(findScroller(root.current, own.current, ownScrolls))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [enabled, root, own, ownScrolls])

  const active = enabled && rows.length > VIRTUAL_FROM && scroller != null && scroller.clientHeight > 0

  // Onde as linhas começam no conteúdo da área: logo abaixo do cabeçalho (na área própria) ou somando o que vem antes da tabela.
  useLayoutEffect(() => {
    const table = root.current
    if (!active || !scroller || !table) return
    const update = () => {
      const head = table.querySelector<HTMLElement>('.bt-table__head')
      const headHeight = head?.offsetHeight ?? 0
      const top = scroller === own.current ? headHeight : table.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + headHeight
      setScrollMargin((current) => (Math.abs(top - current) > 1 ? top : current))
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    observer.observe(table)
    return () => observer.disconnect()
  }, [active, scroller, root, own, rows])

  // Chave estável enquanto a lista não muda: função nova a cada quadro faria o virtualizador recalcular todas as linhas.
  const keyOf = useRef(rowKey)
  keyOf.current = rowKey
  const getItemKey = useCallback((index: number) => keyOf.current(rows[index]), [rows])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    getItemKey,
    overscan: 10,
    scrollMargin,
    enabled: active,
  })
  // Densidade trocada: as alturas guardadas das linhas fora da tela ficaram velhas; recomeça da estimativa nova.
  useLayoutEffect(() => { virtualizer.measure() }, [virtualizer, estimate])
  const items = virtualizer.getVirtualItems()
  if (!active || !items.length) return { visible: rows, start: 0, before: 0, after: 0 }
  const first = items[0]
  const last = items[items.length - 1]
  return {
    visible: rows.slice(first.index, last.index + 1),
    start: first.index,
    before: Math.max(0, first.start - scrollMargin),
    after: Math.max(0, virtualizer.getTotalSize() - (last.end - scrollMargin)),
    measure: virtualizer.measureElement,
  }
}
