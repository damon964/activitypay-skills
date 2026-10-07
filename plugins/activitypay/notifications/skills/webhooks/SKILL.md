---
name: webhooks
description: >
  Guides developers of booking software through receiving ActivityPay gateway webhooks: choosing
  event families and subtypes (transaction, settlement, cardsync), verifying the Signature header
  (HMAC-SHA256 of the raw body, Base64 URL, shared test key for test events), deduplicating with
  X-Webhook-Event-Id, responding within 15 seconds, handling retries and secret rotation, and using
  events to confirm bookings paid by link, catch ACH returns, and reconcile settlements. Use when the
  user mentions webhooks, payment notifications, callbacks, signature verification, settlement
  events, or confirming payments asynchronously. Do NOT use for taking payments themselves.
metadata:
  version: "0.1.3"
  category: notifications
  status: draft
---

# Webhooks

## Version check (run this first)

Compare `metadata.version` with
`https://raw.githubusercontent.com/damon964/activitypay-skills/main/plugins/activitypay/notifications/skills/webhooks/SKILL.md`.
If older, tell the developer and ask whether to continue. If the fetch fails, note it and continue.

---

## Quick reference

```text
Inbound:   POST <your https endpoint>, Content-Type: application/json, body ends with "\n"
Headers:   Signature, Signature-Previous (rotation), X-Webhook-Event-Id, X-Webhook-Replay-Of
Verify:    base64url_nopad(HMAC_SHA256(key, raw_body)) == Signature   (constant-time compare)
Key:       live events → webhook signing secret;  "type":"test" → 00000000-0000-4000-8000-000000000001
Respond:   within 15 s; live 200-204; create/update/test probes need exactly 200
Families:  transaction (transaction_create|update|void|capture|settlement), settlement (settlement_batch),
           cardsync (transaction_automatic_account_updater_vault_update)
```

## References

`references/api-schema.md` (Webhooks section), `references/error-response-format.md`, `references/test-data.md`, `references/_sources.md`.

## Core principles

1. **Verify every delivery against the raw bytes.** Capture the body before any JSON middleware (Express: `express.raw({ type: 'application/json' })`; Flask: `request.get_data()`; PHP: `php://input`). Include the trailing newline. Never re-serialize JSON before hashing.
2. **Pick the key by event type.** `"type": "test"` uses the shared test key; everything else uses the webhook's signing secret (from the control panel, stored as a secret env var). Never skip verification for test events.
3. **Accept `Signature-Previous` too** during secret rotation.
4. **Idempotent processing.** Store processed `X-Webhook-Event-Id` values; return 200 again for duplicates without repeating side effects.
5. **Fast 2xx.** Verify, persist the event, return 200, then process asynchronously. Never return 5xx for "already processed".
6. **Trust but confirm.** For money-moving decisions (marking a booking paid), use `data.response_code` 100-199 and match `data.order_id` to the booking. Optionally re-fetch `GET /api/transaction/{id}`.
7. **One webhook config per family**, with the needed subtypes enabled (empty subtypes = no deliveries).

## Intake

Scan for an existing web framework, background job system, and booking confirmation logic. Confirm:
- Which events matter: payment-link confirmation (`transaction_create`), captures/voids, settlements for reconciliation, ACH returns (`transaction_update`), account updater (`cardsync`)?
- Public HTTPS URL for each environment (sandbox, production)? Local dev via a tunnel?
- Where the signing secret will live.

## Step 1 — Endpoint with verification

Build the route, raw-body capture, signature check (with test-key branch and rotation), dedupe, enqueue, 200. `get_code_sample` (`flow: "webhook_verify"`) on the ActivityPay MCP server returns a full Node, Python, or PHP endpoint.

### Checkpoint
`send_test_webhook` (MCP) with `event_type: "test"` passes all checks, including rejecting a forged signature.

## Step 2 — Register the webhook

Control panel → Manage → Settings → Webhooks. Create one per family. The gateway probes the URL with a test event on create: it must return exactly 200.

## Step 3 — Handle events

| Event | Typical booking-software action |
|---|---|
| `transaction_create` (approved) | Confirm payment-link bookings by `order_id`; record payment |
| `transaction_create` (declined) | Notify staff / guest if a link payment failed |
| `transaction_capture` / `transaction_void` | Sync payment status |
| `transaction_settlement`, `settlement_batch` | Reconciliation and payout reporting |
| `transaction_update` with `returned` / `late_return` | ACH return: flag booking, contact guest |
| `transaction_automatic_account_updater_vault_update` | Refresh stored card display |

## Testing with the ActivityPay MCP server

`send_test_webhook` sends correctly signed events (and a forged one) to the developer's URL, optionally using a real sandbox transaction (`transaction_id`) and their signing secret (`signing_secret`) for live-event verification.
Certification: `check_integration_readiness` with `flows: [..., "webhooks"]` and `webhook_url` tests the endpoint.

## Common mistakes

- Parsing JSON before verifying (signature mismatch).
- Stripping the trailing newline.
- Standard Base64 instead of Base64 URL without padding.
- Using the live secret for test events (or skipping verification for them).
- Returning 204 to the create probe (must be 200).
- Doing slow work before responding (15 s timeout → retries → duplicates).
