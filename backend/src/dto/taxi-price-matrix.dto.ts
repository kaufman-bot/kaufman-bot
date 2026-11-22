import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs of the taxi price matrix (see design D5/D6). Prices are stored once
 * per unordered pair (normalized `fromCityId < toCityId`) and are symmetric
 * by construction. Value rules (non-negative integer price, distinct cities)
 * are enforced in `TaxiPriceMatrixService`.
 */

/** City as exposed by the matrix endpoints (id + km marker for the UI). */
export class TaxiPriceMatrixCityDto {
  @ApiProperty({ description: 'cuid of the city' })
  id: string;

  @ApiProperty({ description: 'City name', example: 'Москва' })
  name: string;

  @ApiProperty({
    description: 'Km marker along the route from the first point',
    example: 0,
  })
  distanceKm: number;

  constructor(partial: Partial<TaxiPriceMatrixCityDto> = {}) {
    Object.assign(this, partial);
  }
}

/** One stored unordered pair with its price (rubles). */
export class TaxiPricePairDto {
  @ApiProperty({ description: 'First city id (normalized: id < toCityId)' })
  fromCityId: string;

  @ApiProperty({ description: 'Second city id' })
  toCityId: string;

  @ApiProperty({
    description: 'Price for the trip between the two cities (rubles)',
    example: 4900,
  })
  price: number;

  constructor(partial: Partial<TaxiPricePairDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Response of `GET /taxi/price-matrix`. */
export class TaxiPriceMatrixDto {
  @ApiProperty({
    description: 'Cities ordered by km marker',
    type: TaxiPriceMatrixCityDto,
    isArray: true,
  })
  cities: TaxiPriceMatrixCityDto[];

  @ApiProperty({
    description: 'Stored pair prices, one row per unordered pair',
    type: TaxiPricePairDto,
    isArray: true,
  })
  prices: TaxiPricePairDto[];

  constructor(partial: Partial<TaxiPriceMatrixDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PUT /taxi/price-matrix/:fromCityId/:toCityId`. */
export class SetPairPriceRequestDto {
  @ApiProperty({
    description: 'Price for the pair in rubles (non-negative integer)',
    example: 1200,
  })
  price: number;

  constructor(partial: Partial<SetPairPriceRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `POST /taxi/price-matrix/auto-calc`. */
export class AutoCalcRequestDto {
  @ApiProperty({
    description:
      'Price of the trip between the extreme cities (min/max km marker); ' +
      'every pair price is derived proportionally to its km distance',
    example: 4900,
  })
  price: number;

  constructor(partial: Partial<AutoCalcRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Response of `POST /taxi/price-matrix/auto-calc`. */
export class AutoCalcResultDto {
  @ApiProperty({
    description: 'Number of pair prices created or overwritten',
    example: 21,
  })
  pairs: number;

  constructor(partial: Partial<AutoCalcResultDto> = {}) {
    Object.assign(this, partial);
  }
}
