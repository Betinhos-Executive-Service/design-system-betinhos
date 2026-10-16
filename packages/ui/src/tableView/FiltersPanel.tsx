import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Drawer } from '../components/Drawer'
import { SegmentedControl } from '../components/SegmentedControl'
import { Select, type SelectOption } from '../components/Select'
import { Sheet } from '../components/Sheet'
import { Tabs } from '../components/Tabs'
import { useMediaQuery } from '../useMediaQuery'
import { FilterValueEditor, QuickFilterCell, type LookupSearch } from './FilterEditors'
import {
  appendTo, conditionProblem, countIncomplete, emptyFilters, FILTER_OPS, MAX_GROUP_DEPTH, newCondition, newGroup, removeNode, updateNode,
  type FilterCondition, type FilterField, type FilterGroup, type TableFilters,
} from './filters'

export type FiltersPanelTab = 'coluna' | 'avancado'

export type FiltersPanelProps = {
  open: boolean
  onClose: () => void
  fields: FilterField[]
  /** Filtros na tela; o painel edita um rascunho. */
  value: TableFilters
  onApply: (filters: TableFilters) => void
  search?: LookupSearch
  /** Quando a fonte conta sem custo: resultado previsto no "Aplicar" (§10.9.2). `null` = não mostra. */
  countPreview?: (filters: TableFilters) => Promise<number | null>
  /** Aba ao abrir (o chip de um filtro avançado abre direto nela). */
  initialTab?: FiltersPanelTab
}

const icon = (d: string) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const PLUS = 'M12 5v14M5 12h14'
const X = 'M18 6 6 18M6 6l12 12'
const same = (a: TableFilters, b: TableFilters) => JSON.stringify(a) === JSON.stringify(b)

/** Painel "Filtros" (§10.9.2): Drawer largo no desktop, Sheet no mobile; só vale em "Aplicar". */
export function FiltersPanel({ open, onClose, fields, value, onApply, search, countPreview, initialTab = 'coluna' }: FiltersPanelProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const [draft, setDraft] = useState(value)
  const [tab, setTab] = useState<FiltersPanelTab>(initialTab)
  const [confirming, setConfirming] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const [preview, setPreview] = useState<number | null>(null)

  // Cada abertura começa do que está na tela.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setDraft(value); setTab(initialTab); setPreview(null) }
  }

  useEffect(() => {
    if (!open || !countPreview) return
    let live = true
    const timer = window.setTimeout(() => { countPreview(draft).then((n) => { if (live) setPreview(n) }).catch(() => { if (live) setPreview(null) }) }, 400)
    return () => { live = false; window.clearTimeout(timer) }
  }, [open, draft, countPreview])

  const changed = !same(draft, value)
  const incomplete = countIncomplete(draft.advanced, fields)
  const requestClose = () => (changed ? setConfirming(true) : onClose())
  const apply = () => { onApply(draft); onClose() }

  const footer = (
    <div className="bt-filters__footer">
      <Button variant="ghost" onClick={() => setDraft(emptyFilters())}>Limpar tudo</Button>
      <span className="bt-filters__footer-end">
        {incomplete ? <span className="bt-filters__note">{incomplete === 1 ? '1 condição incompleta será ignorada' : `${incomplete} condições incompletas serão ignoradas`}</span> : null}
        <Button variant="secondary" onClick={requestClose}>Cancelar</Button>
        <Button onClick={apply} disabled={!changed}>{preview != null ? `Aplicar · ${preview.toLocaleString('pt-BR')} ${preview === 1 ? 'registro' : 'registros'}` : 'Aplicar'}</Button>
      </span>
    </div>
  )

  const quickFields = fields.filter((f) => !f.advancedOnly)
  const body = (
    <Tabs
      aria-label="Tipo de filtro"
      value={tab}
      onChange={setTab}
      tabs={[
        { value: 'coluna', label: 'Por coluna', badge: Object.keys(draft.quick).length || undefined },
        { value: 'avancado', label: 'Avançado', badge: draft.advanced.items.length || undefined },
      ]}
    >
      {tab === 'coluna' ? (
        <ul className="bt-filters__quick" aria-label="Filtros por coluna">
          {quickFields.map((field) => (
            <li key={field.key} className={['bt-filters__quick-item', 'bt-quick', draft.quick[field.key] && 'is-active'].filter(Boolean).join(' ')}>
              <span className="bt-filters__quick-label">{field.label}</span>
              <QuickFilterCell
                field={field}
                value={draft.quick[field.key]}
                search={search}
                onChange={(condition) => setDraft((d) => {
                  const quick = { ...d.quick }
                  if (condition) quick[field.key] = condition
                  else delete quick[field.key]
                  return { ...d, quick }
                })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <GroupEditor group={draft.advanced} depth={1} fields={fields} search={search} onChange={(advanced) => setDraft((d) => ({ ...d, advanced }))} />
      )}
    </Tabs>
  )

  return (
    <>
      {/* O conteúdo só existe aberto: fechado, os editores de todos os campos pesariam na lista e duplicariam os da linha rápida. */}
      {mobile
        ? <Sheet open={open} onClose={requestClose} title="Filtros" footer={footer}>{open ? body : null}</Sheet>
        : <Drawer open={open} onClose={requestClose} title="Filtros" size="wide" footer={footer}>{open ? body : null}</Drawer>}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setConfirming(false); onClose() }}>Descartar</Button>
        </>}
      >
        As mudanças nos filtros ainda não foram aplicadas.
      </Dialog>
    </>
  )
}

