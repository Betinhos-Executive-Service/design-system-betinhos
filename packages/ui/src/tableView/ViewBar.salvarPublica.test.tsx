// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tableViewColumns, type TableColumn } from '../components/Table'
import { defaultConfig } from './config'
import type { TableViewEntry } from './store'
import type { TableViewState } from './useTableView'
import { ViewBar } from './ViewBar'

const columns: TableColumn<{ id: string }>[] = [{ key: 'nome', header: 'Nome', cell: () => '' }]
const defs = tableViewColumns(columns)
const config = defaultConfig(defs)
const entry = (id: string, scope: TableViewEntry['scope'], canEdit: boolean): TableViewEntry => ({ id, name: id === 'pub' ? 'Agenda' : 'Minha', scope, canEdit, config })

function state(active: TableViewEntry, saveAs = vi.fn(async () => {}), save = vi.fn(async () => {})): TableViewState {
  return {
    status: 'ready', views: [active], active, config, dirty: true, canPublish: false, density: 'default',
    setConfig: () => {}, setDensity: () => {}, select: () => {}, restore: () => {}, save, saveAs,
    rename: async () => {}, remove: async () => {}, publish: async () => {}, reload: async () => {},
  } as unknown as TableViewState
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /^Visão:/ }))
const item = (name: string | RegExp) => screen.queryByRole('menuitem', { name, hidden: true })

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('visão pública alterada: Salvar vira cópia pessoal com nome sugerido, sem tocar na original', async () => {
  const saveAs = vi.fn(async () => {})
  const save = vi.fn(async () => {})
  render(<ViewBar view={state(entry('pub', 'publica', false), saveAs, save)} columns={defs} />)
  openMenu()
  expect(item('Renomear…')).toBeNull()
  expect(item('Nova visão…')).toBeTruthy()
  fireEvent.click(item('Salvar como minha…')!)
  const input = screen.getByRole('textbox') as HTMLInputElement
  expect(input.value).toBe('Agenda (minha)')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar visão' }))
  await vi.waitFor(() => expect(saveAs).toHaveBeenCalledWith('Agenda (minha)'))
  expect(save).not.toHaveBeenCalled()
})

it('visão pessoal alterada: Salvar grava a própria visão', () => {
  render(<ViewBar view={state(entry('minha', 'pessoal', true))} columns={defs} />)
  openMenu()
  expect(item('Salvar')).toBeTruthy()
  expect(item('Salvar como minha…')).toBeNull()
  expect(item('Renomear…')).toBeTruthy()
})
