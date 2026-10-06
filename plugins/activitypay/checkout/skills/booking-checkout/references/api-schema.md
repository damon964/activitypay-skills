# ActivityPay gateway API reference (curated slice)

Local snapshot for ActivityPay skills. Emit field names, endpoints, and enum values from this
file, not from memory. Full machine-readable spec: `spec/openapi.yaml` in the activitypay-mcp repo.
Source and sync date: see `_sources.md`.

## Base URL and auth

| Environment | Base URL |
|---|---|
| Sandbox | `https://sandbox.activitypaygateway.co` |
| Production | Issued by ActivityPay after review. Never hardcode; read from config. |

Headers on every server-side request:

```
Authorization: api_xxxxxxxxxxxxxxxx      (private key, NO "Bearer" prefix)
Content-Type: application/json
```

- Private keys start with `api_` (server only). Public keys start with `pub_` (browser only, for hosted payment fields).
- Every response has an `x-correlation-id` header. Log it.
- HTTP client timeout: at least 180 seconds.
- Amounts are integers in cents (`$12.99` → `1299`).

Response envelope: `{"status": "success" | "failed", "msg": "...", "data": ...}`.

## Transactions

### POST /api/transaction — sale or authorize

| Field | Type | Notes |
|---|---|---|
| `type` | string, required | `sale`, `authorize`, `verification`, `credit` |
| `amount` | int, required* | Cents, final total including fees/tax/tip. (*or `base_amount`) |
| `payment_method` | object, required | Exactly one of `token`, `customer`, `card`, `ach`, `terminal`, `apple_pay_token`, `google_pay_token`, `apm` |
| `payment_method.token` | string | From hosted payment fields. Expires 2 minutes after creation |
| `payment_method.customer.id` | string | Vault customer id |
| `payment_method.customer.payment_method_id` | string | Optional; defaults to customer's default |
| `order_id` | string | Up to 17 letters/digits. Use the booking id |
| `description` | string | Max 255 |
| `idempotency_key` | string (UUID) | Same key within `idempotency_time` returns the original transaction |
| `idempotency_time` | int | Seconds, default 300 |
| `billing_address` | object | `first_name`, `last_name`, `company`, `address_line_1`, `address_line_2`, `city`, `state`, `postal_code`, `country`, `email`, `phone` (digits), `fax` |
| `tip_amount`, `tax_amount`, `shipping_amount`, `discount_amount` | int | Cents, included in `amount` |
| `line_items[]` | array | `name`, `description`, `product_code`, `quantity`, `unit_price`, `amount`, `tax_amount`, `discount_amount` |
| `email_receipt` / `email_address` | bool / string | |
| `allow_partial_payment` | bool | Accept partial approvals |
| `create_vault_record` | bool | Save the payment method to a new vault customer after success |
| `create_vault_record_for` | string | Add the payment method to an existing customer id |
| `initiated_by` | string | `customer` or `merchant` (card on file) |
| `stored_credential_indicator` | string | `stored` (first use) or `used` (later uses) |
| `card_on_file_indicator` | string | `C` (general) or `R` (recurring) |
| `billing_method` | string | `straight` (default), `initial_recurring`, `recurring` |
| `initial_transaction_id` | string | Only if not using the gateway vault |
| `processor_id` | string | Only if the account has no default processor |

### POST /api/transaction/{id}/capture

Body (all optional, default to the authorization): `amount`, `tax_amount`, `shipping_amount`, `tax_exempt`, `order_id`, `po_number`, `ip_address`.

### POST /api/transaction/{id}/void

No body. Only before settlement. Full amount. Response `data` is `null`.

### POST /api/transaction/{id}/refund

Body: `amount` (omit for full refund), `surcharge`. Only after settlement. Several partial refunds allowed up to the settled amount. Creates a new transaction with `type: "refund"` and `referenced_transaction_id`.

### GET /api/transaction/{id}

Returns the transaction. Documented with `data` as a one-item array; accept an object too.

### POST /api/transaction/search

Filters: string fields take `{"operator": "=" | "!=", "value": "..."}`; number fields also take `<`, `>`. Date ranges: `{"start_date": "YYYY-MM-DDTHH:MM:SSZ", "end_date": "..."}`. Fields: `transaction_id`, `type`, `status`, `amount`, `amount_authorized`, `amount_captured`, `amount_settled`, `order_id`, `po_number`, `payment_method`, `customer_id`, `settlement_batch_id`, `created_at`, `captured_at`, `settled_at`, billing/shipping address fields. `limit` 0-100, `offset`. Default window: prior four months. Response includes `total_count`.

