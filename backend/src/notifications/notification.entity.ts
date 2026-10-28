import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type NotificationType = 'delivery' | 'approval' | 'invoice' | 'payment' | 'system';

@Entity('notifications')
@Index(['userId', 'isRead'])
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Recipient. */
  @Column({ name: 'user_id', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'system' })
  type: NotificationType;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  message: string;

  /** In-app path the notification opens, e.g. /deliveries/<id>. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  link: string | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
