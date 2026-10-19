// Registro de erros do front na tabela compartilhada de logs (new_appmotoristaslog).
// Sem React e sem dependências: serve para telas React (subpath `error-logger`) e HTML único (dist/error-logger.iife.js).
// Grava só com contexto Dataverse (Xrm ou GetGlobalContext); em modo mock não faz nada.
// Falha ao gravar nunca gera novo log: o envio não passa por request() da tela e todo erro interno é engolido.

export const ERROR_LOG_TABLE = 'new_appmotoristaslog'
export const ERROR_LOG_ENTITY_SET = 'new_appmotoristaslogs'
const API_VERSION = 'v9.2'
const MAX_LOGS_PER_SESSION = 30
const DEDUPE_WINDOW_MS = 60_000
const RETRY_MS = 30_000
const MAX_QUEUE = 50
const GLOBAL_KEY = '__BETINHOS_ERROR_LOGGER__'

// Limites das colunas em new_appmotoristaslog (metadata DEV de 19/10/2026).
const LIMITS = {
  name: 160, severity: 30, source: 120, action: 180, phase: 120, component: 180, screen: 120,
  detailId: 120, detailType: 80, message: 20_000, stack: 100_000, errorName: 220, errorCode: 120,
  appName: 120, appVersion: 60, builtAt: 80, sessionId: 120, userId: 120, userName: 300, userEmail: 300,
  userDomainName: 300, url: 4000, referrer: 4000, userAgent: 4000, language: 80, platform: 160,
  timeZone: 120, viewport: 80, visibility: 40, connection: 80, clientUrl: 500, isOffline: 20,
  payload: 100_000, raw: 100_000,
} as const

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

export type ErrorLogDetails = {
  source?: string
  action?: string
  phase?: string
  component?: string
  errorCode?: string | number
  detailId?: string
  detailType?: string
  payload?: unknown
  severity?: ErrorSeverity
  screen?: string
}

export type ErrorLoggerOptions = {
  appName: string
  appVersion: string
  /** Data/hora do build (ex.: "02/10/2026 07:30"). */
  builtAt?: string
  getScreen?: () => string | undefined
  getUserEmail?: () => string | undefined
}

export type ErrorLogContext = { screen?: string; userEmail?: string }
export type ErrorLogResult = 'sent' | 'queued' | 'skipped'
export type ErrorLogRecord = Record<string, string>

type GlobalContextLike = {
  getClientUrl?: () => string
  userSettings?: { userId?: string; userName?: string }
}
type XrmLike = {
  Utility?: { getGlobalContext?: () => GlobalContextLike }
  WebApi?: { createRecord?: (entity: string, data: Record<string, unknown>) => Promise<unknown> }
}
type Runtime = { clientUrl: string; xrm: XrmLike | null; globalContext: GlobalContextLike }
type UserInfo = { userId: string; userName: string; userEmail: string; userDomainName: string }
type RuntimeWindow = Window & { Xrm?: XrmLike; GetGlobalContext?: () => GlobalContextLike; [GLOBAL_KEY]?: Installed }
type Installed = { uninstall: () => void }

const state = {
  options: null as ErrorLoggerOptions | null,
  context: { screen: '', userEmail: '' },
  sessionId: '',
  sentCount: 0,
  signatures: new Map<string, number>(),
  memoryQueue: null as ErrorLogRecord[] | null,
  flushing: null as Promise<void> | null,
  userPromise: null as Promise<UserInfo> | null,
  lastDeliveryError: '',
}

function win(): RuntimeWindow | null {
  return typeof window === 'undefined' ? null : (window as RuntimeWindow)
}

// ---------- Contexto Dataverse ----------

/** Procura o contexto em window.parent.Xrm, window.Xrm e GetGlobalContext, nessa ordem. Null = modo mock. */
export function detectDataverseRuntime(): Runtime | null {
  const current = win()
  if (!current) return null
  const candidates: (XrmLike | undefined)[] = []
  try { candidates.push((current.parent as RuntimeWindow | null)?.Xrm) } catch { /* parent de outra origem */ }
  try { candidates.push(current.Xrm) } catch { /* sem Xrm */ }
  for (const xrm of candidates) {
    try {
      const globalContext = xrm?.Utility?.getGlobalContext?.()
      const clientUrl = cleanUrl(globalContext?.getClientUrl?.())
      if (xrm && globalContext && clientUrl) return { clientUrl, xrm, globalContext }
    } catch { /* tenta o próximo */ }
  }
  try {
    const globalContext = current.GetGlobalContext?.()
    const clientUrl = cleanUrl(globalContext?.getClientUrl?.())
    if (globalContext && clientUrl) return { clientUrl, xrm: null, globalContext }
  } catch { /* sem ClientGlobalContext */ }
  return null
}

