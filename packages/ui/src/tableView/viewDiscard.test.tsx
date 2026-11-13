// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Alert'
import { tableViewColumns, type TableColumn } from '../components/Table'
import { createMemoryViewStore } from './store'
import { useTableView, VIEW_DISCARD_DELAY_MS } from './useTableView'
import { ViewBar } from './ViewBar'

type Row = { id: string; nome: string }
const columns: TableColumn<Row>[] = [{ key: 'nome', header: 'Nome', cell: (r) => r.nome }]
const defs = tableViewColumns(columns)

function Lista({ store }: { store: ReturnType<typeof createMemoryViewStore> }) {
  const view = useTableView({ tela: 'teste', columns: defs, store, storage: null })
  return <ViewBar view={view} columns={defs} />
}

const seed = () => createMemoryViewStore([
  { id: 'minha', name: 'Minhas pendentes', publica: false, mine: true, config: '' },
  { id: 'pub', name: 'Equipe', publica: true, mine: false, config: '' },
])
const mount = (store: ReturnType<typeof createMemoryViewStore>) => render(<ToastProvider><Lista store={store} /></ToastProvider>)
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /^Visão:/ }))
const trash = (name: string) => screen.queryByRole('button', { name: `Excluir “${name}”`, hidden: true })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('lixeira só nas visões pessoais; exclui no store depois do prazo', async () => {
  const store = seed()
  mount(store)
  await act(async () => {})
  openMenu()
  expect(trash('Equipe')).toBeNull()
  fireEvent.click(trash('Minhas pendentes')!)

  // Some da lista na hora e o menu continua aberto.
  expect(screen.queryByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })).toBeNull()
  expect(screen.getByRole('menuitemradio', { name: /Equipe/, hidden: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy()
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(true)

  await act(async () => { vi.advanceTimersByTime(VIEW_DISCARD_DELAY_MS) })
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(false)
})

it('Desfazer devolve a visão e não exclui; a visão ativa volta a ser a ativa', async () => {
  const store = seed()
  mount(store)
  await act(async () => {})
  openMenu()
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true }))
  expect(screen.getByRole('button', { name: /^Visão: Minhas pendentes/ })).toBeTruthy()

  openMenu()
  fireEvent.click(trash('Minhas pendentes')!)
  expect(screen.queryByRole('button', { name: /^Visão: Minhas pendentes/ })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
  await act(async () => { vi.advanceTimersByTime(VIEW_DISCARD_DELAY_MS) })
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(true)
  expect(screen.getByRole('button', { name: /^Visão: Minhas pendentes/ })).toBeTruthy()
})

it('tecla Delete no item pessoal manda para a lixeira; sair da lista antes do prazo confirma a exclusão', async () => {
  const store = seed()
  const { unmount } = mount(store)
  await act(async () => {})
  openMenu()
  const item = screen.getByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })
  fireEvent.mouseEnter(item) // item ativo, como ao chegar nele pelas setas
  fireEvent.keyDown(item, { key: 'Delete' })
  expect(screen.queryByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })).toBeNull()

  unmount()
  await act(async () => {})
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(false)
})

it('falha do store devolve a visão e avisa', async () => {
  const store = seed()
  store.remove = () => Promise.reject(new Error('Sem permissão.'))
  mount(store)
  await act(async () => {})
  openMenu()
  fireEvent.click(trash('Minhas pendentes')!)
  await act(async () => { vi.advanceTimersByTime(VIEW_DISCARD_DELAY_MS) })
  expect(screen.getByText(/Não foi possível excluir a visão\. Sem permissão\./)).toBeTruthy()
  expect(screen.getByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })).toBeTruthy()
})

it('estado sem discard (adaptador da tela) mantém a visão pessoal no diálogo "Excluir visão…"', async () => {
  function SemLixeira({ store }: { store: ReturnType<typeof createMemoryViewStore> }) {
    const { discard: _, ...view } = useTableView({ tela: 'teste', columns: defs, store, storage: null })
    return <ViewBar view={view} columns={defs} />
  }
  render(<ToastProvider><SemLixeira store={seed()} /></ToastProvider>)
  await act(async () => {})
  openMenu()
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true }))
  openMenu()
  expect(trash('Minhas pendentes')).toBeNull()
  expect(screen.getByRole('menuitem', { name: /Excluir visão…/, hidden: true })).toBeTruthy()
})
