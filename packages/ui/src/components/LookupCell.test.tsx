// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LookupCell, RecordOpenProvider } from './LookupCell'
import { Table } from './Table'

afterEach(cleanup)
const ID = '11111111-2222-3333-4444-555555555555'

it('o clique abre o registro da tabela e não propaga para a linha', () => {
  const open = vi.fn()
  const linha = vi.fn()
  render(<div onClick={linha}><LookupCell table="cr40f_clientes" id={ID} onOpenRecord={open}>Tenaris</LookupCell></div>)
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Tenaris' }))
  expect(open).toHaveBeenCalledExactlyOnceWith('cr40f_clientes', ID)
  expect(linha).not.toHaveBeenCalled()
})

it('Enter com o foco no link não chega ao tratador de Enter da linha', () => {
  const linha = vi.fn()
  render(<div onKeyDown={linha}><LookupCell table="cr40f_clientes" id={ID} onOpenRecord={() => {}}>Tenaris</LookupCell></div>)
  const link = screen.getByRole('button', { name: 'Abrir Tenaris' })
  link.focus()
  fireEvent.keyDown(link, { key: 'Enter' })
  expect(linha).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(link)
})

it('sem permissão, sem destino ou sem id vira texto comum', () => {
  const open = vi.fn()
  const { rerender } = render(<LookupCell table="t" id={ID} canOpen={false} onOpenRecord={open}>Ana</LookupCell>)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('Ana')).toBeTruthy()
  rerender(<LookupCell table="t" id={null} onOpenRecord={open}>Ana</LookupCell>)
  expect(screen.queryByRole('button')).toBeNull()
  rerender(<LookupCell table="t" id={ID}>Ana</LookupCell>)
  expect(screen.queryByRole('button')).toBeNull()
  rerender(<LookupCell table="t" id={ID} onOpenRecord={open}>{''}</LookupCell>)
  expect(screen.getByText('—')).toBeTruthy()
  expect(open).not.toHaveBeenCalled()
})

it('o provedor abre pela tabela e `canOpen` do provedor decide a permissão', () => {
  const open = vi.fn()
  render(
    <RecordOpenProvider value={{ onOpenRecord: open, canOpen: (table) => table === 'cr40f_clientes' }}>
      <LookupCell table="cr40f_clientes" id={ID}>Tenaris</LookupCell>
      <LookupCell table="cr40f_outra" id={ID}>Sem drawer</LookupCell>
    </RecordOpenProvider>,
  )
  expect(screen.queryByRole('button', { name: 'Abrir Sem drawer' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Tenaris' }))
  expect(open).toHaveBeenCalledExactlyOnceWith('cr40f_clientes', ID)
})

it('dentro da Table com seleção, abrir o lookup não seleciona nem abre a linha', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  const open = vi.fn()
  const onRow = vi.fn()
  const onChange = vi.fn()
  render(
    <RecordOpenProvider value={{ onOpenRecord: open }}>
      <Table
        columns={[{ key: 'c', header: 'Cliente', cell: (r: { id: string }) => <LookupCell table="cr40f_clientes" id={r.id}>Tenaris</LookupCell> }]}
        rows={[{ id: ID }]} rowKey={(r) => r.id} onRowClick={onRow} selection={{ selected: new Set(), onChange }}
      />
    </RecordOpenProvider>,
  )
  const link = screen.getByRole('button', { name: 'Abrir Tenaris' })
  fireEvent.click(link)
  fireEvent.keyDown(link, { key: 'Enter' })
  expect(open).toHaveBeenCalledExactlyOnceWith('cr40f_clientes', ID)
  expect(onChange).not.toHaveBeenCalled()
  expect(onRow).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
