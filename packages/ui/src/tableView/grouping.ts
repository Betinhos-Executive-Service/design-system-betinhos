import type { ViewGroup } from './config'
import type { FilterField, FilterKind } from './filters'

/** Agrupamento da lista em um nível (Design System §10.9.1): quais campos agrupam e como as linhas se dividem. */

/** Acima disto, os grupos de relação (lookup) mostram os maiores e juntam o resto em "Outros". */
export const GROUP_LIMIT = 50
export const OTHERS_GROUP_ID = '\u0000outros'
export const EMPTY_GROUP_ID = ''

const GROUPABLE: ReadonlySet<FilterKind> = new Set(['choice', 'lookup', 'bool', 'date'])

/** Campos que entram em "Agrupar por": escolha, relação, Sim/Não e datas. */
export const groupableFields = (fields: FilterField[]) => fields.filter((f) => GROUPABLE.has(f.kind))

export type RowGroup<Row> = { id: string; label: string; rows: Row[] }

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const spDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Dia (AAAA-MM-DD) no fuso de São Paulo. Texto com hora e fuso (o Dataverse manda em UTC: "…T02:00:00Z") é convertido; sem fuso, vale como está. */
function dayOf(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(value)) value = new Date(value)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : spDay.format(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return null
}

const firstValue = (raw: unknown) => {
  const list = (Array.isArray(raw) ? raw : [raw]).filter((x) => x != null && x !== '')
  return list.length ? String(list[0]) : null
}

/**
 * Divide as linhas (já filtradas e ordenadas: a ordem dentro de cada grupo é mantida) pelo agrupamento da visão.
 * `null` quando não há agrupamento ou o campo não agrupa nesta tela. Escolha segue a ordem das opções; Sim antes de Não;
 * data do período mais recente ao mais antigo; relação do maior grupo ao menor, com até `GROUP_LIMIT` grupos e o resto
 * em "Outros". Linhas sem valor ficam em "Vazio", no fim. Escolha múltipla entra no grupo do primeiro valor.
 * `labelOf` dá o rótulo da relação a partir da linha (sem ele, o valor lido).
 */
export function groupRows<Row>(
  rows: Row[],
  group: ViewGroup | null | undefined,
  fields: FilterField[],
  read: (row: Row, key: string) => unknown,
  labelOf?: (row: Row, key: string) => string,
): RowGroup<Row>[] | null {
  const field = group ? groupableFields(fields).find((f) => f.key === group.key) : undefined
  if (!group || !field) return null
  const byYear = field.kind === 'date' && group.by === 'year'
  const buckets = new Map<string, RowGroup<Row>>()
  const empty: RowGroup<Row> = { id: EMPTY_GROUP_ID, label: 'Vazio', rows: [] }

  for (const row of rows) {
    const raw = read(row, field.key)
    const day = field.kind === 'date' ? dayOf(raw) : null
    const id = field.kind === 'date' ? (day ? day.slice(0, byYear ? 4 : 7) : null)
      : field.kind === 'bool' ? (raw == null || raw === '' ? null : raw === false || raw === 0 || raw === '0' || raw === 'false' ? '0' : '1')
      : firstValue(raw)
    if (id == null) { empty.rows.push(row); continue }
    const bucket = buckets.get(id)
    if (bucket) { bucket.rows.push(row); continue }
    const option = field.options?.find((o) => o.value === id)?.label
    const label = field.kind === 'date' ? (byYear ? id : `${MONTHS[Number(id.slice(5, 7)) - 1]} de ${id.slice(0, 4)}`)
      : field.kind === 'bool' ? option ?? (id === '1' ? 'Sim' : 'Não')
      : option ?? labelOf?.(row, field.key) ?? id
    buckets.set(id, { id, label, rows: [row] })
  }

  let list = [...buckets.values()]
  if (field.kind === 'date') list.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  else if (field.kind === 'bool') list.sort((a, b) => b.id.localeCompare(a.id))
  else if (field.kind === 'choice') {
    const order = new Map((field.options ?? []).map((o, i) => [o.value, i]))
    list.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.label.localeCompare(b.label, 'pt-BR'))
  } else {
    list.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label, 'pt-BR'))
    if (list.length > GROUP_LIMIT) {
      const rest = list.slice(GROUP_LIMIT)
      const inRest = new Set(rest.flatMap((g) => g.rows))
      list = [...list.slice(0, GROUP_LIMIT), { id: OTHERS_GROUP_ID, label: `Outros (${rest.length})`, rows: rows.filter((r) => inRest.has(r)) }]
    }
  }
  return empty.rows.length ? [...list, empty] : list
}
