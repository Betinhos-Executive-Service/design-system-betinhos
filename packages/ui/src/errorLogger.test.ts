import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ERROR_LOG_TABLE, flushErrorLogQueue, installErrorLogger, logAppError, logDataverseFailure, pendingErrorLogs,
  redactSensitive, resetErrorLoggerForTests, sanitizeDataversePath, setErrorLogContext,
} from './errorLogger'

const CLIENT = 'https://org.crm2.dynamics.com'
const USER_ID = '11111111-2222-3333-4444-555555555555'

type FakeWindow = EventTarget & Record<string, unknown>

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    data,
  }
}

function makeWindow(xrm?: unknown): FakeWindow {
  const target = new EventTarget() as FakeWindow
  Object.assign(target, {
    Xrm: xrm,
    parent: target,
    location: { href: 'https://org.crm2.dynamics.com/WebResources/tela.html?data=secreto' },
    document: { referrer: '', visibilityState: 'visible' },
    navigator: { userAgent: 'vitest', language: 'pt-BR', platform: 'node', onLine: true },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
  })
  return target
}

function makeXrm(createRecord = vi.fn(async () => ({ id: 'x' })), userSettings: unknown = { userId: `{${USER_ID.toUpperCase()}}`, userName: 'Renan' }) {
  return { createRecord, xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => `${CLIENT}/`, userSettings }) }, WebApi: { createRecord } } }
}

function systemUserFetch() {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/WhoAmI')) return new Response(JSON.stringify({ UserId: USER_ID }), { status: 200 })
    if (url.includes('/systemusers(')) return new Response(JSON.stringify({ fullname: 'Renan Santos', internalemailaddress: 'renan@betinhos.com.br', domainname: 'renan@betinhos.com.br' }), { status: 200 })
    return new Response(null, { status: 204 })
  })
}