function cleanUrl(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

function cleanGuid(value: unknown) {
  return String(value ?? '').replace(/[{}]/g, '').toLowerCase()
}

const ODATA_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json; charset=utf-8',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { credentials: 'include', headers: ODATA_HEADERS })
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/** userSettings e, quando faltar e-mail ou id (shim do shell), WhoAmI + systemuser. Nunca rejeita. */
function getUserInfo(runtime: Runtime): Promise<UserInfo> {
  if (state.userPromise) return state.userPromise
  state.userPromise = (async () => {
    let settings: GlobalContextLike['userSettings'] = {}
    try { settings = runtime.globalContext.userSettings ?? {} } catch { /* shim sem userSettings */ }
    const info: UserInfo = { userId: cleanGuid(settings?.userId), userName: String(settings?.userName ?? ''), userEmail: '', userDomainName: '' }
    if (typeof fetch !== 'function') return info
    const api = `${runtime.clientUrl}/api/data/${API_VERSION}`
    if (!info.userId) {
      const whoAmI = await getJson(`${api}/WhoAmI`)
      info.userId = cleanGuid(whoAmI?.UserId)
    }
    if (!info.userId) return info
    const user = await getJson(`${api}/systemusers(${info.userId})?$select=internalemailaddress,fullname,domainname`)
    if (user) {
      info.userName = String(user.fullname ?? info.userName)
      info.userEmail = String(user.internalemailaddress ?? '')
      info.userDomainName = String(user.domainname ?? '')
    }
    return info
  })().catch(() => ({ userId: '', userName: '', userEmail: '', userDomainName: '' }))
  return state.userPromise
}

// ---------- Normalização e redação ----------

const REDACTED = '[redacted]'
const SENSITIVE_KEY = /(base64|conteudo|content|signature|assinatura|photo|foto|image|imagem|token|secret|senha|password|authorization|sharelink|cookie)/i
const SENSITIVE_HOST = /(sharepoint|onedrive|1drv|powerautomate|logic\.azure|flow\.microsoft|blob\.core\.windows)/i

function redactUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (SENSITIVE_HOST.test(parsed.hostname)) return `${parsed.origin}/[redacted-url]`
    return `${parsed.origin}${parsed.pathname}${parsed.search ? '?[redacted-query]' : ''}${parsed.hash ? '#[redacted-hash]' : ''}`
  } catch {
    return '[redacted-url]'
  }
}

