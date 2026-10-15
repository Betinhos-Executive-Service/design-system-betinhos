import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field, Input } from '../components/Field'
import { Select, type SelectOption } from '../components/Select'
import {
  DATE_PRESETS, FILTER_OPS, parseNumberBR, parseQuickNumber, parseQuickText, quickNumberOf, quickTextOf,
  type FilterCondition, type FilterField, type FilterOption,
} from './filters'

/** Busca remota de lookup: devolve as opções que casam com o texto (mínimo de 2 caracteres, §10.9.2). */
export type LookupSearch = (field: FilterField, text: string) => Promise<FilterOption[]>

const QUICK_DELAY = 300
const label = (field: FilterField, op: string) => FILTER_OPS[field.kind].find((o) => o.op === op)?.label ?? op

/** Opções do lookup: busca no servidor a partir de 2 caracteres, sem perder as já escolhidas. */
function useLookupOptions(field: FilterField, selected: FilterOption[], search?: LookupSearch) {
  const [found, setFound] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const onSearchChange = (text: string) => {
    const id = ++seq.current
    if (!search || text.trim().length < 2) { setFound([]); setLoading(false); return }
    setLoading(true)
    search(field, text.trim()).then((options) => { if (id === seq.current) setFound(options) }).catch(() => { if (id === seq.current) setFound([]) }).finally(() => { if (id === seq.current) setLoading(false) })
  }
  const merged = [...selected, ...found.filter((o) => !selected.some((s) => s.value === o.value))]
  return { options: merged.map((o): SelectOption => ({ value: o.value, label: o.label })), loading, onSearchChange }
}

const pick = (options: FilterOption[], values: string[]) => values.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v })

// ---------- Célula do filtro rápido ----------

type QuickProps = {
  field: FilterField
  value: FilterCondition | undefined
  onChange: (condition: FilterCondition | null) => void
  search?: LookupSearch
}

/** Campo de texto com espera de 300 ms; Enter aplica na hora, Esc limpa (§10.9.2). */
function QuickTyped({ field, value, onChange, parse, show }: QuickProps & { parse: (field: string, text: string) => FilterCondition | null; show: (c: FilterCondition | undefined) => string }) {
  const [text, setText] = useState(show(value))
  const timer = useRef<number | undefined>(undefined)
  const applied = show(value)
  // Valor aplicado por fora (chip removido, visão trocada) sobrescreve o que está no campo.
  useEffect(() => { setText(applied) }, [applied])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const commit = (next: string) => {
    window.clearTimeout(timer.current)
    const condition = parse(field.key, next)
    if (show(condition ?? undefined) !== applied || (!condition && applied)) onChange(condition)
  }
  return (
    <Input
      size="compact"
      className="bt-quick__input"
      value={text}
      inputMode={field.kind === 'number' ? 'decimal' : undefined}
      placeholder={field.kind === 'number' ? '≥ 0' : 'Filtrar'}
      aria-label={`Filtrar ${field.label}`}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => commit(next), QUICK_DELAY)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(text) }
        if (event.key === 'Escape' && text) { event.preventDefault(); event.stopPropagation(); setText(''); commit('') }
      }}
    />
  )
}

function QuickList({ field, value, onChange, search }: QuickProps) {
  const selected = value?.op === 'in' ? value.values ?? [] : []
  const lookup = useLookupOptions(field, selected, search)
  const options = field.kind === 'lookup' ? lookup.options : (field.options ?? []).map((o) => ({ value: o.value, label: o.label }))
  const source = field.kind === 'lookup' ? [...selected, ...lookup.options.map((o) => ({ value: o.value, label: o.label }))] : field.options ?? []
  return (
    <Select
      multiple
      size="compact"
      className="bt-quick__select"
      aria-label={`Filtrar ${field.label}`}
      placeholder="Todos"
      searchable={field.kind === 'lookup' || (field.options?.length ?? 0) > 7}
      onSearchChange={field.kind === 'lookup' ? lookup.onSearchChange : undefined}
      loading={field.kind === 'lookup' ? lookup.loading : undefined}
      emptyText={field.kind === 'lookup' ? 'Digite 2 letras para buscar' : undefined}
      options={options}
      value={selected.map((v) => v.value)}
      onChange={(values) => onChange(values.length ? { type: 'condition', id: `rapido-${field.key}`, field: field.key, op: 'in', values: pick(source, values) } : null)}
    />
  )
}

function QuickBool({ field, value, onChange }: QuickProps) {
  const yes = field.options?.find((o) => o.value === '1')?.label ?? 'Sim'
  const no = field.options?.find((o) => o.value === '0')?.label ?? 'Não'
  return (
    <Select
      size="compact"
      className="bt-quick__select"
      aria-label={`Filtrar ${field.label}`}
      placeholder="Todos"
      searchable={false}
      options={[{ value: 'yes', label: yes }, { value: 'no', label: no }]}
      value={value ? String(value.op) : null}
      onChange={(next) => onChange(next ? { type: 'condition', id: `rapido-${field.key}`, field: field.key, op: next as 'yes' | 'no' } : null)}
    />
  )
}

