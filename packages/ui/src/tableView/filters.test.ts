import { describe, expect, it } from 'vitest'
import {
  appendTo, conditionProblem, countActiveFilters, countIncomplete, describeCondition, describeGroup, emptyFilters, filtersToFetchXml,
  keywordToFetchXml, matchesFilters, parseNumberBR, parseQuickNumber, quickNumberOf, newGroup, parseQuickText, quickTextOf, readFilters, removeNode, todaySaoPaulo, updateNode, toPanelList, fromPanelList, groupDepth,
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
  describe('data e hora em America/Sao_Paulo', () => {
    const ids = (values: unknown[], filter: FilterCondition, today: string) =>
      values.map((data, i) => ({ data, i })).filter((r) => matchesFilters(r, withQuick({ data: filter }), fields, (row) => row.data, today)).map((r) => r.i)
    it('Date 01:30Z de 11/11 conta como 10/11', () => {
      expect(ids([new Date('2026-11-11T01:30:00Z')], c('data', 'today'), '2026-11-10')).toEqual([0])
      expect(ids([new Date('2026-11-11T01:30:00Z')], c('data', 'today'), '2026-11-11')).toEqual([])
    })
    it('string ISO com Z ou ±hh:mm vira o dia de São Paulo', () => {
      expect(ids(['2026-11-11T01:30:00Z', '2026-11-11T01:30:00.000+00:00', '2026-11-10T22:30:00-03:00'], c('data', 'today'), '2026-11-10')).toEqual([0, 1, 2])
      expect(ids(['2026-11-11T01:30:00Z'], c('data', 'on', { value: '2026-11-10' }), '2026-11-10')).toEqual([0])
      expect(ids(['2026-11-11T01:30:00Z'], c('data', 'before', { value: '2026-11-11' }), '2026-11-10')).toEqual([0])
      expect(ids(['2026-11-11T01:30:00Z'], c('data', 'between', { value: '2026-11-10', to: '2026-11-10' }), '2026-11-10')).toEqual([0])
    })
    it('só dia e hora sem fuso mantêm o dia escrito', () => {
      expect(ids(['2026-11-11'], c('data', 'today'), '2026-11-11')).toEqual([0])
      expect(ids(['2026-11-11'], c('data', 'today'), '2026-11-10')).toEqual([])
      expect(ids(['2026-11-10T22:30:00', '2026-11-11T01:30:00'], c('data', 'today'), '2026-11-10')).toEqual([0])
    })
    it('este mês na virada: 31/10 23:00 BRT (01/11 02:00Z) conta em outubro', () => {
      const virada = ['2026-11-01T02:00:00Z', new Date('2026-11-01T02:00:00Z')]
      expect(ids(virada, c('data', 'this-month'), '2026-10-31')).toEqual([0, 1])
      expect(ids(virada, c('data', 'this-month'), '2026-11-01')).toEqual([])
      expect(ids(virada, c('data', 'last-month'), '2026-11-01')).toEqual([0, 1])
    })
  })
  it('número: diferente de inclui os vazios; igual e maior que os excluem', () => {
    const vals: unknown[] = [100, 50, null, undefined, '']
    const run = (filter: FilterCondition) => vals.map((valor, i) => ({ valor, i })).filter((r) => matchesFilters(r, withQuick({ valor: filter }), fields, (row) => row.valor, '2026-10-15')).map((r) => r.i)
    expect(run(c('valor', 'ne', { value: 100 }))).toEqual([1, 2, 3, 4])
    expect(run(c('valor', 'eq', { value: 100 }))).toEqual([0])
    expect(run(c('valor', 'gt', { value: 10 }))).toEqual([0, 1])
    expect(run(c('valor', 'empty'))).toEqual([2, 3, 4])
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

describe('toPanelList e fromPanelList', () => {
  const g = (logic: 'and' | 'or', items: Array<FilterCondition | ReturnType<typeof newGroup>>, id = 'raiz') => ({ type: 'group' as const, id, logic, items })
  const casos: Array<[string, TableFilters]> = [
    ['vazio', emptyFilters()],
    ['só rápido', withQuick({ nome: c('nome', 'contains', { value: 'ana' }), status: c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] }) })],
    ['só avançado e', withQuick({}, g('and', [c('valor', 'gt', { value: 10 }), c('cidade', 'contains', { value: 'Rio' })]))],
    ['só avançado ou', withQuick({}, g('or', [c('valor', 'gt', { value: 10 }), c('nome', 'eq', { value: 'x' })]))],
    ['rápido + avançado ou', withQuick({ nome: c('nome', 'contains', { value: 'ana' }) }, g('or', [c('valor', 'gt', { value: 10 }), c('data', 'today')]))],
    ['rápido + avançado com grupo', withQuick({ nome: c('nome', 'contains', { value: 'ana' }) }, g('and', [c('cidade', 'contains', { value: 'Rio' }), g('or', [c('valor', 'lt', { value: 5 }), c('blindado', 'yes')], 'g1')]))],
    ['avançado e com um único grupo', withQuick({}, g('and', [g('or', [c('valor', 'gt', { value: 1 }), c('data', 'today')], 'g3')]))],
    ['avançado ou com subgrupo e rápido', withQuick({ nome: c('nome', 'contains', { value: 'ana' }) }, g('or', [c('valor', 'gt', { value: 1 }), g('and', [c('data', 'today'), c('blindado', 'no')], 'g2')]))],
  ]
  for (const [nome, filtros] of casos) {
    it(`ida e volta sem mudança: ${nome}`, () => {
      expect(fromPanelList(toPanelList(filtros, fields), fields, filtros)).toEqual(filtros)
    })
  }
  it('lista começa pelos rápidos, na ordem dos campos', () => {
    const list = toPanelList(withQuick({ status: c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] }), nome: c('nome', 'contains', { value: 'a' }) }), fields)
    expect(list.items.map((i) => (i.type === 'condition' ? i.field : 'grupo'))).toEqual(['nome', 'status'])
    expect(list.logic).toBe('and')
  })
  it('avançado em ou com rápido vira grupo dentro da lista', () => {
    const list = toPanelList(withQuick({ nome: c('nome', 'contains', { value: 'a' }) }, g('or', [c('valor', 'gt', { value: 1 }), c('data', 'today')])), fields)
    expect(list.items).toHaveLength(2)
    expect(list.items[1]).toMatchObject({ type: 'group', logic: 'or' })
  })
  it('sem rápido, avançado em ou entra como grupo sob a raiz e', () => {
    const list = toPanelList(withQuick({}, g('or', [c('valor', 'gt', { value: 1 })])), fields)
    expect(list).toMatchObject({ id: 'raiz', logic: 'and', items: [{ type: 'group', logic: 'or' }] })
  })
  it('mesmo campo no rápido e no avançado: abrir e voltar não troca de lugar', () => {
    const x = withQuick({ status: c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] }) }, g('and', [c('status', 'not-in', { values: [{ value: '2', label: 'Confirmado' }] })]))
    expect(fromPanelList(toPanelList(x, fields), fields, x)).toEqual(x)
  })
  it('condição da célula que vai ao avançado ganha id próprio', () => {
    const out = fromPanelList(g('and', [{ ...c('nome', 'ends', { value: 'a' }), id: 'rapido-nome' }]), fields)
    expect(out.advanced.items[0].id).not.toBe('rapido-nome')
  })
  it('readFilters dá o mesmo id a cada leitura de condição gravada sem id', () => {
    const raw = { quick: { nome: { type: 'condition', field: 'nome', op: 'contains', value: 'a' } }, advanced: { type: 'group', logic: 'and', items: [{ type: 'condition', field: 'valor', op: 'gt', value: 1 }] } }
    expect(readFilters(raw, fields)).toEqual(readFilters(raw, fields))
    expect(readFilters(raw, fields).quick.nome.id).toBe('rapido-nome')
  })
  it('groupDepth conta os níveis', () => {
    expect(groupDepth(g('and', [c('nome', 'eq', { value: 'a' })]))).toBe(1)
    expect(groupDepth(g('and', [g('or', [g('and', [])], 'x')]))).toBe(3)
  })
  it('volta ao rápido só a condição única do campo, completa e com operador da célula', () => {
    const list = g('and', [
      c('nome', 'ends', { value: 'a' }), // operador que a célula não mostra → avançado
      c('valor', 'gt', { value: 1 }), c('valor', 'lt', { value: 9 }), // dois do mesmo campo → avançado
      c('cidade', 'contains', { value: 'Rio' }), // advancedOnly → avançado
      c('status', 'in', { values: [] }), // incompleta → avançado
      c('data', 'last-7'), // vai para o rápido
    ])
    const out = fromPanelList(list, fields)
    expect(Object.keys(out.quick)).toEqual(['data'])
    expect(out.advanced.items).toHaveLength(5)
  })
  it('condição que estava no avançado continua lá, mesmo podendo ir ao rápido', () => {
    const origem = withQuick({}, g('and', [c('valor', 'gt', { value: 10 })]))
    const lista = toPanelList(origem, fields)
    const nova = c('data', 'today')
    const out = fromPanelList({ ...lista, items: [...lista.items, nova] }, fields, origem)
    expect(Object.keys(out.quick)).toEqual(['data'])
    expect(out.advanced.items.map((i) => i.id)).toEqual(['valor-gt'])
  })
  it('lista em ou vai inteira para o avançado', () => {
    const out = fromPanelList(g('or', [c('nome', 'contains', { value: 'a' }), c('data', 'today')]), fields)
    expect(out.quick).toEqual({})
    expect(out.advanced).toMatchObject({ id: 'raiz', logic: 'or' })
  })
})
