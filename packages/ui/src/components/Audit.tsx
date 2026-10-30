import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { icons } from '../tableView/icons'
import { Alert } from './Alert'
import { Button, type ButtonSize } from './Button'
import { Drawer } from './Drawer'
import { EmptyState } from './EmptyState'
import { Avatar, Skeleton } from './Misc'
import { SearchBox } from './SearchBox'
import { SegmentedControl } from './SegmentedControl'
import { Select, normalizeSearch, type SelectOption } from './Select'
import { StatusBadge, type StatusTone } from './StatusBadge'

export type AuditOperation = 'create' | 'update' | 'delete' | 'other'

/** Um campo alterado; valores já formatados para leitura (rótulo da opção, nome do lookup, data local). `null` = vazio. */
export type AuditChange = { field: string; label: string; before: string | null; after: string | null }

export type AuditEvent = {
  id: string
  /** ISO 8601. */
  at: string
  user: string
  operation: AuditOperation
  /** Nome da ação quando não é criação, alteração ou exclusão (ex.: "Compartilhamento"). */
  action?: string
  /** Registro do evento; aparece quando o painel mostra mais de um registro. */
  record?: { id: string; name: string }
  changes: AuditChange[]
}

/** `forbidden`: o perfil não tem "Exibir auditoria". `disabled`: a tabela não tem auditoria ligada. */
export type AuditStatus = 'loading' | 'ready' | 'error' | 'forbidden' | 'disabled'

export type AuditFilters = { query: string; user: string | null; field: string | null; operation: AuditOperation | 'all' }

export const EMPTY_AUDIT_FILTERS: AuditFilters = { query: '', user: null, field: null, operation: 'all' }

const ZONE = 'America/Sao_Paulo'
// Formatadores criados uma vez: a busca refiltra e redesenha a lista a cada tecla.
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' })
const FULL = new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, dateStyle: 'short', timeStyle: 'medium' })
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, day: 'numeric', month: 'long' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, day: 'numeric', month: 'long', year: 'numeric' })
const dayKey = (date: Date) => DAY_KEY.format(date)
const timeOf = (iso: string) => TIME.format(new Date(iso))
const fullDate = (iso: string) => FULL.format(new Date(iso))

/** "Hoje", "Ontem", "28 de outubro" ou "28 de outubro de 2025" (fuso de São Paulo). */
export function auditDayLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  const key = dayKey(date)
  const today = dayKey(now)
  if (key === today) return 'Hoje'
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return 'Ontem'
  return (key.slice(0, 4) === today.slice(0, 4) ? DAY_MONTH : DAY_MONTH_YEAR).format(date)
}

/** Agrupa por dia, mantendo a ordem recebida (mais nova primeiro). */
export function groupAuditByDay(events: AuditEvent[], now = new Date()) {
  const groups: { key: string; label: string; events: AuditEvent[] }[] = []
  for (const event of events) {
    const key = dayKey(new Date(event.at))
    const last = groups[groups.length - 1]
    if (last?.key === key) last.events.push(event)
    else groups.push({ key, label: auditDayLabel(event.at, now), events: [event] })
  }
  return groups
}

/** Filtra no que já foi carregado; a busca ignora acentos e olha usuário, registro, campo e valores. */
export function filterAuditEvents(events: AuditEvent[], filters: AuditFilters) {
  const tokens = normalizeSearch(filters.query).split(/\s+/).filter(Boolean)
  return events.filter((event) => {
    if (filters.operation !== 'all' && event.operation !== filters.operation) return false
    if (filters.user && event.user !== filters.user) return false
    if (filters.field && !event.changes.some((change) => change.field === filters.field)) return false
    if (!tokens.length) return true
    const text = normalizeSearch([event.user, event.action, event.record?.name, ...event.changes.flatMap((c) => [c.label, c.before, c.after])].filter(Boolean).join(' '))
    return tokens.every((token) => text.includes(token))
  })
}

/** Opções de usuário e campo tiradas dos eventos carregados, em ordem alfabética. */
export function auditFacets(events: AuditEvent[]) {
  const users = new Set<string>()
  const fields = new Map<string, string>()
  for (const event of events) {
    users.add(event.user)
    for (const change of event.changes) fields.set(change.field, change.label)
  }
  const byLabel = (a: SelectOption, b: SelectOption) => String(a.label).localeCompare(String(b.label), 'pt-BR')
  return {
    users: [...users].map((user): SelectOption => ({ value: user, label: user })).sort(byLabel),
    fields: [...fields].map(([value, label]): SelectOption => ({ value, label })).sort(byLabel),
  }
}

const OPERATION: Record<AuditOperation, { label: string; tone: StatusTone }> = {
  create: { label: 'Criou', tone: 'success' },
  update: { label: 'Alterou', tone: 'info' },
  delete: { label: 'Excluiu', tone: 'danger' },
  other: { label: 'Ação', tone: 'neutral' },
}

