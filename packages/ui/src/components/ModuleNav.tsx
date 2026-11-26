import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Menu, type MenuAction } from './Menu'
import { useShellHeader, type ShellHeaderEntry } from './ShellHeader'
import { useMediaQuery } from '../useMediaQuery'

export type ModuleNavItem<T extends string = string> = {
  value: T
  label: string
  /** Rótulo da barra do celular, quando `label` não cabe (~10 caracteres); o leitor de tela continua lendo `label`. */
  shortLabel?: string
  /** Ícone Lucide de 16 px, distinto em cada item (§10.1). */
  icon: ReactNode
  /** Com `href` o item é um link; sem ele, um botão que chama `onNavigate`. */
  href?: string
  /** Um indicador por item: contagem neutra, contagem em vermelho suave (`tone: 'alert'`) ou ponto. */
  count?: number
  tone?: 'alert'
  dot?: boolean
  disabled?: boolean
}

export type ModuleNavProps<T extends string = string> = {
  'aria-label': string
  items: ModuleNavItem<T>[]
  /** Seção atual: recebe `aria-current="page"` e nunca vai para o "Mais". */
  value: T
  /** Botões chamam sempre; links chamam no clique simples (Ctrl/⌘/meio abrem em nova aba sem passar por aqui). */
  onNavigate?: (value: T) => void
  /** `default` 48 px; `compact` 40 px. */
  density?: 'default' | 'compact'
  /** À direita: chips de contexto e botões de ícone. No celular vão para o cabeçalho do AppShell. */
  actions?: ReactNode
  /** Ações do cabeçalho do celular, no lugar de `actions` (que costumam não caber ao lado do título): em geral só ícones. `null` = nenhuma. */
  mobileActions?: ReactNode
  /** No celular a faixa some: o título da seção e as `actions` vão para o cabeçalho do AppShell (`useShellHeader`). `false` desliga. */
  shellHeader?: boolean
}

// Marca da camada de medida: itens com `item`, o "Mais" com `__more` (um item com value '__more' não colide).
const ITEM = 'item'
const MORE = '__more'

const MOBILE = '(max-width: 820px)'
/** Na barra do celular cabem 5 botões; com mais seções, 4 + "Mais". */
const DOCK_SLOTS = 5

const signals = (list: ModuleNavItem[]) => list.some((item) => item.dot || (item.tone === 'alert' && item.count))

const countText = (count: number) => (count > 99 ? '99+' : String(count))

/**
 * Quais itens ficam na faixa. Cabem todos: todos. Senão, reserva o "Mais" e enche da esquerda;
 * o ativo escondido troca de lugar com o último visível. Devolve os índices visíveis, em ordem de exibição.
 */
export function fitModuleNav(widths: number[], available: number, moreWidth: number, gap: number, active: number): number[] {
  const all = widths.map((_, index) => index)
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1)
  if (total <= available) return all
  const room = available - moreWidth - gap
  const visible: number[] = []
  let used = 0
  for (const index of all) {
    const next = used + (visible.length ? gap : 0) + widths[index]
    if (next > room) break
    visible.push(index)
    used = next
  }
  if (active < 0 || visible.includes(active)) return visible
  // O ativo entra no lugar do último visível; se ainda não couber, sai mais um da ponta.
  const fits = (list: number[]) => list.reduce((sum, index) => sum + widths[index], 0) + gap * Math.max(0, list.length - 1) <= room
  const kept = visible.slice(0, -1)
  while (kept.length && !fits([...kept, active])) kept.pop()
  return [...kept, active]
}

const Dot = () => <><span className="bt-module-nav__dot" aria-hidden="true" /><span className="bt-sr-only">, com novidades</span></>
const Chevron = () => <svg className="bt-module-nav__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>

function Indicator({ item }: { item: ModuleNavItem }) {
  if (item.dot) return <Dot />
  if (!item.count) return null
  if (item.tone !== 'alert') return <span className="bt-module-nav__badge">{countText(item.count)}</span>
  // O vermelho não chega ao leitor de tela: o alerta vai em texto.
  return <><span className="bt-module-nav__badge bt-module-nav__badge--alert">{countText(item.count)}</span><span className="bt-sr-only">, em alerta</span></>
}

function Content({ item }: { item: ModuleNavItem }) {
  return (
    <>
      <span className="bt-module-nav__icon" aria-hidden="true">{item.icon}</span>
      <span className="bt-module-nav__label">{item.label}</span>
      <Indicator item={item} />
    </>
  )
}

