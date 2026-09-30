# Alligentics Outreach

A small outreach inbox for **Cloudflare Workers + D1 + Mailgun**.

It supports:

- Compose and send one-to-one outreach emails
- Backend allow-listed sender identities
- Mailgun outbound API
- Mailgun inbound reply webhook with HMAC-SHA256 signature verification
- D1-backed conversations and messages
- Replying from an existing conversation
- Duplicate inbound-message protection
- No Mailgun API keys committed to GitHub

## 1. Requirements

- Cloudflare account
- Node.js 20+
- A verified Mailgun sending domain
- A Mailgun API key
- Mailgun webhook signing key

## 2. Install

```bash
npm install
```

Then authenticate Wrangler if needed:

```bash
npx wrangler login
```

## 3. Create the D1 database

```bash
npx wrangler d1 create alligentics-outreach
```

Cloudflare will return a database ID. Put that ID in `wrangler.toml`:

```toml
database_id = "YOUR_REAL_D1_DATABASE_ID"
```

Initialize the database:

```bash
npm run db:init:remote
```

## 4. Configure secrets

Never put real credentials into GitHub source files.

Set the Mailgun API key:

```bash
npx wrangler secret put MAILGUN_API_KEY
```

Set the Mailgun webhook signing key:

```bash
npx wrangler secret put MAILGUN_WEBHOOK_SIGNING_KEY
```

Set allowed sender identities as JSON:

```bash
npx wrangler secret put SENDER_IDENTITIES
```

Example value:

```json
{"sarah":{"name":"Sarah","email":"sarah@alligentics.com"},"murtaza":{"name":"Murtaza","email":"murtaza@alligentics.com"}}
```

Only configure addresses that actually exist/are authorized for your Mailgun domain.

## 5. Deploy

```bash
npm run deploy
```

Open the deployed Worker URL. You should see the Alligentics Outreach UI.

## 6. Test outbound first

Before configuring inbound email, send one test email to an address you control.

If Mailgun rejects it, check:

- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- sender authorization
- Mailgun account/domain status

## 7. Configure inbound replies

The endpoint is:

```text
https://YOUR-WORKER.workers.dev/mailgun/inbound
```

Create a Mailgun Receiving Route that forwards matching inbound mail to that HTTPS endpoint.

The Worker verifies Mailgun's `timestamp + token` HMAC-SHA256 signature using `MAILGUN_WEBHOOK_SIGNING_KEY` before accepting the message.

### Important MX warning

Do **not** replace the MX records for `alligentics.com` if the root domain already receives normal business email through Google Workspace, Zoho, Microsoft 365, or another provider.

In that situation, use a dedicated outreach/receiving subdomain such as `outreach.alligentics.com` and configure Mailgun receiving there instead.

## 8. Environment values

Public configuration in `wrangler.toml`:

```text
MAILGUN_DOMAIN=alligentics.com
MAILGUN_BASE_URL=https://api.mailgun.net
```

Secrets configured in Cloudflare:

```text
MAILGUN_API_KEY
MAILGUN_WEBHOOK_SIGNING_KEY
SENDER_IDENTITIES
```

## Security notes

- Sender addresses are selected from the backend allow-list. The browser cannot choose arbitrary `From` addresses.
- Inbound Mailgun requests are signature-checked.
- Mailgun message IDs are de-duplicated when present.
- API keys are Cloudflare secrets, not source code.
- The app currently has no user login. Do not expose it publicly for real outreach until authentication is added.
