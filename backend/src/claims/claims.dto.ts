import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClaimDto {
  @IsUUID() requestId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount: number;
  @IsString() @MaxLength(120) accountHolderName: string;
  @IsString()
  @Matches(/^\d{9,18}$/, {
    message: 'Account number must contain 9 to 18 digits',
  })
  accountNumber: string;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i, { message: 'IFSC code is invalid' })
  ifsc: string;
}

export class ClaimQueryDto {
  @Type(() => Number) @Min(1) page = 1;
  @Type(() => Number) @Min(1) limit = 20;
}