const OPERATION_FILTER = [
  { value: 'all', label: 'Todas' },
  { value: 'create', label: 'Criação' },
  { value: 'update', label: 'Alteração' },
  { value: 'delete', label: 'Exclusão' },
] as const

/** Campos mostrados antes de "Ver tudo"; valor com mais caracteres ou quebras de linha que isso pode passar das 3 linhas e também pede "Ver tudo". */
const VISIBLE_CHANGES = 5
const LONG_VALUE = 100
const LONG_LINES = 3
const isLong = (value: string | null) => value != null && (value.length > LONG_VALUE || value.split('\n').length > LONG_LINES)

function Value({ value, kind }: { value: string | null; kind: 'before' | 'after' }) {
  if (value == null || value === '') return <span className="bt-audit__value bt-audit__value--empty">vazio</span>
  return kind === 'before'
    ? <del className="bt-audit__value bt-audit__value--before">{value}</del>
    : <ins className="bt-audit__value bt-audit__value--after">{value}</ins>
}

function AuditEntry({ event, index, showRecord, onOpenRecord }: { event: AuditEvent; index: number; showRecord: boolean; onOpenRecord?: (record: { id: string; name: string }) => void }) {
  const [expanded, setExpanded] = useState(false)
  const op = OPERATION[event.operation]
  const long = event.changes.some((c) => isLong(c.before) || isLong(c.after))
  const collapsible = event.changes.length > VISIBLE_CHANGES || long
  const shown = expanded ? event.changes : event.changes.slice(0, VISIBLE_CHANGES)
  const hidden = event.changes.length - shown.length

  return (
    <li className={`bt-audit__event${expanded ? ' is-expanded' : ''}`} style={{ '--bt-audit-i': Math.min(index, 8) } as CSSProperties}>
      <div className="bt-audit__event-head">
        <Avatar name={event.user} size="sm" />
        <div className="bt-audit__who">
          <span className="bt-audit__user">{event.user}</span>
          <StatusBadge tone={op.tone}>{event.action ?? op.label}</StatusBadge>
          {showRecord && event.record ? (
            // Registro excluído não tem para onde abrir.
            onOpenRecord && event.operation !== 'delete'
              ? <button type="button" className="bt-audit__record" onClick={() => onOpenRecord(event.record!)}>{event.record.name}</button>
              : <span className="bt-audit__record bt-audit__record--static">{event.record.name}</span>
          ) : null}
        </div>
        <time className="bt-audit__time" dateTime={event.at} title={fullDate(event.at)}>{timeOf(event.at)}</time>
      </div>
      {event.changes.length ? (
        <dl className="bt-audit__changes">
          {shown.map((change) => (
            <div key={change.field} className="bt-audit__change">
              <dt>{change.label}</dt>
              <dd>
                {event.operation === 'create' ? null : <Value value={change.before} kind="before" />}
                {event.operation === 'create' || event.operation === 'delete' ? null : <span className="bt-audit__arrow" role="img" aria-label="para">{icons.arrowRight}</span>}
                {event.operation === 'delete' ? null : <Value value={change.after} kind="after" />}
              </dd>
            </div>
          ))}
        </dl>
      ) : event.operation === 'other' ? null : <p className="bt-audit__note">{event.operation === 'delete' ? 'Registro excluído.' : 'Sem campos registrados.'}</p>}
      {collapsible ? (
        <button type="button" className="bt-audit__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Ver menos' : hidden > 0 ? `Ver mais ${hidden} ${hidden === 1 ? 'campo' : 'campos'}` : 'Ver tudo'}
        </button>
      ) : null}
    </li>
  )
}

function Loading() {
  return (
    <div className="bt-audit__loading" role="status" aria-label="Carregando auditoria">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bt-audit__skeleton">
          <Skeleton shape="circle" width={28} height={28} />
          <div><Skeleton width="40%" /><Skeleton width="85%" /><Skeleton width="65%" /></div>
        </div>
      ))}
    </div>
  )
}

export type AuditPanelProps = {
  open: boolean
  onClose: () => void
  /** Padrão "Auditoria". */
  title?: ReactNode
  /** Tabela e alcance, ex.: "Despesas · 3 registros". */
  eyebrow?: ReactNode
  status: AuditStatus
  /** Mais nova primeiro. */
  events: AuditEvent[]
  error?: string
  onRetry?: () => void
  /** Há página seguinte no servidor. */
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  /** Mostra o nome do registro em cada evento (painel de uma tabela ou de vários registros). */
  showRecord?: boolean
  onOpenRecord?: (record: { id: string; name: string }) => void
}

/**
 * Auditoria (§10.9.4): linha do tempo de quem mudou o quê, agrupada por dia, com "antes → depois" por campo.
 * Só apresenta: quem chama busca os eventos, formata os valores e pagina.
 */
