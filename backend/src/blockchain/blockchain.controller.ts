import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BlockchainService } from './blockchain.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('blockchain')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get blockchain network status' })
  async getNetworkStatus() {
    const status = await this.blockchainService.getNetworkStatus();
    return { data: status };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get recent blockchain transactions' })
  async getRecentTransactions() {
    const txs = await this.blockchainService.getRecentTransactions(20);
    return { data: txs };
  }

  @Get('transactions/:hash')
  @ApiOperation({ summary: 'Get a blockchain transaction by hash' })
  async getTransactionByHash(@Param('hash') hash: string) {
    const tx = await this.blockchainService.getTransactionByHash(hash);
    return { data: tx };
  }

  @Get('network')
  @ApiOperation({ summary: 'Get network topology and node status' })
  async getNetworkTopology() {
    const status = await this.blockchainService.getNetworkStatus();
    // Return structured node information for the frontend visualization
    return {
      data: {
        networkStatus: status,
        nodes: [
          {
            id: 'node1',
            name: 'Company A Node',
            role: 'validator',
            organization: 'Company A',
            rpcPort: 8545,
            p2pPort: 30303,
            status: status.connected ? 'online' : 'offline',
          },
          {
            id: 'node2',
            name: 'Company B Node',
            role: 'validator',
            organization: 'Company B',
            rpcPort: 8546,
            p2pPort: 30304,
            status: 'unknown', // separate connectivity check needed
          },
          {
            id: 'node3',
            name: 'Auditor Node',
            role: 'validator',
            organization: 'Auditor',
            rpcPort: 8547,
            p2pPort: 30305,
            status: 'unknown',
          },
        ],
        disclaimer:
          'Node connectivity status for nodes 2 and 3 requires direct RPC connectivity to each node endpoint.',
      },
    };
  }
}
