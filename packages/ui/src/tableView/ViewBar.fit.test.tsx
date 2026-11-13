// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '../components/Button'
import { SearchBox } from '../components/SearchBox'
import { tableViewColumns, type TableColumn } from '../components/Table'
import type { FilterField } from './filters'
import { selectionMenuActions, type SelectionAction } from './Selection'
import { createMemoryViewStore } from './store'
import { useTableView } from './useTableView'
import { ViewBar } from './ViewBar'
import { fitSelection, planFit, type FitInput } from './viewBarFit'

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

// Larguras simuladas (px): cheio / só ícone. Gaps caem no padrão do ViewBar (8 entre comandos, 12 depois da visão).
const SIZES: Record<string, [number, number]> = {
  view: [200, 200], colunas: [120, 40], filtros: [110, 40], density: [40, 40], audit: [130, 40], primary: [170, 40],
  'sel:abrir': [100, 40], 'sel:copiar': [100, 40], 'sel:concluir': [100, 40],
}
let barWidth = 1800
let resize: (() => void) | null = null
let mobile = false

function width(element: Element) {
  if (element.classList.contains('bt-viewbar')) return barWidth
  const key = (element as HTMLElement).dataset?.vb
  if (!key) return 0
  // Contador: cresce com o texto ("3 selecionados" = 158, "88 selecionados" = 165).
  if (key === 'sel-count') return 60 + 7 * (element.querySelector('.bt-selection__label')?.textContent?.length ?? 0)
  const size = SIZES[key] ?? [0, 0]
  return element.classList.contains('is-compact') ? size[1] : size[0]
}

