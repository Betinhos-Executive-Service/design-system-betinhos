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

it('versão do build é a última linha do rodapé, depois do status', () => {
  const out = renderToStaticMarkup(<AppShell brand={{ name: 'B' }} groups={groups} activeId="geral" title="T" status={{ tone: 'success', text: 'Conectado' }} footer={<button type="button">Instalar</button>} version="v1.2.3 · 12/11/2026 15:00"><p /></AppShell>)
  const foot = out.slice(out.indexOf('bt-shell__foot'))
  expect(foot.indexOf('Instalar')).toBeLessThan(foot.indexOf('Conectado'))
  expect(foot).toMatch(/Conectado<\/span><\/div><span class="bt-shell__version">v1\.2\.3 · 12\/11\/2026 15:00<\/span><\/div>/)
})