export function AuditPanel({ open, onClose, title = 'Auditoria', eyebrow, status, events, error, onRetry, hasMore, loadingMore, onLoadMore, showRecord = false, onOpenRecord }: AuditPanelProps) {
  const [filters, setFilters] = useState(EMPTY_AUDIT_FILTERS)
  useEffect(() => { if (open) setFilters(EMPTY_AUDIT_FILTERS) }, [open])

  const facets = useMemo(() => auditFacets(events), [events])
  const visible = useMemo(() => filterAuditEvents(events, filters), [events, filters])
  const groups = useMemo(() => groupAuditByDay(visible), [visible])
  const filtered = filters.query.trim() !== '' || filters.user != null || filters.field != null || filters.operation !== 'all'
  const set = (patch: Partial<AuditFilters>) => setFilters((current) => ({ ...current, ...patch }))

  let body: ReactNode
  if (status === 'loading') body = <Loading />
  else if (status === 'forbidden') body = (
    <EmptyState icon={icons.lock} title="Sem permissão para ver a auditoria">
      O seu perfil não tem o privilégio "Exibir auditoria". Peça ao administrador do sistema.
    </EmptyState>
  )
  else if (status === 'disabled') body = (
    <EmptyState icon={icons.history} title="Auditoria desligada nesta tabela">
      O Dataverse não registra as alterações desta tabela. Ligar a auditoria é uma mudança de configuração feita pela TI.
    </EmptyState>
  )
  else if (status === 'error') body = (
    <Alert tone="danger" title="Não foi possível carregar a auditoria" action={onRetry ? <Button variant="secondary" onClick={onRetry}>Tentar de novo</Button> : undefined}>
      {error ?? 'Tente de novo em instantes.'}
    </Alert>
  )
  else if (!events.length) body = (
    <EmptyState icon={icons.history} title="Nenhuma alteração registrada">
      Quando alguém criar, alterar ou excluir, o registro aparece aqui.
    </EmptyState>
  )
  else body = (
    <>
      <div className="bt-audit__filters">
        <SearchBox className="bt-audit__search" value={filters.query} onChange={(query) => set({ query })} placeholder="Buscar por usuário, campo ou valor" aria-label="Buscar na auditoria" />
        <Select className="bt-audit__select" aria-label="Usuário" placeholder="Todos os usuários" options={facets.users} value={filters.user} onChange={(user) => set({ user })} />
        <Select className="bt-audit__select" aria-label="Campo" placeholder="Todos os campos" options={facets.fields} value={filters.field} onChange={(field) => set({ field })} />
        <SegmentedControl aria-label="Operação" size="compact" options={[...OPERATION_FILTER]} value={filters.operation} onChange={(operation) => set({ operation })} />
      </div>
      <p className="bt-audit__count" aria-live="polite">
        {filtered ? `${visible.length} de ${events.length} ${events.length === 1 ? 'alteração carregada' : 'alterações carregadas'}` : `${events.length} ${events.length === 1 ? 'alteração' : 'alterações'}${hasMore ? ' carregadas' : ''}`}
      </p>
      {groups.length ? (
        <ol className="bt-audit__days">
          {groups.map((group) => (
            <li key={group.key} className="bt-audit__day">
              <h3 className="bt-audit__day-label">{group.label}</h3>
              <ol className="bt-audit__events">
                {group.events.map((event, index) => <AuditEntry key={event.id} event={event} index={index} showRecord={showRecord} onOpenRecord={onOpenRecord} />)}
              </ol>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState compact icon={icons.filterX} title="Nada corresponde aos filtros" action={<Button variant="secondary" onClick={() => setFilters(EMPTY_AUDIT_FILTERS)}>Limpar filtros</Button>}>
          {hasMore ? 'A busca vale para o que já foi carregado. Carregue mais para procurar em alterações antigas.' : undefined}
        </EmptyState>
      )}
      {error ? <Alert tone="danger" title="Não foi possível carregar mais">{error}</Alert> : null}
    </>
  )

  const footer = status === 'ready' && hasMore && onLoadMore
    ? <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>Carregar mais</Button>
    : undefined

  return (
    <Drawer open={open} onClose={onClose} size="wide" title={title} eyebrow={eyebrow} footer={footer}>
      <div className="bt-audit">{body}</div>
    </Drawer>
  )
}

export type AuditButtonProps = {
  onClick: () => void
  /** Só o ícone (celular, cabeçalho de drawer); o nome vai para `aria-label` e dica. */
  iconOnly?: boolean
  size?: ButtonSize
  disabled?: boolean
}

/** Botão padrão que abre a auditoria (§10.9.4), na linha de comando da lista e no cabeçalho do drawer do registro. */
export function AuditButton({ onClick, iconOnly = false, size, disabled }: AuditButtonProps) {
  return (
    <Button variant="secondary" size={size} icon={icons.history} aria-haspopup="dialog" aria-label={iconOnly ? 'Auditoria' : undefined} title="Auditoria: quem alterou o quê" disabled={disabled} onClick={onClick}>
      {iconOnly ? null : 'Auditoria'}
    </Button>
  )
}
