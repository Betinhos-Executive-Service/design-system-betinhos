import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Checkbox } from '../components/Choice'
import { Input } from '../components/Field'
import { Menu, type MenuAction } from '../components/Menu'
import { FilterFieldPicker } from './FilterFieldPicker'
import { FilterPopover } from './FilterPopover'
import { FilterValueEditor, type LookupSearch } from './FilterEditors'
import {
  DATE_PRESETS, FILTER_OPS, conditionProblem, fieldLabel, needsValue, newCondition, parseNumberBR,
  type FilterCondition, type FilterField, type FilterOp,
} from './filters'

export type FilterRowProps = {
  condition: FilterCondition
  fields: FilterField[]
  search?: LookupSearch
  /** Abre o seletor de campo ou o editor de valor ao montar (linha recém-criada). */
  autoOpen?: 'field' | 'value'
  onChange: (next: FilterCondition) => void
  /** `viaPointer`: clique no × (anima a saída); teclado e menu removem na hora. */
  onRemove: (viaPointer?: boolean) => void
  onDuplicate: () => void
  /** "Colocar num grupo"; ausente dentro de grupo. */
  onWrap?: () => void
}

const EMPTY_OPS = new Set<FilterOp>(['empty', 'not-empty'])
const NUMBER = new Intl.NumberFormat('pt-BR')
const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (day: unknown) => (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : '')
const opLabel = (field: FilterField, op: FilterOp) => FILTER_OPS[field.kind].find((o) => o.op === op)?.label ?? op

/** Só o valor da condição ("Pendente, Aprovado", "R$ 1.000,00", "01/11/2026 a 15/11/2026"); vazio quando falta. */
export function conditionValueText(c: FilterCondition, field: FilterField): string {
  if (!needsValue(c.op) || conditionProblem(c, field)) return ''
  const num = (n: unknown) => (typeof n === 'number' ? (field.money ? MONEY.format(n) : NUMBER.format(n)) : '')
  switch (field.kind) {
    case 'text': return String(c.value ?? '')
    case 'choice': case 'lookup': return (c.values ?? []).map((v) => field.options?.find((o) => o.value === v.value)?.label ?? v.label).join(', ')
    case 'date': return c.op === 'between' ? `${brDate(c.value)} a ${brDate(c.to)}` : brDate(c.value)
    case 'number': return c.op === 'between' ? `${num(c.value)} e ${num(c.to)}` : num(c.value)
    case 'bool': return ''
  }
}

/** A condição como frase: "Status é um de Pendente, Aprovado". */
export function conditionSentence(c: FilterCondition, fields: FilterField[]): string {
  const field = fields.find((f) => f.key === c.field)
  if (!field) return c.field
  return [fieldLabel(field), opLabel(field, c.op), conditionValueText(c, field)].filter(Boolean).join(' ')
}

/** Novo operador: mantém o valor quando o novo também pede valor; `to` só fica em "entre". */
function withOp(c: FilterCondition, op: FilterOp): FilterCondition {
  if (!needsValue(op)) return { type: 'condition', id: c.id, field: c.field, op }
  const next: FilterCondition = { ...c, op }
  if (op !== 'between') delete next.to
  return next
}

/** Novo campo: do mesmo tipo mantém operador e valor; de outro tipo volta ao operador padrão. */
function withField(c: FilterCondition, from: FilterField | undefined, to: FilterField): FilterCondition {
  if (from?.kind === to.kind && to.kind !== 'choice' && to.kind !== 'lookup') return { ...c, field: to.key }
  if (from?.kind === to.kind) return { ...c, field: to.key, values: from.key === to.key ? c.values : undefined }
  return { ...newCondition(to), id: c.id }
}

type Open = 'field' | 'value' | null

