// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig, type ViewConfig } from '../tableView/config'
import { Table, tableViewColumns, type TableColumn } from './Table'

type Row = { id: string; nome: string; status: string }
const rows: Row[] = [{ id: '1', nome: 'Ana', status: 'Ativo' }]
const columns: TableColumn<Row>[] = [
  { key: 'nome', header: 'Nome', cell: (r) => r.nome },
  { key: 'status', header: 'Status', cell: (r) => r.status, defaultWidth: 100 },
]
const defs = tableViewColumns(columns)

function Harness({ spy }: { spy: (c: ViewConfig) => void }) {
  const [config, setConfig] = useState(defaultConfig(defs))
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} view={{ config, onChange: (fn) => setConfig((c) => { const next = fn(c); spy(next); return next }) }} />
}
const handle = () => screen.getByRole('separator', { name: 'Largura de Status' })
const table = () => handle().closest<HTMLElement>('.bt-table')!
const frame = () => act(() => { vi.runAllTimers() })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout'] })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('arrastar a largura muda só o estilo e grava a visão uma vez, ao soltar', () => {
  const spy = vi.fn()
  render(<Harness spy={spy} />)
  fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 500 })
  expect(document.documentElement.classList.contains('bt-resizing')).toBe(true)
  fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 520 })
  fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 540 })
  frame()
  expect(spy).not.toHaveBeenCalled()
  expect(table().style.getPropertyValue('--bt-table-columns')).toContain('140px')
  fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 540 })
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0].columns.find((c: { key: string }) => c.key === 'status').width).toBe(140)
  expect(document.documentElement.classList.contains('bt-resizing')).toBe(false)
  expect(handle().getAttribute('aria-valuenow')).toBe('140')
})

it('Esc durante o arraste devolve a largura de antes sem gravar', () => {
  const spy = vi.fn()
  render(<Harness spy={spy} />)
  const before = table().style.getPropertyValue('--bt-table-columns')
  fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 500 })
  fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 600 })
  frame()
  expect(table().style.getPropertyValue('--bt-table-columns')).toContain('200px')
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 600 })
  expect(spy).not.toHaveBeenCalled()
  expect(table().style.getPropertyValue('--bt-table-columns')).toBe(before)
})
