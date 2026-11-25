# RazorpayX claim payouts

The Wallet claim form sends the requested amount and recipient bank details to the authenticated backend. The backend encrypts the stored bank details, debits the user's wallet in a database transaction, creates a RazorpayX contact and fund account, and submits an INR payout. RazorpayX webhooks update the final status. The browser never receives RazorpayX credentials.

## Requirements before enabling payouts

- Activate an eligible RazorpayX account and complete Razorpay's business verification.
- Allowlist the backend server's outbound IP address in RazorpayX.
- Fund the RazorpayX account separately. A Payment Gateway payment is not automatically available in the RazorpayX payout account.
- Successful incoming payments (`direction = in`) credit the wallet of the user who recorded the payment. Razorpay webhook settlements use the user who created the order. The credit and payment are saved in one transaction. Outgoing payments do not credit wallets.
- Deleting an incoming payment reverses its wallet credit only when no claim debit was recorded afterward. Otherwise deletion is blocked because the credit may already have funded a claim. Razorpay payments remain undeletable.
- Admins can also grant wallet credits through the audited credit endpoint, but they must first verify the approved business funding record and available funds. Claims are limited to each user's wallet ledger balance.
- Test the entire flow using RazorpayX test credentials and test webhooks before using live credentials.

## Backend configuration

Set these only in the backend environment/secrets manager. Do not commit credentials:

```env
RAZORPAYX_PAYOUTS_ENABLED=false
RAZORPAYX_KEY_ID=
RAZORPAYX_KEY_SECRET=
RAZORPAYX_ACCOUNT_NUMBER=
RAZORPAYX_API_BASE=https://api.razorpay.com/v1
RAZORPAYX_QUEUE_IF_LOW_BALANCE=false
RAZORPAYX_WEBHOOK_SECRET=
CLAIM_BANK_ENCRYPTION_KEY=
```

Generate a 32-byte encryption key once with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set that 64-character hexadecimal value as `CLAIM_BANK_ENCRYPTION_KEY`, keep it stable and backed up securely, and plan a data re-encryption migration before rotating it. The RazorpayX webhook secret is configured independently from the Payment Gateway webhook secret.

Keep `RAZORPAYX_PAYOUTS_ENABLED=false` until the account, wallet-credit source, webhook, and test flow have been checked. Set it to `true` only when the server is intentionally allowed to initiate real payouts. Use the matching test or live RazorpayX key pair and account number.

## Database

For a new MySQL installation, apply `database/claims-wallet.sql`. For an installation where the claims tables already exist, apply `database/claims-wallet-payout-upgrade.sql` once. The upgrade adds the client request UUID, payout idempotency key, and the last four digits of the destination account. Opening a wallet also backfills earlier incoming payments for that user exactly once. Historical incoming payments without a `created_by` user cannot be assigned to a wallet and are skipped. For a bulk backfill instead, stop the backend and apply `database/wallet-payment-credits.sql` once.

## Webhook configuration

Register a public HTTPS endpoint in the RazorpayX Dashboard:

```text
https://<your-backend-host>/api/claims/webhook
```

Use the same secret as `RAZORPAYX_WEBHOOK_SECRET` and subscribe to `payout.processed`, `payout.failed`, and `payout.reversed`. Keep the endpoint reachable over HTTPS and test webhook signature validation before going live. The authenticated claim-history endpoint also fetches the latest RazorpayX payout status for processing claims, so the UI can reconcile if a webhook is delayed or unavailable.

## Payout behavior

- Claim submission automatically starts a payout. The frontend shows the account suffix, claim reference, current status, failure reason or UTR.
- Payout amounts are converted from rupees to integer paise. Requests use NEFT and include a persisted `X-Payout-Idempotency` key. Low-balance queuing is controlled by `RAZORPAYX_QUEUE_IF_LOW_BALANCE` and defaults to `false`.
- If low-balance queuing is enabled, RazorpayX can accept a payout as `queued`; the wallet amount remains reserved and the claim stays processing until RazorpayX processes or rejects it. Queuing does not fund the RazorpayX account or mean that money has been transferred.
- Each claim submission also carries a client request UUID with a database uniqueness constraint, so a lost browser response can be safely resubmitted without creating another claim or payout.
- If the payout request times out or has an uncertain server error, the claim remains `PROCESSING` and its amount stays reserved. Retrying uses the same key to prevent a duplicate transfer.
- While a claim has a payout ID and remains processing, claim-history reads and the **Refresh status** action fetch that payout from RazorpayX. The payout ID is authoritative; a returned reference or amount is also checked when present. `processed` completes the claim; `failed`, `reversed`, `cancelled`, and `rejected` fail it and refund the wallet once. Queued and in-progress statuses remain processing.
- In RazorpayX Test Mode, payouts do not automatically advance to `processed`. Open the payout in the RazorpayX Dashboard and manually move it to `Processed`. The configured `payout.processed` webhook updates the claim; claim-history polling also fetches the status from RazorpayX and reconciles it.
- Definitive failures and signed `payout.failed` webhooks refund the wallet once. A signed `payout.reversed` event also releases the reserved wallet amount.
- The frontend polls while a claim is pending or processing. A transfer is shown as complete only after RazorpayX reports it as processed.
- An application admin can create a wallet credit at `POST /api/wallet/users/:userId/credits`. Each credit requires a reason or approval reference and a unique request UUID; the ledger stores the admin user ID and the credit is written to the audit log in the same database transaction. Admins cannot credit their own wallet.