/** Remove tokens, senhas, base64 e query string de URLs. Chaves sensíveis viram "[redacted]". */
export function redactSensitive(value: unknown, key = '', depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value
  if (key && SENSITIVE_KEY.test(key)) return REDACTED
  if (typeof value === 'string') {
    return value
      .replace(/data:[^;,]+;base64,[A-Za-z0-9+/=\s]{40,}/gi, 'data:[redacted-base64]')
      .replace(/\b[A-Za-z0-9+/]{160,}={0,2}/g, '[redacted-base64]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
      .replace(/((?:access_token|token|password|senha|secret|authorization)\s*[=:]\s*)[^\s,;&"]+/gi, `$1${REDACTED}`)
      .replace(/https?:\/\/[^\s"'<>)]*/gi, redactUrl)
  }
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (typeof value !== 'object') return value
  if (depth > 8) return '[MaxDepth]'
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactSensitive(item, key, depth + 1, seen))
  const source = value instanceof Error
    ? { ...value, name: value.name, message: value.message, stack: value.stack, cause: (value as { cause?: unknown }).cause }
    : (value as Record<string, unknown>)
  const result: Record<string, unknown> = {}
  for (const [entryKey, entry] of Object.entries(source)) result[entryKey] = redactSensitive(entry, entryKey, depth + 1, seen)
  return result
}

function stringify(value: unknown, limit: number) {
  try {
    return truncate(JSON.stringify(redactSensitive(value)) ?? '', limit)
  } catch (error) {
    return `[unserializable:${error instanceof Error ? error.message : String(error)}]`
  }
}

function truncate(value: unknown, limit: number) {
  const text = String(value ?? '')
  return text.length <= limit ? text : text.slice(0, limit)
}

function clean(value: unknown, limit: number) {
  return truncate(redactSensitive(String(value ?? '')), limit)
}

export type NormalizedError = { name: string; message: string; stack: string; code: string }

export function normalizeError(error: unknown, depth = 0): NormalizedError {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; errorCode?: unknown; cause?: unknown }
    const cause = depth < 4 && record.cause ? normalizeError(record.cause, depth + 1) : null
    return {
      name: error.name || 'Error',
      message: error.message || 'Erro sem mensagem.',
      stack: error.stack || String(error),
      code: String(record.errorCode ?? record.code ?? cause?.code ?? ''),
    }
  }
  if (typeof error === 'string') return { name: 'Error', message: error || 'Erro sem mensagem.', stack: '', code: '' }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const nested = depth < 4 && record.error && typeof record.error === 'object' ? normalizeError(record.error, depth + 1) : null
    let fallback = ''
    try { fallback = JSON.stringify(error) ?? '' } catch { fallback = String(error) }
    return {
      name: String(record.name ?? nested?.name ?? 'UnknownError'),
      message: String(record.message ?? nested?.message ?? fallback ?? 'Erro desconhecido.'),
      stack: String(record.stack ?? nested?.stack ?? ''),
      code: String(record.errorCode ?? record.code ?? nested?.code ?? ''),
    }
  }
  return { name: 'UnknownError', message: String(error ?? 'Erro desconhecido.'), stack: '', code: '' }
}

/** Tira origem, /api/data/vX, query e GUIDs para agrupar falhas iguais da mesma rota. */
export function sanitizeDataversePath(path: string) {
  return String(path || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/api\/data\/v\d+(\.\d+)?/i, '')
    .split('?')[0]
    .replace(/\(\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?\)/gi, '(id)')
}

// ---------- Registro ----------

function getSessionId() {
  if (!state.sessionId) {
    state.sessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
  return state.sessionId
}

function safeCall(fn: (() => string | undefined) | undefined) {
  try { return fn?.() ?? '' } catch { return '' }
}

type Environment = { runtime: Runtime | null; user: UserInfo; now: string }

export function buildErrorLogRecord(error: unknown, details: ErrorLogDetails, env: Environment): ErrorLogRecord {
  const options = state.options
  const appName = options?.appName || 'App sem nome'
  const normalized = normalizeError(error)
  const severity = details.severity ?? 'error'
  const action = details.action || 'runtime-error'
  const source = details.source || 'app'
  const screen = details.screen || state.context.screen || safeCall(options?.getScreen)
  const userEmail = state.context.userEmail || safeCall(options?.getUserEmail) || env.user.userEmail
  const errorCode = details.errorCode ?? normalized.code
  const current = win()
  const nav = current?.navigator as (Navigator & { connection?: { effectiveType?: string; type?: string } }) | undefined
  let timeZone = ''
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* sem Intl */ }

  return {
    new_name: clean(`${appName} | ${severity} | ${action} | ${normalized.message}`, LIMITS.name),
    new_occurredat: env.now,
    new_severity: truncate(severity, LIMITS.severity),
    new_source: clean(source, LIMITS.source),
    new_action: clean(action, LIMITS.action),
    new_phase: clean(details.phase || 'runtime', LIMITS.phase),
    new_component: clean(details.component || appName, LIMITS.component),
    new_screen: clean(screen, LIMITS.screen),
    new_detailid: clean(details.detailId, LIMITS.detailId),
    new_detailtype: clean(details.detailType, LIMITS.detailType),
    new_message: clean(normalized.message, LIMITS.message),
    new_stack: clean(normalized.stack, LIMITS.stack),
    new_errorname: clean(normalized.name, LIMITS.errorName),
    new_errorcode: clean(errorCode, LIMITS.errorCode),
    new_appname: truncate(appName, LIMITS.appName),
    new_appversion: truncate(options?.appVersion ?? '', LIMITS.appVersion),
    new_builtat: truncate(options?.builtAt ?? '', LIMITS.builtAt),
    new_sessionid: truncate(getSessionId(), LIMITS.sessionId),
    new_userid: truncate(env.user.userId, LIMITS.userId),
    new_username: truncate(env.user.userName, LIMITS.userName),
    new_useremail: truncate(userEmail, LIMITS.userEmail),
    new_userdomainname: truncate(env.user.userDomainName, LIMITS.userDomainName),
    new_clienturl: truncate(env.runtime?.clientUrl ?? '', LIMITS.clientUrl),
    new_url: clean(current?.location?.href, LIMITS.url),
    new_referrer: clean(current?.document?.referrer, LIMITS.referrer),
    new_useragent: truncate(nav?.userAgent ?? '', LIMITS.userAgent),
    new_language: truncate(nav?.language ?? '', LIMITS.language),
    new_platform: truncate(nav?.platform ?? '', LIMITS.platform),
    new_timezone: truncate(timeZone, LIMITS.timeZone),
    new_viewport: current?.innerWidth ? truncate(`${current.innerWidth}x${current.innerHeight}@${current.devicePixelRatio || 1}`, LIMITS.viewport) : '',
    new_visibilitystate: truncate(current?.document?.visibilityState ?? '', LIMITS.visibility),
    new_connectiontype: truncate(nav?.connection?.effectiveType ?? nav?.connection?.type ?? '', LIMITS.connection),
    new_isoffline: nav?.onLine === false ? 'true' : 'false',
    new_payloadjson: stringify(details.payload ?? {}, LIMITS.payload),
    new_rawjson: stringify({ error: normalized, details: { ...details, payload: undefined }, occurredAt: env.now, delivery: { pending: readQueue().length, lastError: state.lastDeliveryError } }, LIMITS.raw),
  }
}

// ---------- Fila ----------

function queueKey() {
  return `betinhos-error-log-queue-v1:${state.options?.appName ?? 'app'}`
}

function readQueue(): ErrorLogRecord[] {
  if (state.memoryQueue) return state.memoryQueue
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(queueKey()) ?? '[]')
    state.memoryQueue = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : []
  } catch {
    state.memoryQueue = []
  }
  return state.memoryQueue
}

