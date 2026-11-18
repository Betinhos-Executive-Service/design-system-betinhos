// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Table } from '../components/Table'
import type { RowGroup } from './grouping'
import { TableGroups } from './TableGroups'

type Row = { id: string }
const rowsOf = (prefix: string, n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))
const tabela = (rows: Row[]) => <Table columns={[{ key: 'id', header: 'Id', cell: (r: Row) => r.id }]} rows={rows} rowKey={(r) => r.id} />

// IntersectionObserver falso: guarda os observadores para o teste disparar a entrada do sentinela.
let observers: { cb: IntersectionObserverCallback; nodes: Element[]; options?: IntersectionObserverInit }[] = []
beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', class {
    entry: (typeof observers)[number]
    constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.entry = { cb, nodes: [], options }; observers.push(this.entry) }
    observe(node: Element) { this.entry.nodes.push(node) }
    disconnect() { this.entry.nodes = [] }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const verSentinela = () => act(() => {
  for (const o of observers) if (o.nodes.length) o.cb(o.nodes.map((target) => ({ isIntersecting: true, target })) as unknown as IntersectionObserverEntry[], {} as IntersectionObserver)
})

it('count vence rows.length no cabeçalho; sem count vale rows.length', () => {
  const groups: RowGroup<Row>[] = [
    { id: 'a', label: 'Aberta', rows: rowsOf('a', 2), count: 1234 },
    { id: 'b', label: 'Paga', rows: rowsOf('b', 3) },
  ]
  render(<TableGroups groups={groups} resetKey="s">{tabela}</TableGroups>)
  expect(screen.getByLabelText('1.234 linhas').textContent).toBe('1.234')
  expect(screen.getByLabelText('3 linhas').textContent).toBe('3')
})

it('controlado: o clique só chama onToggle; quem abre é a tela', () => {
  const onToggle = vi.fn()
  const groups: RowGroup<Row>[] = [{ id: 'a', label: 'Aberta', rows: rowsOf('a', 2), count: 2 }]
  const { rerender } = render(<TableGroups groups={groups} resetKey="s" open={new Set()} onToggle={onToggle}>{tabela}</TableGroups>)
  fireEvent.click(screen.getByRole('button', { name: /Aberta/ }))
  expect(onToggle).toHaveBeenCalledWith('a', true)
  expect(screen.queryByText('a0')).toBeNull()
  rerender(<TableGroups groups={groups} resetKey="s" open={new Set(['a'])} onToggle={onToggle}>{tabela}</TableGroups>)
  expect(screen.getByText('a0')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Aberta/ }))
  expect(onToggle).toHaveBeenLastCalledWith('a', false)
})

it('sem open, abre sozinho como antes e ainda avisa onToggle', () => {
  const onToggle = vi.fn()
  render(<TableGroups groups={[{ id: 'a', label: 'Aberta', rows: rowsOf('a', 1) }]} resetKey="s" onToggle={onToggle}>{tabela}</TableGroups>)
  fireEvent.click(screen.getByRole('button', { name: /Aberta/ }))
  expect(screen.getByText('a0')).toBeTruthy()
  expect(onToggle).toHaveBeenCalledWith('a', true)
})

it('primeira página chegando: "Carregando…" no lugar da tabela', () => {
  const groups: RowGroup<Row>[] = [{ id: 'a', label: 'Aberta', rows: [], count: 300, loading: true, more: true }]
  const { container } = render(<TableGroups groups={groups} resetKey="s" open={new Set(['a'])} onLoadMore={() => undefined}>{tabela}</TableGroups>)
  expect(screen.getByText('Carregando…')).toBeTruthy()
  expect(screen.getByRole('status', { name: 'Carregando Aberta' })).toBeTruthy()
  expect(container.querySelector('.bt-table')).toBeNull()
})