let uninstall: (() => void) | undefined
let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  resetErrorLoggerForTests()
  storage = fakeStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('fetch', systemUserFetch())
})

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('logAppError', () => {
  it('grava pelo Xrm.WebApi com app, versão, tela, usuário e limites de tamanho', async () => {
    const { xrm, createRecord } = makeXrm()
    vi.stubGlobal('window', makeWindow(xrm))
    uninstall = installErrorLogger({ appName: 'Tela Teste', appVersion: 'v1.2.3', builtAt: '19/10/2026 10:00', getScreen: () => 'Lista' })
    const result = await logAppError(new Error('erro longo '.repeat(3_000)), { action: 'salvar', errorCode: 500, payload: { senha: '123', id: 7 } })

    expect(result).toBe('sent')
    expect(createRecord).toHaveBeenCalledTimes(1)
    const [entity, record] = createRecord.mock.calls[0] as unknown as [string, Record<string, string>]
    expect(entity).toBe(ERROR_LOG_TABLE)
    expect(record.new_appname).toBe('Tela Teste')
    expect(record.new_appversion).toBe('v1.2.3')
    expect(record.new_builtat).toBe('19/10/2026 10:00')
    expect(record.new_screen).toBe('Lista')
    expect(record.new_action).toBe('salvar')
    expect(record.new_errorcode).toBe('500')
    expect(record.new_userid).toBe(USER_ID)
    expect(record.new_username).toBe('Renan Santos')
    expect(record.new_useremail).toBe('renan@betinhos.com.br')
    expect(record.new_clienturl).toBe(CLIENT)
    expect(record.new_message).toHaveLength(20_000)
    expect(record.new_name.length).toBeLessThanOrEqual(160)
    expect(record.new_url).not.toContain('secreto')
    expect(JSON.parse(record.new_payloadjson)).toEqual({ senha: '[redacted]', id: 7 })
    expect(pendingErrorLogs()).toBe(0)
  })

  it('contexto explícito vence getScreen e o e-mail do systemuser', async () => {
    const { xrm, createRecord } = makeXrm()
    vi.stubGlobal('window', makeWindow(xrm))
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1', getScreen: () => 'Lista' })
    setErrorLogContext({ screen: 'Detalhe', userEmail: 'outro@betinhos.com.br' })
    await logAppError('falhou')
    const record = (createRecord.mock.calls[0] as unknown as [string, Record<string, string>])[1]
    expect(record.new_screen).toBe('Detalhe')
    expect(record.new_useremail).toBe('outro@betinhos.com.br')
  })

  it('shim do shell sem userSettings: busca id pelo WhoAmI e nome/e-mail no systemuser', async () => {
    const { xrm, createRecord } = makeXrm(undefined, null)
    const parent = makeWindow(xrm)
    const child = makeWindow(undefined)
    child.parent = parent
    vi.stubGlobal('window', child)
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    await logAppError(new Error('no iframe'))
    const record = (createRecord.mock.calls[0] as unknown as [string, Record<string, string>])[1]
    expect(record.new_userid).toBe(USER_ID)
    expect(record.new_useremail).toBe('renan@betinhos.com.br')
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(`${CLIENT}/api/data/v9.2/WhoAmI`)
  })

  it('sem Xrm.WebApi usa GetGlobalContext + POST com credentials include', async () => {
    const fetchMock = systemUserFetch()
    vi.stubGlobal('fetch', fetchMock)
    const target = makeWindow(undefined)
    target.GetGlobalContext = () => ({ getClientUrl: () => CLIENT, userSettings: { userId: USER_ID, userName: 'R' } })
    vi.stubGlobal('window', target)
    uninstall = installErrorLogger({ appName: 'HTML', appVersion: 'v0.0.1' })
    expect(await logAppError(new Error('boom'))).toBe('sent')
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')!
    expect(post[0]).toBe(`${CLIENT}/api/data/v9.2/new_appmotoristaslogs`)
    expect((post[1] as RequestInit).credentials).toBe('include')
    expect(JSON.parse(String((post[1] as RequestInit).body)).new_message).toBe('boom')
  })

  it('modo mock (sem contexto Dataverse) não grava nem enfileira', async () => {
    vi.stubGlobal('window', makeWindow(undefined))
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    expect(await logAppError(new Error('mock'))).toBe('skipped')
    expect(fetch).not.toHaveBeenCalled()
    expect(storage.data.size).toBe(0)
  })

  it('dedupe de 60 s por ação + mensagem e limite de 30 por sessão', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { xrm, createRecord } = makeXrm()
    vi.stubGlobal('window', makeWindow(xrm))
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    expect(await logAppError(new Error('igual'), { action: 'a' })).toBe('sent')
    expect(await logAppError(new Error('igual'), { action: 'a' })).toBe('skipped')
    expect(await logAppError(new Error('igual'), { action: 'b' })).toBe('sent')
    vi.setSystemTime(Date.now() + 61_000)
    expect(await logAppError(new Error('igual'), { action: 'a' })).toBe('sent')
    for (let i = 0; i < 40; i += 1) await logAppError(new Error(`erro ${i}`))
    expect(createRecord).toHaveBeenCalledTimes(30)
  })

  it('falha ao gravar não gera novo log: fica na fila e o retry de 30 s envia', async () => {
    vi.useFakeTimers()
    const createRecord = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue({ id: 'x' })
    const { xrm } = makeXrm(createRecord)
    vi.stubGlobal('window', makeWindow(xrm))
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    expect(await logAppError(new Error('primeiro'))).toBe('queued')
    expect(createRecord).toHaveBeenCalledTimes(1)
    expect(pendingErrorLogs()).toBe(1)
    expect(JSON.parse(storage.getItem('betinhos-error-log-queue-v1:A')!)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(createRecord).toHaveBeenCalledTimes(2)
    expect(pendingErrorLogs()).toBe(0)
  })

  it('evento online reenvia a fila, e a fila do localStorage sobrevive a recarga', async () => {
    const createRecord = vi.fn().mockRejectedValue(new Error('offline'))
    const { xrm } = makeXrm(createRecord)
    const target = makeWindow(xrm)
    vi.stubGlobal('window', target)
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    await logAppError(new Error('sem rede'))
    expect(pendingErrorLogs()).toBe(1)

    uninstall()
    resetErrorLoggerForTests()
    createRecord.mockResolvedValue({ id: 'x' })
    createRecord.mockClear()
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    await flushErrorLogQueue()
    expect(createRecord).toHaveBeenCalledTimes(1)

    createRecord.mockRejectedValueOnce(new Error('offline'))
    await logAppError(new Error('de novo'))
    expect(pendingErrorLogs()).toBe(1)
    target.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(pendingErrorLogs()).toBe(0))
  })
})

