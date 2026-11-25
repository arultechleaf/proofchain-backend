-- Backfill incoming payments recorded before wallet credits were integrated.
-- Stop the backend before running this script.
CREATE TEMPORARY TABLE wallet_payment_credit_backfill (
  payment_id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL
);

INSERT INTO wallet_payment_credit_backfill (payment_id, user_id, amount)
SELECT p.id, p.created_by, ROUND(p.amount, 2)
FROM payments p
INNER JOIN users u ON u.id = p.created_by
WHERE p.direction = 'in'
  AND p.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM wallet_transactions wt
    WHERE wt.reference_id = CONCAT('payment-credit-', p.id)
  );

START TRANSACTION;

INSERT INTO wallets (user_id, balance)
SELECT user_id, SUM(amount)
FROM wallet_payment_credit_backfill
GROUP BY user_id
ON DUPLICATE KEY UPDATE balance = wallets.balance + VALUES(balance);

INSERT INTO wallet_transactions (
  wallet_id,
  type,
  amount,
  reference_id,
  created_by,
  description
)
SELECT
  w.wallet_id,
  'payment_credit',
  b.amount,
  CONCAT('payment-credit-', b.payment_id),
  b.user_id,
  CONCAT('Incoming payment ', b.payment_id)
FROM wallet_payment_credit_backfill b
INNER JOIN wallets w ON w.user_id = b.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM wallet_transactions wt
  WHERE wt.reference_id = CONCAT('payment-credit-', b.payment_id)
);

COMMIT;
DROP TEMPORARY TABLE wallet_payment_credit_backfill;
