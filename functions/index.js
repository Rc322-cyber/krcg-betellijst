import admin from 'firebase-admin'
import { defineSecret } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'
import { handleTelegramWebhook } from './telegramWebhook.js'

admin.initializeApp()

const db = admin.firestore()
const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN')

export const telegramWebhook = onRequest(
  {
    region: 'europe-west1',
    cors: false,
    // Vul deze secret met: firebase functions:secrets:set TELEGRAM_BOT_TOKEN
    // De webhook logic leest de token via process.env.TELEGRAM_BOT_TOKEN.
    secrets: [telegramBotToken],
  },
  async (request, response) => {
    await handleTelegramWebhook({
      request,
      response,
      db,
      serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
    })
  },
)