function TabContent({ item }: { item: ModuleNavItem }) {
  const short = item.shortLabel && item.shortLabel !== item.label
  return (
    <>
      <span className="bt-module-nav__tab-icon" aria-hidden="true">{item.icon}</span>
      {short ? <><span className="bt-module-nav__tab-label" aria-hidden="true">{item.shortLabel}</span><span className="bt-sr-only">{item.label}</span></> : <span className="bt-module-nav__tab-label">{item.label}</span>}
      {/* Depois do nome, para o leitor de tela dizer "Gestão, 3, em alerta"; o CSS põe sobre o ícone. */}
      <Indicator item={item} />
    </>
  )
}

const MoreIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>

type DockProps = { items: ModuleNavItem[]; value: string; label: string; render: (item: ModuleNavItem, className: string) => ReactNode }

/**
 * Celular: barra flutuante na zona do polegar. Até 5 seções cabem; com mais, 4 + "Mais", que abre uma
 * segunda linha na própria barra. Some ao rolar o conteúdo para baixo e volta ao subir ou ao trocar de seção.
 */
function Dock({ items, value, label, render }: DockProps) {
  const ref = useRef<HTMLElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const extraId = useId()
  const [open, setOpen] = useState(false)
  const [away, setAway] = useState(false)
  const overflow = items.length > DOCK_SLOTS
  const main = overflow ? items.slice(0, DOCK_SLOTS - 1) : items
  const extra = overflow ? items.slice(DOCK_SLOTS - 1) : []
  const extraActive = extra.find((item) => item.value === value)
  const tab = (item: ModuleNavItem) => render(item, item.value === value ? 'bt-module-nav__tab is-active' : 'bt-module-nav__tab')

  useEffect(() => { setOpen(false); setAway(false) }, [value])

  // Rola o contêiner mais próximo com overflow (no AppShell, o main); sem ele, a janela.
  useEffect(() => {
    let node = ref.current?.parentElement ?? null
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement
    const target: HTMLElement | Window = node ?? window
    const top = () => (node ? node.scrollTop : window.scrollY)
    let last = top()
    const onScroll = () => {
      const y = top()
      if (Math.abs(y - last) < 8) return
      setAway(y > last && y > 80)
      last = y
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); moreRef.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <nav ref={ref} aria-label={label} className={away && !open ? 'bt-module-nav__dock is-away' : 'bt-module-nav__dock'}>
      {overflow ? <div id={extraId} className="bt-module-nav__dock-row bt-module-nav__dock-extra" hidden={!open}>{extra.map(tab)}</div> : null}
      <div className="bt-module-nav__dock-row">
        {main.map(tab)}
        {overflow ? (
          <button ref={moreRef} type="button" className={extraActive ? 'bt-module-nav__tab is-active' : 'bt-module-nav__tab'} aria-expanded={open} aria-controls={extraId} onClick={() => setOpen((current) => !current)}>
            <span className="bt-module-nav__tab-icon" aria-hidden="true"><MoreIcon /></span>
            <span className="bt-module-nav__tab-label">Mais</span>
            {signals(extra) ? <Dot /> : null}
            {extraActive ? <span className="bt-sr-only">, seção atual: {extraActive.label}</span> : null}
          </button>
        ) : null}
      </div>
    </nav>
  )
}

/** Só registra no cabeçalho do AppShell quando `shellHeader` está ligado (hook não pode ser condicional). */
function ShellHeaderBridge({ title, actions }: ShellHeaderEntry) {
  useShellHeader({ title, actions })
  return null
}

/** Conteúdo do "Mais"; a camada de medida usa sempre com ponto, para reservar a largura máxima. */
function MoreContent({ signal }: { signal: boolean }) {
  return <><span className="bt-module-nav__label">Mais</span>{signal ? <Dot /> : null}<Chevron /></>
}

const plainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/** Faixa fixa no topo que navega entre as seções de um módulo; o que não cabe vai para o menu "Mais". */
export function ModuleNav<T extends string>({ items, value, onNavigate, density = 'default', actions, mobileActions, shellHeader = true, 'aria-label': ariaLabel }: ModuleNavProps<T>) {
  const listRef = useRef<HTMLUListElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState<number[] | null>(null)
  const activeIndex = items.findIndex((item) => item.value === value)
  const mobile = useMediaQuery(MOBILE)

  const measure = useRef(() => {})
  measure.current = () => {
    const list = listRef.current
    const layer = measureRef.current
    if (!list || !layer) return
    const nodes = Array.from(layer.querySelectorAll<HTMLElement>('[data-mn]'))
    const widths = nodes.filter((node) => node.dataset.mn === ITEM).map((node) => node.getBoundingClientRect().width)
    const more = nodes.find((node) => node.dataset.mn === MORE)?.getBoundingClientRect().width ?? 0
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0
    const next = fitModuleNav(widths, list.getBoundingClientRect().width, more, gap, activeIndex)
    setVisible((current) => (current && current.length === next.length && current.every((index, i) => index === next[i]) ? current : next))
  }

  useLayoutEffect(() => { measure.current() }, [items, activeIndex, density])
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure.current())
    observer.observe(list)
    void document.fonts?.ready.then(() => measure.current(), () => undefined)
    return () => observer.disconnect()
  }, [])

  // Antes da primeira medida (e no servidor), todos os itens; a faixa corta o excesso sem rolagem.
  const shown = (visible ?? items.map((_, index) => index)).filter((index) => index < items.length)
  const shownSet = new Set(shown)
  const hidden = items.filter((_, index) => !shownSet.has(index))

  const go = (item: ModuleNavItem<T>) => {
    if (item.disabled) return
    if (onNavigate) onNavigate(item.value)
    else if (item.href) window.location.assign(item.href)
  }

  const toAction = (item: ModuleNavItem<T>): MenuAction => ({
    id: item.value,
    label: <span className="bt-module-nav__menu-label">{item.label}<Indicator item={item} /></span>,
    icon: item.icon,
    disabled: item.disabled,
    onSelect: () => go(item),
  })
  const moreSignal = signals(hidden)

  // Link ou botão: a faixa e a barra do celular usam a mesma regra de clique.
  const control = (item: ModuleNavItem<T>, className: string, children: ReactNode) => {
    const current = item.value === value ? 'page' : undefined
    return item.href && !item.disabled
      ? <a key={item.value} className={className} href={item.href} aria-current={current} onClick={(event) => { if (onNavigate && plainClick(event)) { event.preventDefault(); onNavigate(item.value) } }}>{children}</a>
      : <button key={item.value} type="button" className={className} aria-current={current} disabled={item.disabled} onClick={() => go(item)}>{children}</button>
  }

  return (
    <>
    <div className={`bt-module-nav bt-module-nav--${density}`}>
      {shellHeader ? <ShellHeaderBridge title={items[activeIndex]?.label} actions={mobileActions !== undefined ? mobileActions : actions} /> : null}
      <nav aria-label={ariaLabel} className="bt-module-nav__nav">
        <ul ref={listRef} className="bt-module-nav__items">
          {shown.map((index) => {
            const item = items[index]
            const current = item.value === value
            const className = current ? 'bt-module-nav__item is-active' : 'bt-module-nav__item'
            return (
              <li key={item.value} className="bt-module-nav__slot">{control(item, className, <Content item={item} />)}</li>
            )
          })}
          {hidden.length ? (
            <li className="bt-module-nav__slot">
              <Menu align="start" actions={hidden.map(toAction)} trigger={(props) => (
                <button type="button" className="bt-module-nav__item bt-module-nav__more" {...props}>
                  <MoreContent signal={moreSignal} />
                </button>
              )} />
            </li>
          ) : null}
        </ul>
        {/* Camada de medida: todos os itens e o "Mais" no tamanho real, invisíveis e fora da árvore de acessibilidade. */}
        <div ref={measureRef} className="bt-module-nav__measure" aria-hidden="true" inert>
          {items.map((item) => <span key={item.value} data-mn={ITEM} className={item.value === value ? 'bt-module-nav__item is-active' : 'bt-module-nav__item'}><Content item={item} /></span>)}
          <span data-mn={MORE} className="bt-module-nav__item bt-module-nav__more"><MoreContent signal /></span>
        </div>
      </nav>
      {actions != null ? <div className="bt-module-nav__actions">{actions}</div> : null}
    </div>
    {mobile ? <Dock items={items} value={value} label={ariaLabel} render={(item, className) => control(item as ModuleNavItem<T>, className, <TabContent item={item} />)} /> : null}
    </>
  )
}
