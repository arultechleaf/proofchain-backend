-- Non-GST sales: a flag on invoices (1 = GST invoice, 0 = Non-GST sale). Existing rows stay GST invoices.
-- Only needed on MySQL with DB_SYNCHRONIZE=false; SQLite and synchronize=true add the column by themselves.
ALTER TABLE invoices ADD COLUMN is_gst TINYINT(1) NOT NULL DEFAULT 1;
-- The two new screens (non_gst_sales, non_gst_sales_create) and their role permissions are created when the backend starts.

-- Pay-first Razorpay: an order can exist before its invoice does.
ALTER TABLE razorpay_orders MODIFY invoice_id INT NULL;
