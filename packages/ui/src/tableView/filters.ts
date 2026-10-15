/**
 * Modelo puro dos filtros de lista (Design System §10.9.2): filtro rápido por coluna, filtro avançado em grupos E/OU
 * (até dois níveis) e as traduções para FetchXML, texto de chip e filtragem em memória.
 */

export type FilterKind = 'text' | 'choice' | 'lookup' | 'date' | 'number' | 'bool'

export type FilterOption = { value: string; label: string }

/** Campo que pode ser filtrado. Colunas da visão e campos fora dela (inclusive de tabelas relacionadas). */
export type FilterField = {
  key: string
  label: string
  kind: FilterKind
  /** Nome lógico no FetchXML; padrão: `key`. Campo de relação usa `alias.atributo` com `entityname` no link-entity. */
  attribute?: string
  /** Opções de escolha (choice) ou rótulos de Sim/Não (bool, `value` "1"/"0"). */
  options?: FilterOption[]
  /** Número em BRL. */
  money?: boolean
  /** Nome da relação para agrupar no painel ("Cliente"); o rótulo aparece como "Cliente › Cidade". */
  relation?: string
  /** Fica fora do filtro rápido (só no avançado). */
  advancedOnly?: boolean
}

export type TextOp = 'contains' | 'not-contains' | 'eq' | 'ne' | 'begins' | 'ends' | 'empty' | 'not-empty'
export type ListOp = 'in' | 'not-in' | 'empty' | 'not-empty'
export type DateOp =
  | 'today' | 'tomorrow' | 'yesterday' | 'this-week' | 'next-7' | 'last-7' | 'this-month' | 'last-month'
  | 'on' | 'before' | 'after' | 'between' | 'empty' | 'not-empty'
export type NumberOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'between' | 'empty'
export type BoolOp = 'yes' | 'no'
export type FilterOp = TextOp | ListOp | DateOp | NumberOp | BoolOp

export type FilterCondition = {
  type: 'condition'
  id: string
  field: string
  op: FilterOp
  /** Texto, dia `AAAA-MM-DD` ou número. */
  value?: string | number
  /** Fim do intervalo (`between`). */
  to?: string | number
  /** Valores escolhidos (choice e lookup), com o rótulo para o chip. */
  values?: FilterOption[]
}

export type FilterGroup = { type: 'group'; id: string; logic: 'and' | 'or'; items: Array<FilterCondition | FilterGroup> }

/** O que a visão guarda em `config.filters`. A busca por palavra-chave não entra (§10.9.2). */
export type TableFilters = { quick: Record<string, FilterCondition>; advanced: FilterGroup }

/** Operadores oferecidos por tipo, na ordem do painel, com o rótulo em português (§10.9.2). */
export const FILTER_OPS: Record<FilterKind, Array<{ op: FilterOp; label: string }>> = {
  text: [
    { op: 'contains', label: 'contém' }, { op: 'not-contains', label: 'não contém' }, { op: 'eq', label: 'igual a' },
    { op: 'ne', label: 'diferente de' }, { op: 'begins', label: 'começa com' }, { op: 'ends', label: 'termina com' },
    { op: 'empty', label: 'está vazio' }, { op: 'not-empty', label: 'está preenchido' },
  ],
  choice: [{ op: 'in', label: 'é um de' }, { op: 'not-in', label: 'não é nenhum de' }, { op: 'empty', label: 'está vazio' }, { op: 'not-empty', label: 'está preenchido' }],
  lookup: [{ op: 'in', label: 'é um de' }, { op: 'not-in', label: 'não é nenhum de' }, { op: 'empty', label: 'está vazio' }, { op: 'not-empty', label: 'está preenchido' }],
  date: [
    { op: 'today', label: 'hoje' }, { op: 'tomorrow', label: 'amanhã' }, { op: 'yesterday', label: 'ontem' },
    { op: 'this-week', label: 'esta semana' }, { op: 'next-7', label: 'próximos 7 dias' }, { op: 'last-7', label: 'últimos 7 dias' },
    { op: 'this-month', label: 'este mês' }, { op: 'last-month', label: 'mês passado' },
    { op: 'on', label: 'em' }, { op: 'before', label: 'antes de' }, { op: 'after', label: 'depois de' }, { op: 'between', label: 'entre' },
    { op: 'empty', label: 'está vazio' }, { op: 'not-empty', label: 'está preenchido' },
  ],
  number: [
    { op: 'eq', label: 'igual a' }, { op: 'ne', label: 'diferente de' }, { op: 'gt', label: 'maior que' }, { op: 'ge', label: 'maior ou igual' },
    { op: 'lt', label: 'menor que' }, { op: 'le', label: 'menor ou igual' }, { op: 'between', label: 'entre' }, { op: 'empty', label: 'está vazio' },
  ],
  bool: [{ op: 'yes', label: 'é sim' }, { op: 'no', label: 'é não' }],
}