type GroupProps = { group: FilterGroup; depth: number; fields: FilterField[]; search?: LookupSearch; onChange: (group: FilterGroup) => void; onRemove?: () => void }

/** Grupo E/OU com suas condições; o segundo nível não oferece "+ Grupo" (§10.9.2). */
function GroupEditor({ group, depth, fields, search, onChange, onRemove }: GroupProps) {
  const add = (node: FilterCondition | FilterGroup) => onChange(appendTo(group, group.id, node))
  return (
    <section className={depth === 1 ? 'bt-filters__group bt-filters__group--root' : 'bt-filters__group'} aria-label={depth === 1 ? 'Condições' : 'Grupo de condições'}>
      <header className="bt-filters__group-head">
        <SegmentedControl
          size="compact"
          aria-label="Combinar condições com"
          value={group.logic}
          onChange={(logic) => onChange({ ...group, logic })}
          options={[{ value: 'and', label: 'E: todas' }, { value: 'or', label: 'OU: qualquer' }]}
        />
        {onRemove ? <Button variant="ghost" size="compact" icon={icon(X)} aria-label="Remover grupo" onClick={onRemove} /> : null}
      </header>
      {group.items.length === 0 ? <p className="bt-filters__empty">Nenhuma condição. Use "+ Condição" para começar.</p> : null}
      <ul className="bt-filters__items">
        {group.items.map((item) => (
          <li key={item.id}>
            {item.type === 'group' ? (
              <GroupEditor
                group={item}
                depth={depth + 1}
                fields={fields}
                search={search}
                onChange={(next) => onChange(updateNode(group, item.id, () => next))}
                onRemove={() => onChange(removeNode(group, item.id))}
              />
            ) : (
              <ConditionRow
                condition={item}
                fields={fields}
                search={search}
                onChange={(next) => onChange(updateNode(group, item.id, () => next))}
                onRemove={() => onChange(removeNode(group, item.id))}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="bt-filters__add">
        <Button variant="secondary" size="compact" icon={icon(PLUS)} disabled={!fields.length} onClick={() => add(newCondition(fields[0]))}>Condição</Button>
        {depth < MAX_GROUP_DEPTH ? <Button variant="ghost" size="compact" icon={icon(PLUS)} disabled={!fields.length} onClick={() => add({ ...newGroup('or'), items: [newCondition(fields[0])] })}>Grupo</Button> : null}
      </div>
    </section>
  )
}

type RowProps = { condition: FilterCondition; fields: FilterField[]; search?: LookupSearch; onChange: (condition: FilterCondition) => void; onRemove: () => void }

/** Campo, operador e valor; incompleta fica marcada com o que falta (§10.9.2). */
function ConditionRow({ condition, fields, search, onChange, onRemove }: RowProps) {
  const field = fields.find((f) => f.key === condition.field)
  const problem = conditionProblem(condition, field)
  const fieldOptions: SelectOption[] = fields.map((f) => ({ value: f.key, label: f.label, group: f.relation }))
  const opOptions: SelectOption[] = field ? FILTER_OPS[field.kind].map((o) => ({ value: o.op, label: o.label })) : []
  return (
    <div className={problem ? 'bt-filters__row is-invalid' : 'bt-filters__row'}>
      <div className="bt-filters__row-controls">
        <Select
          aria-label="Campo"
          searchable={fields.length > 7}
          clearable={false}
          options={fieldOptions}
          value={condition.field}
          onChange={(key) => {
            const next = fields.find((f) => f.key === key)
            if (next) onChange({ ...newCondition(next), id: condition.id })
          }}
        />
        <Select
          aria-label="Operador"
          searchable={false}
          clearable={false}
          options={opOptions}
          value={condition.op}
          onChange={(op) => op && onChange({ ...condition, op: op as FilterCondition['op'], value: undefined, to: undefined })}
        />
        {field ? <FilterValueEditor field={field} condition={condition} search={search} invalid={Boolean(problem)} onChange={onChange} /> : null}
        <Button variant="ghost" size="compact" icon={icon(X)} aria-label="Remover condição" onClick={onRemove} />
      </div>
      {problem ? <p className="bt-filters__problem" role="status">{problem}</p> : null}
    </div>
  )
}
