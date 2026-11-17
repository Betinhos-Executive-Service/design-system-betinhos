// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { defaultConfig, visibleColumns, type ViewConfig } from '../tableView/config'
import { Table, tableViewColumns, type TableColumn } from './Table'

type Row = { id: string; a: string }
const rows: Row[] = [{ id: '1', a: 'x' }]
const columns: TableColumn<Row>[] = ['nome', 'status', 'cidade'].map((key) => ({ key, header: key.toUpperCase(), cell: () => key }))
const defs = tableViewColumns(columns)

function Harness({ spy }: { spy: (c: ViewConfig) => void }) {
  const [config, setConfig] = useState(defaultConfig(defs))
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} view={{ config, onChange: (fn) => setConfig((c) => { const next = fn(c); spy(next); return next }) }} />
}
const head = (key: string) => document.querySelector<HTMLElement>(`.bt-table__head [data-col="${key}"]`)!
const transfer = () => { const data = new Map<string, string>(); return { types: [] as string[], effectAllowed: '', setData(t: string, v: string) { data.set(t, v); this.types.push(t) }, getData: (t: string) => data.get(t) ?? '' } }

afterEach(cleanup)

it('arrastar o título move a coluna uma vez, ao soltar, e mantém o título no lugar', () => {
  const spy = vi.fn()
  render(<Harness spy={spy} />)
  const data = transfer()
  expect(head('nome').getAttribute('draggable')).toBeNull()
  fireEvent.dragStart(head('cidade'), { dataTransfer: data })
  fireEvent.dragOver(head('status'), { dataTransfer: data, clientX: 0 })
  fireEvent.dragOver(head('nome'), { dataTransfer: data, clientX: 0 })
  expect(head('nome').className).toContain('is-drop-after')
  expect(spy).not.toHaveBeenCalled()
  fireEvent.drop(head('nome'), { dataTransfer: data, clientX: 0 })
  expect(spy).toHaveBeenCalledTimes(1)
  expect(visibleColumns(spy.mock.calls[0][0]).map((c) => c.key)).toEqual(['nome', 'cidade', 'status'])
  expect(head('cidade').textContent).toContain('CIDADE')
  expect(screen.getByText(/Coluna .* na posição 2 de 3/)).toBeTruthy()
})
