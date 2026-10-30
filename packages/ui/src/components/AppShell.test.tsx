import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AppShell, type NavGroup } from './AppShell'

const groups: NavGroup[] = [
  { id: 'inicio', label: 'Página inicial', href: '#/inicio', items: [] },
  { id: 'operacional', label: 'Operacional', items: [{ id: 'geral', label: 'Geral', href: '#/geral' }] },
]
const html = (activeId: string) => renderToStaticMarkup(<AppShell brand={{ name: 'B' }} groups={groups} activeId={activeId} title="T"><p /></AppShell>)

it('grupo-link vira link direto, sem acordeão', () => {
  const out = html('geral')
  expect(out).toContain('<a class="bt-shell__group-toggle" href="#/inicio">')
  expect(out.match(/aria-expanded/g)?.length).toBe(2) // menu do celular + só o grupo Operacional
})

it('grupo-link fica ativo quando é a tela aberta', () => {
  expect(html('inicio')).toContain('href="#/inicio" aria-current="page" data-active="true"')
})
