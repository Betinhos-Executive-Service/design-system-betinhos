// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { ModuleNav, fitModuleNav, type ModuleNavItem } from './ModuleNav'

const icon = <svg aria-hidden="true" />
const items: ModuleNavItem[] = [
  { value: 'tarefas', label: 'Tarefas', icon, count: 12 },
  { value: 'gestao', label: 'Gestão', icon, count: 3, tone: 'alert' },
  { value: 'ideias', label: 'Boas ideias', icon, dot: true },
  { value: 'cotacoes', label: 'Cotações', icon },
  { value: 'projetos', label: 'Projetos', icon },
  { value: 'config', label: 'Configurações', icon },
]

// Cada item mede 100 px e o "Mais" 80 px; a largura da faixa muda por teste.
let listWidth = 1000
let resize: (() => void) | null = null

beforeEach(() => {
  listWidth = 1000
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('bt-module-nav__items') ? listWidth : this.dataset.mn === '__more' ? 80 : this.dataset.mn ? 100 : 0
    return { width, height: 48, top: 0, left: 0, right: width, bottom: 48, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const strip = () => screen.getByRole('navigation', { name: 'Seções' })
const stripLabels = () => within(strip()).getAllByRole('listitem').map((li) => li.textContent)
const resizeTo = (width: number) => act(() => { listWidth = width; resize?.() })

it('fitModuleNav: tudo cabe, reserva o "Mais" quando não cabe e troca o ativo pelo último visível', () => {
  expect(fitModuleNav([100, 100, 100], 300, 80, 0, 0)).toEqual([0, 1, 2])
  expect(fitModuleNav([100, 100, 100, 100], 300, 80, 0, 0)).toEqual([0, 1])
  expect(fitModuleNav([100, 100, 100, 100], 300, 80, 0, 3)).toEqual([0, 3])
  // Ativo maior que o último visível: sai mais um para caber.
  expect(fitModuleNav([100, 100, 100, 180], 300, 80, 0, 3)).toEqual([3])
  // Gap conta entre itens e antes do "Mais".
  expect(fitModuleNav([100, 100, 100], 320, 80, 10, 0)).toEqual([0, 1, 2])
  expect(fitModuleNav([100, 100, 100], 319, 80, 10, 0)).toEqual([0, 1])
  expect(fitModuleNav([100, 100, 100], 299, 80, 10, 0)).toEqual([0])
})

it('marca só a seção atual com aria-current="page" dentro de <nav aria-label>', () => {
  render(<ModuleNav aria-label="Seções" items={items} value="gestao" onNavigate={() => {}} />)
  const current = within(strip()).getByRole('button', { current: 'page' })
  expect(current.textContent).toContain('Gestão')
  expect(within(strip()).getAllByRole('button').filter((button) => button.getAttribute('aria-current'))).toHaveLength(1)
  expect(screen.queryByRole('tablist')).toBeNull()
})

it('mostra contagem neutra, contagem de alerta e ponto', () => {
  const { container } = render(<ModuleNav aria-label="Seções" items={items} value="tarefas" onNavigate={() => {}} />)
  const nav = container.querySelector('.bt-module-nav__items')!
  expect(nav.querySelector('.bt-module-nav__badge:not(.bt-module-nav__badge--alert)')?.textContent).toBe('12')
  expect(nav.querySelector('.bt-module-nav__badge--alert')?.textContent).toBe('3')
  expect(nav.querySelectorAll('.bt-module-nav__dot')).toHaveLength(1)
  expect(within(strip()).getByRole('button', { name: /Boas ideias, com novidades/ })).toBeTruthy()
})

it('recolhe para o "Mais" e devolve os itens quando a largura muda', () => {
  render(<ModuleNav aria-label="Seções" items={items} value="tarefas" onNavigate={() => {}} />)
  expect(stripLabels()).toHaveLength(6)
  expect(within(strip()).queryByRole('button', { name: /Mais/ })).toBeNull()

  resizeTo(400) // 400 - 80 do "Mais" = 3 itens
  expect(stripLabels()).toEqual(['Tarefas12', 'Gestão3, em alerta', 'Boas ideias, com novidades', expect.stringContaining('Mais')])
  fireEvent.click(within(strip()).getByRole('button', { name: /Mais/ }))
  expect(screen.getAllByRole('menuitem', { hidden: true }).map((item) => item.textContent)).toEqual(['Cotações', 'Projetos', 'Configurações'])

  resizeTo(1000)
  expect(stripLabels()).toHaveLength(6)
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull()
})

it('o item ativo nunca fica no "Mais": troca de lugar com o último visível', () => {
  render(<ModuleNav aria-label="Seções" items={items} value="config" onNavigate={() => {}} />)
  resizeTo(400)
  expect(stripLabels()).toEqual(['Tarefas12', 'Gestão3, em alerta', 'Configurações', expect.stringContaining('Mais')])
  expect(within(strip()).getByRole('button', { current: 'page' }).textContent).toBe('Configurações')
  fireEvent.click(within(strip()).getByRole('button', { name: /Mais/ }))
  expect(screen.getAllByRole('menuitem', { hidden: true }).map((item) => item.textContent)).toEqual(['Boas ideias, com novidades', 'Cotações', 'Projetos'])
})

it('o "Mais" sinaliza quando esconde um item com ponto ou alerta', () => {
  render(<ModuleNav aria-label="Seções" items={items} value="tarefas" onNavigate={() => {}} />)
  resizeTo(180) // só Tarefas
  expect(within(strip()).getByRole('button', { name: /Mais, com novidades/ })).toBeTruthy()
})

it('com onNavigate: botões navegam pelo valor, inclusive pelo "Mais"; desabilitado não navega', () => {
  function Harness() {
    const [value, setValue] = useState('tarefas')
    return <ModuleNav aria-label="Seções" items={items.map((item) => (item.value === 'projetos' ? { ...item, disabled: true } : item))} value={value} onNavigate={setValue} />
  }
  render(<Harness />)
  fireEvent.click(within(strip()).getByRole('button', { name: /Cotações/ }))
  expect(within(strip()).getByRole('button', { current: 'page' }).textContent).toBe('Cotações')
  fireEvent.click(within(strip()).getByRole('button', { name: /Projetos/ }))
  expect(within(strip()).getByRole('button', { current: 'page' }).textContent).toBe('Cotações')

  resizeTo(400)
  fireEvent.click(within(strip()).getByRole('button', { name: /Mais/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Configurações', hidden: true }))
  expect(within(strip()).getByRole('button', { current: 'page' }).textContent).toBe('Configurações')
})

it('com href: itens são links; clique simples com onNavigate vira navegação SPA, Ctrl+clique fica com o navegador', () => {
  const linked = items.map((item) => ({ ...item, href: `#/${item.value}` }))
  const onNavigate = vi.fn()
  render(<ModuleNav aria-label="Seções" items={linked} value="cotacoes" onNavigate={onNavigate} />)
  const link = within(strip()).getByRole('link', { name: /Projetos/ })
  expect(link.getAttribute('href')).toBe('#/projetos')
  expect(within(strip()).getByRole('link', { current: 'page' }).textContent).toBe('Cotações')

  expect(fireEvent.click(link)).toBe(false) // preventDefault
  expect(onNavigate).toHaveBeenCalledWith('projetos')
  onNavigate.mockClear()
  expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
  expect(onNavigate).not.toHaveBeenCalled()
})

it('com href e sem onNavigate: o link segue sozinho e o "Mais" navega pela URL', () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign })
  render(<ModuleNav aria-label="Seções" items={items.map((item) => ({ ...item, href: `/central/${item.value}` }))} value="tarefas" />)
  expect(fireEvent.click(within(strip()).getByRole('link', { name: /Gestão/ }))).toBe(true)
  resizeTo(400)
  fireEvent.click(within(strip()).getByRole('button', { name: /Mais/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Projetos', hidden: true }))
  expect(assign).toHaveBeenCalledWith('/central/projetos')
})

it('no AppShell, leva o título da seção e as ações para o cabeçalho do celular', () => {
  render(
    <AppShell brand={{ name: 'Betinhos' }} groups={[]} activeId="" title="Central">
      <ModuleNav aria-label="Seções" items={items} value="cotacoes" onNavigate={() => {}} actions={<button type="button">Atualizar</button>} />
    </AppShell>,
  )
  const header = document.querySelector('.bt-shell__header')!
  expect(header.querySelector('.bt-shell__header-title')?.textContent).toBe('Cotações')
  expect(within(header as HTMLElement).getByRole('button', { name: 'Atualizar' })).toBeTruthy()
})

const mobile = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 820px)', media: query, addEventListener() {}, removeEventListener() {} }))
const dock = () => document.querySelector('.bt-module-nav__dock') as HTMLElement

it('no celular, a barra flutuante mostra 4 seções e o "Mais" abre a segunda linha', () => {
  mobile()
  function Harness() {
    const [value, setValue] = useState('cotacoes')
    return (
      <AppShell brand={{ name: 'Betinhos' }} groups={[]} activeId="" title="Central">
        <ModuleNav aria-label="Seções" items={items} value={value} onNavigate={setValue} />
      </AppShell>
    )
  }
  render(<Harness />)
  expect(dock().getAttribute('aria-label')).toBe('Seções')
  const row = dock().querySelectorAll('.bt-module-nav__dock-row')[1] as HTMLElement
  expect(within(row).getAllByRole('button').map((button) => button.textContent)).toEqual(['Tarefas12', 'Gestão3, em alerta', 'Boas ideias, com novidades', 'Cotações', 'Mais'])
  expect(within(dock()).getByRole('button', { current: 'page' }).textContent).toBe('Cotações')

  const more = within(dock()).getByRole('button', { name: 'Mais' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(more)
  expect(more.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(within(dock()).getByRole('button', { name: 'Configurações' }))

  expect(document.querySelector('.bt-shell__header-title')?.textContent).toBe('Configurações')
  expect(more.getAttribute('aria-expanded')).toBe('false')
  expect(within(dock()).queryByRole('button', { name: 'Configurações' })).toBeNull()
  expect(more.textContent).toBe('Mais, seção atual: Configurações')
})

it('no celular, Esc fecha o "Mais" e devolve o foco; com até 5 seções não há "Mais" e o rótulo curto mantém o nome', () => {
  mobile()
  const { unmount } = render(<ModuleNav aria-label="Seções" items={items} value="tarefas" onNavigate={() => {}} />)
  const more = within(dock()).getByRole('button', { name: 'Mais' })
  fireEvent.click(more)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(more)
  unmount()

  const five = items.slice(0, 5).map((item) => (item.value === 'ideias' ? { ...item, shortLabel: 'Ideias' } : item))
  render(<ModuleNav aria-label="Seções" items={five} value="tarefas" onNavigate={() => {}} />)
  expect(within(dock()).queryByRole('button', { name: 'Mais' })).toBeNull()
  const ideias = within(dock()).getByRole('button', { name: /^Boas ideias/ })
  expect(ideias.querySelector('.bt-module-nav__tab-label')?.textContent).toBe('Ideias')
})

it('no desktop, a barra flutuante não é montada', () => {
  render(<ModuleNav aria-label="Seções" items={items} value="tarefas" onNavigate={() => {}} />)
  expect(dock()).toBeNull()
})

it('mobileActions substitui as ações no cabeçalho do celular', () => {
  render(
    <AppShell brand={{ name: 'Betinhos' }} groups={[]} activeId="" title="Central">
      <ModuleNav aria-label="Seções" items={items} value="tarefas" onNavigate={() => {}} actions={<span>8 hoje</span>} mobileActions={<button type="button">Atualizar</button>} />
    </AppShell>,
  )
  const header = document.querySelector('.bt-shell__header') as HTMLElement
  expect(within(header).getByRole('button', { name: 'Atualizar' })).toBeTruthy()
  expect(within(header).queryByText('8 hoje')).toBeNull()
})

it('shellHeader={false} não mexe no cabeçalho do AppShell', () => {
  render(
    <AppShell brand={{ name: 'Betinhos' }} groups={[]} activeId="" title="Central">
      <ModuleNav aria-label="Seções" items={items} value="cotacoes" onNavigate={() => {}} shellHeader={false} />
    </AppShell>,
  )
  expect(document.querySelector('.bt-shell__header-title')?.textContent).toBe('Central')
})
