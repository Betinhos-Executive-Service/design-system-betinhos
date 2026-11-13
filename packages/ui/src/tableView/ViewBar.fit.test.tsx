// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '../components/Button'
import { SearchBox } from '../components/SearchBox'
import { tableViewColumns, type TableColumn } from '../components/Table'
import type { FilterField } from './filters'
import { selectionMenuActions, type SelectionAction } from './Selection'
import { createMemoryViewStore } from './store'
import { useTableView } from './useTableView'
import { ViewBar } from './ViewBar'
import { fitBarActions, fitZone, planFit, type FitInput } from './viewBarFit'

type Row = { id: string; nome: string }
const columns: TableColumn<Row>[] = [{ key: 'nome', header: 'Nome', cell: (r) => r.nome }]
const defs = tableViewColumns(columns)
const fields: FilterField[] = [{ key: 'nome', label: 'Nome', kind: 'text' }]
const noop = () => undefined
const storage = { getItem: () => null, setItem: noop }
const icon = <svg aria-hidden="true" />
const actions: SelectionAction[] = [
  { id: 'abrir', label: 'Abrir', icon, single: true, inline: true, onSelect: noop },
  { id: 'copiar', label: 'Copiar', icon, inline: true, onSelect: noop },
  { id: 'concluir', label: 'Concluir', icon, inline: true, blocked: 'Há concluídas na seleção.', onSelect: noop },
  { id: 'excluir', label: 'Excluir', icon, tone: 'danger', onSelect: noop },
]

// Larguras simuladas (px): cheio / só ícone. Gaps e moldura caem no padrão do ViewBar (2 dentro da superfície, 12 depois
// da visão, 8 antes da principal, moldura 6); cada fio entre grupos tem 9.
const SIZES: Record<string, [number, number]> = {
  view: [200, 60], colunas: [120, 40], filtros: [110, 40], density: [40, 40], audit: [130, 40], primary: [170, 40],
  sep: [9, 9],
  'sel:abrir': [100, 40], 'sel:copiar': [100, 40], 'sel:concluir': [100, 40],
  more: [90, 44],
}
let barWidth = 1800
/** Largura da fileira de botões do rodapé do celular. */
let rowWidth = 358
let resize: (() => void) | null = null
let mobile = false

function width(element: Element) {
  if (element.classList.contains('bt-viewbar')) return barWidth
  if (element.classList.contains('bt-selectionbar__actions')) return rowWidth
  const key = (element as HTMLElement).dataset?.vb ?? (element as HTMLElement).dataset?.sb
  if (!key) return 0
  // Contador: cresce com o texto ("3 selecionados" = 158, "88 selecionados" = 165).
  if (key === 'sel-count') return 60 + 7 * (element.querySelector('.bt-selection__label')?.textContent?.length ?? 0)
  const size = SIZES[key] ?? [0, 0]
  return element.classList.contains('is-compact') ? size[1] : size[0]
}

