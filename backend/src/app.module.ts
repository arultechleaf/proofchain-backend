import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { ProofsModule } from './proofs/proofs.module';
import { VerificationModule } from './verification/verification.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AuditModule } from './audit/audit.module';

import { User } from './users/user.entity';
import { Company } from './companies/company.entity';
import { Delivery } from './deliveries/delivery.entity';
import { Approval } from './approvals/approval.entity';
import { BlockchainTransaction } from './blockchain/blockchain-transaction.entity';
import { ProofRecord } from './proofs/proof-record.entity';
import { AuditLog } from './audit/audit-log.entity';
import { Party } from './parties/party.entity';
import { Item } from './items/item.entity';
import { StockMovement } from './items/stock-movement.entity';
import { Invoice } from './invoices/invoice.entity';
import { InvoiceLine } from './invoices/invoice-line.entity';
import { Payment } from './payments/payment.entity';
import { RazorpayOrder } from './payments/razorpay-order.entity';
import { PartiesModule } from './parties/parties.module';
import { ItemsModule } from './items/items.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { EmailOtp } from './email-otp/email-otp.entity';

const ENTITIES = [
  User, Company, Delivery, Approval, BlockchainTransaction, ProofRecord, AuditLog,
  Party, Item, StockMovement, Invoice, InvoiceLine, Payment, RazorpayOrder, EmailOtp,
];

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // ── Rate Limiting ─────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),

    // ── Database ─────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<string>('DB_TYPE', 'sqlite');
        if (dbType === 'sqlite') {
          return {
            type: 'better-sqlite3',
            database: config.get<string>('SQLITE_PATH', './proofchain.sqlite'),
            entities: ENTITIES,
            synchronize: true,
            logging: config.get<string>('DB_LOGGING', 'false') === 'true',
          } as any;
        }
        return {
          type: 'mysql',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 3306),
          username: config.get<string>('DB_USERNAME', 'proofchain'),
          password: config.get<string>('DB_PASSWORD', ''),
          database: config.get<string>('DB_DATABASE', 'proofchain_db'),
          entities: ENTITIES,
          synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
          logging: config.get<string>('DB_LOGGING', 'false') === 'true',
          charset: 'utf8mb4',
          timezone: 'Z',
        };
      },
    }),

    // ── Feature Modules ───────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CompaniesModule,
    DeliveriesModule,
    ApprovalsModule,
    ProofsModule,
    VerificationModule,
    BlockchainModule,
    AuditModule,
    DashboardModule,
    HealthModule,
    PartiesModule,
    ItemsModule,
    InvoicesModule,
    PaymentsModule,
    ReportsModule,
  ],
})
export class AppModule {}
