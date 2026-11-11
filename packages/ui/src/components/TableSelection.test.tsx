// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig } from '../tableView/config'
import { Table, tableViewColumns, type TableColumn } from './Table'

type Row = { id: string; nome: string }
const rows: Row[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, nome: `Nome ${id}` }))
const columns: TableColumn<Row>[] = [
  { key: 'nome', header: 'Nome', cell: (r) => r.nome },
  { key: 'acao', header: 'Ação', cell: (r) => <button type="button">Editar {r.id}</button> },
]

function Harness({ open = vi.fn(), withView = false, initial = [] as string[] }: { open?: (row: Row) => void; withView?: boolean; initial?: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))
  const [config, setConfig] = useState(() => defaultConfig(tableViewColumns(columns)))
  return (
    <>
      <output data-testid="sel">{[...selected].sort().join(',')}</output>
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={open}
        view={withView ? { config, onChange: (fn) => setConfig(fn) } : undefined}
        selection={{ selected, onChange: setSelected, label: (r) => `Selecionar ${r.nome}` }} />
    </>
  )
}
const sel = () => screen.getByTestId('sel').textContent
const rowOf = (id: string) => screen.getByText(`Nome ${id}`).closest('[role="row"]') as HTMLElement

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('grid acessível: role, aria-multiselectable, aria-selected, rótulos e linha que não é botão', () => {
  render(<Harness initial={['b']} />)
  const grid = screen.getByRole('grid')
  expect(grid.getAttribute('aria-multiselectable')).toBe('true')
  expect(rowOf('b').getAttribute('aria-selected')).toBe('true')
  expect(rowOf('b').className).toContain('is-selected')
  expect(rowOf('a').getAttribute('aria-selected')).toBe('false')
  expect(rowOf('a').tagName).toBe('DIV')
  expect(screen.getByRole('checkbox', { name: 'Selecionar Nome a' })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Selecionar linhas carregadas' })).toBeTruthy()
})

it('clique sozinho substitui, Ctrl/Cmd alterna, Shift vai da âncora', () => {
  const open = vi.fn()
  render(<Harness open={open} />)
  fireEvent.click(rowOf('b'))
  expect(sel()).toBe('b')
  fireEvent.click(rowOf('d'), { ctrlKey: true })
  expect(sel()).toBe('b,d')
  fireEvent.click(rowOf('d'), { metaKey: true })
  expect(sel()).toBe('b')
  fireEvent.click(rowOf('a'))
  fireEvent.click(rowOf('c'), { shiftKey: true })
  expect(sel()).toBe('a,b,c')
  // O intervalo continua partindo da mesma âncora.
  fireEvent.click(rowOf('b'), { shiftKey: true })
  expect(sel()).toBe('a,b')
  expect(open).not.toHaveBeenCalled()
})

it('Shift sem âncora seleciona só a linha', () => {
  render(<Harness />)
  fireEvent.click(rowOf('c'), { shiftKey: true })
  expect(sel()).toBe('c')
})

it('cabeçalho em três estados alterna entre todas e nenhuma', () => {
  render(<Harness initial={['a']} />)
  const head = screen.getByRole('checkbox', { name: 'Selecionar linhas carregadas' }) as HTMLInputElement
  expect(head.checked).toBe(false)
  expect(head.indeterminate).toBe(true)
  fireEvent.click(head)
  expect(sel()).toBe('a,b,c,d')
  expect(head.checked).toBe(true)
  expect(head.indeterminate).toBe(false)
  fireEvent.click(head)
  expect(sel()).toBe('')
  expect(head.indeterminate).toBe(false)
})

it('checkbox da linha alterna sem tirar as outras', () => {
  render(<Harness initial={['a']} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Nome c' }))
  expect(sel()).toBe('a,c')
})

it('Esc com o foco na tabela limpa a seleção', () => {
  render(<Harness initial={['a', 'b']} />)
  fireEvent.keyDown(rowOf('a'), { key: 'Escape' })
  expect(sel()).toBe('')
})

it('controle dentro da célula não seleciona nem abre', () => {
  const open = vi.fn()
  render(<Harness open={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'Editar b' }))
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Editar b' }))
  expect(sel()).toBe('')
  expect(open).not.toHaveBeenCalled()
})

it('duplo clique, Enter e a seta abrem o registro', () => {
  const open = vi.fn()
  render(<Harness open={open} />)
  fireEvent.doubleClick(rowOf('a'))
  fireEvent.keyDown(rowOf('b'), { key: 'Enter' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Abrir' })[2])
  expect(open.mock.calls.map(([r]) => r.id)).toEqual(['a', 'b', 'c'])
})

it('com visão: coluna de seleção de 40px fixa antes das colunas de dados', () => {
  const { container } = render(<Harness withView />)
  const table = container.querySelector('.bt-table') as HTMLElement
  expect(table.style.getPropertyValue('--bt-table-columns')).toBe('40px 240px 160px minmax(24px, 1fr)')
  const lead = rowOf('a').querySelector('.bt-table__cell--select') as HTMLElement
  expect(lead.className).toContain('bt-table__cell--pinned')
  expect(lead.className).toContain('bt-table__cell--pin-last')
})

it('sem selection, o clique simples abre como antes', () => {
  const open = vi.fn()
  render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={open} />)
  expect(screen.getByRole('table')).toBeTruthy()
  fireEvent.click(rowOf('a'))
  expect(open).toHaveBeenCalledTimes(1)
  expect(rowOf('a').tagName).toBe('BUTTON')
})

function MenuHarness({ actions, initial = [] as string[] }: { actions: (row: Row, selection: Row[]) => { id: string; label: string; onSelect: () => void }[]; initial?: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))
  return (
    <>
      <output data-testid="sel">{[...selected].sort().join(',')}</output>
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={() => {}} rowActions={actions}
        selection={{ selected, onChange: setSelected }} />
    </>
  )
}
const lote = (seen: string[][]) => (_row: Row, selection: Row[]) => {
  seen.push(selection.map((r) => r.id))
  return [{ id: 'lote', label: `Agir em ${selection.length}`, onSelect: () => {} }]
}

it('clique direito fora da seleção seleciona só a linha e o menu age nela', () => {
  const seen: string[][] = []
  render(<MenuHarness actions={lote(seen)} initial={['a', 'b']} />)
  fireEvent.contextMenu(rowOf('d'))
  expect(sel()).toBe('d')
  expect(seen).toEqual([['d']])
  expect(screen.getByRole('menuitem', { name: 'Agir em 1', hidden: true })).toBeTruthy()
})

it('clique direito dentro da seleção mantém e entrega todas as selecionadas, na ordem das linhas', () => {
  const seen: string[][] = []
  render(<MenuHarness actions={lote(seen)} initial={['c', 'a', 'fora-da-lista']} />)
  fireEvent.contextMenu(rowOf('c'))
  expect(sel()).toBe('a,c,fora-da-lista')
  expect(seen).toEqual([['a', 'c']])
  expect(screen.getByRole('menuitem', { name: 'Agir em 2', hidden: true })).toBeTruthy()
})

it('Ctrl+clique direito fica com o menu do navegador e não mexe na seleção', () => {
  const seen: string[][] = []
  render(<MenuHarness actions={lote(seen)} initial={['a']} />)
  const event = fireEvent.contextMenu(rowOf('d'), { ctrlKey: true })
  expect(event).toBe(true)
  expect(sel()).toBe('a')
  expect(seen).toEqual([])
})

it('ações vazias não abrem menu nem mudam a seleção', () => {
  render(<MenuHarness actions={() => []} initial={['a']} />)
  expect(fireEvent.contextMenu(rowOf('d'))).toBe(true)
  expect(sel()).toBe('a')
})

it('rowActions antigo, de um argumento, continua funcionando (com e sem seleção)', () => {
  const old = vi.fn((row: Row) => [{ id: 'x', label: `Ação ${row.id}`, onSelect: () => {} }])
  const { unmount } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} rowActions={old} />)
  fireEvent.contextMenu(rowOf('b'))
  expect(old.mock.calls[0][0].id).toBe('b')
  expect((old.mock.calls[0] as unknown[])[1]).toEqual([rows[1]])
  expect(screen.getByRole('menuitem', { name: 'Ação b', hidden: true })).toBeTruthy()
  unmount()
  render(<MenuHarness actions={old} />)
  fireEvent.contextMenu(rowOf('c'))
  expect(screen.getByRole('menuitem', { name: 'Ação c', hidden: true })).toBeTruthy()
})