beforeEach(() => {
  mobile = false
  barWidth = 1800
  rowWidth = 358
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px') ? mobile : false, media: query, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const w = width(this)
    return { width: w, height: 40, top: 0, left: 0, right: w, bottom: 40, x: 0, y: 0, toJSON: noop } as DOMRect
  })
  // O jsdom não carrega o CSS: gaps e moldura da superfície como no table-view.css (gap 2, padding 2, borda 1).
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => {
    if (element.classList.contains('bt-viewbar__surface')) return { columnGap: '2px', paddingLeft: '2px', paddingRight: '2px', borderLeftWidth: '1px', borderRightWidth: '1px' } as CSSStyleDeclaration
    if (element.classList.contains('bt-viewbar__end')) return { columnGap: '8px' } as CSSStyleDeclaration
    if (element.classList.contains('bt-viewbar')) return { columnGap: '12px' } as CSSStyleDeclaration
    return computed(element)
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function Lista({ count, onAudit = noop, legacy = false, primary = <Button icon={icon}>Nova ocorrência</Button>, selectionActions = actions }: { count: number; onAudit?: () => void; legacy?: boolean; primary?: ReactNode; selectionActions?: SelectionAction[] }) {
  const [store] = useState(() => createMemoryViewStore())
  const view = useTableView({ tela: 'fit', columns: defs, store, storage })
  if (legacy) return <ViewBar view={view} columns={defs} filters={{ fields }} onAudit={onAudit}><Button>Atualizar</Button></ViewBar>
  return (
    <ViewBar
      view={view}
      columns={defs}
      filters={{ fields }}
      onAudit={onAudit}
      search={<SearchBox aria-label="Buscar" value="" onChange={noop} />}
      more={[{ id: 'exportar', label: 'Exportar CSV', onSelect: noop }]}
      primary={primary}
      selection={{ count, onClear: noop, actions: selectionActions }}
    />
  )
}

async function at(px: number, count = 3, selectionActions = actions) {
  barWidth = px
  const out = render(<Lista count={count} selectionActions={selectionActions} />)
  await act(async () => {})
  return out
}
const slot = (container: HTMLElement, key: string) => container.querySelector<HTMLElement>(`.bt-viewbar__end [data-vb="${key}"]`)
const state = (container: HTMLElement) => ({
  labels: !slot(container, 'colunas')!.classList.contains('is-compact'),
  primaryLabel: !slot(container, 'primary')!.classList.contains('is-compact'),
  selShown: [...container.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter((b) => !(b as HTMLElement).hidden).length,
  selLabels: !container.querySelector('.bt-viewbar__end [data-vb^="sel:"]')?.classList.contains('is-compact'),
  audit: !slot(container, 'audit')!.hidden,
  density: !(container.querySelector('.bt-viewbar__end [data-vb="density"]')!.closest('.bt-viewbar__slot') as HTMLElement).hidden,
  colunas: !slot(container, 'colunas')!.hidden,
  filtros: Boolean(slot(container, 'filtros')),
  lupa: Boolean(screen.queryByRole('button', { name: 'Buscar' })),
  startCompact: container.querySelector('.bt-viewbar__start [data-vb="view"]')!.classList.contains('is-compact'),
})
/** Só o que é fixo (a busca e a seleção não são). */
const fixedState = (container: HTMLElement) => { const { selShown: _s, selLabels: _l, lupa: _p, ...rest } = state(container); return rest }

describe('ViewBar: encolhimento medido (§10.9.1)', () => {
  // Reserva mínima da seleção (1.32): só ✕ + contador de exemplo ("88 selecionados" = 165). Com tudo cheio:
  // 200 + 12 + superfície(6 + 120 + 110 + 40 + 130 + zona(165 + 2 + 140) + 40 + 5 fios×9 + 10×2) + 8 + 170 = 1208.
  // Cada grupo dobrado tira ele, um fio e dois gaps (40 + 9 + 4 = 53). Os degraus são os mesmos com 0 ou 3 marcados.
  const cases: Array<[number, Partial<ReturnType<typeof state>>]> = [
    [1800, { labels: true, primaryLabel: true, startCompact: false }],
    [1208, { labels: true, primaryLabel: true, audit: true }],
    [1207, { labels: false, primaryLabel: true }], // 1. Colunas, Filtros e Auditoria só ícone
    [968, { labels: false, primaryLabel: true }],
    [967, { labels: false, primaryLabel: false, audit: true }], // 2. a principal só ícone
    [838, { primaryLabel: false, audit: true, density: true }],
    [837, { audit: false, density: true }], // 3. Auditoria, depois Densidade, depois Colunas para o ⋮ (−53 cada)
    [784, { audit: false, density: false, colunas: true }],
    [731, { density: false, colunas: false }],
    [679, { colunas: false, filtros: true }],
    [579, { colunas: false, startCompact: false }], // 4. a busca vira lupa (sem linhas marcadas, só se nem a compacta couber)
    [578, { startCompact: true }], // 5. só quando nem a lupa basta: a visão fica só ícone + chevron
    [324, { startCompact: true, filtros: true }],
  ]
  it.each(cases)('em %ipx (0 e 3 marcados)', async (px, expected) => {
    for (const count of [0, 3]) {
      const { container, unmount } = await at(px, count)
      expect(state(container)).toMatchObject(expected)
      expect(container.querySelector('[data-vb="primary"]')).not.toBeNull()
      expect(screen.getByRole('button', { name: /^Mais ações/ })).toBeTruthy()
      unmount()
    }
  })

  it('com linhas marcadas, as ações tiram espaço só da busca, nesta ordem (1.32)', async () => {
    // De 1208 a 1800 nada fixo muda; a zona tem 307 + sobra. "3 selecionados" = 158; ação 100 (texto) ou 40 (só ícone).
    const order: Array<[number, Partial<ReturnType<typeof state>>]> = [
      [1600, { selShown: 3, selLabels: true, lupa: false }], // 158 + 3×102 + 2 + 140 = 606 ≤ 699
      [1400, { selShown: 3, selLabels: false, lupa: false }], // 1. ações só ícone, busca ≥ 140
      [1300, { selShown: 3, selLabels: false, lupa: false }], // 2. a busca encolhe até a compacta (≥ 96)
      [1250, { selShown: 3, selLabels: false, lupa: true }], // 3. a busca vira lupa
      [1210, { selShown: 2, lupa: true }], // 4. ações para o ⋮, da direita para a esquerda
    ]
    for (const [px, expected] of order) {
      const { container, unmount } = await at(px, 3)
      expect(state(container), `${px}px`).toMatchObject({ labels: true, primaryLabel: true, audit: true, density: true, colunas: true, ...expected })
      unmount()
    }
  })

  it('o texto volta assim que a largura cresce (ResizeObserver)', async () => {
    const { container } = await at(600)
    expect(state(container)).toMatchObject({ lupa: true, colunas: false })
    barWidth = 1800
    await act(async () => { resize?.() })
    expect(state(container)).toMatchObject({ lupa: false, colunas: true, labels: true, primaryLabel: true, selLabels: true })
  })

  it('marcar linhas não muda nada fixo: mesmo degrau com 0, 1 e 3 selecionados, em cada degrau', async () => {
    for (const px of [1800, 1600, 1400, 1300, 1250, 1210, 1208, 1207, 1000, 968, 967, 838, 837, 785, 784, 732, 731, 690, 679, 678, 600, 579, 578, 400]) {
      const snapshots = []
      for (const count of [0, 1, 3]) {
        const { container, unmount } = await at(px, count)
        snapshots.push(fixedState(container))
        unmount()
      }
      expect(snapshots[1], `${px}px, 1 marcado`).toEqual(snapshots[0])
      expect(snapshots[2], `${px}px, 3 marcados`).toEqual(snapshots[0])
    }
 }, 30_000)

  it('reserva mínima: quantas ações inline a tela tem não muda os fixos (1.32)', async () => {
    const none = actions.map((action) => ({ ...action, inline: false }))
    for (const px of [1208, 1207, 967, 837, 784, 731, 679, 600]) {
      const many = await at(px, 0)
      const before = fixedState(many.container)
      many.unmount()
      const few = await at(px, 0, none)
      expect(fixedState(few.container), `${px}px`).toEqual(before)
      few.unmount()
    }
  })

  it('sem seleção a busca ocupa a reserva: sem largura fixa, logo depois do fio de Auditoria, sem fio sobrando (1.27.1)', async () => {
    for (const count of [0, 1]) {
      const { container, unmount } = await at(1400, count)
      const search = container.querySelector<HTMLElement>('.bt-viewbar__search')!
      // Largura vem do CSS (ocupa o que a seleção não usa); nada de largura fixa que deixe vão.
      expect(search.style.width).toBe('')
      expect(search.classList.contains('is-sized')).toBe(false)
      expect(container.querySelector('.bt-viewbar__surface')!.classList.contains('is-hug')).toBe(false)
      // Colunas | Filtros | Densidade | Auditoria | zona | ⋮: 5 fios com ou sem seleção; a seleção entra antes da busca.
      expect(container.querySelectorAll('.bt-viewbar__surface > .bt-viewbar__sep')).toHaveLength(5)
      const zone = container.querySelector('.bt-viewbar__zone')!
      expect(zone.firstElementChild!.classList.contains('bt-selection')).toBe(true)
      expect((zone.firstElementChild as HTMLElement).hidden).toBe(count === 0)
      unmount()
    }
  })

  it('degrau da lupa: sem seleção a busca volta a caixa na reserva; marcar linhas recolhe na lupa sem mover os fixos', async () => {
    const idle = await at(668, 0)
    expect(state(idle.container).lupa).toBe(false)
    expect(idle.container.querySelector<HTMLElement>('.bt-viewbar__search')!.hidden).toBe(false)
    const before = fixedState(idle.container)
    idle.unmount()
    const busy = await at(668, 1)
    expect(state(busy.container).lupa).toBe(true)
    expect(fixedState(busy.container)).toEqual(before)
  })

  it('a sobra vai para a busca: o trecho da seleção nunca estica; no degrau da lupa, a lupa ocupa a sobra (1.32)', async () => {
    const zone = (container: HTMLElement) => container.querySelector('.bt-viewbar__zone')!.classList
    const busy = await at(1250, 3)
    expect(state(busy.container).lupa).toBe(true)
    expect(zone(busy.container).contains('is-fill')).toBe(false)
    expect(zone(busy.container).contains('is-lupa-fill')).toBe(true)
    expect(screen.getByRole('button', { name: 'Buscar' }).classList.contains('bt-viewbar__lupa')).toBe(true)
    busy.unmount()
    // Com a caixa da busca, ela é quem estica (CSS); nada de largura fixa.
    for (const [px, count] of [[1800, 1], [1300, 3], [668, 0]]) {
      const { container, unmount } = await at(px, count)
      expect(zone(container).contains('is-fill')).toBe(false)
      expect(zone(container).contains('is-lupa-fill')).toBe(false)
      expect(container.querySelector<HTMLElement>('.bt-viewbar__search')!.style.width).toBe('')
      unmount()
    }
  })

  it('a ação principal só ícone ganha title com o rótulo, e perde quando o texto volta', async () => {
    const { container } = await at(900)
    const button = container.querySelector<HTMLElement>('[data-vb="primary"] .bt-button')!
    expect(button.title).toBe('Nova ocorrência')
    expect(button.textContent).toContain('Nova ocorrência') // nome acessível continua
    barWidth = 1800
    await act(async () => { resize?.() })
    expect(button.hasAttribute('title')).toBe(false)
  })

  it('visão compacta: sem o nome na linha, nome no aria-label, no title e no menu; volta com espaço', async () => {
    const { container } = await at(500, 0)
    const trigger = container.querySelector<HTMLElement>('.bt-viewbar__start [data-vb="view"]')!
    expect(trigger.classList.contains('is-compact')).toBe(true)
    const name = trigger.querySelector('.bt-viewbar__name')!.textContent!
    expect(trigger.getAttribute('aria-label')).toContain(`Visão: ${name}`)
    expect(trigger.title).toBe(name)
    expect(trigger.querySelector('.bt-viewbar__scope svg')).not.toBeNull() // ícone da visão (padrão = lista)
    fireEvent.click(trigger)
    expect(within(screen.getByRole('menu', { hidden: true })).getByRole('menuitemradio', { name: name, hidden: true })).toBeTruthy()
    barWidth = 1800
    await act(async () => { resize?.() })
    expect(trigger.classList.contains('is-compact')).toBe(false)
    expect(trigger.hasAttribute('title')).toBe(false)
  })

  it('a lupa abre a busca, que fecha ao perder o foco vazia', async () => {
    const { container } = await at(668, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    const box = container.querySelector<HTMLElement>('.bt-viewbar__search')!
    expect(box.classList.contains('is-floating')).toBe(true)
    expect(box.hidden).toBe(false)
    fireEvent.focusOut(box.querySelector('input')!, { relatedTarget: document.body })
    expect(box.hidden).toBe(true)
  })
})

describe('ViewBar: peça única (1.27)', () => {
  const inside = (container: HTMLElement, selector: string) => Boolean(container.querySelector(`.bt-viewbar__surface ${selector}`))
  it('tudo menos a visão e a ação principal numa superfície, com um fio entre cada grupo visível', async () => {
    const { container } = await at(1800, 0)
    expect(container.querySelectorAll('.bt-viewbar__surface')).toHaveLength(1)
    for (const selector of ['[data-vb="colunas"]', '[data-vb="filtros"]', '[data-vb="density"]', '[data-vb="audit"]', '.bt-viewbar__search', '.bt-viewbar__more']) expect(inside(container, selector)).toBe(true)
    expect(inside(container, '[data-vb="view"]')).toBe(false)
    expect(inside(container, '[data-vb="primary"]')).toBe(false)
    expect(container.querySelector('.bt-viewbar__end > [data-vb="primary"]')).not.toBeNull()
    // Colunas | Filtros | Densidade | Auditoria | espaço flexível | ⋮ → 5 fios.
    expect(container.querySelectorAll('.bt-viewbar__surface > .bt-viewbar__sep')).toHaveLength(5)
  })
  it('grupo dobrado sai sem deixar fio sobrando', async () => {
    const { container } = await at(731, 0) // Auditoria, Densidade e Colunas no ⋮
    expect(container.querySelectorAll('.bt-viewbar__surface > .bt-viewbar__sep')).toHaveLength(2) // Filtros | zona | ⋮
    expect(container.querySelector('.bt-viewbar__surface > :not([hidden])')!.classList.contains('bt-viewbar__sep')).toBe(false)
  })
  it('seleção como trecho dentro da superfície: ✕, contador em texto simples e ações ghost; sem pílula nem selo', async () => {
    const { container } = await at(1800, 3)
    const segment = container.querySelector<HTMLElement>('.bt-viewbar__surface .bt-viewbar__zone > .bt-selection')!
    expect(segment.hidden).toBe(false)
    expect(within(segment).getByRole('button', { name: 'Limpar seleção' })).toBeTruthy()
    const label = segment.querySelector('.bt-selection__label')!
    expect(label.textContent).toBe('3 selecionados')
    expect(label.children).toHaveLength(0)
    for (const button of segment.querySelectorAll('[data-vb^="sel:"]')) expect(button.classList.contains('bt-button--ghost')).toBe(true)
    expect(container.querySelector('.bt-viewbar__badge')).toBeNull()
  })
  it('primary: o botão primário fica fora; secondary, ghost e só ícone entram na superfície depois do ⋮', async () => {
    barWidth = 1800
    const { container } = render(<Lista count={0} primary={<><Button variant="secondary" icon={icon} aria-label="Atualizar" /><Button icon={icon}>Nova ocorrência</Button><Button variant="ghost">Ajuda</Button><Button icon={icon} aria-label="Importar" /></>} />)
    await act(async () => {})
    const tools = container.querySelector<HTMLElement>('.bt-viewbar__surface > [data-vb="tools"]')!
    expect([...tools.querySelectorAll('.bt-button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Atualizar', 'Ajuda', 'Importar'])
    expect(tools.previousElementSibling?.classList.contains('bt-viewbar__sep')).toBe(true)
    expect(tools.previousElementSibling?.previousElementSibling?.querySelector('.bt-viewbar__more')).not.toBeNull()
    const main = container.querySelector<HTMLElement>('.bt-viewbar__end > [data-vb="primary"]')!
    expect([...main.querySelectorAll('.bt-button')].map((b) => b.textContent)).toEqual(['Nova ocorrência'])
  })
  it('componente da tela (não Button) fica fora; fragmentos aninhados não repetem chave', async () => {
    barWidth = 1800
    const error = vi.spyOn(console, 'error').mockImplementation(noop)
    const Criar = () => <Button icon={icon}>Criar</Button>
    const { container } = render(<Lista count={0} primary={<><Button variant="ghost">A</Button><><Button variant="ghost">B</Button></><Criar /></>} />)
    await act(async () => {})
    expect(container.querySelector('.bt-viewbar__end > [data-vb="primary"]')!.textContent).toBe('Criar')
    expect([...container.querySelectorAll('[data-vb="tools"] .bt-button')].map((b) => b.textContent)).toEqual(['A', 'B'])
    expect(error.mock.calls.some(([message]) => String(message).includes('same key'))).toBe(false)
  })
  it('só secondary em primary: nada fora da superfície', async () => {
    barWidth = 1800
    const { container } = render(<Lista count={0} primary={<Button variant="secondary" icon={icon} aria-label="Atualizar" />} />)
    await act(async () => {})
    expect(container.querySelector('[data-vb="primary"]')).toBeNull()
    expect(container.querySelector('.bt-viewbar__surface > [data-vb="tools"]')).not.toBeNull()
  })
})

describe('ViewBar: menu único do ⋮ (§10.9.6)', () => {
  it('sem "Ações ▾"; a seleção que não coube em cima, as da tela embaixo; ⋮ sem selo, com a quantidade no aria-label', async () => {
    await at(690) // Colunas, Densidade e Auditoria no ⋮ pela largura; a zona (307 + 11) cabe 2 ações + lupa
    expect(screen.queryByRole('button', { name: /^Ações/ })).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Mais ações (2 da seleção)' })
    expect(trigger.textContent).toBe('')
    expect(trigger.querySelector('.bt-viewbar__badge, .bt-viewbar__count')).toBeNull()
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { hidden: true })
    const items = within(menu).getAllByRole('menuitem', { hidden: true })
    expect(items.map((i) => i.textContent)).toEqual(['ConcluirHá concluídas na seleção.', 'Excluir', 'Exportar CSV', 'Colunas', 'Auditoria'])
    expect(menu.querySelector('.bt-menu__group')?.textContent).toBe('3 selecionados')
    expect((items[0] as HTMLButtonElement).disabled).toBe(true) // inerte, com o motivo na segunda linha
  })

  it('sem seleção, o ⋮ é o de sempre mais o que saiu da linha (Colunas, Auditoria, Densidade)', async () => {
    const onAudit = vi.fn()
    barWidth = 716
    render(<Lista count={0} onAudit={onAudit} />)
    await act(async () => {})
    const trigger = screen.getByRole('button', { name: 'Mais ações' })
    expect(trigger.textContent).toBe('')
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { hidden: true })
    expect(within(menu).getAllByRole('menuitem', { hidden: true }).map((i) => i.textContent)).toEqual(['Exportar CSV', 'Colunas', 'Auditoria'])
    expect(within(menu).getAllByRole('menuitemradio', { hidden: true }).map((i) => i.textContent)).toEqual(['Confortável', 'Compacta', 'Mínima'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Auditoria', hidden: true }))
    expect(onAudit).toHaveBeenCalledOnce()
  })

  it('o clique direito usa a mesma lista da seleção (linha + ⋮ = todas as ações)', async () => {
    const context = selectionMenuActions({ count: 3, actions }).map((a) => a.id)
    expect(context).toEqual(['abrir', 'copiar', 'concluir', 'excluir'])
  })
})

describe('ViewBar: celular (até 820 px)', () => {
  it('só a lupa na zona: a superfície abraça os itens (sem vão entre Filtros e a lupa)', async () => {
    mobile = true
    const { container } = await at(390, 0)
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeTruthy()
    expect(container.querySelector('.bt-viewbar__surface')!.classList.contains('is-hug')).toBe(true)
  })
  it('rodapé: rótulo que não cabe vira só ícone com title e nome acessível; com espaço, todos com texto', async () => {
    mobile = true
    SIZES['sel:copiar'] = [200, 44] // "Copiar Serviços"
    try {
      const { container, unmount } = await at(390, 1)
      const bar = container.querySelector<HTMLElement>('.bt-selectionbar')!
      const copiar = bar.querySelector<HTMLElement>('[data-sb="copiar"]')!
      // (358 − 2×8) / 3 = 114 < 200: Copiar perde o texto; sobra (358 − 16 − 44) / 2 = 149 para Abrir (100) e Mais (90).
      expect(copiar.classList.contains('is-compact')).toBe(true)
      expect(copiar.title).toBe('Copiar')
      expect(within(bar).getByRole('button', { name: 'Copiar' })).toBe(copiar)
      expect(bar.querySelector('[data-sb="abrir"]')!.classList.contains('is-compact')).toBe(false)
      expect(bar.querySelector('[data-sb="more"]')!.classList.contains('is-compact')).toBe(false)
      expect(bar.querySelector('.bt-selectionbar__measure')).toBeNull()
      unmount()
      rowWidth = 800
      const wide = await at(820, 1)
      expect(wide.container.querySelectorAll('.bt-selectionbar .is-compact')).toHaveLength(0)
    } finally {
      SIZES['sel:copiar'] = [100, 40]
    }
  })
  it('linha de cima sem seleção; barra do rodapé com 2 ações e Mais com o mesmo menu unificado', async () => {
    mobile = true
    const { container } = await at(390, 3)
    expect(container.querySelector('.bt-viewbar__end .bt-selection')).toBeNull()
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeTruthy()
    const bar = container.querySelector<HTMLElement>('.bt-selectionbar')!
    fireEvent.click(within(bar).getByRole('button', { name: 'Mais ações (2 da seleção)' }))
    const menu = screen.getByRole('menu', { hidden: true })
    const labels = within(menu).getAllByRole('menuitem', { hidden: true }).map((i) => i.textContent)
    expect(labels).toEqual(['ConcluirHá concluídas na seleção.', 'Excluir', 'Exportar CSV', 'Colunas', 'Auditoria'])
  })
})

describe('ViewBar: modo legado (children sem espaços nomeados)', () => {
  it('não mede nem muda: Colunas, Filtros e Auditoria com texto no desktop, children no fim', async () => {
    barWidth = 400
    const { container } = render(<Lista count={0} legacy />)
    await act(async () => {})
    expect(container.querySelector('.bt-viewbar--slots, .bt-viewbar__measure, .bt-viewbar__slot')).toBeNull()
    const end = container.querySelector('.bt-viewbar__end')!
    expect([...end.children].map((c) => c.textContent)).toEqual(['Colunas', 'Filtros', '', 'Auditoria', 'Atualizar'])
  })
  it('no celular, os mesmos botões só ícone com aria-label', async () => {
    mobile = true
    render(<Lista count={0} legacy />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Colunas' }).textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Filtros' }).textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Auditoria' }).textContent).toBe('')
  })
})

describe('planFit / fitZone', () => {
  const base: FitInput = {
    avail: 2000, gap: 2, startGap: 12, endGap: 8, frame: 6, sep: 9, start: { full: 200, compact: 60 }, square: 40,
    colunas: { full: 120, compact: 40 }, filtros: { full: 110, compact: 40 }, audit: { full: 130, compact: 40 }, primary: { full: 170, compact: 40 },
    extra: 0, search: true, searchMin: 140, menu: true, selection: { counter: 165 },
  }
  it('o último degrau vale quando nada cabe', () => {
    expect(planFit({ ...base, avail: 100 })).toMatchObject({ lupa: true, fold: { audit: true, density: true, colunas: true }, startCompact: true })
  })
  it('a visão compacta é o último degrau: não entra enquanto a lupa basta', () => {
    // Degrau da lupa: 200 + 12 + superfície(6 + 40 + zona(165 + 2 + 40) + 40 + 2 fios×9 + 4×2) + 8 + 40 = 579 (Filtros nunca sai).
    for (const avail of [2000, 1000, 700, 579]) expect(planFit({ ...base, avail }).startCompact).toBe(false)
    expect(planFit({ ...base, avail: 579 })).toMatchObject({ lupa: true, slack: 0, flex: 207 })
    expect(planFit({ ...base, avail: 578 })).toMatchObject({ lupa: true, startCompact: true, slack: 139 }) // 578 - (60 + 12 + 319 + 48)
  })
  it('sem largura compacta menor, não há degrau da visão', () => {
    expect(planFit({ ...base, start: { full: 200, compact: 200 }, avail: 100 })).toMatchObject({ lupa: true, startCompact: false })
  })
  it('a reserva é só ✕ + contador: custa exatamente ele e um gap (1.32)', () => {
    expect(planFit({ ...base, avail: 1208 }).level).toBe(0)
    expect(planFit({ ...base, avail: 1207 }).level).toBe(1)
    // 1208 − reserva (165) − 1 gap = 1041.
    expect(planFit({ ...base, selection: undefined, avail: 1041 }).level).toBe(0)
    expect(planFit({ ...base, selection: undefined, avail: 1040 }).level).toBe(1)
  })
  it('fios contam como itens: grupo a mais custa ele, um fio e dois gaps', () => {
    const without = planFit({ ...base, audit: undefined, avail: 5000 }).slack
    expect(planFit({ ...base, avail: 5000 }).slack).toBe(without - (130 + 9 + 2 * 2))
  })
  it('itens de primary na superfície (tools) perdem o texto no mesmo degrau da principal, depois dos fixos', () => {
    // Sem principal fora (−178) e com tools de 120 na superfície (+ fio + 2 gaps = 133): 1208 − 178 + 133 = 1163.
    const input = { ...base, primary: undefined, tools: { full: 120, compact: 40 } }
    expect(planFit({ ...input, avail: 1163 })).toMatchObject({ labels: true, primaryLabel: true })
    expect(planFit({ ...input, avail: 1162 })).toMatchObject({ labels: false, primaryLabel: true })
    expect(planFit({ ...input, avail: 1163 - 240 - 1 })).toMatchObject({ labels: false, primaryLabel: false })
  })
  it('flex: a zona inteira (reserva + busca + sobra), sem `children`', () => {
    expect(planFit({ ...base, avail: 1300 }).flex).toBe(165 + 2 + 140 + 92)
    // `children` de 50 entra na zona com um gap e sai do flex: sobra 52 a menos.
    expect(planFit({ ...base, extra: 50, avail: 2000 }).flex).toBe(planFit({ ...base, avail: 2000 }).flex - 52)
  })
  const inline = [{ full: 100, compact: 40 }, { full: 100, compact: 40 }]
  const search = { min: 140, compact: 96, square: 40 }
  it('fitZone: só ícone antes de encolher a busca, depois a compacta, a lupa e o ⋮', () => {
    // Contador 150; com texto 150 + 2×102 = 354; só ícone 150 + 2×42 = 234.
    expect(fitZone(496, 150, inline, 2, search)).toEqual({ labels: true, shown: 2, search: 'field' }) // 354 + 142
    expect(fitZone(495, 150, inline, 2, search)).toEqual({ labels: false, shown: 2, search: 'field' })
    expect(fitZone(376, 150, inline, 2, search)).toEqual({ labels: false, shown: 2, search: 'field' }) // 234 + 142
    expect(fitZone(332, 150, inline, 2, search)).toEqual({ labels: false, shown: 2, search: 'field' }) // 234 + 98: compacta
    expect(fitZone(331, 150, inline, 2, search)).toEqual({ labels: false, shown: 2, search: 'lupa' })
    expect(fitZone(275, 150, inline, 2, search)).toEqual({ labels: false, shown: 1, search: 'lupa' }) // 234 + 42 = 276
    expect(fitZone(100, 150, inline, 2, search)).toEqual({ labels: false, shown: 0, search: 'lupa' })
  })
  it('fitZone: ao virar lupa, as ações recuperam o texto se o espaço liberado bastar', () => {
    const wide = [{ full: 60, compact: 40 }, { full: 60, compact: 40 }]
    // Só ícone + compacta: 234 + 98 = 332 > 331; com texto + lupa: 150 + 2×62 + 42 = 316 ≤ 331.
    expect(fitZone(331, 150, wide, 2, search)).toEqual({ labels: true, shown: 2, search: 'lupa' })
  })
  it('fitZone sem linhas marcadas: a busca ocupa a zona (caixa até a compacta, senão lupa)', () => {
    expect(fitZone(96, 0, inline, 2, search).search).toBe('field')
    expect(fitZone(95, 0, inline, 2, search).search).toBe('lupa')
  })
  it('fitZone sem busca: texto, só ícone, ⋮', () => {
    expect(fitZone(354, 150, inline, 2, null)).toEqual({ labels: true, shown: 2, search: null })
    expect(fitZone(353, 150, inline, 2, null)).toEqual({ labels: false, shown: 2, search: null })
    expect(fitZone(233, 150, inline, 2, null)).toEqual({ labels: false, shown: 1, search: null })
  })
  it('rodapé: o mais largo perde o texto primeiro e devolve a sobra aos outros', () => {
    expect(fitBarActions(358, 8, [100, 200, 90], 44)).toEqual([false, true, false])
    expect(fitBarActions(800, 8, [100, 200, 90], 44)).toEqual([false, false, false])
    expect(fitBarActions(200, 8, [100, 200, 90], 44)).toEqual([true, true, false]) // (200 − 16 − 88) = 96 ≥ 90
    expect(fitBarActions(100, 8, [100, 200, 90], 44)).toEqual([true, true, true])
  })
})
