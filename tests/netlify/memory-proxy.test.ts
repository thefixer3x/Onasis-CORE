import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

function loadCommonJsModule(modulePath: string) {
  const absolutePath = path.resolve(__dirname, modulePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const module = { exports: {} as Record<string, unknown> }
  const context = vm.createContext({
    console,
    process,
    Buffer,
    URL,
    URLSearchParams,
    fetch: globalThis.fetch,
    Response: globalThis.Response,
    exports: module.exports,
    module,
    require,
    __filename: absolutePath,
    __dirname: path.dirname(absolutePath),
  })
  const script = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${source}\n})`,
    { filename: absolutePath }
  )
  const compiled = script.runInContext(context)
  compiled(module.exports, require, module, absolutePath, path.dirname(absolutePath))
  return module.exports
}

function loadHandler() {
  return (loadCommonJsModule('../../netlify/functions/memory-proxy.js') as {
    handler: (event: Record<string, unknown>) => Promise<{ statusCode: number }>
  }).handler
}

describe('memory-proxy path normalization', () => {
  beforeEach(() => {
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
    process.env.SUPABASE_URL = 'https://lanonasis.supabase.co'
    process.env.VITE_SUPABASE_URL = 'https://lanonasis.supabase.co'
    vi.restoreAllMocks()
  })

  it('routes public plural collection GET requests to memory-list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memories',
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { limit: '1' },
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-list?limit=1',
      }),
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('routes public singular list requests to memory-list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memory/list',
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {},
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-list',
      }),
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('routes public plural item requests to memory-get by id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'abc-123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memories/abc-123',
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {},
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-get/abc-123',
      }),
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('routes public plural collection POST requests to memory-create and preserves auth/context headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'mem-123' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()
    const requestBody = JSON.stringify({
      content: 'hello world',
      projectId: 'proj-123',
      quality: { score: 0.92 },
    })

    const response = await handler({
      path: '/api/v1/memories',
      httpMethod: 'POST',
      headers: {
        authorization: 'Bearer user-token',
        'x-api-key': 'client-key',
        'x-project-scope': 'project:proj-123',
        'x-client-info': 'lanonasis-cli/1.0.0',
        'content-type': 'application/json',
      },
      queryStringParameters: {},
      body: requestBody,
    })

    expect(response.statusCode).toBe(201)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-create',
      }),
      expect.objectContaining({
        method: 'POST',
        body: requestBody,
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
          'X-API-Key': 'client-key',
          'x-project-scope': 'project:proj-123',
          'x-client-info': 'lanonasis-cli/1.0.0',
        }),
      })
    )
  })

  it('routes public stats requests to memory-stats and preserves query strings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ total: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memory/stats',
      httpMethod: 'GET',
      headers: {},
      rawQuery: 'scope=project&projectId=proj-123',
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-stats?scope=project&projectId=proj-123',
      }),
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('routes public health requests to system-health', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memory/health',
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {},
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/system-health',
      }),
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('routes public plural item updates to memory-update and injects the id into the body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ updated: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memories/abc-123',
      httpMethod: 'PATCH',
      headers: { 'content-type': 'application/json' },
      queryStringParameters: {},
      body: JSON.stringify({ content: 'updated content' }),
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-update',
      }),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ content: 'updated content', id: 'abc-123' }),
      })
    )
  })

  it('routes public legacy get requests to memory-get without losing query parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'mem-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/api/v1/memory/get',
      httpMethod: 'GET',
      headers: {},
      rawQuery: 'id=mem-1&scope=project',
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-get?id=mem-1&scope=project',
      }),
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('preserves existing internal netlify function paths', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = loadHandler()

    const response = await handler({
      path: '/.netlify/functions/memory-proxy/search',
      httpMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      queryStringParameters: {},
      body: JSON.stringify({ query: 'hello' }),
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://lanonasis.supabase.co/functions/v1/memory-search',
      }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'hello' }),
      })
    )
  })
})
