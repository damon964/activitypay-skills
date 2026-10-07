---
name: card-on-file
description: >
  Guides developers of booking software through storing guest cards in the ActivityPay customer
  vault and charging them later: vaulting a hosted-fields token with POST /api/vault/customer,
  $0 or $1 verification, storing only customer and payment method ids, charging with
  payment_method.customer and correct stored-credential flags, managing multiple cards, and
  account updater. Use when the user mentions saving cards, card on file, returning guests, one-click
  rebooking, add-on or damage charges, no-show fees, memberships, or the customer vault, even
  without endpoint names. Do NOT use for deposit-then-balance flows (use deposits-balance-due, which
  builds on this) or one-time checkout (use booking-checkout).
metadata:
  version: "0.1.3"
  category: vault
  status: draft
---

# Card On File

## Version check (run this first)

Compare `metadata.version` with
`https://raw.githubusercontent.com/damon964/activitypay-skills/main/plugins/activitypay/vault/skills/card-on-file/SKILL.md`.
If older, tell the developer and ask whether to continue. If the fetch fails, note it and continue.

---

## Quick reference

```text
Save:    POST /api/vault/customer?validate=true
         { "description": "...", "default_payment": { "token": "<token>" },
           "default_billing_address": { "line_1": "...", "postal_code": "...", "email": "..." } }
         → data.id, data.data.customer.defaults.payment_method_id, payments.cards[].masked_number
Charge:  POST /api/transaction
         { "type": "sale", "amount": <cents>, "order_id": "<booking>", "idempotency_key": "<uuid>",
           "payment_method": { "customer": { "id": "<customer id>", "payment_method_id": "<pm id>" } },
           "initiated_by": "merchant", "stored_credential_indicator": "used" }
Add card: POST /api/vault/customer/{id}/token   { "token": "<token>" }
Remove:   DELETE /api/vault/customer/{id}/card/{payment method id}
```

## References

`references/api-schema.md` (Customer vault), `references/error-response-format.md`, `references/test-data.md`, `references/_sources.md`.

## Core principles

1. **Store ids, never card data.** Persist the customer id, payment method id, card type, and masked number. CVV is never stored anywhere (PCI rule; the gateway will not store it either).
2. **Cards enter only through hosted payment fields** (token), never typed by staff or accepted by the developer's API.
3. **Verification choice:** `?validate=true` ($0.00 check) is the usual default; `?authorize=true` places a $1.00 hold that is never captured and shows on the guest's statement; neither stores without contacting the issuer.
4. **Flag who started the charge.** Guest-present charges: `initiated_by: "customer"`. Charges the business starts (fees, balances, no-shows): `initiated_by: "merchant"`, `stored_credential_indicator: "used"`.
5. **Consent and transparency.** Record what the guest agreed to be charged for, show the stored card ("Visa ending 1111") in their account, and let them remove it.
6. **One vault customer per guest.** Look up an existing customer id before creating another. `create_vault_record: true` on a sale creates a new customer every time.
7. **Vault addresses use `line_1` / `line_2`**, unlike transactions (`address_line_1`), and must include `country` whenever they include `postal_code`.
8. **Required custom fields apply to stored-card charges too.** Send the merchant's required `custom_fields` on every charge, including ones started by background jobs.
9. Integer cents; idempotency key per charge; timeout ≥ 180 s; log `x-correlation-id`.

## Intake

Scan for the guest/customer model, account pages, existing payment storage, and what triggers later charges. Confirm:
- When is the card saved: at checkout, from the account page, or both?
- What later charges are allowed (add-ons, damage, no-show, memberships), and how is consent captured?
- Multiple cards per guest? Default card selection?
- Card expiry handling: account updater enabled on the merchant? (`cardsync` webhook.)

## Step 1 — Save the card

Server receives a token from hosted fields and either creates a customer (`POST /api/vault/customer`) or adds a card to an existing one (`POST /api/vault/customer/{id}/token`). Store the ids and display fields.

### Checkpoint
Sandbox: vault `4111111111111111` and see `411111******1111` returned.

## Step 2 — Charge it later

Build a charge service that takes booking id, amount, reason, and optional payment method id, then sends the sale with `payment_method.customer` and the right flags. Handle results like checkout (approved / declined / 261-262 stop recurring → stop using the card).

### Checkpoint
Charge the stored card for a no-show fee in sandbox and see it recorded on the booking.

## Step 3 — Manage cards

Guest can view, set default (`POST /api/vault/customer/{id}` with `defaults`), and delete cards. Handle `transaction_automatic_account_updater_vault_update` webhooks to refresh displayed expiry/last four.

## Testing with the ActivityPay MCP server

`create_customer_token` (vault a test card), `create_sandbox_transaction` with `customer_id`, `get_transaction`.
Certification: `check_integration_readiness` with `flows: [..., "card_on_file"]` needs an approved charge to a vaulted customer made by the developer's own code.
Account updater test cards: MCP `list_test_cards` with `category: "account_updater"`.

## Common mistakes

- Storing the token instead of vault ids (tokens expire in 2 minutes).
- Creating duplicate customers for the same guest.
- Missing `initiated_by` / `stored_credential_indicator` on merchant-initiated charges.
- Using `authorize=true` by default and surprising guests with $1 holds.
