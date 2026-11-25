import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClaimDto } from './claims.dto';

describe('CreateClaimDto', () => {
  it('trims surrounding whitespace and normalizes IFSC to uppercase', async () => {
    const dto = plainToInstance(CreateClaimDto, {
      requestId: '4c4a0d4f-1695-4e8d-a5af-1f918b8bd0f1',
      amount: 500,
      accountHolderName: 'Test User',
      accountNumber: '1234567890123',
      ifsc: ' razr0000001 ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.ifsc).toBe('RAZR0000001');
  });

  it('continues to reject malformed IFSC values after trimming', async () => {
    const dto = plainToInstance(CreateClaimDto, {
      requestId: '4c4a0d4f-1695-4e8d-a5af-1f918b8bd0f1',
      amount: 500,
      accountHolderName: 'Test User',
      accountNumber: '1234567890123',
      ifsc: ' RAZR000001 ',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'ifsc')).toBe(true);
  });
});
