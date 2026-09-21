import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

interface CacheFile { schemaVersion: 1; entries: Record<string, { condition: unknown; result: unknown; savedAt: string }> }
const emptyCache = (): CacheFile => ({ schemaVersion: 1, entries: {} });

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 5_000_000) throw new Error('Cache request exceeds 5 MB'); chunks.push(buffer); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function respond(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
}

/** Local Vite-only API. Static GitHub Pages builds do not contain this endpoint. */
export function sweepCachePlugin(): Plugin {
  const cachePath = resolve(process.cwd(), process.env.SWEEP_CACHE_PATH || 'data/sweep-cache.json');
  let cache: CacheFile | null = null, writeQueue = Promise.resolve();
  async function load() {
    if (cache) return cache;
    try { const parsed = JSON.parse(await readFile(cachePath, 'utf8')) as CacheFile; cache = parsed.schemaVersion === 1 && parsed.entries ? parsed : emptyCache(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; cache = emptyCache(); }
    return cache;
  }
  function persist() {
    writeQueue = writeQueue.then(async () => { await mkdir(dirname(cachePath), { recursive: true }); await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8'); });
    return writeQueue;
  }
  return { name: 'local-sweep-cache', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = request.url?.split('?')[0];
      if (!pathname?.startsWith('/api/sweep-cache/')) return next();
      try {
        const database = await load();
        if (pathname === '/api/sweep-cache/status' && request.method === 'GET') return respond(response, 200, { available: true, path: 'data/sweep-cache.json', entries: Object.keys(database.entries).length });
        if (pathname === '/api/sweep-cache/lookup' && request.method === 'POST') {
          const body = await requestJson(request) as { keys?: unknown };
          if (!Array.isArray(body.keys) || body.keys.length > 10_000 || body.keys.some(key => typeof key !== 'string')) return respond(response, 400, { error: 'keys must be an array of at most 10,000 strings' });
          const entries: Record<string, unknown> = {}; for (const key of body.keys) if (database.entries[key]) entries[key] = database.entries[key].result;
          return respond(response, 200, { entries });
        }
        if (pathname === '/api/sweep-cache/store' && request.method === 'POST') {
          const body = await requestJson(request) as { entries?: unknown };
          if (!Array.isArray(body.entries) || body.entries.length > 256) return respond(response, 400, { error: 'entries must be an array of at most 256 records' });
          for (const item of body.entries as Array<{ key?: unknown; condition?: unknown; result?: unknown }>) {
            if (typeof item.key !== 'string' || !/^[a-f0-9]{64}$/.test(item.key) || item.result === undefined) return respond(response, 400, { error: 'invalid cache entry' });
            database.entries[item.key] = { condition: item.condition, result: item.result, savedAt: new Date().toISOString() };
          }
          await persist(); return respond(response, 200, { stored: body.entries.length, total: Object.keys(database.entries).length });
        }
        return respond(response, 404, { error: 'unknown cache endpoint' });
      } catch (error) { return respond(response, 500, { error: error instanceof Error ? error.message : String(error) }); }
    });
  } };
}
