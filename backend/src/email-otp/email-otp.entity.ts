import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('email_otps')
@Index(['account_type', 'email'], { unique: true })
export class EmailOtp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  account_type: string;

  @Column({ type: 'varchar', length: 150 })
  email: string;

  @Column({ type: 'varchar', length: 64 })
  code_hash: string;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'datetime' })
  sent_at: Date;

  @Column({ type: 'datetime', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'tinyint', default: 0 })
  attempts: number;
}
