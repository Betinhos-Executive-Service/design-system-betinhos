import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Menu, type MenuAction } from './Menu'
import { useShellHeader } from './ShellHeader'

export type ModuleNavItem<T extends string = string> = {
  value: T
  label: string
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
  /** No celular a faixa some e o título da seção e as `actions` vão para o cabeçalho do AppShell (`useShellHeader`). `false` desliga. */
  shellHeader?: boolean
}

// Marca da camada de medida: itens com `item`, o "Mais" com `__more` (um item com value '__more' não colide).
const ITEM = 'item'
const MORE = '__more'

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

/** Só registra no cabeçalho do AppShell quando `shellHeader` está ligado (hook não pode ser condicional). */
function ShellHeaderBridge({ title, actions }: { title?: string; actions?: ReactNode }) {
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

  const moreActions: MenuAction[] = hidden.map((item) => ({
    id: item.value,
    label: <span className="bt-module-nav__menu-label">{item.label}<Indicator item={item} /></span>,
    icon: item.icon,
    disabled: item.disabled,
    onSelect: () => go(item),
  }))
  const moreSignal = hidden.some((item) => item.dot || (item.tone === 'alert' && item.count))

  return (
    <div className={`bt-module-nav bt-module-nav--${density}`}>
      {shellHeader ? <ShellHeaderBridge title={items[activeIndex]?.label} actions={mobileActions !== undefined ? mobileActions : actions} /> : null}
      <nav aria-label={ariaLabel} className="bt-module-nav__nav">
        <ul ref={listRef} className="bt-module-nav__items">
          {shown.map((index) => {
            const item = items[index]
            const current = item.value === value
            const className = current ? 'bt-module-nav__item is-active' : 'bt-module-nav__item'
            return (
              <li key={item.value} className="bt-module-nav__slot">
                {item.href && !item.disabled
                  ? <a className={className} href={item.href} aria-current={current ? 'page' : undefined} onClick={(event) => { if (onNavigate && plainClick(event)) { event.preventDefault(); onNavigate(item.value) } }}><Content item={item} /></a>
                  : <button type="button" className={className} aria-current={current ? 'page' : undefined} disabled={item.disabled} onClick={() => go(item)}><Content item={item} /></button>}
              </li>
            )
          })}
          {hidden.length ? (
            <li className="bt-module-nav__slot">
              <Menu align="start" actions={moreActions} trigger={(props) => (
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
  )
}
