import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { CardOpenButton } from './CardOpenButton'
import { Progress, Skeleton, type ProgressProps } from './Misc'
import type { StatusTone } from './StatusBadge'

/* Card de número (KPI) do Design System: rótulo, valor com selo de variação, apoio e sparkline na base.
   Composição inspirada nos cards de KPI do Tremor (Apache-2.0) e do shadcn/ui (MIT); código e estilo próprios, só tokens --bt-*. */

export type StatTone = Exclude<StatusTone, 'neutral'>
export type DeltaTone = 'positive' | 'negative' | 'neutral'
export type DeltaTrend = 'up' | 'down'

const arrow = (paths: ReactNode) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
)
const ARROW: Record<DeltaTrend, ReactNode> = {
  up: arrow(<><path d="M7 7h10v10" /><path d="M7 17 17 7" /></>),
  down: arrow(<><path d="m7 7 10 10" /><path d="M17 7v10H7" /></>),
}

export type DeltaBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** Variação já formatada, com sinal: "+78,1%", "−3,1%" ou proporção "62%". */
  children: ReactNode
  /** Seta para cima ou para baixo; sem `trend` o selo é uma proporção, sem seta. */
  trend?: DeltaTrend
  /** Cor pelo que é favorável, não pelo sinal (queda de contas a pagar é positive). Padrão: up = positive, down = negative, sem trend = neutral. */
  tone?: DeltaTone
}

const DELTA_TEXT: Partial<Record<DeltaTone, string>> = { positive: 'Favorável', negative: 'Desfavorável' }

/** Selo de variação: seta, sinal e texto, com "favorável/desfavorável" para o leitor de tela (status nunca só por cor). */
export function DeltaBadge({ children, trend, tone, className, title, ...rest }: DeltaBadgeProps) {
  const resolved: DeltaTone = tone ?? (trend === 'up' ? 'positive' : trend === 'down' ? 'negative' : 'neutral')
  const meaning = DELTA_TEXT[resolved]
  return (
    <span className={['bt-delta', `bt-delta--${resolved}`, className].filter(Boolean).join(' ')} title={title ?? meaning} {...rest}>
      {trend ? ARROW[trend] : null}
      {children}
      {meaning ? <span className="bt-sr-only">, {meaning.toLowerCase()}</span> : null}
    </span>
  )
}

const round = (n: number) => Math.round(n * 10) / 10
const SPARK_W = 100
const SPARK_H = 28

/** Caminhos da sparkline (linha e área) e o último ponto, numa caixa de 100 × 28; menos de dois pontos válidos não desenha nada. */
export function sparklinePaths(values: readonly number[]): { line: string; area: string; end: { x: number; y: number } } | null {
  // Ponto inválido (sem dado no período) é pulado, mas mantém a posição dos outros no eixo do tempo.
  const points = values.flatMap((v, i) => (Number.isFinite(v) ? [{ v, i }] : []))
  if (points.length < 2) return null
  const nums = points.map((p) => p.v)
  const min = Math.min(...nums)
  const span = Math.max(...nums) - min
  const step = SPARK_W / (values.length - 1)
  // Margem de 2 em cima e embaixo para o traço não cortar; série constante fica no meio.
  const y = (v: number) => (span === 0 ? SPARK_H / 2 : SPARK_H - 2 - ((v - min) / span) * (SPARK_H - 4))
  const line = points.map((p, k) => `${k ? 'L' : 'M'}${round(p.i * step)} ${round(y(p.v))}`).join(' ')
  const first = round(points[0].i * step)
  const last = round(points[points.length - 1].i * step)
  const end = points[points.length - 1]
  return { line, area: `${line} L${last} ${SPARK_H} L${first} ${SPARK_H} Z`, end: { x: last, y: round(y(end.v)) } }
}

export type SparklineProps = {
  /** Valores na ordem do tempo; menos de dois pontos não desenha. */
  data: readonly number[]
  tone?: StatTone
  /** Área sob a linha em gradiente vertical do tom (padrão); `false` deixa só a linha e o ponto final. */
  area?: boolean
  className?: string
}

