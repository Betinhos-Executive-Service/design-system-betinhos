import { describe, expect, it } from 'vitest'
import {
  appendTo, conditionProblem, countActiveFilters, countIncomplete, describeCondition, describeGroup, emptyFilters, filtersToFetchXml,
  keywordToFetchXml, matchesFilters, parseNumberBR, parseQuickNumber, quickNumberOf, newGroup, parseQuickText, quickTextOf, readFilters, removeNode, todaySaoPaulo, updateNode,
  type FilterCondition, type FilterField, type TableFilters,
} from './filters'

const fields: FilterField[] = [
  { key: 'nome', label: 'Nome', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Pendente' }, { value: '2', label: 'Confirmado' }] },
  { key: 'cliente', label: 'Cliente', kind: 'lookup', attribute: '_cr40f_cliente_value' },
  { key: 'data', label: 'Data', kind: 'date' },
  { key: 'valor', label: 'Valor', kind: 'number', money: true },
  { key: 'blindado', label: 'Blindado', kind: 'bool' },
  { key: 'cidade', label: 'Cidade', kind: 'text', relation: 'Cliente', attribute: 'cli.cr40f_cidade', advancedOnly: true },
]
const c = (field: string, op: FilterCondition['op'], extra: Partial<FilterCondition> = {}): FilterCondition => ({ type: 'condition', id: `${field}-${op}`, field, op, ...extra })
const withQuick = (quick: Record<string, FilterCondition>, advanced = emptyFilters().advanced): TableFilters => ({ quick, advanced })

describe('parseQuickText e quickTextOf', () => {
  it('entende os prefixos e volta ao mesmo texto', () => {
    for (const [text, op] of [['ana', 'contains'], ['=Ana', 'eq'], ['^An', 'begins'], ['!teste', 'not-contains'], ['vazio', 'empty'], ['Preenchido', 'not-empty']] as const) {
      const parsed = parseQuickText('nome', text)
      expect(parsed?.op).toBe(op)
      expect(quickTextOf(parsed!).toLowerCase()).toBe(text.toLowerCase())
    }
  })
  it('texto vazio ou só o prefixo não filtra', () => {
    expect(parseQuickText('nome', '   ')).toBeNull()
    expect(parseQuickText('nome', '=')).toBeNull()
  })
})

describe('conditionProblem', () => {
  it('aponta o que falta e aceita operadores sem valor', () => {
    expect(conditionProblem(c('nome', 'contains'), fields[0])).toBe('Digite um texto.')
    expect(conditionProblem(c('status', 'in', { values: [] }), fields[1])).toBe('Escolha ao menos um valor.')
    expect(conditionProblem(c('data', 'between', { value: '2026-10-01' }), fields[3])).toBe('Informe as duas datas.')
    expect(conditionProblem(c('valor', 'gt'), fields[4])).toBe('Informe um número.')
    expect(conditionProblem(c('data', 'this-week'), fields[3])).toBeNull()
    expect(conditionProblem(c('nome', 'empty'), fields[0])).toBeNull()
    expect(conditionProblem(c('sumiu', 'eq'), undefined)).toBe('Este campo não existe mais na lista.')
  })
})

describe('describe', () => {
  it('monta o texto do chip', () => {
    expect(describeCondition(c('status', 'in', { values: [{ value: '1', label: '?' }, { value: '2', label: '?' }] }), fields)).toBe('Status: Pendente, Confirmado')
    expect(describeCondition(c('valor', 'between', { value: 100, to: 250.5 }), fields)).toMatch(/^Valor: entre R\$\s100,00 e R\$\s250,50$/)
    expect(describeCondition(c('data', 'between', { value: '2026-10-01', to: '2026-10-15' }), fields)).toBe('Data: de 01/10/2026 a 15/10/2026')
    expect(describeCondition(c('cidade', 'contains', { value: 'Campinas' }), fields)).toBe('Cliente › Cidade: Campinas')
    const group = { ...newGroup('or'), items: [c('cliente', 'in', { values: [{ value: 'a', label: 'Alfa' }] }), c('blindado', 'yes')] }
    expect(describeGroup(group, fields)).toBe('Grupo OU: Cliente: Alfa · Blindado: Sim')
  })
})

describe('readFilters', () => {
  it('descarta campo inexistente, operador inválido, rápido de campo só avançado e grupo além do segundo nível', () => {
    const raw = {
      quick: { nome: c('nome', 'contains', { value: 'a' }), sumiu: c('sumiu', 'eq'), cidade: c('cidade', 'contains', { value: 'x' }), status: c('status', 'gt') },
      advanced: {
        type: 'group', id: 'x', logic: 'or', items: [
          c('valor', 'gt', { value: 10 }),
          { type: 'group', id: 'g1', logic: 'and', items: [c('blindado', 'yes'), { type: 'group', id: 'g2', logic: 'or', items: [c('nome', 'empty')] }] },
        ],
      },
    }
    const read = readFilters(raw, fields)
    expect(Object.keys(read.quick)).toEqual(['nome'])
    expect(read.advanced.id).toBe('raiz')
    expect(read.advanced.logic).toBe('or')
    const inner = read.advanced.items[1]
    expect(inner.type === 'group' && inner.items.map((i) => i.type)).toEqual(['condition'])
    expect(readFilters('lixo', fields)).toEqual(emptyFilters())
  })
})

describe('filtersToFetchXml', () => {
  it('junta rápidos (E) e o avançado, escapando XML e curingas do like', () => {
    const advanced = {
      ...emptyFilters().advanced,
      items: [
        { ...newGroup('or'), id: 'g', items: [c('valor', 'between', { value: 10, to: 20 }), c('cliente', 'in', { values: [{ value: 'id-1', label: 'Alfa' }] })] },
        c('nome', 'contains'), // incompleta: ignorada
      ],
    }
    const xml = filtersToFetchXml(withQuick({ nome: c('nome', 'contains', { value: '50%_"a"<b>' }), data: c('data', 'next-7') }, advanced), fields)
    expect(xml).toBe(
      '<filter type="and">'
      + '<condition attribute="nome" operator="like" value="%50[%][_]&quot;a&quot;&lt;b&gt;%" />'
      + '<condition attribute="data" operator="next-x-days" value="7" />'
      + '<filter type="and"><filter type="or">'
      + '<filter type="and"><condition attribute="valor" operator="ge" value="10" /><condition attribute="valor" operator="le" value="20" /></filter>'
      + '<condition attribute="_cr40f_cliente_value" operator="in"><value>id-1</value></condition>'
      + '</filter></filter></filter>',
    )
  })
  it('vazio quando nada vale; "depois de" começa no dia seguinte; Sim/Não vira 1/0', () => {
    expect(filtersToFetchXml(emptyFilters(), fields)).toBe('')
    expect(filtersToFetchXml(withQuick({ data: c('data', 'after', { value: '2026-12-31' }) }), fields)).toContain('operator="on-or-after" value="2027-01-01"')
    expect(filtersToFetchXml(withQuick({ blindado: c('blindado', 'no') }), fields)).toContain('operator="eq" value="0"')
  })
  it('busca por palavra-chave vira OU de like', () => {
    expect(keywordToFetchXml(' ana ', ['nome', 'email'])).toBe('<filter type="or"><condition attribute="nome" operator="like" value="%ana%" /><condition attribute="email" operator="like" value="%ana%" /></filter>')
    expect(keywordToFetchXml('', ['nome'])).toBe('')
  })
})

describe('contagens', () => {
  it('conta só condições completas e informa as incompletas', () => {
    const advanced = { ...emptyFilters().advanced, items: [c('valor', 'gt', { value: 1 }), c('nome', 'eq'), { ...newGroup(), items: [c('blindado', 'yes')] }] }
    const filters = withQuick({ nome: c('nome', 'contains', { value: 'a' }), status: c('status', 'in', { values: [] }) }, advanced)
    expect(countActiveFilters(filters, fields)).toBe(3)
    expect(countIncomplete(advanced, fields)).toBe(1)
  })
})

describe('matchesFilters', () => {
  type Row = { nome: string; status: string; cliente: string; data: string; valor: number; blindado: boolean }
  const rows: Row[] = [
    { nome: 'João', status: '1', cliente: 'a', data: '2026-10-15', valor: 100, blindado: true },
    { nome: 'Maria', status: '2', cliente: 'b', data: '2026-10-20', valor: 300, blindado: false },
    { nome: 'Ana', status: '2', cliente: 'a', data: '2026-09-30', valor: 50, blindado: false },
  ]
  const run = (filters: TableFilters) => rows.filter((r) => matchesFilters(r, filters, fields, (row, key) => row[key as keyof Row], '2026-10-15')).map((r) => r.nome)

  it('aplica rápidos sem acento e o grupo OU', () => {
    expect(run(withQuick({ nome: c('nome', 'contains', { value: 'joao' }) }))).toEqual(['João'])
    const advanced = { ...emptyFilters().advanced, items: [{ ...newGroup('or'), items: [c('blindado', 'yes'), c('valor', 'gt', { value: 200 })] }] }
    expect(run(withQuick({}, advanced))).toEqual(['João', 'Maria'])
  })
  it('datas relativas a partir do dia informado', () => {
    expect(run(withQuick({ data: c('data', 'today') }))).toEqual(['João'])
    expect(run(withQuick({ data: c('data', 'next-7') }))).toEqual(['João', 'Maria'])
    expect(run(withQuick({ data: c('data', 'last-month') }))).toEqual(['Ana'])
  })
  it('todaySaoPaulo usa o fuso de São Paulo', () => {
    expect(todaySaoPaulo(new Date('2026-10-16T01:30:00Z'))).toBe('2026-10-15')
  })
})

describe('edição da árvore', () => {
  it('acrescenta, atualiza e remove nós sem mutar', () => {
    const root = emptyFilters().advanced
    const g = { ...newGroup('or'), id: 'g' }
    const withGroup = appendTo(root, 'raiz', g)
    const withCond = appendTo(withGroup, 'g', c('nome', 'contains', { id: 'n1', value: 'a' }))
    const updated = updateNode(withCond, 'n1', (n) => ({ ...n, value: 'b' } as FilterCondition))
    expect(JSON.stringify(updated)).toContain('"value":"b"')
    expect(removeNode(updated, 'g').items).toEqual([])
    expect(root.items).toEqual([])
  })
})

describe('filtro rápido de número', () => {
  it('lê formatos brasileiros e operadores', () => {
    expect(parseNumberBR('1.234,56')).toBe(1234.56)
    expect(parseNumberBR('R$ 99')).toBe(99)
    expect(parseQuickNumber('valor', '>= 1.000')?.op).toBe('ge')
    expect(parseQuickNumber('valor', '≤10')).toMatchObject({ op: 'le', value: 10 })
    expect(parseQuickNumber('valor', '200..100')).toMatchObject({ op: 'between', value: 100, to: 200 })
    expect(parseQuickNumber('valor', '10 a 20')).toMatchObject({ op: 'between', value: 10, to: 20 })
    expect(parseQuickNumber('valor', '250')).toMatchObject({ op: 'eq', value: 250 })
    expect(parseQuickNumber('valor', 'abc')).toBeNull()
    expect(quickNumberOf(parseQuickNumber('valor', '>=12,5')!)).toBe('≥12,5')
  })
})
