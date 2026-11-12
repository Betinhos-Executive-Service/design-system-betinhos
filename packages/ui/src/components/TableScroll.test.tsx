// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createRef, useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig } from '../tableView/config'
import { Table, tableViewColumns, type TableColumn } from './Table'

type Row = { id: string }
const rows: Row[] = [{ id: 'a' }, { id: 'b' }]
const columns: TableColumn<Row>[] = [{ key: 'id', header: 'Id', cell: (r) => r.id }]

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function WithView({ scrollRef }: { scrollRef: (node: HTMLDivElement | null) => void }) {
  const [config, setConfig] = useState(() => defaultConfig(tableViewColumns(columns)))
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} view={{ config, onChange: (fn) => setConfig(fn) }}
    scrollRef={scrollRef} afterRows={<div data-testid="sentinela" />} />
}

it('scrollRef objeto aponta para o contêiner de rolagem, mesmo sem visão', () => {
  const ref = createRef<HTMLDivElement>()
  render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} scrollRef={ref} afterRows={<div data-testid="sentinela" />} />)
  expect(ref.current?.className).toBe('bt-table__scroll')
  expect(ref.current?.contains(screen.getByTestId('sentinela'))).toBe(true)
})

it('scrollRef função com visão recebe o .bt-table__scroll e o afterRows vem depois da última linha', () => {
  let node: HTMLDivElement | null = null
  render(<WithView scrollRef={(n) => { node = n }} />)
  const scroll = node as HTMLDivElement | null
  expect(scroll?.className).toBe('bt-table__scroll')
  const sentinela = screen.getByTestId('sentinela')
  expect(scroll?.contains(sentinela)).toBe(true)
  const last = screen.getByText('b').closest('[role="row"]') as HTMLElement
  expect(last.nextElementSibling).toBe(sentinela)
})

it('sem as props novas não cria o contêiner de rolagem', () => {
  const { container } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />)
  expect(container.querySelector('.bt-table__scroll')).toBeNull()
})

it('columnLines liga a classe das linhas entre colunas; sem ela a tabela fica sem', () => {
  const { container, rerender } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />)
  expect(container.querySelector('.bt-table')?.classList.contains('bt-table--lines')).toBe(false)
  rerender(<Table columns={columns} rows={rows} rowKey={(r) => r.id} columnLines />)
  expect(container.querySelector('.bt-table')?.classList.contains('bt-table--lines')).toBe(true)
})

it('density="dense" liga a classe da linha densa; o padrão fica sem', () => {
  const { container, rerender } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />)
  expect(container.querySelector('.bt-table')?.classList.contains('bt-table--dense')).toBe(false)
  rerender(<Table columns={columns} rows={rows} rowKey={(r) => r.id} density="dense" />)
  expect(container.querySelector('.bt-table')?.classList.contains('bt-table--dense')).toBe(true)
})

it('stickyHeader cria a área de rolagem com o cabeçalho dentro e passa maxHeight na variável', () => {
  const { container } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} stickyHeader maxHeight="420px" />)
  const table = container.querySelector<HTMLElement>('.bt-table')!
  expect(table.classList.contains('bt-table--sticky')).toBe(true)
  expect(table.style.getPropertyValue('--bt-table-max-height')).toBe('420px')
  expect(container.querySelector('.bt-table__scroll > .bt-table__head')).not.toBeNull()
})

it('fill liga o cabeçalho fixo e marca a tabela vazia', () => {
  const { container, rerender } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} fill />)
  const table = () => container.querySelector<HTMLElement>('.bt-table')!
  expect(table().classList.contains('bt-table--fill')).toBe(true)
  expect(table().classList.contains('bt-table--sticky')).toBe(true)
  expect(table().classList.contains('is-empty')).toBe(false)
  rerender(<Table columns={columns} rows={[]} rowKey={(r) => r.id} fill />)
  expect(table().classList.contains('is-empty')).toBe(true)
})
