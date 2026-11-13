import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SINGLE_REASON, SelectionBar, SelectionInline, selectionMenuActions, selectionOverflow, type SelectionAction, type ViewBarSelection } from './Selection'

const noop = () => undefined
const actions: SelectionAction[] = [
  { id: 'editar', label: 'Editar', single: true, inline: true, onSelect: noop },
  { id: 'desativar', label: 'Desativar', tone: 'danger', inline: true, blocked: 'Selecione só ativos ou só inativos.', onSelect: noop },
  { id: 'copiar', label: 'Copiar', inline: true, onSelect: noop },
  { id: 'voucher', label: 'Gerar Voucher', inline: true, onSelect: noop },
  { id: 'op', label: 'Gerar OP', onSelect: noop },
]
const sel = (count: number): ViewBarSelection => ({ count, onClear: noop, actions })

describe('selectionMenuActions', () => {
  it('bloqueia o que exige um registro e mostra o motivo embaixo', () => {
    const items = selectionMenuActions(sel(3))
    expect(items.map((i) => [i.id, i.disabled, i.description])).toEqual([
      ['editar', true, SINGLE_REASON],
      ['desativar', true, 'Selecione só ativos ou só inativos.'],
      ['copiar', false, undefined],
      ['voucher', false, undefined],
      ['op', false, undefined],
    ])
  })
  it('com um registro, a ação single fica liberada', () => {
    expect(selectionMenuActions(sel(1))[0].disabled).toBe(false)
  })
  it('não vaza as chaves próprias para o item de menu', () => {
    expect(Object.keys(selectionMenuActions(sel(1))[0])).not.toContain('single')
  })
})

describe('SelectionInline', () => {
  it('contador com limpar e as ações inline; as que não cabem ficam no DOM, escondidas', () => {
    const out = renderToStaticMarkup(<SelectionInline selection={sel(3)} shown={2} compact={false} />)
    expect(out).toContain('aria-label="Limpar seleção"')
    expect(out).toContain('3 selecionados')
    expect(out).toMatch(/<button(?![^>]*hidden)[^>]*data-vb="sel:editar"/)
    expect(out).toMatch(/<button[^>]*hidden=""[^>]*data-vb="sel:copiar"|<button[^>]*data-vb="sel:copiar"[^>]*hidden=""/)
    expect(out).not.toContain('Ações (')
  })
  it('ação inerte continua focável, com aria-disabled e o motivo', () => {
    const out = renderToStaticMarkup(<SelectionInline selection={sel(3)} shown={4} compact={false} />)
    expect(out).toMatch(/aria-disabled="true"[^>]*title="Selecione exatamente um registro\."/)
    expect(out).not.toMatch(/<button[^>]* disabled=""[^>]*>[^<]*Editar/)
  })
  it('só ícone marca os botões com is-compact; sem seleção o grupo fica escondido', () => {
    expect(renderToStaticMarkup(<SelectionInline selection={sel(1)} shown={4} compact />)).toMatch(/class="[^"]*is-compact/)
    expect(renderToStaticMarkup(<SelectionInline selection={sel(0)} shown={4} compact={false} />)).toMatch(/^<div[^>]*hidden=""/)
  })
  it('rótulo próprio do contador', () => {
    const out = renderToStaticMarkup(<SelectionInline selection={{ ...sel(1), label: (n: number) => `${n} serviço` }} shown={1} compact={false} />)
    expect(out).toContain('1 serviço')
  })
})

describe('selectionOverflow (grupo da seleção no ⋮)', () => {
  it('as não inline e as inline além de shown, na ordem da tela, sob "N selecionados", inertes com o motivo', () => {
    const items = selectionOverflow(sel(3), 2)
    expect(items.map((i) => [i.id, i.group, i.disabled, i.description])).toEqual([
      ['copiar', '3 selecionados', false, undefined],
      ['voucher', '3 selecionados', false, undefined],
      ['op', '3 selecionados', false, undefined],
    ])
    expect(selectionOverflow(sel(3), 0).find((i) => i.id === 'desativar')).toMatchObject({ disabled: true, description: 'Selecione só ativos ou só inativos.' })
  })
  it('sem seleção, nada', () => {
    expect(selectionOverflow(sel(0), 0)).toEqual([])
  })
})

describe('SelectionBar (celular)', () => {
  it('duas ações na barra e o resto em Mais, com as ações da tela embaixo', () => {
    const out = renderToStaticMarkup(<SelectionBar selection={sel(2)} menu={[{ id: 'exportar', label: 'Exportar', onSelect: noop }]} />)
    expect(out).toContain('bt-selectionbar')
    expect(out).toContain('>Editar<')
    expect(out).toContain('>Desativar<')
    expect(out).not.toContain('>Copiar<')
    expect(out).toContain('aria-label="Mais ações (3 da seleção)"')
    // Sem selo numérico no "Mais" e contador em texto simples, como no desktop (1.27).
    expect(out).not.toContain('bt-viewbar__badge')
    expect(out).toMatch(/<span role="status" class="bt-selection__label">2 selecionados<\/span>/)
  })
  it('no desktop, ações inline são ghost e a perigosa leva a marca de ícone em danger', () => {
    const out = renderToStaticMarkup(<SelectionInline selection={sel(1)} shown={4} compact={false} />)
    expect(out).toMatch(/class="bt-button bt-button--ghost[^"]*bt-selection__danger[^"]*"[^>]*data-vb="sel:desativar"/)
    expect(out).not.toContain('bt-button--danger')
    expect(out).not.toContain('bt-button--secondary')
  })
})
