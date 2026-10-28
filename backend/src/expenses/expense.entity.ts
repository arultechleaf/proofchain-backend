import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Money a company spends that is not a supplier purchase bill: rent, salaries, fuel, etc. */
@Entity('expenses')
@Index(['companyId', 'expenseDate'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', length: 36 })
  companyId: string;

  @Column({ length: 60 })
  category: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'double' })
  amount: number;

  @Column({ name: 'expense_date', length: 10 })
  expenseDate: string;

  @Column({ name: 'payment_method', length: 20, default: 'cash' })
  paymentMethod: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
