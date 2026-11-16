import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'

export type FilterPopoverProps = {
  /** Gatilho: o painel abre logo abaixo dele e o foco volta para ele ao fechar. Sem ele, o painel fica centralizado. */
  anchor: HTMLElement | null
  /** Nome do painel para o leitor de tela; no celular é o título do Sheet. */
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}

/**
 * Painel dos editores do painel "Filtros" (§10.9.2): popover ancorado ao token no desktop, `Sheet` de baixo no celular.
 * Esc e clique fora fecham só o popover; o Esc não chega ao painel.
 */
export function FilterPopover({ anchor, label, onClose, className, children }: FilterPopoverProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const ref = useRef<HTMLDivElement>(null)
  const close = () => { onClose(); anchor?.focus() }
  const closeRef = useRef(close)
  closeRef.current = close

  useLayoutEffect(() => {
    const panel = ref.current
    if (mobile || !panel) return
    try { panel.showPopover?.() } catch { /* sem suporte: fixo com z-index alto */ }
    const place = () => {
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const width = panel.offsetWidth
      const below = window.innerHeight - r.bottom - 8
      const up = below < Math.min(panel.scrollHeight, 320) && r.top > below
      panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`
      panel.style.top = up ? 'auto' : `${r.bottom + 4}px`
      panel.style.bottom = up ? `${window.innerHeight - r.top + 4}px` : 'auto'
      panel.style.maxHeight = `${Math.max(160, (up ? r.top : below) - 8)}px`
      panel.style.transformOrigin = up ? 'bottom left' : 'top left'
    }
    place()
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.contains(target) && !anchor?.contains(target)) closeRef.current()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchor, mobile])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    // No Sheet o <dialog> fecha sozinho (cancel); no popover, o Esc não pode fechar o Drawer embaixo.
    if (!mobile) { event.preventDefault(); close() }
  }

  if (mobile) {
    return (
      <Sheet open onClose={close} title={label}>
        <div className={['bt-fpop__sheet', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown}>{children}</div>
      </Sheet>
    )
  }
  return (
    <div ref={ref} role="dialog" aria-label={label} popover="manual" className={['bt-fpop', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}
