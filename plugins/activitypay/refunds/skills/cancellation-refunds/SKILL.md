---
name: cancellation-refunds
description: >
  Guides developers of tour, activity, and rental booking software through cancellations on
  ActivityPay: choosing void (before settlement) or refund (after settlement), partial refunds for
  fee-based cancellation policies, releasing unused authorizations, refunding deposits, idempotent
  refund handling, and recording refund transactions. Use when the user mentions cancellations,
  refunds, partial refunds, cancellation fees, rain-outs, weather cancellations, no-shows, voiding a
  charge, or releasing a hold, even without endpoint names. Do NOT use for taking payments (use
  booking-checkout or deposits-balance-due) or for chargebacks and disputes.
metadata:
  version: "0.1.0"
  category: refunds
  status: draft
---

# Cancellation Refunds

## Version check (run this first)

Compare `metadata.version` with
`https://raw.githubusercontent.com/damon964/activitypay-skills/main/plugins/activitypay/refunds/skills/cancellation-refunds/SKILL.md`.
If older, tell the developer and ask whether to continue. If the fetch fails, note it and continue.

---

## Quick reference

```text
GET  /api/transaction/{id}                 → data.status
status authorized | pending_settlement     → POST /api/transaction/{id}/void        (full amount, no body)
status settled | partially_refunded        → POST /api/transaction/{id}/refund      { "amount": <cents> }  (omit for full)
Refund response: new transaction, type "refund", referenced_transaction_id = original id
```

## References

`references/api-schema.md`, `references/error-response-format.md`, `references/test-data.md`, `references/_sources.md`.

## Core principles

1. **Status decides the operation.** Void only works before settlement and always cancels the full amount. Refund only works after settlement and supports partial amounts. Fetch the transaction status first; do not guess from timestamps.
2. **Policy math lives in the booking software.** Compute the refund amount (in cents) from the cancellation policy and the amount actually paid. The gateway only executes it.
3. **Partial refund before settlement is not possible.** Options: wait for settlement then refund the partial amount, or (for authorizations) capture only the fee and let the rest release. Explain this to the developer rather than voiding the full amount silently.
4. **Several partial refunds are allowed**, but their total cannot exceed the settled amount. Track the refunded total per booking.
5. **Make refunds safe to retry.** Record "refund requested" with amount before calling the gateway. On a timeout, check the original (`amount_refunded`, status) or search for `type: refund` with the same `order_id` before retrying, so a guest is never refunded twice.
6. **Store every refund transaction id** and link it to the booking and the original payment.
7. Deposits and balances are separate transactions: refund each one according to policy.
8. Integer cents; timeout ≥ 180 s; log `x-correlation-id`.

## Intake

Scan for booking cancellation flows, policy rules, admin tools, and existing payment records. Confirm:
- Cancellation policy tiers (e.g. 100% if >48 h, 50% if >24 h, 0% after) and who can override.
- Operator-initiated cancellations (weather, minimum not met) → usually full refunds.
- Are payments sales or authorizations? Deposits plus balances?
- Refund to original card only (yes, this is the gateway behavior) and how to tell the guest.

## Step 1 — Refund service

`cancelPayment(transactionId, refundCents)`:
1. `GET /api/transaction/{id}`.
2. If `authorized` / `pending_settlement`: if `refundCents` equals the full amount, void. Otherwise return a clear "partial refund available after settlement" result (or capture the fee for authorizations).
3. If `settled` / `partially_refunded`: `POST /refund` with `amount`.
4. Check the refund's `response_code` (100-199 approved). Record it.

### Checkpoint
Sandbox: sale then same-day cancel → void. A settled sale → partial refund returns a new `refund` transaction.

## Step 2 — Booking-level orchestration

For bookings with several payments (deposit + balance), apply the policy to the total paid and refund across transactions (most recent first is common). Update the booking: refunded amount, status, audit trail, guest notification.

## Step 3 — Handle failures

| Case | Action |
|---|---|
| Refund declined (e.g. test card `4000000000000010`) | Mark "refund failed", alert staff; do not retry automatically in a loop |
| Gateway says not settled | Use void (full) or wait for settlement |
| Timeout | Check `amount_refunded` on the original before retrying |

## Testing with the ActivityPay MCP server

`create_sandbox_transaction` (`void`, `refund`), `get_transaction` to see `status` and `amount_refunded`, `explain_response_code`.
Certification: `check_integration_readiness` with `flows: [..., "cancellations"]` needs a void and a refund from the developer's own code (a partial refund is recommended).

## Common mistakes

- Calling refund on an unsettled transaction (fails) or void on a settled one (fails).
- Voiding the whole amount when the policy says partial.
- Floats for refund amounts.
- Retrying a timed-out refund without checking whether it went through.
- Not storing the refund transaction id.