/** Sparkline em SVG puro: linha no tom, área em gradiente do tom até transparente e ponto no último valor. Decorativa (o número está no card). */
export function Sparkline({ data, tone = 'info', area = true, className }: SparklineProps) {
  const gradientId = `bt-spark-${useId().replace(/:/g, '')}`
  const paths = sparklinePaths(data)
  if (!paths) return null
  return (
    <svg className={['bt-spark', `bt-spark--${tone}`, className].filter(Boolean).join(' ')} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {area ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop className="bt-spark__stop bt-spark__stop--top" offset="0" />
              <stop className="bt-spark__stop bt-spark__stop--bottom" offset="1" />
            </linearGradient>
          </defs>
          <path className="bt-spark__area" d={paths.area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path className="bt-spark__line" d={paths.line} vectorEffect="non-scaling-stroke" />
      {/* Traço de comprimento zero com ponta redonda: círculo que não deforma com o esticamento do SVG. */}
      <path className="bt-spark__dot" d={`M${paths.end.x} ${paths.end.y}h0`} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Barra do card: `label` à esquerda ("Meta"); `valueLabel` à direita ("R$ 3,20M"), senão a porcentagem. */
export type StatCardProgress = Pick<ProgressProps, 'value' | 'max' | 'label' | 'valueLabel'>

export type StatCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** O que o número mede: "Faturamento". Também nomeia o card e o botão de detalhe. */
  label: string
  /** Valor já formatado em pt-BR. `null` = sem dado: mostra "s/dado", nunca número provisório. */
  value: ReactNode | null
  /** Ícone Lucide de 14 px, num quadrado de 22 px no tom, antes do rótulo. */
  icon?: ReactNode
  /** Tom do ícone e da sparkline; o número é sempre navy. */
  tone?: StatTone
  /** Selo de variação, normalmente um `<DeltaBadge>`. */
  delta?: ReactNode
  /** Onde o selo fica: `value` (padrão) ao lado do valor; `top` no canto superior direito, na linha do rótulo, antes do botão de detalhe. */
  deltaPlacement?: 'value' | 'top'
  /** Frase de apoio: "vs R$ 1,12M no ano anterior". */
  hint?: ReactNode
  /** Barra de meta ou proporção, com rótulo à esquerda e total à direita. */
  progress?: StatCardProgress
  /** Série da sparkline na base do card. */
  trend?: readonly number[]
  /** Área em gradiente sob a sparkline (padrão); `false` deixa só a linha e o ponto final. */
  trendArea?: boolean
  /** Extras próprios do uso, depois do apoio e da barra. Com `onOpen`, links e botões aqui ficam acima da área de clique. */
  children?: ReactNode
  /** Drill-down: chevron no canto e o card inteiro clicável. */
  onOpen?: () => void
  /** Texto do drill-down ("Ver detalhes"; "Abrir <tela>" quando leva a outra tela). */
  openLabel?: string
  /** Barras no lugar do valor e do apoio enquanto carrega. */
  loading?: boolean
}

/**
 * Card de KPI. Ocupa quatro linhas de uma grade pai (subgrid): rótulo, valor, extras e sparkline ficam alinhados entre os cards
 * da mesma fileira. O valor encolhe pela largura do card (`cqi`), sem quebrar.
 */
export function StatCard({
  label, value, icon, tone = 'info', delta, deltaPlacement = 'value', hint, progress, trend, trendArea = true, children, onOpen, openLabel = 'Ver detalhes', loading = false, className, ...rest
}: StatCardProps) {
  const labelId = useId()
  const empty = value == null
  const deltaNode = !loading && !empty ? delta : null
  return (
    <article
      className={['bt-stat', `bt-stat--${tone}`, onOpen && 'bt-stat--open', className].filter(Boolean).join(' ')}
      aria-labelledby={rest['aria-label'] ? undefined : labelId}
      aria-busy={loading || undefined}
      {...rest}
    >
      <div className="bt-stat__top">
        <span className="bt-stat__label" id={labelId}>
          {icon != null ? <span className="bt-stat__icon" aria-hidden="true">{icon}</span> : null}
          {label}
        </span>
        {deltaPlacement === 'top' && deltaNode != null ? <span className="bt-stat__delta-top">{deltaNode}</span> : null}
        {onOpen ? <CardOpenButton label={label} text={openLabel} onOpen={onOpen} /> : null}
      </div>
      <div className="bt-stat__box">
        {loading
          ? <Skeleton width={72} height={24} />
          : <strong className={empty ? 'bt-stat__value bt-stat__value--empty' : 'bt-stat__value'}>{empty ? 's/dado' : value}</strong>}
        {deltaPlacement === 'value' ? deltaNode : null}
      </div>
      <div className="bt-stat__extras">
        {loading
          ? (hint != null || progress ? <Skeleton width={120} /> : null)
          : <>{hint != null ? <span className="bt-stat__hint">{hint}</span> : null}{progress && !empty ? <Progress {...progress} /> : null}{children}</>}
      </div>
      {!loading && !empty && trend ? <Sparkline data={trend} tone={tone} area={trendArea} className="bt-stat__spark" /> : <span aria-hidden="true" />}
    </article>
  )
}
