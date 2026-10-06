# Sandbox test data

Use only in the sandbox. Any future expiration (e.g. `12/30`), any CVV unless testing CVV.

| Card | Result |
|---|---|
| `4111111111111111` | Approve (Visa debit) |
| `4005519200000004` | Approve (Visa credit, surchargeable) |
| `5555555555554444` | Approve (Mastercard) |
| `378282246310005` | Approve (Amex) |
| `6011111111111117` | Approve (Discover) |
| `4000000000000002` | Generic decline |
| `4000000000009995` | Insufficient funds |
| `4000000000009987` | Lost card |
| `4000000000009979` | Stolen card |
| `4000000000000069` | Expired card |
| `4000000000000010` | Sale approves, refund declines |
| `4000000000000051` | Partial approval (50%) |

CVV triggers: `200` → N, `201` → U, `301` → S. Billing postal code triggers: `20000` → AVS N, `20001` → AVS U.
ACH: account `111111111` / routing `111111111` approves; routing `000000000` declines, `000000001` returns, `000000002` late return.
Apple Pay and Google Pay are not available in sandbox.

## With the ActivityPay MCP server

If the developer has the ActivityPay MCP server connected, use its tools to test as you build:
`list_test_cards`, `create_sandbox_transaction`, `get_transaction`, `explain_response_code`,
`create_customer_token`, `create_payment_link`, `send_test_webhook`, and finally
`check_integration_readiness`. Transactions created by MCP tools are excluded from readiness,
so the developer's own code must run each flow.
