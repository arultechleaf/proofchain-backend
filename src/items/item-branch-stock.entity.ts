import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * How much of one item is held at one branch / godown. `items.stock` stays the total across branches,
 * so everything that already reads item.stock keeps working.
 */
@Entity('item_branch_stock')
@Index(['itemId', 'branchId'], { unique: true })
@Index(['companyId'])
export class ItemBranchStock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({ name: 'branch_id', type: 'int' })
  branchId: number;

  @Column({ type: 'double', default: 0 })
  quantity: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
