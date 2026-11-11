// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ColumnsPanel } from '../tableView/ColumnsPanel'
import { defaultConfig, pinColumn, type ViewConfig } from '../tableView/config'
import { Table, tableViewColumns, type TableColumn } from './Table'

type Row = { id: string; nome: string; status: string; valor: string }
const rows: Row[] = [{ id: '1', nome: 'Ana', status: 'Ativo', valor: '10' }]
const columns: TableColumn<Row>[] = [
  { key: 'nome', header: 'Nome', cell: (r) => r.nome },
  { key: 'status', header: 'Status', cell: (r) => r.status, defaultWidth: 100 },
  { key: 'valor', header: 'Valor', cell: (r) => r.valor, defaultWidth: 300 },
]
const defs = tableViewColumns(columns)

function Harness({ initial = defaultConfig(defs), pinnable = true, spy }: { initial?: ViewConfig; pinnable?: boolean; spy?: (c: ViewConfig) => void }) {
  const [config, setConfig] = useState(initial)
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} view={{ config, pinnable, onChange: (fn) => setConfig((c) => { const next = fn(c); spy?.(next); return next }) }} />
}
const openMenu = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const item = (name: string) => screen.queryByRole('menuitem', { name, hidden: true })

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('menu do título fixa e desafixa, com anúncio', () => {
  let last: ViewConfig | undefined
  render(<Harness spy={(c) => { last = c }} />)
  openMenu('Status')
  fireEvent.click(item('Fixar coluna')!)
  expect(last?.columns.map((c) => [c.key, c.pinned ?? false])).toEqual([['status', true], ['nome', false], ['valor', false]])
  expect(screen.getByText('Coluna Status fixada')).toBeTruthy()
  const cell = screen.getAllByRole('columnheader')[0]
  expect(cell.className).toContain('bt-table__cell--pinned')
  openMenu('Status')
  fireEvent.click(item('Desafixar coluna')!)
  expect(last?.columns.some((c) => c.pinned)).toBe(false)
  expect(screen.getByText('Coluna Status solta')).toBeTruthy()
})

it('sem pinnable o item não aparece', () => {
  render(<Harness pinnable={false} />)
  openMenu('Status')
  expect(item('Fixar coluna')).toBeNull()
  expect(item('Ocultar coluna')).toBeTruthy()
})

it('limite de 50%: "Fixar coluna" desabilitado com a dica', () => {
  // Tabela com 500px visíveis: Status (100) cabe; Valor (300) passaria de 250 com Status já fixa.
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.classList.contains('bt-table__scroll') ? 500 : 0 } })
  render(<Harness initial={pinColumn(defaultConfig(defs), defs, 'status')} />)
  openMenu('Valor')
  const pin = item('Fixar coluna') as HTMLButtonElement
  expect(pin.disabled).toBe(true)
  expect(pin.title).toBe('As colunas fixas já ocupam metade da tabela')
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
})

it('painel: seção Fixas, alfinete e Restaurar volta às defaultPinned', () => {
  const pinnedDefs = defs.map((d) => (d.key === 'status' ? { ...d, defaultPinned: true } : d))
  const defaults = defaultConfig(pinnedDefs)
  const onApply = vi.fn()
  render(<ColumnsPanel open pinnable onClose={() => {}} columns={pinnedDefs} config={defaultConfig(defs)} defaults={defaults} onApply={onApply} />)
  const fixas = screen.getByRole('region', { name: 'Fixas' })
  expect(within(fixas).queryAllByRole('listitem')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Fixar Valor' }))
  expect(within(fixas).getAllByRole('listitem').map((li) => li.dataset.col)).toEqual(['valor'])
  expect(screen.getByText('Coluna Valor fixada')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar colunas' }))
  expect(within(fixas).getAllByRole('listitem').map((li) => li.dataset.col)).toEqual(['status'])
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(onApply.mock.calls[0][0].columns).toEqual(defaults.columns)
})
