---
name: booking-checkout
description: >
  Guides developers of tour, activity, ticketing, rental, and outdoor recreation booking software
  through an ActivityPay online checkout: hosted payment fields (Tokenizer) in the browser, a
  server-side sale with POST /api/transaction, idempotent retries, decline handling, partial
  approvals, and booking confirmation. Use this skill when the user wants to take card payments for
  bookings, build or fix a checkout or "pay now" page, charge a Tokenizer token, handle declined
  cards, or connect a booking flow to the ActivityPay or Fluid Pay gateway, even if they don't name
  the endpoints. Do NOT use for deposits with a later balance (use deposits-balance-due), phone or
  staff-entered bookings (use phone-booking-payment-link), cancellations and refunds (use
  cancellation-refunds), saving cards for later (use card-on-file), or webhook endpoints (use webhooks).
metadata:
  version: "0.1.0"
  category: checkout
  status: draft
---

# Booking Checkout

## Version check (run this first)

1. Read this skill's `metadata.version` above.
2. Fetch the published copy and read its `metadata.version`:
   `https://raw.githubusercontent.com/activitypay/skills/main/plugins/activitypay/checkout/skills/booking-checkout/SKILL.md`
3. If this version is older, tell the developer a newer version exists and ask whether to continue or upgrade first. If the fetch fails, say the version could not be verified and continue.

---

## Quick reference

```text
Browser: https://sandbox.activitypaygateway.co/tokenizer/tokenizer.js   (public pub_ key)
Server:  POST https://sandbox.activitypaygateway.co/api/transaction        (private api_ key)
         Authorization: api_xxx      (no "Bearer")
         Content-Type: application/json
Body:    { "type": "sale", "amount": <cents>, "order_id": "<booking id>",
           "idempotency_key": "<uuid>", "payment_method": { "token": "<token>" } }
Approved when data.response_code is 100-199.
```

## References

| File | Use for |
|---|---|
| `references/api-schema.md` | Every field name, endpoint, and enum value |
| `references/error-response-format.md` | HTTP errors, response codes, what to show the guest |
| `references/test-data.md` | Test cards and MCP tools for testing |
| `references/_sources.md` | Where the references came from and when |

Read `api-schema.md` before emitting any request body. Do not use field names from memory.

## Core principles

1. **Card data never touches the developer's servers.** The card form is the gateway's hosted iframe (Tokenizer). Never build a custom card input, never log or store card numbers or CVV, never accept card numbers in an API of their own.
2. **Two keys, two places.** The `pub_` key goes in browser code. The `api_` key stays on the server, read from an environment variable (match the codebase's convention; otherwise `ACTIVITYPAY_API_KEY`). Never put the `api_` key in client bundles, mobile apps, or source control.
3. **HTTP 200 is not "approved".** Check `data.response_code`: 100-199 approved, 200-299 issuer decline, 300-399 gateway decline, 400-499 processor error.
4. **Idempotency on every sale.** Generate one UUID per payment attempt, store it with the booking before calling the gateway, and reuse it if retrying after a timeout or network error.
5. **Timeout at least 180 seconds** on the gateway HTTP client.
6. **Amounts are integer cents.** Convert at the edge; never send floats.
7. **`order_id` = booking id** (up to 17 letters and digits) so payments, refunds, and webhooks can be matched.
8. **Tokens expire in 2 minutes.** Charge immediately after the browser hands the token over.
9. **Log `x-correlation-id`** with every gateway call.

## Intake

Scan the codebase first: language and framework, where checkout lives, how bookings and holds are modelled, existing HTTP client and env var conventions, any existing payment code. Then ask only what you could not infer:

- What is being booked, and is inventory held during checkout? For how long?
- Full payment now, or a deposit? (Deposit → also use `deposits-balance-due`.)
- Do they collect tips, taxes, or fees on top of the price?
- Should the card be saved for later charges? (Yes → also use `card-on-file`.)
- Which currency? (Sandbox examples use USD.)

## Prerequisites

Needed to run and test, not to write code. If missing, warn and keep building with env vars.

1. ActivityPay sandbox account with a private `api_` key and a public `pub_` key (sandbox control panel → Settings → API Keys).
2. Optional but recommended: the ActivityPay MCP server connected to the developer's AI tool, for testing.

### Checkpoint
Keys are configured via env vars, or the developer knows which variables to set.

---

## Step 1 — Hosted payment fields in the checkout page

Load the script and create the form with the public key. On `submission`, handle `success` (send `resp.token` to the server), `validation` (show field errors from `resp.invalid`), and anything else (generic retry message). Set `url` to the gateway base URL (required for localhost). Enable `requireCVV`. Optionally collect name, email, and billing ZIP with `settings.user` / `settings.billing`.

Generate the idempotency key for this attempt (UUID) when the guest starts paying and send it with the token, or generate it server-side and store it on the booking before calling the gateway.

If the ActivityPay MCP server is connected, `get_code_sample` with `flow: "hosted_payment_fields"` returns a complete example in the developer's language.

### Checkpoint
The iframe renders, and submitting with `4111111111111111` / `12/30` produces a token in the browser console.

## Step 2 — Server endpoint that charges the token

Create an endpoint (e.g. `POST /checkout/charge`) that:

1. Loads the booking and checks it is still held and unpaid. Computes the amount server-side. Never trust an amount from the browser.
2. Reuses the stored idempotency key for this attempt, or creates and stores one.
3. Calls `POST /api/transaction` with `type: "sale"`, `amount`, `order_id`, `idempotency_key`, `payment_method.token`, and `billing_address` (name, email, postal code) when available.
4. Logs `x-correlation-id`, transaction `id`, and `response_code`.
5. Returns a simple result to the browser: approved, declined (with a friendly message), or error.

### Checkpoint
A sandbox sale with `4111111111111111` returns `response_code` 100 and the booking stores the transaction id.

## Step 3 — Handle every outcome

| Outcome | Booking software should |
|---|---|
| 100-199, `amount_authorized == amount` | Mark the booking paid, store transaction id and correlation id, send confirmation |
| 100-199, `amount_authorized < amount` (partial, only with `allow_partial_payment`) | Do not confirm in full. Collect the rest (second card or payment link) or void and ask for another card |
| 200-299 | Keep the hold, show "Your card was declined. Please try another card.", allow retry with a NEW idempotency key |
| 300-399 | Log for the developer; show a generic error. 301 means a duplicate was blocked: look up the original |
| 400-499, 5xx, timeout | Do not create a new charge. Look up by `order_id` (POST /api/transaction/search) or retry with the SAME idempotency key |

### Checkpoint
Run `4000000000000002` (decline), `4000000000009995` (insufficient funds), and a forced timeout retry. No double charges, clear messages.

## Step 4 — Confirm via webhook (recommended)

Subscribe to `transaction_create` so the booking is confirmed even if the browser closes mid-request. Use the `webhooks` skill.

## Testing with the ActivityPay MCP server

- `list_test_cards` for scenarios; `explain_response_code` for anything unexpected.
- `get_transaction` to inspect what the developer's code created.
- Before go-live: `check_integration_readiness` with `flows: ["checkout", ...]`. It ignores transactions the MCP tools created, so the developer's own checkout must produce an approved sale, a decline, and use idempotency keys.

## Common mistakes

- Sending `Authorization: Bearer api_...`. The header value is the bare key.
- Using the `pub_` key on the server → `unauthorized`.
- Sending `12.99` instead of `1299`.
- Treating HTTP 200 as approved.
- Generating a new idempotency key on retry (double charge risk).
- Confirming a booking on a partial approval.
- Charging a token more than 2 minutes after it was created.
