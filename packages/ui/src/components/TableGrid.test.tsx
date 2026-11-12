// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig } from '../tableView/config'
import { Table, tableViewColumns, viewLayout, type TableCellStatus, type TableColumn } from './Table'

type Row = { id: string; nome: string; cidade: string; travado?: boolean }
const base: Row[] = [{ id: 'a', nome: 'Ana', cidade: 'Taubaté' }, { id: 'b', nome: 'Bruno', cidade: 'Jacareí', travado: true }]

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function Grade({ onOpen = vi.fn(), status }: { onOpen?: (row: Row) => void; status?: TableCellStatus }) {
  const [rows, setRows] = useState(base)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const columns: TableColumn<Row>[] = [
    { key: 'id', header: 'Id', opens: true, cell: (r) => r.id },
    {
      key: 'nome', header: 'Nome', cell: (r) => r.nome,
      edit: {
        typing: true,
        start: (r, typed) => typed ?? r.nome,
        enabled: (r) => !r.travado,
        commit: (r, draft: string) => {
          if (!draft.trim()) return 'Informe o nome'
          setRows((list) => list.map((x) => (x.id === r.id ? { ...x, nome: draft } : x)))
        },
        editor: (_r, { draft, setDraft, error, label }) => <input aria-label={label} aria-invalid={error ? true : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} />,
      },
    },
    { key: 'cidade', header: 'Cidade', readOnly: 'Vem do cadastro', cell: (r) => r.cidade },
  ]
  return (
    <>
      <output data-testid="sel">{[...selected].join(',')}</output>
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onOpen}
        selection={{ selected, onChange: setSelected }}
        cellStatus={(r, key) => (r.id === 'a' && key === 'nome' ? status : null)} />
    </>
  )
}
const cellOf = (text: string) => screen.getByText(text).closest('[role="gridcell"]') as HTMLElement

it('Enter abre o editor, Enter grava e a célula volta a mostrar o valor', () => {
  render(<Grade />)
  const cell = cellOf('Ana')
  cell.focus()
  fireEvent.keyDown(cell, { key: 'Enter' })
  const input = screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement
  expect(input.value).toBe('Ana')
  fireEvent.change(input, { target: { value: 'Ana Paula' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText('Ana Paula')).toBeTruthy()
})

it('commit recusado mantém a edição aberta com a mensagem; Esc desiste sem gravar', () => {
  render(<Grade />)
  const cell = cellOf('Ana')
  fireEvent.keyDown(cell, { key: 'F2' })
  const input = screen.getByRole('textbox', { name: 'Nome' })
  fireEvent.change(input, { target: { value: ' ' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  expect(screen.getAllByText(/Informe o nome/).length).toBeGreaterThan(0)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText('Ana')).toBeTruthy()
})

it('digitar uma letra abre com ela; entrar em edição seleciona a linha', () => {
  render(<Grade />)
  fireEvent.keyDown(cellOf('Ana'), { key: 'X' })
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('X')
  expect(screen.getByTestId('sel').textContent).toBe('a')
})

it('linha com edit.enabled falso e coluna readOnly ficam só leitura, com cadeado', () => {
  render(<Grade />)
  const travada = cellOf('Bruno')
  expect(travada.getAttribute('aria-readonly')).toBe('true')
  fireEvent.keyDown(travada, { key: 'Enter' })
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getAllByRole('img', { name: 'Somente leitura. Vem do cadastro' })).toHaveLength(2)
})

it('setas movem o foco entre células e linhas', () => {
  render(<Grade />)
  const ana = cellOf('Ana')
  ana.focus()
  fireEvent.keyDown(ana, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(cellOf('Taubaté'))
  fireEvent.keyDown(cellOf('Taubaté'), { key: 'ArrowDown' })
  expect(document.activeElement).toBe(cellOf('Jacareí'))
})

it('duplo clique na célula editável edita em vez de abrir; opens abre pelo link', () => {
  const onOpen = vi.fn()
  render(<Grade onOpen={onOpen} />)
  fireEvent.doubleClick(cellOf('Ana'))
  expect(onOpen).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox')).toBeTruthy()
  act(() => { vi.runAllTimers() })
  fireEvent.click(screen.getByRole('button', { name: 'b' }))
  expect(onOpen).toHaveBeenCalledWith(base[1])
  expect(screen.getByTestId('sel').textContent).toBe('a')
})

it('cellStatus mostra gravando, salvo e erro com "Tentar de novo"', () => {
  const retry = vi.fn()
  const { rerender } = render(<Grade status={{ state: 'saving' }} />)
  expect(screen.getByRole('status', { name: 'Gravando' })).toBeTruthy()
  rerender(<Grade status={{ state: 'saved' }} />)
  expect(screen.getByRole('img', { name: 'Salvo' })).toBeTruthy()
  rerender(<Grade status={{ state: 'error', message: 'Sem permissão', onRetry: retry }} />)
  expect(cellOf('Ana').getAttribute('aria-invalid')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(retry).toHaveBeenCalled()
})

it('view.fluid: coluna não redimensionada cresce em fr; redimensionada fica em px', () => {
  type R = { id: string }
  const columns: TableColumn<R>[] = [{ key: 'a', header: 'A', cell: (r) => r.id }, { key: 'b', header: 'B', defaultWidth: 120, cell: (r) => r.id }]
  const config = defaultConfig(tableViewColumns(columns))
  const fluid = viewLayout(columns, config, false, { fluid: true })
  expect(fluid.template).toBe('minmax(240px, 240fr) minmax(120px, 120fr)')
  expect(fluid.minWidth).toBe('calc(360px + 1 * var(--bt-table-gap) + 2 * var(--bt-table-pad))')
  const resized = { ...config, columns: config.columns.map((c) => (c.key === 'b' ? { ...c, width: 200 } : c)) }
  expect(viewLayout(columns, resized, false, { fluid: true }).template).toBe('minmax(240px, 240fr) 200px')
  expect(viewLayout(columns, config, false).template).toBe('240px 120px minmax(0, 1fr)')
  expect(viewLayout(columns, config, false).minWidth).toBeNull()
})

it('virtual sem área de rolagem com altura (jsdom) desenha todas as linhas', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i), nome: `N${i}`, cidade: '' }))
  render(<Table columns={[{ key: 'nome', header: 'Nome', cell: (r: Row) => r.nome }]} rows={many} rowKey={(r) => r.id} virtual stickyHeader />)
  expect(screen.getAllByRole('row')).toHaveLength(151)
})