### Transaction fields to read

`id`, `type`, `status`, `response` (`approved`/`declined`), `response_code`, `amount`, `amount_authorized`, `amount_captured`, `amount_settled`, `amount_refunded`, `order_id`, `customer_id`, `referenced_transaction_id`, `transaction_source`, `response_body.card.{masked_card, card_type, avs_response_code, cvv_response_code, auth_code}`, `created_at`, `captured_at`, `settled_at`.

`status` values: `authorized`, `pending_settlement`, `settled`, `declined`, `voided`, `reversed`, `refunded`, `partially_refunded`, `returned`, `late_return`, `pending`, `flagged`, `flagged_partner`, `unknown`.

## Customer vault

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/vault/customer` | Create customer with `default_payment` (`token`, or `card` with `number` + `expiration_date`) |
| GET | `/api/vault/{customer id}` | Get customer, addresses, cards |
| POST | `/api/vault/customer/search` | Search |
| POST | `/api/vault/customer/{customer id}` | Update `description`, `notes`, `flags`, `defaults` |
| DELETE | `/api/vault/{customer id}` | Delete |
| POST | `/api/vault/customer/{customer id}/token` | Add a card from a token |
| DELETE | `/api/vault/customer/{customer id}/card/{payment method id}` | Remove a card |

Create query params: `validate=true` ($0.00 verification), `authorize=true` ($1.00 auth, never captured).
Vault addresses use `line_1` / `line_2` (not `address_line_1`).
Store from the create response: `data.id` (customer id) and `data.data.customer.defaults.payment_method_id`.
Display: `data.data.customer.payments.cards[].masked_number`, `card_type`.

## Invoices (payment links)

`POST /api/invoice` required fields: `currency`, `payable_to`, `bill_to` (each with `address_line_1`, `city`, `state` (2 letters), `postal_code`, `country` (2 letters)), `date_due` (ISO date-time), `items[]` (each `unit_price`, `quantity`, `status: "pending"`), `tax_percent` (string, `"0.000"`), `payment_methods` (`["card"]`), `card_processor_id` and `ach_processor_id` (`""` = default), `send_via` (`email`, `text`, `both`, `none`).
Optional: `invoice_number` (becomes the paying transaction's `order_id`), `customer_id`, `message`, `email_to`, `allow_partial_payment` + `settings.partial_payment_type` (`amount` or `line_items`), `transaction_type` (`sale`/`authorize`), `save_customer_vault` (`none`/`optional`/`required`).
Response: `data.id`, `data.public_hash`, `data.hosted_url` (send this to the guest).
Other: `GET /api/invoice/{id}`, `POST /api/invoices/search`, `POST /api/invoice/{id}` (update), `DELETE /api/invoice/{id}`, `POST /api/invoice/{id}/resend`, `POST /api/invoice/{id or public_hash}/pay`.
Status values seen: `pending`, `partially_paid`, `paid`, `past_due`, `declined`.

## Hosted payment fields (Tokenizer)

Script: `https://sandbox.activitypaygateway.co/tokenizer/tokenizer.js`. Options: `url` (gateway base URL), `apikey` (`pub_` key), `container`, `submission(resp)`, `settings.payment.card.requireCVV`, `settings.user`, `settings.billing`, `settings.styles`. `resp.status`: `success` (`resp.token`), `validation` (`resp.invalid`), `error` (`resp.msg`). Call `tokenizer.submit()`.

## Webhooks

See `error-response-format.md` for HTTP errors; webhook details:
- Families and subtypes: `transaction` (`transaction_create`, `transaction_update`, `transaction_void`, `transaction_capture`, `transaction_settlement`), `settlement` (`settlement_batch`), `cardsync` (`transaction_automatic_account_updater_vault_update`), plus `test`.
- Headers: `Signature` (HMAC-SHA256 of raw body, Base64 URL, no padding), `Signature-Previous`, `X-Webhook-Event-Id`, `X-Webhook-Replay-Of`.
- Keys: webhook signing secret for live events; `00000000-0000-4000-8000-000000000001` for `"type": "test"`.
- Body ends with a newline. Respond within 15 s. Live: 200-204. Probes: exactly 200.
- Envelope: `status`, `msg`, `type`, `account_type`, `account_type_id`, `transaction_id`, `action_at`, `data`.
