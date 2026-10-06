# References — source manifest

These skills emit from the local `references/` files. Nothing is fetched live at runtime except
the version check. To refresh, re-read the source pages, update the files in `skills/_shared/references/`,
run `npm run skills:sync`, and update the dates here.

| Local file | Source | Last synced | Provenance |
|---|---|---|---|
| `api-schema.md` | https://sandbox.activitypaygateway.co/docs/api/ (requests, quickstart, transactions_sale_auth, transactions_capture, transactions_void, transactions_refund, transactions_search, customer_vault, invoices), /docs/services/tokenizer, /docs/services/webhooks | 2026-10-06 | gateway docs, curated slice |
| `error-response-format.md` | /docs/api/requests (errors, unauthorized), /docs/api/transactions_response | 2026-10-06 | gateway docs, curated slice + ActivityPay guidance |
| `test-data.md` | /docs/test_data | 2026-10-06 | gateway docs, curated slice |

## Known documentation inconsistencies

- `GET /api/transaction/{id}` is documented returning `data` as an array; other endpoints return an object.
- The test data page's CVV example uses `cvv`; the Sale/Auth reference uses `card.cvc` (use `cvc`).
- The tokenizer-to-vault workflow example uses `address_line_1` in the vault billing address; the vault reference uses `line_1` (use `line_1`).
