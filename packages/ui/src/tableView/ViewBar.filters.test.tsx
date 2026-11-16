// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Alert'
import { tableViewColumns, type TableColumn } from '../components/Table'
import type { FilterLocked } from './FiltersPanel'
import type { FilterField } from './filters'
import { createMemoryViewStore } from './store'
import { useTableView } from './useTableView'
import { ViewBar } from './ViewBar'

type Row = { id: string; cliente: string }
const columns: TableColumn<Row>[] = [{ key: 'cliente', header: 'Cliente', cell: (r) => r.cliente }]
const defs = tableViewColumns(columns)
const fields: FilterField[] = [{ key: 'cliente', label: 'Cliente', kind: 'text' }]
const tenaris = { type: 'condition', id: 'q1', field: 'cliente', op: 'contains', value: 'Tenaris' }

function Lista({ store, locked, onRemoveLocked }: { store: ReturnType<typeof createMemoryViewStore>; locked?: FilterLocked[]; onRemoveLocked?: (id: string) => void }) {
  const view = useTableView({ tela: 'teste', columns: defs, store, storage: null })
  return <ViewBar view={view} columns={defs} filters={{ fields, locked, onRemoveLocked, noun: { one: 'composição', other: 'composições' } }} />
}
const mount = (props: Partial<Parameters<typeof Lista>[0]> = {}) => render(<ToastProvider><Lista store={createMemoryViewStore([])} {...props} /></ToastProvider>)
const rows = () => screen.queryAllByRole('group').filter((g) => g.classList.contains('bt-frow'))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
})
beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('repassa as condições só leitura e o substantivo ao painel', async () => {
  const onRemoveLocked = vi.fn()
  mount({ locked: [{ id: 'l1', label: 'Região é Sul' }], onRemoveLocked })
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
  expect(screen.getByText('Sempre')).toBeTruthy()
  expect(screen.getByText('Região é Sul')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remover condição da visão' }))
  expect(onRemoveLocked).toHaveBeenCalledWith('l1')
})

it('visão salva com filtro: mexer no rascunho mostra o aviso e Restaurar volta', async () => {
  const store = createMemoryViewStore([{ id: 'minha', name: 'Tenaris', publica: false, mine: true, config: JSON.stringify({ v: 1, columns: [], sort: null, filters: { quick: { cliente: tenaris }, advanced: { type: 'group', id: 'raiz', logic: 'and', items: [] } } }) }])
  render(<ToastProvider><Lista store={store} /></ToastProvider>)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: /^Visão:/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Tenaris/, hidden: true }))
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
  expect(rows()).toHaveLength(1)
  expect(screen.queryByText('Filtros diferentes da visão salva')).toBeNull()
  fireEvent.keyDown(rows()[0], { key: 'Delete' })
  expect(screen.getByText('Filtros diferentes da visão salva')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
  expect(rows()).toHaveLength(1)
})

it('na visão padrão não há aviso de visão alterada', async () => {
  mount()
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar filtro' }))
  fireEvent.click(screen.getByRole('option', { name: /Cliente/, hidden: true }))
  expect(screen.queryByText('Filtros diferentes da visão salva')).toBeNull()
})
