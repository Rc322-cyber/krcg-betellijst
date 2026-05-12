const COLLECTION_NAME = 'krcg'
const DOCUMENT_NAME = 'bestellijst'
const SESSION_COLLECTION_NAME = 'telegramSessions'

const PRODUCTS = [
  { id: 'trui_gcf', name: 'Trui GCF' },
  { id: 'tshirt_gcf_zwart', name: 'T-shirt GCF zwart' },
]
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
const QUANTITIES = ['1', '2', '3', '4']

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

const getProductById = (productId) =>
  PRODUCTS.find((product) => product.id === productId) || null

const createInlineKeyboard = (buttons, columns = 1) => ({
  inline_keyboard: buttons.reduce((rows, button, index) => {
    if (index % columns === 0) {
      rows.push([])
    }

    rows[rows.length - 1].push(button)
    return rows
  }, []),
})

const getProductKeyboard = () =>
  createInlineKeyboard(
    PRODUCTS.map((product) => ({
      text: product.name,
      callback_data: `order:product:${product.id}`,
    })),
  )

const getSizeKeyboard = (productId) =>
  createInlineKeyboard(
    SIZES.map((size) => ({
      text: size,
      callback_data: `order:size:${productId}:${size}`,
    })),
    3,
  )

const getQuantityKeyboard = (productId, size) =>
  createInlineKeyboard(
    QUANTITIES.map((quantity) => ({
      text: quantity,
      callback_data: `order:quantity:${productId}:${size}:${quantity}`,
    })),
    4,
  )

const getConfirmKeyboard = (productId, size, quantity) =>
  createInlineKeyboard([
    {
      text: 'Bevestigen',
      callback_data: `order:confirm:${productId}:${size}:${quantity}`,
    },
  ])

const parseCallbackData = (data = '') => {
  const [scope, step, productId, size, quantity] = data.split(':')

  if (scope !== 'order') {
    return null
  }

  return {
    step,
    productId,
    size,
    quantity,
  }
}

const callTelegramApi = async (method, payload) => {
  // Vul TELEGRAM_BOT_TOKEN in als Firebase secret/env var, niet hardcoded in git.
  // Voorbeeld lokaal/functions env: TELEGRAM_BOT_TOKEN=123456:ABC...
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    return
  }

  await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const sendTelegramMessage = async ({ chatId, text, replyMarkup }) => {
  if (!chatId) {
    return
  }

  await callTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

const answerTelegramCallback = async (callbackQueryId) => {
  if (!callbackQueryId) {
    return
  }

  await callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
  })
}