describe('installErrorLogger', () => {
  it('captura window.error, erro de recurso e unhandledrejection; ignora ResizeObserver; é idempotente', async () => {
    const { xrm, createRecord } = makeXrm()
    const target = makeWindow(xrm)
    vi.stubGlobal('window', target)
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    expect(installErrorLogger({ appName: 'A', appVersion: 'v1' })).toBe(uninstall)

    const error = new Event('error') as Event & Record<string, unknown>
    Object.assign(error, { message: 'quebrou', error: new Error('quebrou'), filename: 'app.js', lineno: 1, colno: 2 })
    target.dispatchEvent(error)

    const ignored = new Event('error') as Event & Record<string, unknown>
    Object.assign(ignored, { message: 'ResizeObserver loop completed with undelivered notifications.' })
    target.dispatchEvent(ignored)

    const img = new EventTarget() as EventTarget & Record<string, unknown>
    Object.assign(img, { tagName: 'IMG', src: 'https://cdn.exemplo.com/logo.png?sig=abc' })
    img.addEventListener('error', () => undefined)
    // Erro de recurso não borbulha: chega ao window só na fase de captura (simulada aqui com target = elemento).
    const resource = new Event('error')
    Object.defineProperty(resource, 'target', { value: img })
    target.dispatchEvent(resource)

    const rejection = new Event('unhandledrejection') as Event & Record<string, unknown>
    rejection.reason = new Error('promessa')
    target.dispatchEvent(rejection)

    await vi.waitFor(() => expect(createRecord).toHaveBeenCalledTimes(3))
    const records = createRecord.mock.calls.map((call) => (call as unknown as [string, Record<string, string>])[1])
    expect(records.map((r) => r.new_source).sort()).toEqual(['window.error', 'window.resourceerror', 'window.unhandledrejection'])
    const res = records.find((r) => r.new_source === 'window.resourceerror')!
    expect(res.new_message).toBe('Falha ao carregar recurso img: https://cdn.exemplo.com/logo.png?[redacted-query]')

    uninstall()
    uninstall = undefined
    target.dispatchEvent(rejection)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(createRecord).toHaveBeenCalledTimes(3)
  })
})

describe('logDataverseFailure', () => {
  it('HTTP final: mensagem e código do corpo, rota sem GUID nem query', async () => {
    const { xrm, createRecord } = makeXrm()
    vi.stubGlobal('window', makeWindow(xrm))
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    await logDataverseFailure({
      method: 'patch', path: `${CLIENT}/api/data/v9.2/cr40f_reservadeveculoses(${USER_ID})?$select=x`, status: 403,
      body: { error: { code: '0x80040220', message: 'Principal user is missing prvWrite privilege' } },
    })
    const record = (createRecord.mock.calls[0] as unknown as [string, Record<string, string>])[1]
    expect(record.new_action).toBe('PATCH /cr40f_reservadeveculoses(id)')
    expect(record.new_source).toBe('Dataverse')
    expect(record.new_errorcode).toBe('0x80040220')
    expect(record.new_message).toBe('Principal user is missing prvWrite privilege')
    expect(record.new_errorname).toBe('DataverseError')
  })

  it('erro de rede: código network', async () => {
    const { xrm, createRecord } = makeXrm()
    vi.stubGlobal('window', makeWindow(xrm))
    uninstall = installErrorLogger({ appName: 'A', appVersion: 'v1' })
    await logDataverseFailure({ path: '/WhoAmI', error: new TypeError('Failed to fetch') })
    const record = (createRecord.mock.calls[0] as unknown as [string, Record<string, string>])[1]
    expect(record.new_errorcode).toBe('network')
    expect(record.new_message).toBe('Falha de rede em GET /WhoAmI: Failed to fetch')
  })
})

describe('utilitários', () => {
  it('sanitizeDataversePath e redactSensitive', () => {
    expect(sanitizeDataversePath('/api/data/v9.2/contacts({AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE})?$expand=x')).toBe('/contacts(id)')
    expect(redactSensitive('Authorization: Bearer abc.def')).not.toContain('abc.def')
    expect(redactSensitive({ token: 'x', nested: { ok: 1 } })).toEqual({ token: '[redacted]', nested: { ok: 1 } })
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(redactSensitive(circular)).toEqual({ self: '[Circular]' })
  })
})
