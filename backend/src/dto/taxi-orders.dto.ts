import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs of the admin taxi-orders view (see design D2/D11). Displayed fields
 * come from the order's immutable snapshots taken at confirmation time, so
 * later dictionary edits never change past orders.
 */

/** Snapshot of the assigned car + driver, frozen at confirmation time. */
export class TaxiOrderCarSnapshotDto {
  @ApiProperty({ description: 'Driver full name at confirmation time' })
  driverName: string;

  @ApiProperty({ description: 'Car model at confirmation time' })
  model: string;

  @ApiProperty({ description: 'License plate at confirmation time' })
  plate: string;

  @ApiProperty({
    description: 'Body color at confirmation time (optional)',
    required: false,
    nullable: true,
    type: String,
  })
  color?: string | null;

  constructor(partial: Partial<TaxiOrderCarSnapshotDto> = {}) {
    Object.assign(this, partial);
  }
}

/** One selected extra service with its surcharge, frozen at confirmation. */
export class TaxiOrderServiceSnapshotDto {
  @ApiProperty({ description: 'Service id at confirmation time' })
  id: string;

  @ApiProperty({ description: 'Service name at confirmation time' })
  name: string;

  @ApiProperty({ description: 'Surcharge in rubles at confirmation time' })
  surcharge: number;

  constructor(partial: Partial<TaxiOrderServiceSnapshotDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Submitted taxi order as shown in the admin list. */
export class TaxiOrderDto {
  @ApiProperty({ description: 'cuid of the order' })
  id: string;

  @ApiProperty({
    description: 'Order status (never DRAFT here)',
    example: 'NEW',
    enum: ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  status: string;

  @ApiProperty({
    description: 'Passenger account',
    example: 'user@example.com',
  })
  passengerEmail: string;

  @ApiProperty({ description: 'Id of the passenger account' })
  passengerId: string;

  @ApiProperty({
    description: 'Departure city name at confirmation time',
    required: false,
    nullable: true,
    type: String,
  })
  fromCityName?: string | null;

  @ApiProperty({
    description: 'Destination city name at confirmation time',
    required: false,
    nullable: true,
    type: String,
  })
  toCityName?: string | null;

  @ApiProperty({
    description: 'Departure time label at confirmation time',
    required: false,
    nullable: true,
    type: String,
  })
  departureSlotLabel?: string | null;

  @ApiProperty({
    description: 'Passenger count at confirmation time',
    required: false,
    nullable: true,
    type: Number,
  })
  passengerCount?: number | null;

  @ApiProperty({
    description: 'Selected services with surcharges, frozen at confirmation',
    type: TaxiOrderServiceSnapshotDto,
    isArray: true,
  })
  services: TaxiOrderServiceSnapshotDto[];

  @ApiProperty({
    description: 'Base price from the matrix at confirmation time (rubles)',
    required: false,
    nullable: true,
    type: Number,
  })
  priceBase?: number | null;

  @ApiProperty({
    description:
      'Final price (base + surcharges) at confirmation time (rubles)',
    required: false,
    nullable: true,
    type: Number,
  })
  priceTotal?: number | null;

  @ApiProperty({
    description: 'Assigned car and driver, null until confirmed',
    required: false,
    nullable: true,
    type: TaxiOrderCarSnapshotDto,
  })
  carSnapshot?: TaxiOrderCarSnapshotDto | null;

  @ApiProperty({ description: 'Submission/creation time' })
  createdAt: string;

  @ApiProperty({
    description: 'Confirmation time (null for never-confirmed drafts)',
    required: false,
    nullable: true,
    type: String,
  })
  confirmedAt?: string | null;

  constructor(partial: Partial<TaxiOrderDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Response of `GET /taxi/orders`. */
export class TaxiOrderListDto {
  @ApiProperty({ type: TaxiOrderDto, isArray: true })
  orders: TaxiOrderDto[];

  constructor(partial: Partial<TaxiOrderListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/orders/:id` — the only editable field is the status. */
export class UpdateTaxiOrderStatusRequestDto {
  @ApiProperty({
    description:
      'New status; DRAFT is not accepted (wizard-internal), unknown values are 400',
    enum: ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
    example: 'CONFIRMED',
  })
  status: string;

  constructor(partial: Partial<UpdateTaxiOrderStatusRequestDto> = {}) {
    Object.assign(this, partial);
  }
}