const clearTelegramInlineKeyboard = async ({ chatId, messageId }) => {
  if (!chatId || !messageId) {
    return
  }

  await callTelegramApi('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  })
}

const getSessionRef = (db, chatId) =>
  db.collection(SESSION_COLLECTION_NAME).doc(String(chatId))

const getTelegramSession = async ({ db, chatId }) => {
  if (!chatId) {
    return null
  }

  const snapshot = await getSessionRef(db, chatId).get()

  return snapshot.exists ? snapshot.data() : null
}

const saveTelegramSession = async ({ db, serverTimestamp, chatId, session }) => {
  if (!chatId) {
    return
  }

  await getSessionRef(db, chatId).set(
    {
      ...session,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

const clearTelegramSession = async ({ db, chatId }) => {
  if (!chatId) {
    return
  }

  await getSessionRef(db, chatId).delete()
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

const handleTelegramCallback = async ({
  callbackQuery,
  db,
  serverTimestamp,
}) => {
  const chatId = callbackQuery.message?.chat?.id
  const callback = parseCallbackData(callbackQuery.data)
  const session = await getTelegramSession({ db, chatId })
  const productId = callback?.productId || session?.productId
  const product = getProductById(productId)

  console.log('telegramWebhook callback parsing resultaat', callback)

  await answerTelegramCallback(callbackQuery.id)

  if (!callback || !chatId) {
    await sendTelegramMessage({
      chatId,
      text: 'Er ging iets mis. Start opnieuw met /start.',
    })
    return { ok: true, skipped: 'Invalid callback data' }
  }

  if (callback.step === 'product' && !session?.name) {
    await saveTelegramSession({
      db,
      serverTimestamp,
      chatId,
      session: { step: 'name' },
    })
    await sendTelegramMessage({
      chatId,
      text: 'Geef je naam in:',
    })
    return { ok: true, skipped: 'Missing session name' }
  }

  if (callback.step === 'product' && product) {
    console.log('telegramWebhook product gekozen', {
      chatId,
      product: product.name,
    })
    await saveTelegramSession({
      db,
      serverTimestamp,
      chatId,
      session: {
        step: 'size',
        name: session?.name || '',
        productId: product.id,
        product: product.name,
      },
    })
    await sendTelegramMessage({
      chatId,
      text: 'Kies een maat.',
      replyMarkup: getSizeKeyboard(product.id),
    })
    return { ok: true }
  }

  if (callback.step === 'size' && product && SIZES.includes(callback.size)) {
    console.log('telegramWebhook maat gekozen', {
      chatId,
      product: product.name,
      size: callback.size,
    })
    await saveTelegramSession({
      db,
      serverTimestamp,
      chatId,
      session: {
        step: 'quantity',
        name: session?.name || '',
        productId: product.id,
        product: product.name,
        size: callback.size,
      },
    })
    await sendTelegramMessage({
      chatId,
      text: 'Kies een aantal.',
      replyMarkup: getQuantityKeyboard(product.id, callback.size),
    })
    return { ok: true }
  }

  if (
    callback.step === 'quantity' &&
    product &&
    SIZES.includes(callback.size) &&
    QUANTITIES.includes(callback.quantity)
  ) {
    const orderPreview = {
      name: session?.name || '',
      product: product.name,
      size: callback.size,
      quantity: callback.quantity,
    }

    console.log('telegramWebhook aantal gekozen', {
      chatId,
      quantity: callback.quantity,
      order: orderPreview,
    })
    await saveTelegramSession({
      db,
      serverTimestamp,
      chatId,
      session: {
        step: 'confirm',
        ...orderPreview,
        productId: product.id,
      },
    })
    await sendTelegramMessage({
      chatId,
      text: [
        `Naam: ${orderPreview.name}`,
        `Product: ${orderPreview.product}`,
        `Maat: ${orderPreview.size}`,
        `Aantal: ${orderPreview.quantity}`,
        'Bevestigen?',
      ].join('\n'),
      replyMarkup: getConfirmKeyboard(product.id, callback.size, callback.quantity),
    })
    return { ok: true }
  }

  if (
    callback.step === 'confirm' &&
    product &&
    SIZES.includes(callback.size) &&
    QUANTITIES.includes(callback.quantity)
  ) {
    const messageId = callbackQuery.message?.message_id
    const order = {
      name: session?.name || '',
      product: product.name,
      size: callback.size,
      quantity: callback.quantity,
    }

    console.log('telegramWebhook bevestigen gekozen', {
      chatId,
      order,
    })
    console.log('telegramWebhook parsing resultaat', order)

    if (!order.name) {
      await sendTelegramMessage({
        chatId,
        text: 'Er ontbreekt een naam. Start opnieuw met /start.',
      })
      return { ok: true, skipped: 'Missing session name' }
    }

    try {
      await appendOrderToBestellijst({
        db,
        serverTimestamp,
        order,
        telegram: {
          chatId,
          messageId: callbackQuery.message?.message_id,
          username: callbackQuery.from?.username || '',
          firstName: callbackQuery.from?.first_name || '',
          lastName: callbackQuery.from?.last_name || '',
          receivedAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      console.error('telegramWebhook Firestore fout', error)
      throw error
    }

    await sendTelegramMessage({
      chatId,
      text: 'Bestelling opgeslagen \u2705',
    })
    await clearTelegramInlineKeyboard({ chatId, messageId })
    await clearTelegramSession({ db, chatId })
    return { ok: true }
  }

  await sendTelegramMessage({
    chatId,
    text: 'Er ging iets mis. Start opnieuw met /start.',
  })
  return { ok: true, skipped: 'Unsupported callback step' }
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

  const callbackQuery = request.body?.callback_query

  if (callbackQuery) {
    try {
      const result = await handleTelegramCallback({
        callbackQuery,
        db,
        serverTimestamp,
      })

      response.status(200).json(result)
    } catch {
      response.status(500).json({ ok: false, error: 'Firestore write failed' })
    }
    return
  }

  const message = request.body?.message
  const text = message?.text
  const chatId = message?.chat?.id

  console.log('telegramWebhook ontvangen text', text || '')

  if (!text) {
    response.status(200).json({ ok: true, skipped: 'No text message' })
    return
  }

  if (text.trim().startsWith('/start')) {
    console.log('telegramWebhook start ontvangen', { chatId })
    await saveTelegramSession({
      db,
      serverTimestamp,
      chatId,
      session: { step: 'name' },
    })
    await sendTelegramMessage({
      chatId,
      text: 'Geef je naam in:',
    })
    response.status(200).json({ ok: true })
    return
  }

  const session = await getTelegramSession({ db, chatId })

  if (session?.step === 'name') {
    const name = text.trim()

    console.log('telegramWebhook naam ontvangen', { chatId, name })

    if (!name) {
      await sendTelegramMessage({
        chatId,
        text: 'Geef je naam in:',
      })
      response.status(200).json({ ok: true, skipped: 'Empty name' })
      return
    }

    await saveTelegramSession({
      db,
      serverTimestamp,
      chatId,
      session: {
        step: 'product',
        name,
      },
    })
    await sendTelegramMessage({
      chatId,
      text: 'Kies een product.',
      replyMarkup: getProductKeyboard(),
    })
    response.status(200).json({ ok: true })
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
