import { Hono } from 'hono'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const RESOLVED_CACHE = new LRUCache<string, string>({
  max: 1000,
})

const CACHE_KEY_REGEX = /[a-z]{2}-[0-9a-f]{64}/

const querySchema = z.object({
  wikitext: z.string().min(1),
  key: z.string().length(67).regex(CACHE_KEY_REGEX),
})

app.get('/:hash', (ctx) => {
  const hash = ctx.req.param('hash')
  const response = RESOLVED_CACHE.get(hash)
  if (response)
    return ctx.json(
      {
        text: response,
        processed: true,
      },
      200,
      {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    )
  return ctx.json(
    {
      processed: false,
    },
    404,
  )
})

app.post('/process', zValidator('json', querySchema), async (ctx) => {
  const json = ctx.req.valid('json')
  const keySplit = json.key.split('-', 2)
  if (keySplit.length !== 2 || keySplit[0].length !== 2) return ctx.status(400)
  const formData = new FormData()
  formData.append('action', 'parse')
  formData.append('format', 'json')
  formData.append('formatversion', 2)
  formData.append('prop', 'text')
  formData.append('contentmodel', 'wikitext')
  formData.append('text', json.wikitext)
  const req = await fetch(
    keySplit[0] === 'en'
      ? 'https://minecraft.wiki/api.php'
      : `https://${keySplit[0]}.minecraft.wiki/api.php`,
    {
      method: 'POST',
      headers: {
        'User-Agent': 'minecraft.wiki API Proxy',
      },
      body: formData,
    },
  )
  const data = (await req.json()) as { parse?: { text?: string } }
  if (data.parse && data.parse.text) {
    RESOLVED_CACHE.set(json.key, data.parse.text)
    return ctx.json(
      {
        text: data.parse.text,
        processed: true,
      },
      200,
    )
  } else {
    return ctx.json(data, 400)
  }
})

export default app
