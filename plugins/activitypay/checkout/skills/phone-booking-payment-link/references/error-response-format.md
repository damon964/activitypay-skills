# ActivityPay gateway errors and response codes

Read this before writing any error handling. Emit codes and shapes from here, not from memory.

## Two kinds of failure

1. **The request failed** (HTTP 4xx/5xx). Body:
   ```json
   { "status": "failed", "msg": "bad request error: invalid Postal Code" }
   ```
   `msg` usually names the bad field. There is no machine-readable error code; branch on HTTP status.
2. **The request worked but the payment was not approved.** A transaction was created and
   `data.response_code` says why. **HTTP 200 does not mean approved.** Always check `response_code`.

## HTTP status handling

| HTTP | Meaning | What to do |
|---|---|---|
| 200 | Request processed | Check `data.response_code` |
| 400 | Invalid request | Fix the field named in `msg`. Do not retry unchanged |
| 401 | `unauthorized` | Wrong key type (`pub_` on server), deleted key, IP/URL restriction, or sandbox/production mismatch |
| 404 | Not found | Wrong id or wrong account |
| 5xx / timeout | Gateway or network problem | Look the transaction up (by `order_id` search) before retrying; retry with the SAME `idempotency_key` |

## Response code ranges

| Range | Meaning | Booking software should |
|---|---|---|
| 100-199 | Approved (100 approved, 101 approved pending customer approval, 110 partial approval) | Confirm (for 110, compare `amount_authorized` to `amount` first) |
| 200-299 | Declined by the issuer | Show a friendly decline, keep the booking hold, let the guest try another card. Never auto-retry |
| 300-399 | Declined by the gateway (rules, duplicates) | Usually an integration or account setting |
| 400-499 | Processor error | Retry later with the same `idempotency_key` |
| 0 / 99 | Unknown / pending payment | Wait for webhook or contact support |

## Codes worth handling explicitly

| Code | Meaning | Action |
|---|---|---|
| 110 | Partial approval | Collect remainder (second card or payment link) or void |
| 202 | Insufficient funds | Ask for another card or offer smaller deposit |
| 205 | SCA required | Run 3DS via hosted fields (`tokenizer.submit(amount)`) |
| 223 | Expired card | Ask for a current card; enable account updater for stored cards |
| 225 | Invalid CVC | Ask guest to re-enter |
| 250-253 | Pick up / lost / stolen | Decline politely. Never retry |
| 261, 262 | Stop recurring | Stop charging this stored card |
| 301 | Duplicate transaction | New charges need a new `idempotency_key` and unique `order_id` |
| 310 | Fraud rule | Check account fraud rules |
| 410 | Invalid merchant configuration | Contact ActivityPay support |
| 421 | Processor unreachable | Retry later, same `idempotency_key` |

## AVS and CVV

`response_body.card.avs_response_code`: `Y`/`X`/`M`/`D`/`F` full match, `A` address only, `Z`/`W`/`P` ZIP only, `N` no match, `U`/`R`/`S`/`G`/`0` unavailable, `I` not provided.
`response_body.card.cvv_response_code`: `M` match, `N` no match, `U` not verified, `S` not supported, `I` not provided.
AVS and CVV are fraud signals, not automatic declines.

## Always log

The `x-correlation-id` response header, the transaction `id`, `order_id`, and `response_code`. Support needs the correlation id.
