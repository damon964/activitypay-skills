---
name: deposits-balance-due
description: >
  Guides developers of tour, activity, and rental booking software through taking a deposit at
  booking and collecting the balance later on ActivityPay: vaulting the card from a hosted-fields
  token, charging the deposit as a customer-initiated stored-credential sale, charging the balance
  as a merchant-initiated sale on the due date, and falling back to a payment link when the balance
  declines. Use this skill when the user mentions deposits, balance due, pay later, split payments,
  installments before an activity date, or charging the rest of a booking, even without endpoint
  names. Do NOT use for full payment at checkout (use booking-checkout), saving cards for ad-hoc
  fees only (use card-on-file), or refunds (use cancellation-refunds).
metadata:
  version: "0.1.0"
  category: checkout
  status: draft
---

# Deposits With Balance Due

## Version check (run this first)

Compare `metadata.version` with
`https://raw.githubusercontent.com/damon964/activitypay-skills/main/plugins/activitypay/checkout/skills/deposits-balance-due/SKILL.md`.
If older, tell the developer and ask whether to continue. If the fetch fails, note it and continue.

---

## Quick reference

```text
1. POST /api/vault/customer            { "description": "<booking>", "default_payment": { "token": "<token>" } }
   → store data.id (customer id) and data.data.customer.defaults.payment_method_id
2. POST /api/transaction (deposit)     type sale, amount <deposit>, order_id <booking>,
                                       payment_method.customer.id, initiated_by "customer",
                                       stored_credential_indicator "stored", idempotency_key
3. POST /api/transaction (balance)     same booking order_id, amount <balance>,
   on the due date, from a job         initiated_by "merchant", stored_credential_indicator "used",
                                       NEW idempotency_key
4. Balance declined → POST /api/invoice for the remainder and send hosted_url
```

## References

`references/api-schema.md` (fields), `references/error-response-format.md` (codes),
`references/test-data.md` (cards and MCP tools), `references/_sources.md`.
Read `api-schema.md` before emitting request bodies.

## Core principles

1. **Vault first, then charge.** A Tokenizer token is single use and expires in 2 minutes. Create the vault customer from the token, then charge the customer id for the deposit. (Alternative: deposit sale with `create_vault_record: true`; each such sale creates a new customer.)
2. **Stored-credential flags matter.** Deposit: `initiated_by: "customer"`, `stored_credential_indicator: "stored"`. Balance: `initiated_by: "merchant"`, `stored_credential_indicator: "used"`.
3. **Consent.** At checkout, show the balance amount and the date it will be charged, and record the guest's agreement on the booking. Show "Visa ending 1111" from the vault response.
4. **Same `order_id`, different idempotency keys.** Both charges carry the booking id as `order_id`. Each charge attempt gets its own UUID; retries of the same attempt reuse it.
5. **The balance job must be safe to re-run.** Store the balance idempotency key and the result on the booking before and after calling the gateway. Never charge a booking whose balance is already recorded as paid.
6. **Never store card data.** Only the customer id, payment method id, masked number, and card type.
7. Amounts in integer cents; timeout ≥ 180 s; log `x-correlation-id`.

## Intake

Scan the codebase for booking models, scheduled job infrastructure, and existing payment code. Then confirm:

- Deposit rule: fixed amount, percentage, or per-person? Computed server-side?
- When is the balance due: N days before the activity, on the day, after?
- What happens if the activity is within the balance window at booking time? (Usually charge in full.)
- On balance decline: retry schedule? Payment link? Cancel after a deadline?
- Does the policy allow refunding deposits? (Use `cancellation-refunds`.)

## Step 1 — Checkout: tokenize, vault, charge deposit

Use hosted payment fields (see `booking-checkout`). On the server:
1. `POST /api/vault/customer` with `default_payment.token` and optional `default_billing_address` (`line_1`, `city`, `state`, `postal_code`, `country`, `email`). Consider `?validate=true` for a $0 check.
2. Store `customer_id` and `payment_method_id` on the booking.
3. Charge the deposit with `payment_method.customer`, flags as above.
4. Handle the result exactly like a checkout sale (approved / partial / declined).

### Checkpoint
Sandbox: vault `4111111111111111`, deposit approved, booking shows deposit paid and balance scheduled.

## Step 2 — Balance job

A scheduled job finds bookings with balance due today and no recorded balance payment, then charges the stored card with merchant-initiated flags and the booking `order_id`.

| Result | Action |
|---|---|
| 100-199 | Record balance paid, send receipt |
| 200-299 | Record the decline, email the guest a payment link for the balance (`POST /api/invoice`, `invoice_number` = booking id), schedule follow-up |
| 261/262 | Stop charging this card; payment link only |
| Timeout / 5xx | Do not create a new attempt. Retry with the same idempotency key, or search by `order_id` first |

### Checkpoint
Balance approved with `4111111111111111`. Vault `4000000000009995` as a second test customer and confirm the decline path sends a payment link.

## Testing with the ActivityPay MCP server

`create_customer_token` (vault a test card), `create_sandbox_transaction` with `customer_id` (simulate deposit/balance), `create_payment_link` (fallback), `get_transaction`.
For certification run `check_integration_readiness` with `flows: ["checkout", "deposits", "card_on_file"]`. It needs two approved payments from the developer's own code sharing one `order_id`.

## Common mistakes

- Charging the token twice (deposit then balance). Tokens are single use; vault it.
- Missing or wrong stored-credential flags on the balance charge.
- Balance job without idempotency → double charges when the job retries.
- Using `address_line_1` in vault addresses (vault uses `line_1`).
- No consent record for the merchant-initiated balance charge.