it('sentinela pede a próxima página uma vez por página, com o scrollRoot como raiz', () => {
  const onLoadMore = vi.fn()
  const root = document.createElement('div')
  function Tela() {
    const [rows, setRows] = useState(rowsOf('a', 100))
    return (
      <>
        <button type="button" onClick={() => setRows((r) => [...r, ...rowsOf(`p${r.length}-`, 100)])}>chegou</button>
        <TableGroups groups={[{ id: 'a', label: 'Aberta', rows, count: 300, more: rows.length < 300 }]} resetKey="s" open={new Set(['a'])} onLoadMore={onLoadMore} scrollRoot={root}>{tabela}</TableGroups>
      </>
    )
  }
  render(<Tela />)
  expect(observers.at(-1)?.options?.root).toBe(root)
  verSentinela()
  verSentinela()
  expect(onLoadMore).toHaveBeenCalledTimes(1)
  expect(onLoadMore).toHaveBeenCalledWith('a')
  fireEvent.click(screen.getByText('chegou'))
  verSentinela()
  expect(onLoadMore).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByText('chegou'))
  verSentinela()
  // Sem `more` (300 carregadas), o sentinela sai.
  expect(onLoadMore).toHaveBeenCalledTimes(2)
})

it('erro mostra a mensagem com "Tentar novamente", que chama onRetry; sem sentinela enquanto há erro', () => {
  const onRetry = vi.fn()
  const onLoadMore = vi.fn()
  const groups: RowGroup<Row>[] = [{ id: 'a', label: 'Aberta', rows: rowsOf('a', 100), count: 300, more: true, error: 'O servidor não respondeu' }]
  const { container } = render(<TableGroups groups={groups} resetKey="s" open={new Set(['a'])} onLoadMore={onLoadMore} onRetry={onRetry}>{tabela}</TableGroups>)
  expect(screen.getByRole('alert').textContent).toContain('O servidor não respondeu')
  expect(container.querySelector('.bt-groups__sentinel')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(onRetry).toHaveBeenCalledWith('a')
  expect(screen.getByText('a0')).toBeTruthy()
})

it('grupo aberto sem linhas e sem mais a carregar mostra o vazio (padrão ou emptyGroup)', () => {
  const groups: RowGroup<Row>[] = [{ id: 'a', label: 'Aberta', rows: [], count: 0 }]
  const { rerender } = render(<TableGroups groups={groups} resetKey="s" open={new Set(['a'])}>{tabela}</TableGroups>)
  expect(screen.getByText('Nenhum registro neste grupo')).toBeTruthy()
  rerender(<TableGroups groups={groups} resetKey="s" open={new Set(['a'])} emptyGroup="Nenhum serviço neste grupo">{tabela}</TableGroups>)
  expect(screen.getByText('Nenhum serviço neste grupo')).toBeTruthy()
})

it('agrupamento no cliente (só id, label e rows) não ganha rodapé', () => {
  const { container } = render(<TableGroups groups={[{ id: 'a', label: 'Aberta', rows: rowsOf('a', 2) }]} resetKey="s">{tabela}</TableGroups>)
  fireEvent.click(screen.getByRole('button', { name: /Aberta/ }))
  expect(container.querySelector('.bt-groups__foot')).toBeNull()
})

it('seleção com linhas parciais: o cabeçalho do grupo marca só as carregadas do grupo', () => {
  const a = rowsOf('a', 2)
  const b = rowsOf('b', 2)
  const onChange = vi.fn()
  render(
    <TableGroups groups={[{ id: 'a', label: 'Aberta', rows: a, count: 500, more: true }, { id: 'b', label: 'Paga', rows: b, count: 2 }]} resetKey="s" open={new Set(['a'])} onLoadMore={() => undefined}>
      {(rows) => <Table columns={[{ key: 'id', header: 'Id', cell: (r: Row) => r.id }]} rows={rows} rowKey={(r) => r.id} selection={{ selected: new Set(), onChange }} />}
    </TableGroups>,
  )
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar linhas do grupo' }))
  expect([...onChange.mock.calls[0][0]]).toEqual(['a0', 'a1'])
})
