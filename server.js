/*
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dataFile = path.join(dataDir, 'order-board.json')
const distDir = path.join(__dirname, 'dist')
const isProduction = process.argv.includes('--prod')
const port = Number(process.env.PORT) || 3000

const createItem = (overrides = {}) => ({
  id: crypto.randomUUID(),
  name: '',
  size: '',
  quantity: '1',
  price: '',
  ...overrides,
})

const createPerson = (overrides = {}) => ({
  id: crypto.randomUUID(),
  name: '',
  paymentStatus: 'Niet betaald',
  paidAmount: '',
  pickedUp: false,
  items: [createItem()],
  ...overrides,
})

const normalizeItem = (item = {}) =>
  createItem({
    id: item.id || crypto.randomUUID(),
    name: item.name ?? '',
    size: item.size ?? '',
    quantity: item.quantity ?? '1',
    price: item.price ?? '',
  })

const normalizePerson = (person = {}) =>
  createPerson({
    id: person.id || crypto.randomUUID(),
    name: person.name ?? '',
    paymentStatus: person.paymentStatus ?? 'Niet betaald',
    paidAmount: person.paidAmount ?? '',
    pickedUp: Boolean(person.pickedUp),
    items:
      Array.isArray(person.items) && person.items.length > 0
        ? person.items.map(normalizeItem)
        : [createItem()],
  })

const normalizePeople = (people) =>
  Array.isArray(people) && people.length > 0
    ? people.map(normalizePerson)
    : [createPerson()]

const defaultBoard = () => ({
  people: [createPerson()],
  updatedAt: new Date().toISOString(),
})

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req) => {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const writeBoard = async (payload) => {
  await mkdir(dataDir, { recursive: true })

  const board = {
    people: normalizePeople(payload.people),
    updatedAt: new Date().toISOString(),
  }

  const tempFile = `${dataFile}.tmp`
  await writeFile(tempFile, JSON.stringify(board, null, 2), 'utf8')
  await rename(tempFile, dataFile)

  return board
}

const readBoard = async () => {
  await mkdir(dataDir, { recursive: true })

  try {
    const raw = await readFile(dataFile, 'utf8')
    const parsed = JSON.parse(raw)

    return {
      people: normalizePeople(parsed.people),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    }
  } catch {
    const board = defaultBoard()
    await writeBoard(board)
    return board
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

const serveStaticFile = async (res, filePath) => {
  const extension = path.extname(filePath).toLowerCase()
  const contentType = mimeTypes[extension] || 'application/octet-stream'

  res.writeHead(200, { 'Content-Type': contentType })
  createReadStream(filePath).pipe(res)
}

const start = async () => {
  const vite = isProduction
    ? null
    : await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`)

    if (requestUrl.pathname === '/api/order-board') {
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, await readBoard())
          return
        }

        if (req.method === 'PUT') {
          const body = await readRequestBody(req)

          if (!Array.isArray(body.people)) {
            sendJson(res, 400, { error: 'Ongeldige payload' })
            return
          }

          sendJson(res, 200, await writeBoard(body))
          return
        }

        sendJson(res, 405, { error: 'Methode niet toegestaan' })
      } catch {
        sendJson(res, 500, { error: 'Opslagfout' })
      }

      return
    }

    if (!isProduction && vite) {
      vite.middlewares(req, res, () => {
        res.statusCode = 404
        res.end('Niet gevonden')
      })
      return
    }

    try {
      const relativePath =
        requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1)
      const filePath = path.join(distDir, relativePath)
      await stat(filePath)
      await serveStaticFile(res, filePath)
    } catch {
      await serveStaticFile(res, path.join(distDir, 'index.html'))
    }
  })

  server.listen(port, () => {
    const modeLabel = isProduction ? 'productie' : 'development'
    console.log(`Server gestart op http://localhost:${port} (${modeLabel})`)
  })
}

start()
*/
