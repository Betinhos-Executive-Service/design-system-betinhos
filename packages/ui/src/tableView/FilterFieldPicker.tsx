import { useId, useState, type KeyboardEvent } from 'react'
import { FilterPopover } from './FilterPopover'
import type { FilterField } from './filters'

export type FilterFieldPickerProps = {
  anchor: HTMLElement | null
  fields: FilterField[]
  onPick: (field: FilterField) => void
  onClose: () => void
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Seletor de campo do painel "Filtros" (§10.9.2): busca, "Colunas da tabela" e "Outros campos" (com a relação). */
export function FilterFieldPicker({ anchor, fields, onPick, onClose }: FilterFieldPickerProps) {
  const id = useId()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const q = plain(text.trim())
  const match = fields.filter((f) => !q || plain(f.label).includes(q) || (f.relation ? plain(f.relation).includes(q) : false))
  const sections = [
    { title: 'Colunas da tabela', items: match.filter((f) => !f.relation) },
    { title: 'Outros campos', items: match.filter((f) => f.relation) },
  ].filter((s) => s.items.length)
  const list = sections.flatMap((s) => s.items)
  const current = Math.min(active, list.length - 1)
  const optionId = (index: number) => `${id}-op-${index}`

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (list.length) setActive((current + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (list[current]) onPick(list[current])
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); onClose(); anchor?.focus()
    }
  }

  let index = -1
  return (
    <FilterPopover anchor={anchor} label="Escolher campo" onClose={onClose} className="bt-fpick">
      <input
        className="bt-fpick__search"
        type="search"
        autoFocus
        placeholder="Buscar campo…"
        aria-label="Buscar campo"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={list.length ? optionId(current) : undefined}
        value={text}
        onChange={(event) => { setText(event.target.value); setActive(0) }}
        onKeyDown={onKeyDown}
      />
      <div id={`${id}-list`} role="listbox" aria-label="Campos" className="bt-fpick__list">
        {sections.map((section) => (
          <div key={section.title} role="group" aria-label={section.title} className="bt-fpick__section">
            <div className="bt-fpick__title" aria-hidden="true">{section.title}</div>
            {section.items.map((field) => {
              index += 1
              const mine = index
              return (
                <div
                  key={field.key}
                  id={optionId(mine)}
                  role="option"
                  aria-selected={mine === current}
                  className={mine === current ? 'bt-fpick__item is-active' : 'bt-fpick__item'}
                  onPointerMove={() => setActive(mine)}
                  onClick={() => onPick(field)}
                >
                  <span className="bt-fpick__label">{field.label}</span>
                  {field.relation ? <span className="bt-fpick__relation">{field.relation}</span> : null}
                </div>
              )
            })}
          </div>
        ))}
        {list.length ? null : <p className="bt-fpick__empty">Nenhum campo encontrado.</p>}
      </div>
    </FilterPopover>
  )
}
