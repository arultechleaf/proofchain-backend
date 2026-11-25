-- ProofChain MySQL initialization
-- This script creates the database and grants permissions.
-- The OTP table is initialized here because the backend has no migration runner.
-- For an existing MySQL database, apply the CREATE TABLE statement below manually.

CREATE DATABASE IF NOT EXISTS proofchain_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON proofchain_db.* TO 'proofchain'@'%';
FLUSH PRIVILEGES;

CREATE TABLE IF NOT EXISTS proofchain_db.email_otps (
  id INT NOT NULL AUTO_INCREMENT,
  account_type VARCHAR(20) NOT NULL,
  email VARCHAR(150) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  sent_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_otps_account_email (account_type, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
