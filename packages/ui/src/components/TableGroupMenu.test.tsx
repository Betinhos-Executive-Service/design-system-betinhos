// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig, type ViewConfig } from '../tableView/config'
import type { FilterField } from '../tableView/filters'
import { Table, tableViewColumns, type TableColumn } from './Table'

type Row = { id: string; nome: string; status: string; data: string }
const rows: Row[] = [{ id: '1', nome: 'Ana', status: 'Ativo', data: '2026-11-13' }]
const columns: TableColumn<Row>[] = [
  { key: 'nome', header: 'Nome', cell: (r) => r.nome },
  { key: 'status', header: 'Status', cell: (r) => r.status },
  { key: 'data', header: 'Data', cell: (r) => r.data },
]
const defs = tableViewColumns(columns)
const fields: FilterField[] = [
  { key: 'nome', label: 'Nome', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: 'Ativo', label: 'Ativo' }] },
  { key: 'data', label: 'Data', kind: 'date' },
]

function Harness({ groupable = true, spy }: { groupable?: boolean; spy: (c: ViewConfig) => void }) {
  const [config, setConfig] = useState(defaultConfig(defs))
  return (
    <Table columns={columns} rows={rows} rowKey={(r) => r.id}
      view={{ config, groupable, onChange: (fn) => setConfig((c) => { const next = fn(c); spy(next); return next }) }}
      quickFilters={{ fields, value: {}, onChange: () => {} }} />
  )
}
const openMenu = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const item = (name: string) => screen.queryByRole('menuitem', { name, hidden: true })

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('menu do título agrupa pela escolha e desagrupa', () => {
  let last: ViewConfig | undefined
  render(<Harness spy={(c) => { last = c }} />)
  openMenu('Status')
  fireEvent.click(item('Agrupar por esta coluna')!)
  expect(last?.group).toEqual({ key: 'status' })
  openMenu('Status')
  expect(item('Agrupar por esta coluna')).toBeNull()
  fireEvent.click(item('Desagrupar')!)
  expect(last?.group).toBeUndefined()
})

it('data oferece mês e ano; agrupada por mês, troca para ano', () => {
  let last: ViewConfig | undefined
  render(<Harness spy={(c) => { last = c }} />)
  openMenu('Data')
  expect(item('Agrupar por ano')).toBeTruthy()
  fireEvent.click(item('Agrupar por mês')!)
  expect(last?.group).toEqual({ key: 'data', by: 'month' })
  openMenu('Data')
  expect(item('Agrupar por mês')).toBeNull()
  expect(item('Desagrupar')).toBeTruthy()
  fireEvent.click(item('Agrupar por ano')!)
  expect(last?.group).toEqual({ key: 'data', by: 'year' })
})

it('texto não agrupa e, sem view.groupable, nenhuma coluna oferece agrupar', () => {
  const { unmount } = render(<Harness spy={() => {}} />)
  openMenu('Nome')
  expect(item('Agrupar por esta coluna')).toBeNull()
  unmount()
  render(<Harness groupable={false} spy={() => {}} />)
  openMenu('Status')
  expect(item('Filtrar por…')).toBeTruthy()
  expect(item('Agrupar por esta coluna')).toBeNull()
})
