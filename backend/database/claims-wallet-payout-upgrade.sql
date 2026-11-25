-- Run once on installations where claims already exists.
ALTER TABLE wallet_transactions
  ADD COLUMN created_by INT NULL;

ALTER TABLE claims
  ADD COLUMN request_id CHAR(36) NULL,
  ADD COLUMN payout_idempotency_key CHAR(36) NULL,
  ADD COLUMN bank_account_last_four VARCHAR(4) NULL;

UPDATE claims
SET request_id = UUID(),
    payout_idempotency_key = UUID()
WHERE request_id IS NULL OR payout_idempotency_key IS NULL;

UPDATE claims c
LEFT JOIN claim_bank_accounts b ON b.user_id = c.user_id
SET c.bank_account_last_four = COALESCE(b.last_four, '0000')
WHERE c.bank_account_last_four IS NULL;

ALTER TABLE claims
  MODIFY request_id CHAR(36) NOT NULL,
  MODIFY payout_idempotency_key CHAR(36) NOT NULL,
  MODIFY bank_account_last_four VARCHAR(4) NOT NULL,
  ADD UNIQUE KEY uq_claims_user_request (user_id, request_id),
  ADD UNIQUE KEY uq_claims_payout_idempotency_key (payout_idempotency_key);