beforeEach(() => {
  mobile = false
  barWidth = 1800
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px') ? mobile : false, media: query, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const w = width(this)
    return { width: w, height: 40, top: 0, left: 0, right: w, bottom: 40, x: 0, y: 0, toJSON: noop } as DOMRect
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function Lista({ count, onAudit = noop, legacy = false }: { count: number; onAudit?: () => void; legacy?: boolean }) {
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
      primary={<Button icon={icon}>Nova ocorrência</Button>}
      selection={{ count, onClear: noop, actions }}
    />
  )
}

async function at(px: number, count = 3) {
  barWidth = px
  const out = render(<Lista count={count} />)
  await act(async () => {})
  return out
}
const slot = (container: HTMLElement, key: string) => container.querySelector<HTMLElement>(`.bt-viewbar__end [data-vb="${key}"]`)
const state = (container: HTMLElement) => ({
  labels: !slot(container, 'colunas')!.classList.contains('is-compact'),
  primaryLabel: !slot(container, 'primary')!.classList.contains('is-compact'),
  selShown: [...container.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter((b) => !(b as HTMLElement).hidden).length,
  selLabels: !container.querySelector('.bt-viewbar__end [data-vb^="sel:"]')!.classList.contains('is-compact'),
  audit: !slot(container, 'audit')!.hidden,
  density: !(container.querySelector('.bt-viewbar__end [data-vb="density"]')!.closest('.bt-viewbar__slot') as HTMLElement).hidden,
  colunas: !slot(container, 'colunas')!.hidden,
  filtros: Boolean(slot(container, 'filtros')),
  lupa: Boolean(screen.queryByRole('button', { name: 'Buscar' })),
})

describe('ViewBar: encolhimento medido (§10.9.1)', () => {
  // Com tudo cheio: 200 + 12 + (120 + 110 + 40 + 130 + zona(165 + 3×48 + 8 + 140) + 40 + 170 + 6×8) = 1327.
  const cases: Array<[number, Partial<ReturnType<typeof state>>]> = [
    [1800, { labels: true, primaryLabel: true, selShown: 3, selLabels: true }],
    [1400, { labels: true, primaryLabel: true, selShown: 3, selLabels: false }], // 1. a seleção perde o texto primeiro
    [1327, { labels: true, selShown: 3, selLabels: false }],
    [1326, { labels: false, primaryLabel: true, selShown: 3 }], // 2. Colunas, Filtros e Auditoria só ícone
    [1086, { labels: false, primaryLabel: false, selShown: 3 }], // 3. a principal só ícone
    [956, { primaryLabel: false, selShown: 2, audit: true }], // 4. seleção para o ⋮, da direita para a esquerda
    [861, { selShown: 1 }],
    [812, { selShown: 0, audit: false, density: true }], // 5. Auditoria, depois Densidade, depois Colunas
    [764, { audit: false, density: false, colunas: true }],
    [716, { colunas: false, lupa: false }],
    [668, { colunas: false, lupa: true, filtros: true }], // 6. a busca vira lupa; Filtros nunca sai
  ]
  it.each(cases)('em %ipx', async (px, expected) => {
    const { container } = await at(px)
    expect(state(container)).toMatchObject(expected)
    expect(container.querySelector('[data-vb="primary"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Mais ações/ })).toBeTruthy()
  })

  it('o texto volta assim que a largura cresce (ResizeObserver)', async () => {
    const { container } = await at(600)
    expect(state(container)).toMatchObject({ lupa: true, colunas: false })
    barWidth = 1800
    await act(async () => { resize?.() })
    expect(state(container)).toMatchObject({ lupa: false, colunas: true, labels: true, primaryLabel: true, selLabels: true })
  })

  it('marcar linhas não muda nada fixo: mesmo degrau com 0, 1 e 3 selecionados', async () => {
    for (const px of [1800, 1326, 956, 716]) {
      const fixed = (container: HTMLElement) => { const { selShown: _s, selLabels: _l, ...rest } = state(container); return rest }
      const snapshots = []
      for (const count of [0, 1, 3]) {
        const { container, unmount } = await at(px, count)
        snapshots.push({ ...fixed(container), searchWidth: container.querySelector<HTMLElement>('.bt-viewbar__search')!.style.width })
        unmount()
      }
      expect(snapshots[1]).toEqual(snapshots[0])
      expect(snapshots[2]).toEqual(snapshots[0])
    }
  })

  it('a busca usa a sobra até 320 px, sem invadir a reserva da seleção', async () => {
    const { container } = await at(1400, 0)
    expect(container.querySelector<HTMLElement>('.bt-viewbar__search')!.style.width).toBe('213px')
  })

  it('a ação principal só ícone ganha title com o rótulo, e perde quando o texto volta', async () => {
    const { container } = await at(1000)
    const button = container.querySelector<HTMLElement>('[data-vb="primary"] .bt-button')!
    expect(button.title).toBe('Nova ocorrência')
    expect(button.textContent).toContain('Nova ocorrência') // nome acessível continua
    barWidth = 1800
    await act(async () => { resize?.() })
    expect(button.hasAttribute('title')).toBe(false)
  })

  it('a lupa abre a busca, que fecha ao perder o foco vazia', async () => {
    const { container } = await at(668, 0)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    const box = container.querySelector<HTMLElement>('.bt-viewbar__search')!
    expect(box.classList.contains('is-floating')).toBe(true)
    expect(box.hidden).toBe(false)
    fireEvent.focusOut(box.querySelector('input')!, { relatedTarget: document.body })
    expect(box.hidden).toBe(true)
  })
})

describe('ViewBar: menu único do ⋮ (§10.9.6)', () => {
  it('sem "Ações ▾"; a seleção que não coube em cima, as da tela embaixo, selo com a quantidade', async () => {
    await at(956)
    expect(screen.queryByRole('button', { name: /^Ações/ })).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Mais ações (2 da seleção)' })
    expect(trigger.querySelector('.bt-viewbar__badge')?.textContent).toBe('2')
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { hidden: true })
    const items = within(menu).getAllByRole('menuitem', { hidden: true })
    expect(items.map((i) => i.textContent)).toEqual(['ConcluirHá concluídas na seleção.', 'Excluir', 'Exportar CSV'])
    expect(menu.querySelector('.bt-menu__group')?.textContent).toBe('3 selecionados')
    expect((items[0] as HTMLButtonElement).disabled).toBe(true) // inerte, com o motivo na segunda linha
  })

  it('sem seleção, o ⋮ é o de sempre mais o que saiu da linha (Colunas, Auditoria, Densidade)', async () => {
    const onAudit = vi.fn()
    barWidth = 716
    render(<Lista count={0} onAudit={onAudit} />)
    await act(async () => {})
    const trigger = screen.getByRole('button', { name: 'Mais ações' })
    expect(trigger.querySelector('.bt-viewbar__badge')).toBeNull()
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

describe('planFit / fitSelection', () => {
  const base: FitInput = {
    avail: 2000, gap: 8, startGap: 12, start: 200, square: 40,
    colunas: { full: 120, compact: 40 }, filtros: { full: 110, compact: 40 }, audit: { full: 130, compact: 40 }, primary: { full: 170, compact: 40 },
    extra: 0, search: true, searchMin: 140, searchMax: 320, menu: true, selection: { counter: 165, inline: [40, 40, 40] },
  }
  it('o último degrau vale quando nada cabe', () => {
    expect(planFit({ ...base, avail: 100 })).toMatchObject({ lupa: true, fold: { audit: true, density: true, colunas: true }, selectionFolded: 3 })
  })
  it('sem seleção não reserva nada', () => {
    expect(planFit({ ...base, selection: undefined, avail: 1018 }).level).toBe(0)
  })
  it('a seleção perde o texto antes de ir para o ⋮', () => {
    const inline = [{ full: 100, compact: 40 }, { full: 100, compact: 40 }]
    expect(fitSelection(400, 150, inline, 8)).toEqual({ labels: true, shown: 2 })
    expect(fitSelection(300, 150, inline, 8)).toEqual({ labels: false, shown: 2 })
    expect(fitSelection(200, 150, inline, 8)).toEqual({ labels: false, shown: 1 })
  })
})
