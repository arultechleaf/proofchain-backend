import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('items')
@Index(['companyId'])
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', length: 36 })
  companyId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  sku: string | null;

  @Column({ length: 20, default: 'pcs' })
  unit: string;

  @Column({ name: 'sale_price', type: 'double', default: 0 })
  salePrice: number;

  @Column({ name: 'purchase_price', type: 'double', default: 0 })
  purchasePrice: number;

  /** Tax percentage, e.g. 18 for 18%. */
  @Column({ name: 'tax_rate', type: 'double', default: 0 })
  taxRate: number;

  @Column({ type: 'double', default: 0 })
  stock: number;

  @Column({ name: 'low_stock_level', type: 'double', default: 0 })
  lowStockLevel: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