function QuickDate({ field, value, onChange }: QuickProps) {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const options: SelectOption[] = [...DATE_PRESETS.map((op) => ({ value: op, label: label(field, op) })), { value: 'between', label: 'Intervalo…' }]
  const current = value ? String(value.op) : null
  return (
    <>
      <Select
        size="compact"
        className="bt-quick__select"
        aria-label={`Filtrar ${field.label}`}
        placeholder="Qualquer data"
        searchable={false}
        options={value?.op === 'between' ? options.map((o) => (o.value === 'between' ? { ...o, label: `${String(value.value).split('-').reverse().join('/')} a ${String(value.to).split('-').reverse().join('/')}` } : o)) : options}
        value={current}
        onChange={(next) => {
          if (next === 'between') { setRange({ from: typeof value?.value === 'string' ? value.value : '', to: typeof value?.to === 'string' ? value.to : '' }); return }
          onChange(next ? { type: 'condition', id: `rapido-${field.key}`, field: field.key, op: next as FilterCondition['op'] } : null)
        }}
      />
      <Dialog
        open={range !== null}
        onClose={() => setRange(null)}
        title={`${field.label}: intervalo`}
        actions={<>
          <Button variant="secondary" onClick={() => setRange(null)}>Cancelar</Button>
          <Button disabled={!range?.from || !range?.to} onClick={() => {
            if (!range) return
            const [from, to] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from]
            onChange({ type: 'condition', id: `rapido-${field.key}`, field: field.key, op: 'between', value: from, to })
            setRange(null)
          }}>Aplicar</Button>
        </>}
      >
        <div className="bt-filters__range">
          <Field label="De"><Input type="date" value={range?.from ?? ''} onChange={(event) => setRange((r) => (r ? { ...r, from: event.target.value } : r))} /></Field>
          <Field label="Até"><Input type="date" value={range?.to ?? ''} onChange={(event) => setRange((r) => (r ? { ...r, to: event.target.value } : r))} /></Field>
        </div>
      </Dialog>
    </>
  )
}

/** Uma célula da linha de filtro rápido, com o controle do tipo da coluna (§10.9.2). */
export function QuickFilterCell(props: QuickProps) {
  switch (props.field.kind) {
    case 'text': return <QuickTyped {...props} parse={parseQuickText} show={quickTextOf} />
    case 'number': return <QuickTyped {...props} parse={parseQuickNumber} show={quickNumberOf} />
    case 'choice': case 'lookup': return <QuickList {...props} />
    case 'date': return <QuickDate {...props} />
    case 'bool': return <QuickBool {...props} />
  }
}

// ---------- Editor de valor do painel ----------

type ValueProps = {
  field: FilterField
  condition: FilterCondition
  onChange: (condition: FilterCondition) => void
  search?: LookupSearch
  invalid?: boolean
}

function NumberInput({ value, onChange, invalid, label: aria }: { value: unknown; onChange: (n: number | undefined) => void; invalid?: boolean; label: string }) {
  const [text, setText] = useState(typeof value === 'number' ? String(value).replace('.', ',') : '')
  return <Input inputMode="decimal" invalid={invalid} aria-label={aria} value={text} onChange={(event) => { setText(event.target.value); onChange(parseNumberBR(event.target.value) ?? undefined) }} />
}

function ListValue({ field, condition, onChange, search, invalid }: ValueProps) {
  const selected = condition.values ?? []
  const lookup = useLookupOptions(field, selected, search)
  const options = field.kind === 'lookup' ? lookup.options : (field.options ?? []).map((o) => ({ value: o.value, label: o.label }))
  const source = field.kind === 'lookup' ? [...selected, ...lookup.options.map((o) => ({ value: o.value, label: o.label }))] : field.options ?? []
  return (
    <Select
      multiple
      invalid={invalid}
      aria-label={`Valores de ${field.label}`}
      placeholder="Escolha"
      searchable
      onSearchChange={field.kind === 'lookup' ? lookup.onSearchChange : undefined}
      loading={field.kind === 'lookup' ? lookup.loading : undefined}
      emptyText={field.kind === 'lookup' ? 'Digite 2 letras para buscar' : undefined}
      options={options}
      value={selected.map((v) => v.value)}
      onChange={(values) => onChange({ ...condition, values: pick(source, values) })}
    />
  )
}

/** Valor da condição no painel avançado, conforme o tipo do campo e o operador. Nada quando o operador não pede valor. */
export function FilterValueEditor(props: ValueProps) {
  const { field, condition, onChange, invalid } = props
  const op = condition.op
  if (['empty', 'not-empty', 'yes', 'no', ...DATE_PRESETS].includes(op)) return null
  switch (field.kind) {
    case 'text':
      return <Input invalid={invalid} aria-label={`Texto de ${field.label}`} value={typeof condition.value === 'string' ? condition.value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
    case 'choice': case 'lookup':
      return <ListValue {...props} />
    case 'date':
      return op === 'between' ? (
        <span className="bt-filters__pair">
          <Input type="date" invalid={invalid} aria-label={`${field.label}: de`} value={typeof condition.value === 'string' ? condition.value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
          <Input type="date" invalid={invalid} aria-label={`${field.label}: até`} value={typeof condition.to === 'string' ? condition.to : ''} onChange={(event) => onChange({ ...condition, to: event.target.value })} />
        </span>
      ) : <Input type="date" invalid={invalid} aria-label={`Data de ${field.label}`} value={typeof condition.value === 'string' ? condition.value : ''} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
    case 'number':
      return op === 'between' ? (
        <span className="bt-filters__pair">
          <NumberInput invalid={invalid} label={`${field.label}: de`} value={condition.value} onChange={(n) => onChange({ ...condition, value: n })} />
          <NumberInput invalid={invalid} label={`${field.label}: até`} value={condition.to} onChange={(n) => onChange({ ...condition, to: n })} />
        </span>
      ) : <NumberInput invalid={invalid} label={`Valor de ${field.label}`} value={condition.value} onChange={(n) => onChange({ ...condition, value: n })} />
    case 'bool':
      return null
  }
}
