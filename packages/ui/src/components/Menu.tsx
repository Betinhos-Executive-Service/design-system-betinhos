import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'

export type MenuAction = {
  id: string; label: ReactNode; icon?: ReactNode; onSelect: () => void; tone?: 'neutral' | 'danger'; disabled?: boolean
  /** Itens seguidos com o mesmo grupo ficam sob o rótulo; mudar de grupo desenha um divisor. `''` = só divisor. */
  group?: string
  /** Item atual (ex.: visão ativa): marca com ✓ e `aria-checked`. */
  selected?: boolean
  /** Dica do item (ex.: por que está desabilitado). */
  title?: string
}

export type MenuProps = {
  /** O gatilho: normalmente um `Button` de ícone com `aria-label`. Recebe os atributos do menu por `cloneElement`? Não: envolva seu botão e passe `trigger`. */
  trigger: (props: { 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void; onKeyDown: (event: KeyboardEvent) => void }) => ReactNode
  actions: MenuAction[]
  /** Alinha o painel à direita do gatilho (padrão) ou à esquerda. */
  align?: 'end' | 'start'
}

const enabledOf = (actions: MenuAction[]) => actions.map((action, index) => (action.disabled ? -1 : index)).filter((index) => index >= 0)

/** Painel com os itens, setas, Home/End, Enter e Esc. Compartilhado por `Menu` e `ContextMenu`. */
function MenuPanel({ id, panelRef, actions, onClose, onSelect }: { id: string; panelRef: RefObject<HTMLDivElement | null>; actions: MenuAction[]; onClose: (refocus: boolean) => void; onSelect: (action: MenuAction) => void }) {
  const enabled = enabledOf(actions)
  const [active, setActive] = useState(enabled[0] ?? 0)
  useEffect(() => { panelRef.current?.querySelectorAll<HTMLElement>('[role^=menuitem]')[active]?.focus() }, [active, panelRef])
  const move = (step: number) => setActive((current) => {
    const position = enabled.indexOf(current)
    return enabled[(position + step + enabled.length) % enabled.length] ?? current
  })
  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(1); break
      case 'ArrowUp': event.preventDefault(); move(-1); break
      case 'Home': event.preventDefault(); setActive(enabled[0] ?? 0); break
      case 'End': event.preventDefault(); setActive(enabled[enabled.length - 1] ?? 0); break
      case 'Escape': event.preventDefault(); event.stopPropagation(); onClose(true); break
      case 'Tab': onClose(false); break
    }
  }
  return (
    <div ref={panelRef} id={id} role="menu" className="bt-menu__panel" popover="manual" onKeyDown={onKeyDown} onContextMenu={(event) => event.preventDefault()}>
      {actions.map((action, index) => {
        const startsGroup = action.group !== undefined && action.group !== actions[index - 1]?.group
        return (
          <Fragment key={action.id}>
            {startsGroup && index > 0 ? <div className="bt-menu__divider" role="separator" /> : null}
            {startsGroup && action.group ? <div className="bt-menu__group" role="presentation">{action.group}</div> : null}
            <button type="button" role={action.selected !== undefined ? 'menuitemradio' : 'menuitem'} aria-checked={action.selected} tabIndex={index === active ? 0 : -1} disabled={action.disabled} title={action.title} className={['bt-menu__item', action.tone === 'danger' && 'bt-menu__item--danger', action.selected && 'bt-menu__item--selected'].filter(Boolean).join(' ')} onMouseEnter={() => setActive(index)} onClick={() => { if (!action.disabled) onSelect(action) }}>
              {action.icon != null ? <span className="bt-menu__icon">{action.icon}</span> : null}
              <span className="bt-menu__label">{action.label}</span>
              {action.selected ? <svg className="bt-menu__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg> : null}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

/** Mostra o painel na camada superior e fecha com clique fora; na rolagem, reposiciona (`Menu`) ou fecha (`closeOnScroll`). */
function usePanel(open: boolean, panelRef: RefObject<HTMLDivElement | null>, place: (panel: HTMLDivElement) => void, isInside: (target: Node) => boolean, close: () => void, closeOnScroll = false) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    try { panel.showPopover?.() } catch { /* sem suporte: fixo com z-index alto */ }
    place(panel)
    const onScroll = (event: Event) => { if (!closeOnScroll) place(panel); else if (!panel.contains(event.target as Node)) close() }
    const outside = (event: PointerEvent) => { if (!panel.contains(event.target as Node) && !isInside(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', onScroll, true) }
  }, [open, panelRef, place, isInside, close, closeOnScroll])
}

/** Menu de ações (⋯): painel na camada superior com itens, setas, Enter e Esc. */
export function Menu({ trigger, actions, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const focusTrigger = () => boxRef.current?.querySelector<HTMLElement>('button')?.focus()
  const place = useCallback((panel: HTMLDivElement) => {
    const box = boxRef.current
    if (!box) return
    const r = box.getBoundingClientRect()
    const width = panel.offsetWidth
    const left = align === 'end' ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8)
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < panel.scrollHeight && above > below
    // Lista longa: limita ao espaço visível e rola dentro do painel, sem passar da tela.
    panel.style.maxHeight = `${Math.max(120, (up ? above : below) - 4)}px`
    panel.style.left = `${left}px`
    panel.style.top = up ? 'auto' : `${r.bottom + 4}px`
    panel.style.bottom = up ? `${window.innerHeight - r.top + 4}px` : 'auto'
  }, [align])
  const isInside = useCallback((target: Node) => Boolean(boxRef.current?.contains(target)), [])
  const close = useCallback(() => setOpen(false), [])
  usePanel(open, panelRef, place, isInside, close)

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setOpen(true) }
  }

  return (
    <div ref={boxRef} className="bt-menu">
      {trigger({ 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id, onClick: () => setOpen((current) => !current), onKeyDown: onTriggerKeyDown })}
      {open ? <MenuPanel id={id} panelRef={panelRef} actions={actions} onClose={(refocus) => { setOpen(false); if (refocus) focusTrigger() }} onSelect={(action) => { setOpen(false); action.onSelect(); focusTrigger() }} /> : null}
    </div>
  )
}

export type ContextMenuProps = {
  /** Ponto do clique (coordenadas da janela). `null` = fechado. */
  at: { x: number; y: number } | null
  actions: MenuAction[]
  onClose: () => void
}

/** Menu de contexto (clique direito): o mesmo painel do `Menu`, aberto no ponto do clique e mantido dentro da tela. */
export function ContextMenu({ at, actions, onClose }: ContextMenuProps) {
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const open = at !== null && actions.length > 0
  useLayoutEffect(() => { if (open) returnFocus.current = document.activeElement as HTMLElement | null }, [open])
  const place = useCallback((panel: HTMLDivElement) => {
    if (!at) return
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - 16)}px`
    panel.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - panel.offsetWidth - 8))}px`
    panel.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - panel.offsetHeight - 8))}px`
    panel.style.bottom = 'auto'
  }, [at])
  const isInside = useCallback(() => false, [])
  // O painel vale para o ponto do clique: rolar a página ou redimensionar fecha, como no menu de contexto do sistema.
  usePanel(open, panelRef, place, isInside, onClose, true)
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', onClose)
    return () => window.removeEventListener('resize', onClose)
  }, [open, onClose])
  if (!open || !at) return null
  // O painel costuma ser renderizado dentro da linha ou do card: os eventos param aqui para não abrir, selecionar ou arrastar o registro.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()
  return (
    <div className="bt-menu__context" onClick={stop} onPointerDown={stop} onMouseDown={stop} onContextMenu={stop} onKeyDown={stop}>
      <MenuPanel key={`${at.x},${at.y}`} id={id} panelRef={panelRef} actions={actions} onClose={(refocus) => { onClose(); if (refocus) returnFocus.current?.focus() }} onSelect={(action) => { onClose(); action.onSelect() }} />
    </div>
  )
}

/** Ctrl/⌘ + clique direito e campos editáveis ficam com o menu do navegador (copiar, colar, inspecionar). */
export const wantsNativeMenu = (event: ReactMouseEvent) =>
  event.ctrlKey || event.metaKey || Boolean((event.target as Element).closest('input, textarea, select, [contenteditable="true"]'))

/** Liga o clique direito a um menu de contexto: `onContextMenu(event, actions)` abre no ponto do clique. Renderize `menu` uma vez. */
export function useContextMenu() {
  const [state, setState] = useState<{ at: { x: number; y: number }; actions: MenuAction[] } | null>(null)
  const close = useCallback(() => setState(null), [])
  const onContextMenu = useCallback((event: ReactMouseEvent, actions: MenuAction[]) => {
    if (wantsNativeMenu(event) || actions.length === 0) return
    event.preventDefault()
    setState({ at: { x: event.clientX, y: event.clientY }, actions })
  }, [])
  const menu = <ContextMenu at={state?.at ?? null} actions={state?.actions ?? []} onClose={close} />
  return { onContextMenu, menu }
}
