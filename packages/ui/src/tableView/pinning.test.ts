import { describe, expect, it } from 'vitest'
import {
  defaultConfig, moveVisibleColumn, normalizeConfig, pinColumn, pinnedColumns, resizeColumn, toggleColumn, unpinColumn,
  type ViewColumnDef, type ViewConfig,
} from './config'

const defs: ViewColumnDef[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'status', label: 'Status' },
  { key: 'valor', label: 'Valor' },
  { key: 'obs', label: 'Observação', defaultHidden: true },
]
const keys = (c: ViewConfig) => c.columns.map((x) => x.key)
const pins = (c: ViewConfig) => pinnedColumns(c).map((x) => x.key)

describe('colunas fixas', () => {
  it('fixar leva ao fim do bloco fixo; o título continua primeiro das que rolam', () => {
    let config = pinColumn(defaultConfig(defs), defs, 'status')
    expect(keys(config)).toEqual(['status', 'nome', 'cliente', 'valor', 'obs'])
    config = pinColumn(config, defs, 'valor')
    expect(keys(config)).toEqual(['status', 'valor', 'nome', 'cliente', 'obs'])
    expect(pins(config)).toEqual(['status', 'valor'])
  })

  it('o título fixado vira o primeiro do bloco fixo', () => {
    const config = pinColumn(pinColumn(defaultConfig(defs), defs, 'status'), defs, 'nome')
    expect(keys(config)).toEqual(['nome', 'status', 'cliente', 'valor', 'obs'])
    expect(pins(config)).toEqual(['nome', 'status'])
  })

  it('desafixar leva para logo depois do bloco (depois do título, se ele rola)', () => {
    let config = pinColumn(pinColumn(defaultConfig(defs), defs, 'status'), defs, 'valor')
    config = unpinColumn(config, defs, 'status')
    expect(keys(config)).toEqual(['valor', 'nome', 'status', 'cliente', 'obs'])
    expect(pins(config)).toEqual(['valor'])
    // Título fixo: ao desafixar, ele abre o bloco das que rolam.
    config = unpinColumn(pinColumn(config, defs, 'nome'), defs, 'nome')
    expect(keys(config)[1]).toBe('nome')
    expect(pins(config)).toEqual(['valor'])
  })

  it('não fixa coluna oculta nem repete a que já está fixa', () => {
    const base = defaultConfig(defs)
    expect(pinColumn(base, defs, 'obs')).toBe(base)
    const once = pinColumn(base, defs, 'cliente')
    expect(pinColumn(once, defs, 'cliente')).toBe(once)
    expect(unpinColumn(base, defs, 'cliente')).toBe(base)
  })

  it('ocultar solta a coluna; ao reaparecer ela volta solta', () => {
    let config = pinColumn(pinColumn(defaultConfig(defs), defs, 'status'), defs, 'valor')
    config = toggleColumn(config, defs, 'status')
    expect(config.columns.find((c) => c.key === 'status')).toEqual({ key: 'status', visible: false })
    expect(keys(config)[0]).toBe('valor')
    config = toggleColumn(config, defs, 'status')
    expect(pins(config)).toEqual(['valor'])
  })

  it('arrastar e Alt+setas ficam dentro do bloco', () => {
    let config = pinColumn(pinColumn(defaultConfig(defs), defs, 'status'), defs, 'valor')
    // Fixa não vai para depois do bloco.
    expect(keys(moveVisibleColumn(config, defs, 'status', 3))).toEqual(['valor', 'status', 'nome', 'cliente', 'obs'])
    // Solta não entra no bloco fixo nem passa à frente do título.
    expect(keys(moveVisibleColumn(config, defs, 'cliente', 0))).toEqual(['status', 'valor', 'nome', 'cliente', 'obs'])
    config = moveVisibleColumn(config, defs, 'valor', 0)
    expect(keys(config)).toEqual(['valor', 'status', 'nome', 'cliente', 'obs'])
  })

  it('largura não perde o pinned', () => {
    const config = resizeColumn(pinColumn(defaultConfig(defs), defs, 'status'), 'status', 200)
    expect(config.columns[0]).toEqual({ key: 'status', visible: true, width: 200, pinned: true })
  })

  it('normalizeConfig preserva pinned: true, descarta outros valores e reagrupa o bloco', () => {
    const raw = { v: 1, sort: null, filters: {}, columns: [
      { key: 'nome', visible: true },
      { key: 'cliente', visible: true, pinned: 'sim' },
      { key: 'status', visible: true, pinned: true },
      { key: 'valor', visible: true, pinned: false },
      { key: 'obs', visible: false, pinned: true },
    ] }
    const config = normalizeConfig(raw, defs)
    expect(keys(config)).toEqual(['status', 'nome', 'cliente', 'valor', 'obs'])
    expect(config.columns.map((c) => c.pinned)).toEqual([true, undefined, undefined, undefined, undefined])
    expect(config.columns.every((c) => 'pinned' in c ? c.pinned === true : true)).toBe(true)
  })

  it('visão salva sem pinned abre igual a antes', () => {
    const raw = { v: 1, sort: null, filters: {}, columns: [{ key: 'status', visible: true }, { key: 'nome', visible: true }, { key: 'cliente', visible: false }] }
    const config = normalizeConfig(raw, defs)
    expect(keys(config)).toEqual(['nome', 'status', 'cliente', 'valor', 'obs'])
    expect(pins(config)).toEqual([])
    expect(JSON.stringify(config)).not.toContain('pinned')
  })

  it('defaultPinned entra na visão padrão (e no "Restaurar colunas"), com o título primeiro do bloco', () => {
    const withPins: ViewColumnDef[] = defs.map((d) => (d.key === 'status' || d.key === 'nome' || d.key === 'obs' ? { ...d, defaultPinned: true } : d))
    const config = defaultConfig(withPins)
    expect(keys(config)).toEqual(['nome', 'status', 'cliente', 'valor', 'obs'])
    expect(pins(config)).toEqual(['nome', 'status'])
    // Visão salva antiga, sem pinned, não ganha as defaultPinned.
    expect(pins(normalizeConfig({ v: 1, sort: null, filters: {}, columns: [{ key: 'nome', visible: true }] }, withPins))).toEqual([])
  })
})
