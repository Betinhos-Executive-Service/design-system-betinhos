// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Table, tableViewColumns, type TableColumn } from '../components/Table'
import { createMemoryViewStore } from './store'
import { useTableView } from './useTableView'
import { ViewBar } from './ViewBar'

type Row = { id: string; nome: string }
const columns: TableColumn<Row>[] = [{ key: 'nome', header: 'Nome', cell: (r) => r.nome }]
const defs = tableViewColumns(columns)

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, data }
}

function Lista({ storage, store }: { storage: ReturnType<typeof memory>; store: ReturnType<typeof createMemoryViewStore> }) {
  const view = useTableView({ tela: 'teste', columns: defs, store, storage })
  return (
    <>
      <ViewBar view={view} columns={defs} />
      <Table columns={columns} rows={[{ id: 'a', nome: 'Ana' }]} rowKey={(r) => r.id} view={{ config: view.config, onChange: view.setConfig, density: view.density }} />
    </>
  )
}

beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('o botão Densidade troca para Compacta, deixa a tabela densa e lembra por tela', async () => {
  const storage = memory()
  const store = createMemoryViewStore()
  const { container, unmount } = render(<Lista storage={storage} store={store} />)
  await act(async () => {})
  expect(container.querySelector('.bt-table--dense')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Densidade das linhas' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Compacta/, hidden: true }))
  expect(container.querySelector('.bt-table--dense')).not.toBeNull()
  expect(storage.data.get('betinhos.densidade.teste')).toBe('dense')

  unmount()
  const again = render(<Lista storage={storage} store={store} />)
  await act(async () => {})
  expect(again.container.querySelector('.bt-table--dense')).not.toBeNull()
})

it('Mínima deixa a tabela com a classe mínima (além da densa) e é lida de volta', async () => {
  const storage = memory({ 'betinhos.densidade.teste': 'minimal' })
  const { container } = render(<Lista storage={storage} store={createMemoryViewStore()} />)
  await act(async () => {})
  expect(container.querySelector('.bt-table--minimal.bt-table--dense')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Densidade das linhas' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Confortável/, hidden: true }))
  expect(container.querySelector('.bt-table--dense')).toBeNull()
  expect(storage.data.get('betinhos.densidade.teste')).toBe('default')
})
