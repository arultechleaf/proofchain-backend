import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Item } from './item.entity';

export enum StockReason {
  OPENING = 'opening',
  SALE = 'sale',
  PURCHASE = 'purchase',
  ADJUSTMENT = 'adjustment',
  CANCELLED = 'cancelled',
}

@Entity('stock_movements')
@Index(['itemId'])
@Index(['companyId'])
export class StockMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @ManyToOne(() => Item, { eager: false })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  /** Signed quantity change (negative for stock out). */
  @Column({ name: 'quantity_change', type: 'double' })
  change: number;

  @Column({ name: 'balance_after', type: 'double' })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 30 })
  reason: StockReason;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
