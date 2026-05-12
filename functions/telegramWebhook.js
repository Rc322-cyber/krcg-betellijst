const COLLECTION_NAME = 'krcg'
const DOCUMENT_NAME = 'bestellijst'

const createId = () => crypto.randomUUID()

const createTelegramPerson = ({ name, product, size, quantity, telegram }) => ({
  id: createId(),
  name,
  paymentStatus: 'Niet betaald',
  paidAmount: '',
  pickedUp: false,
  source: 'telegram',
  telegram,
  items: [
    {
      id: createId(),
      name: product,
      size,
      quantity,
      price: '',
      source: 'telegram',
    },
  ],
})

export const parseTelegramOrder = (text = '') => {
  const fields = {}

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(naam|product|maat|aantal)\s*:\s*(.+)$/i)

      if (!match) {
        return
      }

      fields[match[1].toLowerCase()] = match[2].trim()
    })

  const quantity = fields.aantal || '1'

  if (!fields.naam || !fields.product || !Number.isFinite(Number(quantity))) {
    return null
  }

  return {
    name: fields.naam,
    product: fields.product,
    size: fields.maat || '',
    quantity,
  }
}

const getHelpMessage = () =>
  [
    'Stuur je bestelling in dit formaat:',
    '',
    'Naam: Raf',
    'Product: Trui GCF',
    'Maat: L',
    'Aantal: 1',
  ].join('\n')

const sendTelegramMessage = async ({ chatId, text }) => {
  // Vul TELEGRAM_BOT_TOKEN in als Firebase secret/env var, niet hardcoded in git.
  // Voorbeeld lokaal/functions env: TELEGRAM_BOT_TOKEN=123456:ABC...
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken || !chatId) {
    return
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  })
}

const appendOrderToBestellijst = async ({ db, serverTimestamp, order, telegram }) => {
  const listRef = db.collection(COLLECTION_NAME).doc(DOCUMENT_NAME)
  const person = createTelegramPerson({ ...order, telegram })

  console.log('telegramWebhook Firestore schrijfactie gestart', {
    collection: COLLECTION_NAME,
    document: DOCUMENT_NAME,
    person,
  })

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(listRef)
    const currentPeople = Array.isArray(snapshot.data()?.people)
      ? snapshot.data().people
      : []

    transaction.set(
      listRef,
      {
        people: [...currentPeople, person],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  console.log('telegramWebhook Firestore schrijfactie gelukt', {
    collection: COLLECTION_NAME,
    document: DOCUMENT_NAME,
    personId: person.id,
  })

  return person
}

export const handleTelegramWebhook = async ({
  request,
  response,
  db,
  serverTimestamp,
}) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  console.log('telegramWebhook volledige update body', request.body)

  const message = request.body?.message
  const text = message?.text
  const chatId = message?.chat?.id

  console.log('telegramWebhook ontvangen text', text || '')

  if (!text) {
    response.status(200).json({ ok: true, skipped: 'No text message' })
    return
  }

  const order = parseTelegramOrder(text)

  console.log('telegramWebhook parsing resultaat', order)

  if (!order) {
    await sendTelegramMessage({ chatId, text: getHelpMessage() })
    response.status(200).json({ ok: true, skipped: 'Invalid order format' })
    return
  }

  try {
    await appendOrderToBestellijst({
      db,
      serverTimestamp,
      order,
      telegram: {
        chatId,
        messageId: message.message_id,
        username: message.from?.username || '',
        firstName: message.from?.first_name || '',
        receivedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('telegramWebhook Firestore fout', error)
    response.status(500).json({ ok: false, error: 'Firestore write failed' })
    return
  }

  await sendTelegramMessage({
    chatId,
    text: `Bestelling ontvangen: ${order.quantity}x ${order.product}${
      order.size ? ` maat ${order.size}` : ''
    } voor ${order.name}.`,
  })

  response.status(200).json({ ok: true })
}

// setWebhook instellen na deploy:
// curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<FUNCTION_URL>"
// <FUNCTION_URL> is de URL van de gedeployde telegramWebhook Cloud Function.