function writeQueue(items: ErrorLogRecord[]) {
  state.memoryQueue = items.slice(-MAX_QUEUE)
  try { globalThis.localStorage?.setItem(queueKey(), JSON.stringify(state.memoryQueue)) } catch { /* fica em memória nesta sessão */ }
}

export function pendingErrorLogs() {
  return readQueue().length
}

async function send(runtime: Runtime, record: ErrorLogRecord) {
  const createRecord = runtime.xrm?.WebApi?.createRecord
  if (typeof createRecord === 'function') {
    await createRecord.call(runtime.xrm!.WebApi, ERROR_LOG_TABLE, record)
    return
  }
  const response = await fetch(`${runtime.clientUrl}/api/data/${API_VERSION}/${ERROR_LOG_ENTITY_SET}`, {
    method: 'POST',
    credentials: 'include',
    keepalive: JSON.stringify(record).length < 60_000,
    headers: ODATA_HEADERS,
    body: JSON.stringify(record),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

/** Envia a fila em ordem, inclusive o que entrar durante o envio; para no primeiro erro (retry de 30 s ou evento online). */
export function flushErrorLogQueue(): Promise<void> {
  if (state.flushing) return state.flushing
  const runtime = detectDataverseRuntime()
  if (!runtime || !readQueue().length) return Promise.resolve()
  state.flushing = (async () => {
    for (let item = readQueue()[0]; item; item = readQueue()[0]) {
      try {
        await send(runtime, item)
        writeQueue(readQueue().filter((pending) => pending !== item))
        state.lastDeliveryError = ''
      } catch (error) {
        state.lastDeliveryError = truncate(normalizeError(error).message, 500)
        break
      }
    }
  })().catch(() => undefined).finally(() => { state.flushing = null })
  return state.flushing
}

// ---------- API pública ----------

export function setErrorLogContext(next: ErrorLogContext = {}) {
  if (typeof next.screen === 'string') state.context.screen = next.screen
  if (typeof next.userEmail === 'string') state.context.userEmail = next.userEmail
}

function shouldSend(signature: string, now: number) {
  if (state.sentCount >= MAX_LOGS_PER_SESSION) return false
  const last = state.signatures.get(signature)
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false
  state.signatures.set(signature, now)
  state.sentCount += 1
  return true
}

/**
 * Registra um erro. Resolve com 'sent', 'queued' (ficou na fila para retry) ou 'skipped'
 * (modo mock, duplicado em 60 s ou limite de 30 por sessão). Nunca rejeita.
 */
export async function logAppError(error: unknown, details: ErrorLogDetails = {}): Promise<ErrorLogResult> {
  try {
    const runtime = detectDataverseRuntime()
    if (!runtime) return 'skipped'
    const normalized = normalizeError(error)
    if (!shouldSend(`${details.action || ''}|${normalized.message}`, Date.now())) return 'skipped'
    const now = new Date().toISOString()
    const user = await getUserInfo(runtime)
    const record = buildErrorLogRecord(error, details, { runtime, user, now })
    writeQueue([...readQueue(), record])
    await flushErrorLogQueue()
    return readQueue().includes(record) ? 'queued' : 'sent'
  } catch {
    return 'skipped'
  }
}

export type DataverseFailure = {
  method?: string
  /** Rota ou URL completa da chamada; GUIDs e query são removidos da ação. */
  path: string
  /** Status HTTP final (sem status = erro de rede). */
  status?: number
  /** Corpo de erro já lido da resposta (`{ error: { code, message } }`). */
  body?: unknown
  /** Erro de rede ou exceção do fetch. */
  error?: unknown
  component?: string
  detailId?: string
  detailType?: string
  severity?: ErrorSeverity
}

/** Registra falha de chamada Dataverse: HTTP final (status + corpo) ou erro de rede. */
export function logDataverseFailure(failure: DataverseFailure): Promise<ErrorLogResult> {
  try {
    const method = (failure.method || 'GET').toUpperCase()
    const route = sanitizeDataversePath(failure.path)
    const body = failure.body as { error?: { code?: unknown; message?: unknown } } | undefined
    const isNetwork = failure.status === undefined
    const message = isNetwork
      ? `Falha de rede em ${method} ${route}: ${normalizeError(failure.error).message}`
      : String(body?.error?.message ?? `HTTP ${failure.status} em ${method} ${route}`)
    const error = new Error(message)
    error.name = isNetwork ? 'NetworkError' : 'DataverseError'
    if (isNetwork && failure.error instanceof Error && failure.error.stack) error.stack = failure.error.stack
    return logAppError(error, {
      source: 'Dataverse',
      action: `${method} ${route}`,
      phase: 'dataverse',
      component: failure.component || 'request',
      errorCode: isNetwork ? 'network' : String(body?.error?.code ?? failure.status),
      detailId: failure.detailId,
      detailType: failure.detailType,
      severity: failure.severity,
      payload: { method, route, status: failure.status ?? null, body: failure.body ?? null },
    })
  } catch {
    return Promise.resolve('skipped')
  }
}

function isIgnorableMessage(message: unknown) {
  return /^resizeobserver loop (limit exceeded|completed with undelivered notifications)/i.test(String(message ?? '').trim())
}

/** Instala os listeners globais. Idempotente: chamar de novo só atualiza as opções. Retorna a desinstalação. */
export function installErrorLogger(options: ErrorLoggerOptions): () => void {
  state.options = { ...options }
  state.memoryQueue = null
  const target = win()
  if (!target) return () => undefined
  const existing = target[GLOBAL_KEY]
  if (existing) return existing.uninstall

  const onError = (event: Event) => {
    const element = event.target as (EventTarget & { tagName?: string; src?: string; href?: string; currentSrc?: string }) | null
    if (element && element !== target && element.tagName) {
      const tag = String(element.tagName).toLowerCase()
      const url = String(element.currentSrc || element.src || element.href || '')
      void logAppError(new Error(`Falha ao carregar recurso ${tag}: ${url ? redactUrl(url) : 'desconhecido'}`), {
        source: 'window.resourceerror', action: `resource ${tag}`, phase: 'load', component: tag, payload: { tag, url },
      })
      return
    }
    const errorEvent = event as ErrorEvent
    if (isIgnorableMessage(errorEvent.message) || isIgnorableMessage((errorEvent.error as Error | undefined)?.message)) return
    void logAppError(errorEvent.error ?? errorEvent.message, {
      severity: 'critical', source: 'window.error', action: 'window.error', phase: 'global', component: 'window',
      payload: { filename: errorEvent.filename, lineno: errorEvent.lineno, colno: errorEvent.colno },
    })
  }
  const onRejection = (event: Event) => {
    void logAppError((event as PromiseRejectionEvent).reason, {
      severity: 'critical', source: 'window.unhandledrejection', action: 'unhandledrejection', phase: 'global', component: 'window',
    })
  }
  const onOnline = () => { void flushErrorLogQueue() }

  target.addEventListener('error', onError, true)
  target.addEventListener('unhandledrejection', onRejection)
  target.addEventListener('online', onOnline)
  const timer = target.setInterval(() => { if (readQueue().length) void flushErrorLogQueue() }, RETRY_MS)
  void flushErrorLogQueue()

  const installed: Installed = {
    uninstall: () => {
      target.removeEventListener('error', onError, true)
      target.removeEventListener('unhandledrejection', onRejection)
      target.removeEventListener('online', onOnline)
      target.clearInterval(timer)
      if (target[GLOBAL_KEY] === installed) delete target[GLOBAL_KEY]
    },
  }
  target[GLOBAL_KEY] = installed
  return installed.uninstall
}

/** Só para testes: zera dedupe, contador, contexto, usuário e fila em memória. */
export function resetErrorLoggerForTests() {
  state.options = null
  state.context = { screen: '', userEmail: '' }
  state.sessionId = ''
  state.sentCount = 0
  state.signatures.clear()
  state.memoryQueue = null
  state.flushing = null
  state.userPromise = null
  state.lastDeliveryError = ''
}
