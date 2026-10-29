import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/user.entity';
import { Company, CompanyType } from '../companies/company.entity';
import { Delivery, DeliveryStatus, BlockchainStatus } from '../deliveries/delivery.entity';
import { Approval, ApprovalDecision } from '../approvals/approval.entity';
import { BlockchainTransaction, BlockchainTxStatus, BlockchainTxType } from '../blockchain/blockchain-transaction.entity';
import { ProofRecord, VerificationStatus } from '../proofs/proof-record.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { Role, SYSTEM_ROLES } from '../role-permissions/role-permissions';
import * as crypto from 'crypto';

/**
 * Development seed data.
 * Run via: npx ts-node -r tsconfig-paths/register src/database/seed.ts
 * This will wipe existing data and recreate fresh seed records.
 */
async function seed(dataSource: DataSource) {
  console.log('🌱 Seeding database...\n');

  // ── Clear existing data ────────────────────────────────────────────────────
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const entity of [AuditLog, ProofRecord, BlockchainTransaction, Approval, Delivery, User, Company]) {
    await dataSource.getRepository(entity).clear();
  }
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

  // ── Companies ──────────────────────────────────────────────────────────────
  const companyRepo = dataSource.getRepository(Company);
  const companyA = companyRepo.create({
    name: 'Acme Logistics Ltd.',
    organizationCode: 'ACME-A',
    organizationType: CompanyType.SENDER,
    description: 'Primary sender organization — manages outgoing shipments',
    isActive: true,
  });
  const companyB = companyRepo.create({
    name: 'GlobalTrade Receivers Inc.',
    organizationCode: 'GTR-B',
    organizationType: CompanyType.RECEIVER,
    description: 'Receiver organization — processes incoming deliveries',
    isActive: true,
  });
  const companyAuditor = companyRepo.create({
    name: 'ClearAudit Services',
    organizationCode: 'CAS-AUDIT',
    organizationType: CompanyType.AUDITOR,
    description: 'Independent audit organization',
    isActive: true,
  });
  await companyRepo.save([companyA, companyB, companyAuditor]);
  console.log('✅ Companies seeded');

  // ── Users ──────────────────────────────────────────────────────────────────
  const ROUNDS = 10;
  const userRepo = dataSource.getRepository(User);
  const [hashAdmin, hashA, hashB, hashAudit] = await Promise.all([
    bcrypt.hash('Admin@123', ROUNDS),
    bcrypt.hash('CompanyA@123', ROUNDS),
    bcrypt.hash('CompanyB@123', ROUNDS),
    bcrypt.hash('Auditor@123', ROUNDS),
  ]);

  // users store their role as a number (roles.id), so make sure the built-in roles exist first
  const roleRepo = dataSource.getRepository(Role);
  for (const r of SYSTEM_ROLES) {
    if (!(await roleRepo.findOne({ where: { key: r.key } }))) await roleRepo.save(roleRepo.create({ ...r, isSystem: true }));
  }
  const roleIdOf = async (key: string) => (await roleRepo.findOneByOrFail({ key })).id;

  const admin = userRepo.create({
    name: 'System Administrator',
    email: 'admin@proofchain.dev',
    passwordHash: hashAdmin,
    roleId: await roleIdOf(UserRole.ADMIN),
    companyId: companyA.id,
    isActive: true,
  });
  const userA = userRepo.create({
    name: 'Alice Sender',
    email: 'alice@companya.dev',
    passwordHash: hashA,
    roleId: await roleIdOf(UserRole.COMPANY_A),
    companyId: companyA.id,
    isActive: true,
  });
  const userB = userRepo.create({
    name: 'Bob Receiver',
    email: 'bob@companyb.dev',
    passwordHash: hashB,
    roleId: await roleIdOf(UserRole.COMPANY_B),
    companyId: companyB.id,
    isActive: true,
  });
  const auditor = userRepo.create({
    name: 'Carol Auditor',
    email: 'carol@auditor.dev',
    passwordHash: hashAudit,
    roleId: await roleIdOf(UserRole.AUDITOR),
    companyId: companyAuditor.id,
    isActive: true,
  });
  await userRepo.save([admin, userA, userB, auditor]);
  console.log('✅ Users seeded');

  // ── Helper: canonical hash ─────────────────────────────────────────────────
  const makeHash = (payload: Record<string, unknown>) =>
    crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');

  // ── Deliveries ─────────────────────────────────────────────────────────────
  const deliveryRepo = dataSource.getRepository(Delivery);
  const txRepo = dataSource.getRepository(BlockchainTransaction);
  const proofRepo = dataSource.getRepository(ProofRecord);
  const approvalRepo = dataSource.getRepository(Approval);

  const seeds = [
    {
      ref: 'DEL-2024-001',
      desc: 'High-precision electronic components — Batch A',
      qty: 500,
      status: DeliveryStatus.APPROVED,
      bcStatus: BlockchainStatus.CONFIRMED,
      approved: true,
      meta: { weight: '12.5kg', fragile: true, category: 'Electronics' },
    },
    {
      ref: 'DEL-2024-002',
      desc: 'Industrial cooling units — Shipment #7',
      qty: 12,
      status: DeliveryStatus.PENDING,
      bcStatus: BlockchainStatus.CONFIRMED,
      approved: false,
      meta: { weight: '340kg', requiresForklift: true, category: 'HVAC' },
    },
    {
      ref: 'DEL-2024-003',
      desc: 'Pharmaceutical reagents — Cold chain verified',
      qty: 1000,
      status: DeliveryStatus.REJECTED,
      bcStatus: BlockchainStatus.CONFIRMED,
      approved: false,
      rejected: true,
      meta: { temperature: '-20C', hazmat: false, category: 'Pharma' },
    },
    {
      ref: 'DEL-2024-004',
      desc: 'Office furniture and fixtures — New HQ setup',
      qty: 75,
      status: DeliveryStatus.PENDING,
      bcStatus: BlockchainStatus.CONFIRMED,
      approved: false,
      meta: { rooms: 15, assembly_required: true, category: 'Furniture' },
    },
    {
      ref: 'DEL-2024-005',
      desc: 'Automotive spare parts — Urgent restocking',
      qty: 200,
      status: DeliveryStatus.APPROVED,
      bcStatus: BlockchainStatus.CONFIRMED,
      approved: true,
      meta: { urgency: 'high', partNumbers: ['AP-001', 'AP-002'], category: 'Automotive' },
    },
  ];

  for (const s of seeds) {
    const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');

    // The id is generated on save, and the proof hash includes it, so save first and hash afterwards.
    const delivery = deliveryRepo.create({
      deliveryReference: s.ref,
      senderCompanyId: companyA.id,
      receiverCompanyId: companyB.id,
      description: s.desc,
      quantity: s.qty,
      metadata: s.meta,
      status: s.status,
      blockchainStatus: s.bcStatus,
      createdBy: userA.id,
    });
    await deliveryRepo.save(delivery);

    const payload = {
      deliveryId: delivery.id,
      deliveryReference: s.ref,
      senderCompanyId: companyA.id,
      receiverCompanyId: companyB.id,
      description: s.desc,
      quantity: s.qty,
      metadata: s.meta,
    };
    const hash = makeHash(payload);
    delivery.payloadHash = hash;
    await deliveryRepo.save(delivery);

    const tx = txRepo.create({
      deliveryId: delivery.id,
      transactionHash: fakeHash,
      blockNumber: Math.floor(Math.random() * 900000) + 100000,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      transactionType: BlockchainTxType.PROOF_REGISTRATION,
      status: BlockchainTxStatus.CONFIRMED,
      gasUsed: Math.floor(Math.random() * 50000) + 45000,
    });
    await txRepo.save(tx);

    const proof = proofRepo.create({
      deliveryId: delivery.id,
      algorithm: 'SHA-256',
      payloadHash: hash,
      blockchainTransactionId: tx.id,
      canonicalPayload: JSON.stringify(payload),
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    });
    await proofRepo.save(proof);

    if (s.approved) {
      await approvalRepo.save(
        approvalRepo.create({
          deliveryId: delivery.id,
          reviewerId: userB.id,
          decision: ApprovalDecision.APPROVED,
          comment: 'Goods verified and accepted. All documentation in order.',
        }),
      );
    }
    if ((s as any).rejected) {
      await approvalRepo.save(
        approvalRepo.create({
          deliveryId: delivery.id,
          reviewerId: userB.id,
          decision: ApprovalDecision.REJECTED,
          comment: 'Cold chain documentation incomplete. Please resubmit with temp logs.',
        }),
      );
    }
  }
  console.log('✅ Deliveries, transactions, proofs, and approvals seeded');

  console.log('\n🎉 Seed complete!\n');
  console.log('Development login credentials:');
  console.log('  Admin     : admin@proofchain.dev     / Admin@123');
  console.log('  Company A : alice@companya.dev       / CompanyA@123');
  console.log('  Company B : bob@companyb.dev         / CompanyB@123');
  console.log('  Auditor   : carol@auditor.dev        / Auditor@123\n');
}

// ── Standalone runner ─────────────────────────────────────────────────────────
if (require.main === module) {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306'),
    username: process.env.DB_USERNAME ?? 'proofchain',
    password: process.env.DB_PASSWORD ?? 'ProofChain_Dev_2024!',
    database: process.env.DB_DATABASE ?? 'proofchain_db',
    entities: [User, Role, Company, Delivery, Approval, BlockchainTransaction, ProofRecord, AuditLog],
    synchronize: true,
    charset: 'utf8mb4',
  });

  dataSource.initialize()
    .then(() => seed(dataSource))
    .then(() => dataSource.destroy())
    .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
}

export { seed };
