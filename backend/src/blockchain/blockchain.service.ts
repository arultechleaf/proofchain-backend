import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  BlockchainTransaction,
  BlockchainTxStatus,
  BlockchainTxType,
} from './blockchain-transaction.entity';

// ABI for DeliveryProofRegistry
const CONTRACT_ABI = [
  'function registerProof(string calldata deliveryId, bytes32 proofHash) external',
  'function verifyProof(string calldata deliveryId, bytes32 candidateHash) external view returns (bool matches, tuple(bytes32 proofHash, address submittedBy, uint256 timestamp, bool exists, uint8 status) entry)',
  'function getProof(string calldata deliveryId) external view returns (tuple(bytes32 proofHash, address submittedBy, uint256 timestamp, bool exists, uint8 status) entry)',
  'function proofExists(string calldata deliveryId) external view returns (bool)',
  'function updateProofStatus(string calldata deliveryId, uint8 newStatus) external',
  'function grantAuthorization(address account) external',
  'function revokeAuthorization(address account) external',
  'function owner() external view returns (address)',
  'function authorized(address) external view returns (bool)',
  'event ProofRegistered(string indexed deliveryId, bytes32 proofHash, address indexed submittedBy, uint256 timestamp)',
  'event ProofStatusUpdated(string indexed deliveryId, uint8 previousStatus, uint8 newStatus, address indexed updatedBy, uint256 timestamp)',
];

export interface ProofEntry {
  proofHash: string;
  submittedBy: string;
  timestamp: number;
  exists: boolean;
  status: number;
}