/** Uma condição do painel "Filtros" (§10.9.2) em forma de frase: campo, operador e valor, cada um editável. */
export function FilterRow({ condition, fields, search, autoOpen, onChange, onRemove, onDuplicate, onWrap }: FilterRowProps) {
  const field = fields.find((f) => f.key === condition.field)
  const [open, setOpen] = useState<Open>(autoOpen ?? null)
  const fieldRef = useRef<HTMLButtonElement>(null)
  const valueRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [anchors, setAnchors] = useState<{ field: HTMLElement | null; value: HTMLElement | null }>({ field: null, value: null })
  useEffect(() => { setAnchors({ field: fieldRef.current, value: valueRef.current }) }, [open])

  const sentence = conditionSentence(condition, fields)
  const valueText = field ? conditionValueText(condition, field) : ''
  const showValue = Boolean(field && needsValue(condition.op))

  const onBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onRemove(false) }
  }

  const opActions: MenuAction[] = field
    ? FILTER_OPS[field.kind].map((o) => ({
      id: o.op, label: o.label, selected: o.op === condition.op, group: EMPTY_OPS.has(o.op) ? '' : undefined,
      onSelect: () => {
        const next = withOp(condition, o.op)
        onChange(next)
        if (needsValue(o.op) && conditionProblem(next, field)) setOpen('value')
      },
    }))
    : []
  const moreActions: MenuAction[] = [
    { id: 'campo', label: 'Trocar campo', onSelect: () => setOpen('field') },
    { id: 'duplicar', label: 'Duplicar', onSelect: onDuplicate },
    ...(onWrap ? [{ id: 'grupo', label: 'Colocar num grupo', onSelect: onWrap }] : []),
    { id: 'remover', label: 'Remover', tone: 'danger' as const, group: '', onSelect: () => onRemove(false) },
  ]

  return (
    <div ref={boxRef} className="bt-frow" role="group" aria-label={sentence} tabIndex={0} onKeyDown={onBoxKeyDown}>
      <span className="bt-frow__phrase">
        <button ref={fieldRef} type="button" className="bt-frow__token bt-frow__token--field" aria-haspopup="dialog" aria-expanded={open === 'field'} onClick={() => setOpen(open === 'field' ? null : 'field')}>
          {field ? fieldLabel(field) : condition.field}
        </button>
        {field ? (
          <Menu
            align="start"
            actions={opActions}
            trigger={(props) => <button {...props} type="button" className="bt-frow__token bt-frow__token--op">{opLabel(field, condition.op)}</button>}
          />
        ) : null}
        {showValue ? (
          <button ref={valueRef} type="button" className={valueText ? 'bt-frow__token bt-frow__token--value' : 'bt-frow__token bt-frow__token--value is-empty'} aria-haspopup="dialog" aria-expanded={open === 'value'} onClick={() => setOpen(open === 'value' ? null : 'value')}>
            {valueText || 'escolha um valor'}
          </button>
        ) : null}
      </span>
      <span className="bt-frow__actions">
        <Menu
          actions={moreActions}
          trigger={(props) => (
            <button {...props} type="button" className="bt-frow__icon bt-frow__more" aria-label="Mais ações do filtro">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
          )}
        />
        <button type="button" className="bt-frow__icon" aria-label="Remover filtro" onClick={(event) => onRemove(event.detail > 0)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </span>
      {open === 'field' ? (
        <FilterFieldPicker
          anchor={anchors.field}
          fields={fields}
          onClose={() => setOpen(null)}
          onPick={(next) => {
            const changed = withField(condition, field, next)
            onChange(changed)
            setOpen(needsValue(changed.op) && conditionProblem(changed, next) ? 'value' : null)
          }}
        />
      ) : null}
      {open === 'value' && field && showValue ? (
        <FilterPopover anchor={anchors.value} label={`Valor de ${field.label}`} onClose={() => setOpen(null)} className="bt-fvalue">
          <ValueEditor field={field} condition={condition} search={search} onChange={onChange} onDone={() => { setOpen(null); (valueRef.current?.isConnected ? valueRef.current : boxRef.current)?.focus() }} />
        </FilterPopover>
      ) : null}
    </div>
  )
}

