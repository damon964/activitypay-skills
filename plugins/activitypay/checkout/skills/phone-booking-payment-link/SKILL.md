---
name: phone-booking-payment-link
description: >
  Guides developers of booking software through taking payment for phone, walk-up, or
  staff-created bookings with ActivityPay hosted payment links (invoices with a hosted_url), so
  staff never see or type card numbers. Covers creating the invoice with POST /api/invoice, sending
  the link by SMS or email, partial-payment links for deposits, and confirming the booking from the
  transaction_create webhook. Use when the user mentions phone bookings, call centers, payment
  links, pay-by-link, invoices, sending a link to pay, or collecting a balance remotely. Do NOT use
  for online self-serve checkout (use booking-checkout) or for charging a saved card (use card-on-file).
metadata:
  version: "0.1.3"
  category: checkout
  status: draft
---

# Phone Bookings With Payment Links

## Version check (run this first)

Compare `metadata.version` with
`https://raw.githubusercontent.com/damon964/activitypay-skills/main/plugins/activitypay/checkout/skills/phone-booking-payment-link/SKILL.md`.
If older, tell the developer and ask whether to continue. If the fetch fails, note it and continue.

---

## Quick reference

```text
POST /api/invoice
{ "currency": "USD", "invoice_number": "<booking id>", "date_due": "<ISO>",
  "payable_to": {business address}, "bill_to": {guest name/email + address},
  "items": [{ "name": "...", "quantity": 1, "unit_price": <cents>, "status": "pending" }],
  "tax_percent": "0.000", "send_via": "none", "payment_methods": ["card"],
  "card_processor_id": "", "ach_processor_id": "" }
→ data.hosted_url  (send to the guest)
Paid → transaction_create webhook with data.order_id == invoice_number
```

## References

`references/api-schema.md` (Invoices section), `references/error-response-format.md`,
`references/test-data.md`, `references/_sources.md`. Read `api-schema.md` before emitting the body.

## Core principles

1. **Staff never handle card numbers.** No "enter card for customer" screens. Always send a link.
2. **`invoice_number` = booking id** so the paying transaction's `order_id` matches the booking.
3. **Required fields are strict.** `payable_to` and `bill_to` each need `address_line_1`, `city`, 2-letter `state`, `postal_code`, 2-letter `country`. `tax_percent` is a string. `card_processor_id` and `ach_processor_id` are required (empty string uses the default).
4. **Dual pricing merchants need card and ACH.** If the merchant has dual pricing enabled, card-only invoices are refused. Send `"payment_methods": ["card", "ach"]` for them; the guest then also sees a bank account option. Detect it per merchant (from onboarding data or by handling the error).
5. **`send_via: "none"`** when the booking software sends the link itself (SMS provider, email template). Use `email`/`text`/`both` only if the gateway should send it.
6. **Confirm from the webhook**, not from the staff member saying "they paid". Polling `GET /api/invoice/{id}` is a fallback.
7. **Hold inventory with an expiry** while the link is outstanding; release or cancel the invoice (`DELETE /api/invoice/{id}`) when it lapses.
8. Integer cents; timeout ≥ 180 s; log `x-correlation-id`; private key on the server only.

## Intake

Scan for the staff booking screen, SMS/email sending, booking hold logic, and webhook handling. Then confirm:
- Full payment or deposit by link? (Deposit: `allow_partial_payment: true`, `settings.partial_payment_type: "amount"`.)
- How is the link delivered (SMS, email, both) and from which system?
- How long is the hold, and what happens when it expires?
- Is the guest's billing address collected on the call? (If not, decide what to send as `bill_to`.)

## Step 1 — Create the link from the staff screen

Server endpoint builds the invoice from the booking (amount computed server-side), calls `POST /api/invoice`, stores `id`, `public_hash`, and `hosted_url` on the booking, and returns the URL to the staff UI with a "Send link" action.

### Checkpoint
Sandbox invoice returns a `hosted_url`; opening it shows the amount; paying with `4111111111111111` succeeds.

## Step 2 — Send the link

Message template: business name, what is being paid for, amount, expiry, link. Do not include anything else sensitive.

## Step 3 — Confirm the booking

Handle `transaction_create` webhooks: verify signature (see `webhooks` skill), check `response_code` 100-199, find the booking by `data.order_id` (= `invoice_number`, or invoice id if none), mark paid, notify staff. For partial-payment links, compare paid amounts to the booking total.

### Checkpoint
Paying the sandbox link marks the booking paid without staff action.

## Testing with the ActivityPay MCP server

`create_payment_link` to see a working request and URL; `send_test_webhook` with `event_type: "transaction_create"` to test confirmation handling.
For certification: `check_integration_readiness` with `flows: [..., "payment_links"]`. It needs an invoice created by the developer's own code that has been paid.

## Common mistakes

- Missing `bill_to` address fields → 400.
- Numeric `tax_percent` instead of the string `"0.000"`.
- Omitting `card_processor_id` / `ach_processor_id`.
- Confirming the booking when the link is sent instead of when it is paid.
- Letting staff type card numbers "just this once".
- `card and ACH payment methods must be enabled since dual pricing permission is enabled`: the merchant has dual pricing; include `"ach"`.
- `invalid customer number`: keep `customer_number` to letters and digits.