export interface BlockchainNetworkStatus {
  connected: boolean;
  chainId: number | null;
  blockNumber: number | null;
  nodeUrl: string;
  contractAddress: string | null;
  contractDeployed: boolean;
  mode: 'live' | 'demo';
  peerCount: number | null;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private contractAddress: string | null = null;
  private isConnected = false;
  private blockchainMode: 'live' | 'demo';

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(BlockchainTransaction)
    private readonly txRepo: Repository<BlockchainTransaction>,
  ) {
    this.blockchainMode =
      (this.config.get<string>('BLOCKCHAIN_MODE', 'demo') as 'live' | 'demo');
  }

  async onModuleInit() {
    await this.initialize();
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  private async initialize() {
    const rpcUrl = this.config.get<string>('BESU_RPC_URL', 'http://localhost:8545');
    const signerKey = this.config.get<string>('BESU_SIGNER_PRIVATE_KEY', '');
    this.contractAddress = this.config.get<string>('CONTRACT_ADDRESS', '') || null;

    // Try loading contract address from deployment.json if not in env
    if (!this.contractAddress) {
      this.contractAddress = this.loadContractAddressFromFile();
    }

    if (this.blockchainMode === 'demo') {
      this.logger.warn('🔸 Blockchain mode: DEMO — simulated transactions only');
      return;
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await this.provider.getNetwork();
      this.logger.log(`🔗 Connected to blockchain: chainId=${network.chainId}`);
      this.isConnected = true;

      if (signerKey) {
        this.signer = new ethers.Wallet(signerKey, this.provider);
        this.logger.log(`🔑 Signer: ${this.signer.address}`);
      }

      if (this.contractAddress && this.signer) {
        this.contract = new ethers.Contract(
          this.contractAddress,
          CONTRACT_ABI,
          this.signer,
        );
        this.logger.log(`📜 Contract loaded: ${this.contractAddress}`);
      }
    } catch (err) {
      this.logger.warn(
        `⚠️  Cannot connect to blockchain RPC (${rpcUrl}): ${(err as Error).message}. Falling back to demo mode.`,
      );
      this.blockchainMode = 'demo';
      this.isConnected = false;
    }
  }

  private loadContractAddressFromFile(): string | null {
    const candidates = [
      path.join(process.cwd(), 'src/blockchain/contract-config.json'),
      path.join(process.cwd(), '../blockchain/deployment.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (data.contractAddress) return data.contractAddress as string;
        } catch {}
      }
    }
    return null;
  }

  // ── Proof Hash Calculation ─────────────────────────────────────────────────

  /**
   * Canonicalize a delivery payload and compute its SHA-256 hash.
   * Canonical format: sorted JSON keys, no extra whitespace.
   * The bytes32 representation is also returned for use in Solidity.
   */
  computeProofHash(payload: {
    deliveryId: string;
    deliveryReference: string;
    senderCompanyId: string;
    receiverCompanyId: string;
    description: string;
    quantity: number;
    metadata?: Record<string, unknown> | null;
  }): { hexHash: string; bytes32Hash: string; canonicalPayload: string } {
    const canonical = JSON.stringify({
      deliveryId: payload.deliveryId,
      deliveryReference: payload.deliveryReference,
      senderCompanyId: payload.senderCompanyId,
      receiverCompanyId: payload.receiverCompanyId,
      description: payload.description,
      quantity: payload.quantity,
      metadata: payload.metadata ?? null,
    });

    const hexHash = crypto
      .createHash('sha256')
      .update(canonical, 'utf8')
      .digest('hex');

    // Convert to bytes32 for Solidity: prefix with 0x
    const bytes32Hash = '0x' + hexHash;

    return { hexHash, bytes32Hash, canonicalPayload: canonical };
  }

  /**
   * Canonicalize an invoice/bill and compute its SHA-256 hash. Only the fields that
   * must never change after issue are included (not payment status or paid amount).
   */
  computeInvoiceHash(payload: {
    invoiceId: string;
    type: string;
    invoiceNumber: string;
    companyId: string;
    partyId: string;
    invoiceDate: string;
    dueDate: string | null;
    lines: Array<{
      itemId: string | null;
      description: string;
      quantity: number;
      rate: number;
      taxRate: number;
    }>;
    subtotal: number;
    taxTotal: number;
    discount: number;
    total: number;
  }): { hexHash: string; bytes32Hash: string; canonicalPayload: string } {
    const canonical = JSON.stringify({
      invoiceId: payload.invoiceId,
      type: payload.type,
      invoiceNumber: payload.invoiceNumber,
      companyId: payload.companyId,
      partyId: payload.partyId,
      invoiceDate: payload.invoiceDate,
      dueDate: payload.dueDate ?? null,
      lines: payload.lines.map((l) => ({
        itemId: l.itemId ?? null,
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        taxRate: l.taxRate,
      })),
      subtotal: payload.subtotal,
      taxTotal: payload.taxTotal,
      discount: payload.discount,
      total: payload.total,
    });
    const hexHash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    return { hexHash, bytes32Hash: '0x' + hexHash, canonicalPayload: canonical };
  }

  // ── Blockchain Proof Registration ──────────────────────────────────────────

  async registerProof(
    deliveryId: string,
    payloadHash: string,
    dbTx: BlockchainTransaction,
  ): Promise<BlockchainTransaction> {
    if (this.blockchainMode === 'demo' || !this.contract || !this.isConnected) {
      return this.simulateTransaction(dbTx, 'DEMO — not a real blockchain transaction');
    }

    try {
      const bytes32Hash = payloadHash.startsWith('0x')
        ? payloadHash
        : '0x' + payloadHash;

      const tx = await this.contract.registerProof(deliveryId, bytes32Hash);
      const receipt = await tx.wait(1);

      dbTx.transactionHash = tx.hash;
      dbTx.blockNumber = Number(receipt.blockNumber);
      dbTx.contractAddress = this.contractAddress;
      dbTx.status = BlockchainTxStatus.CONFIRMED;
      dbTx.gasUsed = Number(receipt.gasUsed);

      return await this.txRepo.save(dbTx);
    } catch (err) {
      this.logger.error(`❌ registerProof failed: ${(err as Error).message}`);
      dbTx.status = BlockchainTxStatus.FAILED;
      dbTx.errorMessage = (err as Error).message;
      dbTx.retryCount += 1;
      return await this.txRepo.save(dbTx);
    }
  }

  async verifyProofOnChain(
    deliveryId: string,
    candidateHash: string,
  ): Promise<{ matches: boolean; entry: ProofEntry | null; error?: string }> {
    if (this.blockchainMode === 'demo' || !this.contract || !this.isConnected) {
      return {
        matches: false,
        entry: null,
        error: 'Blockchain not connected — running in demo mode',
      };
    }

    try {
      const bytes32Hash = candidateHash.startsWith('0x')
        ? candidateHash
        : '0x' + candidateHash;
      const [matches, entry] = await this.contract.verifyProof(
        deliveryId,
        bytes32Hash,
      );
      return {
        matches,
        entry: {
          proofHash: entry.proofHash,
          submittedBy: entry.submittedBy,
          timestamp: Number(entry.timestamp),
          exists: entry.exists,
          status: Number(entry.status),
        },
      };
    } catch (err) {
      return { matches: false, entry: null, error: (err as Error).message };
    }
  }

  async getNetworkStatus(): Promise<BlockchainNetworkStatus> {
    const rpcUrl = this.config.get<string>('BESU_RPC_URL', 'http://localhost:8545');

    if (this.blockchainMode === 'demo' || !this.provider) {
      return this.getDemoStatus(rpcUrl);
    }

    try {
      const [network, blockNumber] = await Promise.all([
        this.provider.getNetwork(),
        this.provider.getBlockNumber(),
      ]);

      let peerCount: number | null = null;
      try {
        const raw = await this.provider.send('net_peerCount', []);
        peerCount = parseInt(raw, 16);
      } catch {}

      return {
        connected: true,
        chainId: Number(network.chainId),
        blockNumber,
        nodeUrl: rpcUrl,
        contractAddress: this.contractAddress,
        contractDeployed: !!this.contractAddress,
        mode: 'live',
        peerCount,
      };
    } catch (err) {
      return this.getDemoStatus(rpcUrl);
    }
  }

  /** Simulated status for demo mode: configured chain ID, latest simulated block, expected validator peers. */
  private async getDemoStatus(rpcUrl: string): Promise<BlockchainNetworkStatus> {
    const latest = await this.txRepo
      .createQueryBuilder('t')
      .select('MAX(t.block_number)', 'max')
      .getRawOne<{ max: number | null }>();

    return {
      connected: false,
      chainId: Number(this.config.get('BESU_CHAIN_ID', 1337)),
      blockNumber: latest?.max != null ? Number(latest.max) : 0,
      nodeUrl: rpcUrl,
      contractAddress: this.contractAddress,
      contractDeployed: !!this.contractAddress,
      mode: 'demo',
      peerCount: 2, // 3 QBFT validators → 2 peers each
    };
  }

  async getRecentTransactions(limit = 10): Promise<BlockchainTransaction[]> {
    return this.txRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: { delivery: true },
    });
  }

  async getTransactionByHash(hash: string): Promise<BlockchainTransaction | null> {
    return this.txRepo.findOne({
      where: { transactionHash: hash },
      relations: { delivery: true },
    });
  }

  private async simulateTransaction(
    dbTx: BlockchainTransaction,
    note: string,
  ): Promise<BlockchainTransaction> {
    // Generate a plausible-looking fake hash for demo mode
    const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');
    dbTx.transactionHash = fakeHash;
    dbTx.blockNumber = Math.floor(Math.random() * 1000000) + 100000;
    dbTx.contractAddress = this.contractAddress ?? '0x0000000000000000000000000000000000000000';
    dbTx.status = BlockchainTxStatus.CONFIRMED;
    dbTx.errorMessage = `[DEMO] ${note}`;
    return await this.txRepo.save(dbTx);
  }

  get mode(): 'live' | 'demo' {
    return this.blockchainMode;
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