type ValueProps = { field: FilterField; condition: FilterCondition; search?: LookupSearch; onChange: (c: FilterCondition) => void; onDone: () => void }

/** Editor do valor por tipo: texto, número (R$ quando `money`), data com atalhos, escolha em checklist, relação com busca. */
function ValueEditor({ field, condition, search, onChange, onDone }: ValueProps) {
  const enter = (event: KeyboardEvent) => { if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); onDone() } }
  switch (field.kind) {
    case 'text':
      return <Input autoFocus aria-label={`Texto de ${field.label}`} value={typeof condition.value === 'string' ? condition.value : ''} onKeyDown={enter} onChange={(event) => onChange({ ...condition, value: event.target.value })} />
    case 'number':
      return (
        <div className={condition.op === 'between' ? 'bt-filters__pair' : undefined} onKeyDown={enter}>
          <NumberField autoFocus field={field} label={condition.op === 'between' ? `${field.label}: de` : `Valor de ${field.label}`} value={condition.value} onChange={(n) => onChange({ ...condition, value: n })} />
          {condition.op === 'between' ? <NumberField field={field} label={`${field.label}: até`} value={condition.to} onChange={(n) => onChange({ ...condition, to: n })} /> : null}
        </div>
      )
    case 'date':
      return (
        <div className="bt-fvalue__date" onKeyDown={enter}>
          <div className="bt-fvalue__presets" role="group" aria-label="Atalhos de data">
            {DATE_PRESETS.map((op) => (
              <button key={op} type="button" className="bt-fvalue__preset" onClick={() => { onChange(withOp(condition, op)); onDone() }}>{opLabel(field, op)}</button>
            ))}
          </div>
          <FilterValueEditor field={field} condition={condition} onChange={onChange} />
        </div>
      )
    case 'choice':
      return <ChoiceList field={field} condition={condition} onChange={onChange} />
    case 'lookup':
      return <FilterValueEditor field={field} condition={condition} search={search} onChange={onChange} />
    case 'bool':
      return null
  }
}

function NumberField({ field, label, value, onChange, autoFocus }: { field: FilterField; label: string; value: unknown; onChange: (n: number | undefined) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(typeof value === 'number' ? String(value).replace('.', ',') : '')
  return <Input autoFocus={autoFocus} inputMode="decimal" prefix={field.money ? 'R$' : undefined} aria-label={label} value={text} onChange={(event) => { setText(event.target.value); onChange(parseNumberBR(event.target.value) ?? undefined) }} />
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function ChoiceList({ field, condition, onChange }: Omit<ValueProps, 'onDone' | 'search'>) {
  const [text, setText] = useState('')
  const options = field.options ?? []
  const chosen = new Set((condition.values ?? []).map((v) => v.value))
  const shown = options.filter((o) => !text.trim() || plain(o.label).includes(plain(text.trim())))
  const toggle = (value: string) => {
    const next = chosen.has(value) ? [...chosen].filter((v) => v !== value) : [...chosen, value]
    onChange({ ...condition, values: options.filter((o) => next.includes(o.value)) })
  }
  return (
    <div className="bt-fvalue__choices">
      {options.length > 7 ? <Input autoFocus type="search" size="compact" placeholder="Buscar…" aria-label={`Buscar em ${field.label}`} value={text} onChange={(event) => setText(event.target.value)} /> : null}
      <div className="bt-fvalue__list" role="group" aria-label={`Valores de ${field.label}`}>
        {shown.map((o, index) => <Checkbox key={o.value} autoFocus={options.length <= 7 && index === 0} label={o.label} checked={chosen.has(o.value)} onChange={() => toggle(o.value)} />)}
        {shown.length ? null : <p className="bt-fpick__empty">Nada encontrado.</p>}
      </div>
    </div>
  )
}
