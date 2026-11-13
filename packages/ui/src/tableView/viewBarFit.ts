/**
 * Quanto cabe na linha de comando com espaços nomeados (§10.9.1/§10.9.6). Função pura: recebe as larguras medidas e
 * devolve o primeiro degrau de encolhimento em que tudo cabe numa linha. O que é fixo depende só da largura; a seleção
 * tem uma reserva mínima (✕ + o maior contador plausível), então marcar linhas nunca mexe nos controles fixos. As ações
 * inline da seleção não entram na reserva (1.32): com linhas marcadas elas disputam só o espaço da busca (`fitZone`).
 *
 * Desenho "peça única" (1.27): visão | superfície [Colunas · Filtros · Densidade · Auditoria · espaço flexível · ⋮ ·
 * ferramentas] | ação principal. Dentro da superfície, um fio separa cada grupo visível; o fio conta como item da linha.
 */

export type FitSize = { full: number; compact: number }

export type FitInput = {
  /** Largura da barra. */
  avail: number
  /** Espaço entre os itens dentro da superfície (botões, fios, seleção e busca). */
  gap: number
  /** Espaço entre o seletor de visão e a superfície. */
  startGap: number
  /** Espaço entre a superfície e a ação principal. */
  endGap: number
  /** Padding + borda da superfície, somando os dois lados. */
  frame: number
  /** Largura do fio entre grupos (com o respiro lateral dele). */
  sep: number
  /** Seletor de visão: com o nome e compacto (ícone da visão + chevron). */
  start: FitSize
  /** Botão só ícone (Densidade, ⋮, lupa). */
  square: number
  colunas: FitSize
  filtros?: FitSize
  audit?: FitSize
  /** Itens secundários de `primary` (secondary, ghost ou só ícone): dentro da superfície, depois do ⋮. */
  tools?: FitSize
  /** Ação principal (o resto de `primary`): fora da superfície, à direita. */
  primary?: FitSize
  /** `children` no modo de espaços nomeados (nunca encolhe). */
  extra: number
  search: boolean
  searchMin: number
  /** O ⋮ aparece mesmo sem nada dobrado (há `more` ou `selection`). */
  menu: boolean
  /** Reserva da seleção no desktop: ✕ + contador de exemplo (o maior plausível). */
  selection?: { counter: number }
}

export type FitPlan = {
  /** Degrau escolhido (0 = tudo com texto). */
  level: number
  /** Colunas, Filtros e Auditoria com texto. */
  labels: boolean
  /** Ação principal (e os itens de `primary` dentro da superfície) com texto. */
  primaryLabel: boolean
  fold: { audit: boolean; density: boolean; colunas: boolean }
  /** Busca recolhida na lupa. */
  lupa: boolean
  /** Seletor de visão compacto (só ícone + chevron; nome no `aria-label`/`title` e no menu). */
  startCompact: boolean
  /** Sobra da linha no degrau (negativa só no último, quando nem ele cabe). */
  slack: number
  /** Espaço da zona para a seleção e a busca juntas (reserva + busca ou lupa + sobra; sem `children`). Vai para `fitZone`. */
  flex: number
}

const sum = (parts: number[], gap: number) => (parts.length ? parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) : 0)

type Step = Omit<FitPlan, 'level' | 'slack' | 'flex'>

function required(input: FitInput, plan: Step) {
  const { gap } = input
  const end: number[] = []
  if (!plan.fold.colunas) end.push(plan.labels ? input.colunas.full : input.colunas.compact)
  if (input.filtros) end.push(plan.labels ? input.filtros.full : input.filtros.compact)
  if (!plan.fold.density) end.push(input.square)
  if (input.audit && !plan.fold.audit) end.push(plan.labels ? input.audit.full : input.audit.compact)
  const zone: number[] = []
  if (input.selection) zone.push(input.selection.counter)
  if (input.search) zone.push(plan.lupa ? input.square : input.searchMin)
  if (input.extra) zone.push(input.extra)
  // O espaço flexível existe sempre (mesmo vazio), então conta como item da linha.
  end.push(sum(zone, gap))
  const anyFold = plan.fold.audit || plan.fold.density || plan.fold.colunas
  if (input.menu || anyFold) end.push(input.square)
  if (input.tools) end.push(plan.primaryLabel ? input.tools.full : input.tools.compact)
  const surface = input.frame + sum(end.flatMap((part, index) => (index ? [input.sep, part] : [part])), gap)
  const primary = input.primary ? input.endGap + (plan.primaryLabel ? input.primary.full : input.primary.compact) : 0
  return { total: (plan.startCompact ? input.start.compact : input.start.full) + input.startGap + surface + primary, zone: sum(zone, gap) }
}

