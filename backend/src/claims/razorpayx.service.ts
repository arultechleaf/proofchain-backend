import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export class RazorpayXRequestError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown: boolean,
  ) {
    super(message);
    this.name = 'RazorpayXRequestError';
  }
}

export interface RazorpayEntity {
  id: string;
  status?: string;
  amount?: number;
  utr?: string | null;
  reference_id?: string;
  status_details?: { description?: string };
}

@Injectable()
export class RazorpayXService {
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.client = axios.create({
      baseURL: config
        .get<string>('RAZORPAYX_API_BASE', 'https://api.razorpay.com/v1')
        .replace(/\/$/, ''),
      timeout: 15000,
      auth: {
        username: config.get<string>('RAZORPAYX_KEY_ID', ''),
        password: config.get<string>('RAZORPAYX_KEY_SECRET', ''),
      },
    });
  }

  isConfigured() {
    return (
      this.config.get<string>('RAZORPAYX_PAYOUTS_ENABLED') === 'true' &&
      !!this.config.get<string>('RAZORPAYX_KEY_ID') &&
      !!this.config.get<string>('RAZORPAYX_KEY_SECRET') &&
      !!this.config.get<string>('RAZORPAYX_ACCOUNT_NUMBER')
    );
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'RazorpayX payouts are disabled or not configured. Configure RazorpayX credentials and explicitly enable payouts on the backend.',
      );
    }
  }

  async createContact(
    name: string,
    referenceId: string,
  ): Promise<RazorpayEntity> {
    return this.post('/contacts', {
      name,
      type: 'vendor',
      reference_id: referenceId.slice(0, 40),
    });
  }

  async createFundAccount(
    contactId: string,
    accountNumber: string,
    ifsc: string,
    name: string,
  ): Promise<RazorpayEntity> {
    return this.post('/fund_accounts', {
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: { name, ifsc, account_number: accountNumber },
    });
  }

  async createPayout(
    fundAccountId: string,
    amountRupees: number,
    referenceId: string,
    idempotencyKey: string,
  ): Promise<RazorpayEntity> {
    this.assertConfigured();
    try {
      const response = await this.client.post<RazorpayEntity>(
        '/payouts',
        {
          account_number: this.config.getOrThrow<string>(
            'RAZORPAYX_ACCOUNT_NUMBER',
          ),
          fund_account_id: fundAccountId,
          amount: Math.round(amountRupees * 100),
          currency: 'INR',
          mode: 'NEFT',
          purpose: 'payout',
          queue_if_low_balance:
            this.config.get<string>('RAZORPAYX_QUEUE_IF_LOW_BALANCE') ===
            'true',
          reference_id: referenceId,
        },
        { headers: { 'X-Payout-Idempotency': idempotencyKey } },
      );
      if (!response.data?.id) {
        throw new RazorpayXRequestError(
          'RazorpayX returned an incomplete payout response.',
          true,
        );
      }
      return response.data;
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  async getPayout(payoutId: string): Promise<RazorpayEntity> {
    this.assertConfigured();
    try {
      const response = await this.client.get<RazorpayEntity>(
        `/payouts/${encodeURIComponent(payoutId)}`,
      );
      if (!response.data?.id) {
        throw new RazorpayXRequestError(
          'RazorpayX returned an incomplete payout status.',
          true,
        );
      }
      return response.data;
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  private async post(path: string, body: unknown): Promise<RazorpayEntity> {
    this.assertConfigured();
    try {
      const response = await this.client.post<RazorpayEntity>(path, body);
      if (!response.data?.id) {
        throw new RazorpayXRequestError(
          'RazorpayX returned an incomplete recipient response.',
          false,
        );
      }
      return response.data;
    } catch (error) {
      throw this.toRequestError(error);
    }
  }

  private toRequestError(error: unknown): RazorpayXRequestError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const description = error.response?.data?.error?.description;
      const message =
        typeof description === 'string'
          ? `RazorpayX rejected the request: ${description}`
          : 'RazorpayX could not confirm the request outcome.';
      return new RazorpayXRequestError(
        message,
        status === undefined || status >= 500 || status === 429,
      );
    }

    return new RazorpayXRequestError(
      'RazorpayX could not confirm the request outcome.',
      true,
    );
  }
}
