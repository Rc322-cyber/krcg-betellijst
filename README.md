# React + Vite

## Telegram bot MVP

Deze repo bevat een Firebase Cloud Function webhook voor eenvoudige Telegram bestellingen.

Verwacht berichtformaat:

```text
Naam: Raf
Product: Trui GCF
Maat: L
Aantal: 1
```

De webhook schrijft naar hetzelfde Firestore document als de app: `krcg/bestellijst`.

Benodigde npm packages voor de Cloud Function:

```bash
cd functions
npm install firebase-admin firebase-functions
```

Telegram bot token:

- Zet `TELEGRAM_BOT_TOKEN` als Firebase secret/env var.
- Hardcode de token niet in de repository.
- De comments in `functions/telegramWebhook.js` tonen waar de token gelezen wordt.

Deploy:

```bash
firebase deploy --only functions:telegramWebhook
```

Webhook koppelen aan Telegram na deploy:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<FUNCTION_URL>"
```

`<FUNCTION_URL>` is de URL die Firebase toont na deploy van `telegramWebhook`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
