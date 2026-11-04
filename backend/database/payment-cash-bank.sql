-- Apply once to an existing MySQL database before deploying the cash/bank payment link.
-- New SQLite databases receive this column and index through TypeORM synchronization.
ALTER TABLE bank_transactions
  ADD COLUMN payment_id INT NULL,
  ADD UNIQUE KEY uq_bank_transactions_payment_id (payment_id);

ALTER TABLE razorpay_orders
  ADD COLUMN bank_account_id INT NULL;