/** Degraus dos fixos na ordem do §10.9.1: texto de Colunas/Filtros/Auditoria, texto da principal, Auditoria/Densidade/
 * Colunas para o ⋮, a busca vira lupa e, por último, o seletor de visão fica compacto (só quando nada antes coube). A
 * seleção não tem degrau aqui: a reserva é fixa e as ações dela se arrumam no espaço da busca (`fitZone`). */
export function planFit(input: FitInput): FitPlan {
  const steps: Step[] = []
  let plan = { labels: true, primaryLabel: true, fold: { audit: false, density: false, colunas: false }, lupa: false, startCompact: false }
  const push = (next: Partial<typeof plan>) => { plan = { ...plan, ...next, fold: { ...plan.fold, ...next.fold } }; steps.push(plan) }
  steps.push(plan)
  if (input.colunas.full > input.colunas.compact || (input.filtros && input.filtros.full > input.filtros.compact) || (input.audit && input.audit.full > input.audit.compact)) push({ labels: false })
  if ([input.primary, input.tools].some((size) => size && size.full > size.compact)) push({ primaryLabel: false })
  if (input.audit) push({ fold: { ...plan.fold, audit: true } })
  push({ fold: { ...plan.fold, density: true } })
  push({ fold: { ...plan.fold, colunas: true } })
  if (input.search) push({ lupa: true })
  if (input.start.full > input.start.compact) push({ startCompact: true })

  let level = steps.findIndex((step) => required(input, step).total <= input.avail + 0.5)
  if (level < 0) level = steps.length - 1
  const chosen = steps[level]
  const { total, zone } = required(input, chosen)
  const slack = input.avail - total
  return { ...chosen, level, slack, flex: zone + Math.max(0, slack) - (input.extra ? input.extra + input.gap : 0) }
}

export type ZoneSearch = { min: number; compact: number; square: number }
export type ZoneFit = { labels: boolean; shown: number; search: 'field' | 'lupa' | null }

/** Como seleção e busca dividem o espaço da zona (`flex`, 1.32). O trecho da seleção abraça o conteúdo; toda a sobra vai
 * para a busca (a caixa estica; a lupa também, sem deixar faixa vazia). Ordem de cessão com linhas marcadas: as ações
 * perdem o texto com a busca no mínimo (`min`); a busca encolhe até a compacta legível (`compact`); a busca vira lupa (as
 * ações tentam recuperar o texto com o espaço que a caixa liberou); as ações vão para o ⋮ da direita para a esquerda. Sem
 * linhas marcadas (`counter` = 0) a busca ocupa a zona inteira: caixa se couber a compacta, senão lupa. */
export function fitZone(flex: number, counter: number, inline: FitSize[], gap: number, search: ZoneSearch | null): ZoneFit {
  const n = inline.length
  const sel = (labels: boolean, shown: number) => (counter ? sum([counter, ...inline.slice(0, shown).map((size) => (labels ? size.full : size.compact))], gap) : 0)
  const fits = (width: number, need: number | null) => width + (need == null ? 0 : (width ? gap : 0) + need) <= flex + 0.5
  const tries: Array<[boolean, number, number | null, ZoneFit['search']]> = []
  if (search) {
    tries.push([true, n, search.min, 'field'], [false, n, search.min, 'field'], [false, n, search.compact, 'field'], [true, n, search.square, 'lupa'])
    for (let shown = n; shown >= 0; shown -= 1) tries.push([false, shown, search.square, 'lupa'])
  } else {
    tries.push([true, n, null, null])
    for (let shown = n; shown >= 0; shown -= 1) tries.push([false, shown, null, null])
  }
  const hit = tries.find(([labels, shown, need]) => fits(sel(labels, shown), need)) ?? tries[tries.length - 1]
  return { labels: hit[0], shown: hit[1], search: hit[3] }
}

/** Barra do rodapé do celular (§10.9.6): os botões dividem a largura em partes iguais; o que não couber com o rótulo vira só
 * ícone (quadrado, nome no `title`/`aria-label`), começando pelo mais largo, e devolve a sobra aos outros. Nada é cortado.
 * `widths` são as larguras naturais com texto; devolve, na mesma ordem, quem fica só ícone. */
export function fitBarActions(avail: number, gap: number, widths: number[], square: number): boolean[] {
  const compact = widths.map(() => false)
  for (;;) {
    const labeled = widths.map((_, i) => i).filter((i) => !compact[i])
    if (!labeled.length) return compact
    const share = (avail - gap * (widths.length - 1) - square * (widths.length - labeled.length)) / labeled.length
    const widest = labeled.reduce((a, b) => (widths[b] > widths[a] ? b : a))
    if (widths[widest] <= share + 0.5) return compact
    compact[widest] = true
  }
}