/** Atalhos de data do filtro rápido e do avançado. */
export const DATE_PRESETS: DateOp[] = ['today', 'tomorrow', 'yesterday', 'this-week', 'next-7', 'last-7', 'this-month', 'last-month']

/** Dois níveis: o grupo raiz e grupos dentro dele (§10.9.2). */
export const MAX_GROUP_DEPTH = 2

const VALUELESS = new Set<FilterOp>(['empty', 'not-empty', 'yes', 'no', ...DATE_PRESETS])
export const needsValue = (op: FilterOp) => !VALUELESS.has(op)

let counter = 0
export const newId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`

export const emptyFilters = (): TableFilters => ({ quick: {}, advanced: { type: 'group', id: 'raiz', logic: 'and', items: [] } })
export const newCondition = (field: FilterField): FilterCondition => ({ type: 'condition', id: newId(), field: field.key, op: FILTER_OPS[field.kind][0].op })
export const newGroup = (logic: 'and' | 'or' = 'or'): FilterGroup => ({ type: 'group', id: newId(), logic, items: [] })

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** O que falta para a condição valer; `null` quando está completa. Condição incompleta é ignorada na consulta. */
export function conditionProblem(c: FilterCondition, field: FilterField | undefined): string | null {
  if (!field) return 'Este campo não existe mais na lista.'
  if (!FILTER_OPS[field.kind].some((o) => o.op === c.op)) return 'Escolha um operador.'
  if (!needsValue(c.op)) return null
  switch (field.kind) {
    case 'text': return typeof c.value === 'string' && c.value.trim() ? null : 'Digite um texto.'
    case 'choice': case 'lookup': return c.values?.length ? null : 'Escolha ao menos um valor.'
    case 'date':
      if (c.op === 'between') return isDay(c.value) && isDay(c.to) ? null : 'Informe as duas datas.'
      return isDay(c.value) ? null : 'Informe a data.'
    case 'number':
      if (c.op === 'between') return isNum(c.value) && isNum(c.to) ? null : 'Informe os dois valores.'
      return isNum(c.value) ? null : 'Informe um número.'
    case 'bool': return null
  }
}

const fieldMap = (fields: FilterField[]) => new Map(fields.map((f) => [f.key, f]))

function sanitizeCondition(raw: unknown, fields: Map<string, FilterField>): FilterCondition | null {
  if (!isObject(raw) || raw.type !== 'condition' || typeof raw.field !== 'string' || typeof raw.op !== 'string') return null
  const field = fields.get(raw.field)
  if (!field || !FILTER_OPS[field.kind].some((o) => o.op === raw.op)) return null
  const c: FilterCondition = { type: 'condition', id: typeof raw.id === 'string' ? raw.id : newId(), field: field.key, op: raw.op as FilterOp }
  if (typeof raw.value === 'string' || isNum(raw.value)) c.value = raw.value
  if (typeof raw.to === 'string' || isNum(raw.to)) c.to = raw.to
  if (Array.isArray(raw.values)) {
    c.values = raw.values.flatMap((v) => (isObject(v) && typeof v.value === 'string' ? [{ value: v.value, label: typeof v.label === 'string' ? v.label : v.value }] : []))
  }
  return c
}

function sanitizeGroup(raw: unknown, fields: Map<string, FilterField>, depth: number): FilterGroup | null {
  if (!isObject(raw) || raw.type !== 'group' || !Array.isArray(raw.items)) return null
  const items = raw.items.flatMap((item): Array<FilterCondition | FilterGroup> => {
    if (isObject(item) && item.type === 'group') {
      if (depth >= MAX_GROUP_DEPTH) return []
      const group = sanitizeGroup(item, fields, depth + 1)
      return group ? [group] : []
    }
    const c = sanitizeCondition(item, fields)
    return c ? [c] : []
  })
  return { type: 'group', id: typeof raw.id === 'string' ? raw.id : newId(), logic: raw.logic === 'or' ? 'or' : 'and', items }
}

/**
 * Lê `config.filters` (vindo do Dataverse, da URL ou da visão padrão) contra os campos atuais:
 * campo que sumiu, operador inválido e grupo além do segundo nível saem.
 */
export function readFilters(raw: unknown, fields: FilterField[]): TableFilters {
  const map = fieldMap(fields)
  const base = emptyFilters()
  if (!isObject(raw)) return base
  const quick: Record<string, FilterCondition> = {}
  if (isObject(raw.quick)) {
    for (const [key, value] of Object.entries(raw.quick)) {
      const c = sanitizeCondition(value, map)
      if (c && c.field === key && !map.get(key)?.advancedOnly) quick[key] = c
    }
  }
  const advanced = sanitizeGroup(raw.advanced, map, 1) ?? base.advanced
  return { quick, advanced: { ...advanced, id: 'raiz' } }
}

/** Forma gravada na visão: sem nenhum filtro vira `{}`, igual à visão padrão (não marca "Alterada" à toa). */
export function storedFilters(filters: TableFilters): Record<string, unknown> {
  return Object.keys(filters.quick).length || filters.advanced.items.length ? filters : {}
}

/** Condições completas do avançado (para o número no botão "Filtros"). */
function completeConditions(group: FilterGroup, fields: Map<string, FilterField>): FilterCondition[] {
  return group.items.flatMap((item) => (item.type === 'group' ? completeConditions(item, fields) : conditionProblem(item, fields.get(item.field)) ? [] : [item]))
}

/** Quantas condições valem agora (rápidas + avançadas completas). */
export function countActiveFilters(filters: TableFilters, fields: FilterField[]): number {
  const map = fieldMap(fields)
  const quick = Object.values(filters.quick).filter((c) => !conditionProblem(c, map.get(c.field))).length
  return quick + completeConditions(filters.advanced, map).length
}

/** Condições do avançado ignoradas por estarem incompletas (aviso do "Aplicar"). */
export function countIncomplete(group: FilterGroup, fields: FilterField[]): number {
  const map = fieldMap(fields)
  const walk = (g: FilterGroup): number => g.items.reduce((n, item) => n + (item.type === 'group' ? walk(item) : conditionProblem(item, map.get(item.field)) ? 1 : 0), 0)
  return walk(group)
}

// ---------- Filtro rápido de texto ----------

/** Texto da célula de filtro rápido → condição. Prefixos: `=` igual, `^` começa com, `!` não contém; `vazio` e `preenchido`. */
export function parseQuickText(field: string, text: string): FilterCondition | null {
  const raw = text.trim()
  if (!raw) return null
  const base = { type: 'condition' as const, id: `rapido-${field}`, field }
  const word = raw.toLowerCase()
  if (word === 'vazio') return { ...base, op: 'empty' }
  if (word === 'preenchido') return { ...base, op: 'not-empty' }
  const prefix = raw[0]
  const rest = raw.slice(1).trim()
  if (prefix === '=' && rest) return { ...base, op: 'eq', value: rest }
  if (prefix === '^' && rest) return { ...base, op: 'begins', value: rest }
  if (prefix === '!' && rest) return { ...base, op: 'not-contains', value: rest }
  if ('=^!'.includes(prefix) && !rest) return null
  return { ...base, op: 'contains', value: raw }
}

/** Inverso de `parseQuickText`, para a célula mostrar o filtro aplicado. */
export function quickTextOf(c: FilterCondition | undefined): string {
  if (!c) return ''
  const v = typeof c.value === 'string' ? c.value : ''
  switch (c.op) {
    case 'empty': return 'vazio'
    case 'not-empty': return 'preenchido'
    case 'eq': return `=${v}`
    case 'begins': return `^${v}`
    case 'not-contains': return `!${v}`
    default: return v
  }
}

/** "1.234,56", "1234.56" ou "1234" → número; vírgula é o decimal quando aparece. */
export function parseNumberBR(text: string): number | null {
  const raw = text.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/**
 * Texto da célula de número → condição: `100` igual, `>100`, `>=100`/`≥100`, `<100`, `<=100`/`≤100`, `<>100`/`≠100`,
 * `100..200` ou `100 a 200` (entre) e `vazio`.
 */
export function parseQuickNumber(field: string, text: string): FilterCondition | null {
  const raw = text.trim()
  if (!raw) return null
  const base = { type: 'condition' as const, id: `rapido-${field}`, field }
  if (raw.toLowerCase() === 'vazio') return { ...base, op: 'empty' }
  const range = raw.split(/\s*(?:\.\.|\s+a\s+)\s*/i)
  if (range.length === 2) {
    const from = parseNumberBR(range[0])
    const to = parseNumberBR(range[1])
    return from != null && to != null ? { ...base, op: 'between', value: Math.min(from, to), to: Math.max(from, to) } : null
  }
  const match = /^(>=|<=|<>|≥|≤|≠|>|<|=)?\s*(.+)$/.exec(raw)
  const n = match ? parseNumberBR(match[2]) : null
  if (n == null || !match) return null
  const ops: Record<string, FilterOp> = { '>': 'gt', '>=': 'ge', '≥': 'ge', '<': 'lt', '<=': 'le', '≤': 'le', '<>': 'ne', '≠': 'ne', '=': 'eq' }
  return { ...base, op: ops[match[1] ?? '='] ?? 'eq', value: n }
}

/** Inverso de `parseQuickNumber`. */
export function quickNumberOf(c: FilterCondition | undefined): string {
  if (!c) return ''
  const n = (v: unknown) => (isNum(v) ? String(v).replace('.', ',') : '')
  const sign: Partial<Record<FilterOp, string>> = { gt: '>', ge: '≥', lt: '<', le: '≤', ne: '≠', eq: '' }
  if (c.op === 'empty') return 'vazio'
  if (c.op === 'between') return `${n(c.value)}..${n(c.to)}`
  return `${sign[c.op] ?? ''}${n(c.value)}`
}

// ---------- Texto do chip ----------

const brDate = (day: unknown) => (isDay(day) ? day.split('-').reverse().join('/') : '')
const NUMBER = new Intl.NumberFormat('pt-BR')
const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const opLabel = (kind: FilterKind, op: FilterOp) => FILTER_OPS[kind].find((o) => o.op === op)?.label ?? op

export const fieldLabel = (field: FilterField) => (field.relation ? `${field.relation} › ${field.label}` : field.label)

function describeValue(c: FilterCondition, field: FilterField): string {
  const num = (n: unknown) => (isNum(n) ? (field.money ? MONEY.format(n) : NUMBER.format(n)) : '—')
  switch (field.kind) {
    case 'text':
      if (c.op === 'contains') return String(c.value ?? '')
      return c.op === 'empty' || c.op === 'not-empty' ? opLabel('text', c.op) : `${opLabel('text', c.op)} ${c.value ?? ''}`
    case 'choice': case 'lookup': {
      const names = (c.values ?? []).map((v) => field.options?.find((o) => o.value === v.value)?.label ?? v.label).join(', ')
      if (c.op === 'in') return names
      return c.op === 'not-in' ? `exceto ${names}` : opLabel(field.kind, c.op)
    }
    case 'date':
      if (c.op === 'on') return `em ${brDate(c.value)}`
      if (c.op === 'before') return `antes de ${brDate(c.value)}`
      if (c.op === 'after') return `depois de ${brDate(c.value)}`
      if (c.op === 'between') return `de ${brDate(c.value)} a ${brDate(c.to)}`
      return opLabel('date', c.op)
    case 'number': {
      const sign: Partial<Record<FilterOp, string>> = { eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤' }
      if (c.op === 'between') return `entre ${num(c.value)} e ${num(c.to)}`
      if (c.op === 'empty') return 'está vazio'
      return `${sign[c.op] ?? ''} ${num(c.value)}`.trim()
    }
    case 'bool': {
      const want = c.op === 'yes' ? '1' : '0'
      return field.options?.find((o) => o.value === want)?.label ?? (c.op === 'yes' ? 'Sim' : 'Não')
    }
  }
}

/** "Status: Pendente, Confirmado". */
export function describeCondition(c: FilterCondition, fields: FilterField[]): string {
  const field = fields.find((f) => f.key === c.field)
  return field ? `${fieldLabel(field)}: ${describeValue(c, field)}` : c.field
}

/** Chip de grupo de primeiro nível: "Grupo OU: Cliente: Alfa · Tipo: Blindado". */
export function describeGroup(group: FilterGroup, fields: FilterField[]): string {
  const parts = group.items.map((item) => (item.type === 'group' ? `(${describeGroup(item, fields)})` : describeCondition(item, fields)))
  return `Grupo ${group.logic === 'or' ? 'OU' : 'E'}: ${parts.join(' · ')}`
}

// ---------- FetchXML ----------

const xmlAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xmlText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** `%`, `_` e `[` são curingas do `like`: escapados entre colchetes. */
const escapeLike = (text: string) => text.replace(/[%_[]/g, (m) => `[${m}]`)

function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function cond(attribute: string, operator: string, value?: string | number, values?: string[]) {
  const head = `<condition attribute="${xmlAttr(attribute)}" operator="${operator}"${value !== undefined ? ` value="${xmlAttr(String(value))}"` : ''}`
  return values ? `${head}>${values.map((v) => `<value>${xmlText(v)}</value>`).join('')}</condition>` : `${head} />`
}

function conditionXml(c: FilterCondition, field: FilterField): string[] {
  const a = field.attribute ?? field.key
  const v = typeof c.value === 'string' ? c.value.trim() : c.value
  switch (field.kind) {
    case 'text':
      switch (c.op) {
        case 'contains': return [cond(a, 'like', `%${escapeLike(String(v))}%`)]
        case 'not-contains': return [cond(a, 'not-like', `%${escapeLike(String(v))}%`)]
        case 'begins': return [cond(a, 'like', `${escapeLike(String(v))}%`)]
        case 'ends': return [cond(a, 'like', `%${escapeLike(String(v))}`)]
        case 'eq': return [cond(a, 'eq', v)]
        case 'ne': return [cond(a, 'ne', v)]
        case 'empty': return [cond(a, 'null')]
        case 'not-empty': return [cond(a, 'not-null')]
      }
      return []
    case 'choice': case 'lookup': {
      const ids = (c.values ?? []).map((x) => x.value)
      if (c.op === 'in') return [cond(a, 'in', undefined, ids)]
      if (c.op === 'not-in') return [cond(a, 'not-in', undefined, ids)]
      return [cond(a, c.op === 'empty' ? 'null' : 'not-null')]
    }
    case 'date':
      switch (c.op) {
        case 'today': case 'tomorrow': case 'yesterday': case 'this-week': case 'this-month': case 'last-month': return [cond(a, c.op)]
        case 'next-7': return [cond(a, 'next-x-days', 7)]
        case 'last-7': return [cond(a, 'last-x-days', 7)]
        case 'on': return [cond(a, 'on', String(c.value))]
        case 'before': return [cond(a, 'lt', String(c.value))]
        // "depois de" exclui o próprio dia: a partir do dia seguinte.
        case 'after': return [cond(a, 'on-or-after', addDays(String(c.value), 1))]
        case 'between': return [cond(a, 'on-or-after', String(c.value)), cond(a, 'on-or-before', String(c.to))]
        case 'empty': return [cond(a, 'null')]
        case 'not-empty': return [cond(a, 'not-null')]
      }
      return []
    case 'number':
      switch (c.op) {
        case 'eq': case 'ne': case 'gt': case 'ge': case 'lt': case 'le': return [cond(a, c.op, c.value)]
        case 'between': return [cond(a, 'ge', c.value), cond(a, 'le', c.to)]
        case 'empty': return [cond(a, 'null')]
      }
      return []
    case 'bool': return [cond(a, 'eq', c.op === 'yes' ? 1 : 0)]
  }
}

function groupXml(group: FilterGroup, fields: Map<string, FilterField>): string {
  const parts = group.items.flatMap((item) => {
    if (item.type === 'group') {
      const inner = groupXml(item, fields)
      return inner ? [inner] : []
    }
    const field = fields.get(item.field)
    if (!field || conditionProblem(item, field)) return []
    const xml = conditionXml(item, field)
    // Condição com duas partes (entre) dentro de um grupo OU precisa do próprio E.
    return xml.length > 1 && group.logic === 'or' ? [`<filter type="and">${xml.join('')}</filter>`] : xml
  })
  return parts.length ? `<filter type="${group.logic}">${parts.join('')}</filter>` : ''
}

/**
 * `<filter>` com tudo o que vale: filtros rápidos (E) e o grupo avançado. Vazio quando nada vale.
 * A tela injeta o resultado no `<entity>` do FetchXML da visão: a filtragem acontece sempre na fonte.
 */
export function filtersToFetchXml(filters: TableFilters, fields: FilterField[]): string {
  const map = fieldMap(fields)
  const quick = Object.values(filters.quick).flatMap((c) => {
    const field = map.get(c.field)
    return field && !conditionProblem(c, field) ? conditionXml(c, field) : []
  })
  const advanced = groupXml(filters.advanced, map)
  const parts = [...quick, ...(advanced ? [advanced] : [])]
  return parts.length ? `<filter type="and">${parts.join('')}</filter>` : ''
}

/** Busca por palavra-chave: `like` em cada atributo de texto, combinados com OU. */
export function keywordToFetchXml(text: string, attributes: string[]): string {
  const value = text.trim()
  if (!value || !attributes.length) return ''
  return `<filter type="or">${attributes.map((a) => cond(a, 'like', `%${escapeLike(value)}%`)).join('')}</filter>`
}

// ---------- Filtragem em memória ----------

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dayOf = (value: unknown): string | null => {
  if (isDay(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10)
  return null
}

function dateMatches(op: FilterOp, day: string | null, c: FilterCondition, today: string): boolean {
  if (op === 'empty') return day == null
  if (op === 'not-empty') return day != null
  if (day == null) return false
  const weekStart = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay())
  const month = today.slice(0, 7)
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7)
  switch (op) {
    case 'today': return day === today
    case 'tomorrow': return day === addDays(today, 1)
    case 'yesterday': return day === addDays(today, -1)
    case 'this-week': return day >= weekStart && day <= addDays(weekStart, 6)
    case 'next-7': return day >= today && day <= addDays(today, 7)
    case 'last-7': return day >= addDays(today, -7) && day <= today
    case 'this-month': return day.startsWith(month)
    case 'last-month': return day.startsWith(lastMonth)
    case 'on': return day === c.value
    case 'before': return day < String(c.value)
    case 'after': return day > String(c.value)
    case 'between': return day >= String(c.value) && day <= String(c.to)
  }
  return true
}

function conditionMatches(c: FilterCondition, field: FilterField, raw: unknown, today: string): boolean {
  const empty = raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)
  switch (field.kind) {
    case 'text': {
      const text = normalize(String(raw ?? ''))
      const v = normalize(String(c.value ?? ''))
      switch (c.op) {
        case 'contains': return text.includes(v)
        case 'not-contains': return !text.includes(v)
        case 'eq': return text === v
        case 'ne': return text !== v
        case 'begins': return text.startsWith(v)
        case 'ends': return text.endsWith(v)
        case 'empty': return empty
        case 'not-empty': return !empty
      }
      return true
    }
    case 'choice': case 'lookup': {
      const have = (Array.isArray(raw) ? raw : [raw]).filter((x) => x != null && x !== '').map(String)
      const want = (c.values ?? []).map((x) => x.value)
      if (c.op === 'in') return have.some((x) => want.includes(x))
      if (c.op === 'not-in') return !have.some((x) => want.includes(x))
      return c.op === 'empty' ? have.length === 0 : have.length > 0
    }
    case 'date': return dateMatches(c.op, dayOf(raw), c, today)
    case 'number': {
      if (c.op === 'empty') return empty
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (empty || !Number.isFinite(n)) return false
      const v = Number(c.value)
      switch (c.op) {
        case 'eq': return n === v
        case 'ne': return n !== v
        case 'gt': return n > v
        case 'ge': return n >= v
        case 'lt': return n < v
        case 'le': return n <= v
        case 'between': return n >= v && n <= Number(c.to)
      }
      return true
    }
    case 'bool': return Boolean(raw) === (c.op === 'yes')
  }
}

function groupMatches(group: FilterGroup, fields: Map<string, FilterField>, read: (key: string) => unknown, today: string): boolean {
  const results = group.items.flatMap((item) => {
    if (item.type === 'group') return item.items.length ? [groupMatches(item, fields, read, today)] : []
    const field = fields.get(item.field)
    return field && !conditionProblem(item, field) ? [conditionMatches(item, field, read(field.key), today)] : []
  })
  if (!results.length) return true
  return group.logic === 'or' ? results.some(Boolean) : results.every(Boolean)
}

/** Dia de hoje em America/Sao_Paulo (`AAAA-MM-DD`). */
export const todaySaoPaulo = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/**
 * Filtra uma linha em memória. Use só quando o conjunto inteiro está carregado (vitrine, listas pequenas locais):
 * filtrar apenas a página carregada esconde registros sem avisar (§10.9.2).
 */
export function matchesFilters<Row>(row: Row, filters: TableFilters, fields: FilterField[], read: (row: Row, key: string) => unknown, today = todaySaoPaulo()): boolean {
  const map = fieldMap(fields)
  const get = (key: string) => read(row, key)
  for (const c of Object.values(filters.quick)) {
    const field = map.get(c.field)
    if (field && !conditionProblem(c, field) && !conditionMatches(c, field, get(field.key), today)) return false
  }
  return groupMatches(filters.advanced, map, get, today)
}

// ---------- Edição da árvore (imutável) ----------

export function updateNode(group: FilterGroup, id: string, update: (node: FilterCondition | FilterGroup) => FilterCondition | FilterGroup | null): FilterGroup {
  const items = group.items.flatMap((item) => {
    if (item.id === id) {
      const next = update(item)
      return next ? [next] : []
    }
    return item.type === 'group' ? [updateNode(item, id, update)] : [item]
  })
  return { ...group, items }
}

export const removeNode = (group: FilterGroup, id: string) => updateNode(group, id, () => null)

export function appendTo(group: FilterGroup, parentId: string, node: FilterCondition | FilterGroup): FilterGroup {
  if (group.id === parentId) return { ...group, items: [...group.items, node] }
  return { ...group, items: group.items.map((item) => (item.type === 'group' ? appendTo(item, parentId, node) : item)) }
}
