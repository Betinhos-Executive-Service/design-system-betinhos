// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Alert'
import { tableViewColumns, type TableColumn } from '../components/Table'
import { createMemoryViewStore } from './store'
import { useTableView } from './useTableView'
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
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const confirm = () => screen.getByRole('button', { name: 'Excluir visão', hidden: true })

it('lixeira só nas visões pessoais; pede confirmação e só então exclui', async () => {
  const store = seed()
  mount(store)
  await act(async () => {})
  openMenu()
  expect(trash('Equipe')).toBeNull()
  fireEvent.click(trash('Minhas pendentes')!)

  // Diálogo de confirmação com o nome da visão; nada é excluído antes de confirmar.
  expect(screen.getByText(/A visão “Minhas pendentes” será excluída e não pode ser recuperada/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(true)

  await act(async () => { fireEvent.click(confirm()) })
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(false)
  expect(screen.getByText('Visão excluída.')).toBeTruthy()
  openMenu()
  expect(screen.queryByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })).toBeNull()
})

it('"Manter visão" cancela sem excluir', async () => {
  const store = seed()
  mount(store)
  await act(async () => {})
  openMenu()
  fireEvent.click(trash('Minhas pendentes')!)
  fireEvent.click(screen.getByRole('button', { name: 'Manter visão', hidden: true }))
  await act(async () => {})
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(true)
})

it('excluir a visão ativa pela lixeira volta para a padrão', async () => {
  const store = seed()
  mount(store)
  await act(async () => {})
  openMenu()
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true }))
  expect(screen.getByRole('button', { name: /^Visão: Minhas pendentes/ })).toBeTruthy()

  openMenu()
  fireEvent.click(trash('Minhas pendentes')!)
  await act(async () => { fireEvent.click(confirm()) })
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(false)
  expect(screen.queryByRole('button', { name: /^Visão: Minhas pendentes/ })).toBeNull()
})

it('tecla Delete no item pessoal abre a confirmação', async () => {
  const store = seed()
  mount(store)
  await act(async () => {})
  openMenu()
  const item = screen.getByRole('menuitemradio', { name: /Minhas pendentes/, hidden: true })
  fireEvent.mouseEnter(item) // item ativo, como ao chegar nele pelas setas
  fireEvent.keyDown(item, { key: 'Delete' })
  expect(confirm()).toBeTruthy()
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(true)
})

it('falha do store mantém a visão e avisa', async () => {
  const store = seed()
  store.remove = () => Promise.reject(new Error('Sem permissão.'))
  mount(store)
  await act(async () => {})
  openMenu()
  fireEvent.click(trash('Minhas pendentes')!)
  await act(async () => { fireEvent.click(confirm()) })
  expect(screen.getByText(/Não foi possível excluir a visão\. Sem permissão\./)).toBeTruthy()
  expect(store.snapshot().some((v) => v.id === 'minha')).toBe(true)
})

it('estado sem removeView (adaptador da tela) mantém a visão pessoal no diálogo "Excluir visão…"', async () => {
  function SemLixeira({ store }: { store: ReturnType<typeof createMemoryViewStore> }) {
    const { removeView: _, ...view } = useTableView({ tela: 'teste', columns: defs, store, storage: null })
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
