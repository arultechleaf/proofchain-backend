import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('payout_ledger')
export class PayoutLedger {
  @PrimaryGeneratedColumn({
    name: 'payout_ledger_id',
    type: 'bigint',
  })
  payout_ledger_id: string;

  @Column({ name: 'payment_id', type: 'bigint' })
  payment_id: string;

  @Column({ name: 'earner_user_id', type: 'int' })
  earner_user_id: number;

  @Column({ name: 'earner_role_id', type: 'int' })
  earner_role_id: number;

  @Column({
    name: 'own_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  own_amount: string;

  @Column({
    name: 'rolled_up_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  rolled_up_amount: string;

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  amount: string;

  @Column({
    name: 'rolled_up_roles',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  rolled_up_roles: string | null;

  @Column({
    type: 'enum',
    enum: ['ON_HOLD', 'CREDITED', 'CANCELLED'],
    default: 'ON_HOLD',
  })
  status: 'ON_HOLD' | 'CREDITED' | 'CANCELLED';

  @Column({ name: 'release_at', type: 'datetime' })
  release_at: Date;

  @Column({
    name: 'credited_at',
    type: 'datetime',
    nullable: true,
  })
  credited_at: Date | null;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: true,
  })
  created_at: Date | null;
}
