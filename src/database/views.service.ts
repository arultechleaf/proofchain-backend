import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Read-only database views that show sales and purchases as their own "tables".
 *
 * Sales and purchase bills are both rows of `invoices` (type = 'sale' / 'purchase') with their
 * items in `invoice_lines`. The views below give each side its own name for reports and for
 * browsing in MySQL Workbench. They hold no data of their own, so they cannot go out of sync, and
 * the application keeps reading and writing `invoices` as before.
 */
const VIEWS: Array<{ name: string; sql: string }> = [
  {
    name: 'purchases',
    sql: `SELECT i.id, i.company_id, i.invoice_number AS bill_number, i.party_id, p.name AS supplier_name,
                 i.invoice_date AS bill_date, i.due_date, i.subtotal, i.tax_total, i.discount, i.total,
                 i.paid_amount, (i.total - i.paid_amount) AS balance_due, i.status, i.notes,
                 i.created_by, i.created_at
          FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
          WHERE i.type = 'purchase'`,
  },
  {
    name: 'purchase_lines',
    sql: `SELECT l.id, l.invoice_id AS purchase_id, l.position, l.item_id, l.description,
                 l.quantity, l.rate, l.tax_rate, l.amount
          FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
          WHERE i.type = 'purchase'`,
  },
  {
    name: 'sales',
    sql: `SELECT i.id, i.company_id, i.invoice_number, i.party_id, p.name AS customer_name,
                 i.invoice_date, i.due_date, i.subtotal, i.tax_total, i.discount, i.total,
                 i.paid_amount, (i.total - i.paid_amount) AS balance_due, i.status, i.notes,
                 i.created_by, i.created_at
          FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
          WHERE i.type = 'sale'`,
  },
  {
    name: 'sales_lines',
    sql: `SELECT l.id, l.invoice_id AS sale_id, l.position, l.item_id, l.description,
                 l.quantity, l.rate, l.tax_rate, l.amount
          FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
          WHERE i.type = 'sale'`,
  },
];

@Injectable()
export class DatabaseViewsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseViewsService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Runs after TypeORM has created or updated the tables the views read from. */
  async onApplicationBootstrap() {
    const created: string[] = [];
    for (const view of VIEWS) {
      try {
        await this.dataSource.query(`DROP VIEW IF EXISTS \`${view.name}\``);
        await this.dataSource.query(`CREATE VIEW \`${view.name}\` AS ${view.sql}`);
        created.push(view.name);
      } catch (err) {
        // A real table with this name would block the view; report it but never stop the app.
        this.logger.warn(`Could not create view "${view.name}": ${(err as Error).message}`);
      }
    }
    if (created.length) this.logger.log(`Database views ready: ${created.join(', ')}`);
  }
}
