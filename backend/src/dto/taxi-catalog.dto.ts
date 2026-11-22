import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs of the taxi admin dictionaries. Only field *shapes* live here — all
 * value rules (non-empty names, non-negative numbers, `HH:MM` format,
 * uniqueness) are enforced in `TaxiCatalogService`, mirroring the
 * controller-dto-swagger / service-layer-split conventions: DTOs carry
 * Swagger metadata, services throw BadRequest/Conflict/NotFound.
 */

/* --------------------------------- cities --------------------------------- */

/**
 * Populated area of the taxi route. `distanceKm` is the km marker along the
 * route from the first point; it drives the price-matrix auto-calc and the
 * list ordering.
 */
export class TaxiCityDto {
  @ApiProperty({ description: 'Unique city name', example: 'Тверь' })
  name: string;

  @ApiProperty({
    description: 'Km marker along the route from the first point',
    example: 167,
  })
  distanceKm: number;

  @ApiProperty({
    description: 'Inactive cities are hidden from the wizard',
    default: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Manual order within the admin list',
    example: 1,
  })
  sortOrder: number;

  @ApiProperty({ description: 'cuid of the city', example: 'clx…' })
  id: string;

  constructor(partial: Partial<TaxiCityDto> = {}) {
    Object.assign(this, partial);
  }
}

export class TaxiCityListDto {
  @ApiProperty({ type: TaxiCityDto, isArray: true })
  cities: TaxiCityDto[];

  constructor(partial: Partial<TaxiCityListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `POST /taxi/cities`. */
export class CreateTaxiCityRequestDto {
  @ApiProperty({ description: 'Unique city name', example: 'Клин' })
  name: string;

  @ApiProperty({ description: 'Km marker from the first point', example: 84 })
  distanceKm: number;

  @ApiProperty({
    description: 'Inactive cities are hidden from the wizard',
    required: false,
    default: true,
  })
  isActive?: boolean;

  @ApiProperty({
    description: 'Manual order within the admin list',
    required: false,
    default: 0,
  })
  sortOrder?: number;

  constructor(partial: Partial<CreateTaxiCityRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/cities/:id`. Omitted fields stay unchanged. */
export class UpdateTaxiCityRequestDto {
  @ApiProperty({ description: 'Unique city name', required: false })
  name?: string;

  @ApiProperty({
    description: 'Km marker from the first point',
    required: false,
  })
  distanceKm?: number;

  @ApiProperty({
    description: 'Inactive cities are hidden from the wizard',
    required: false,
  })
  isActive?: boolean;

  @ApiProperty({
    description: 'Manual order within the admin list',
    required: false,
  })
  sortOrder?: number;

  constructor(partial: Partial<UpdateTaxiCityRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/* -------------------------------- services -------------------------------- */

/**
 * Extra service selectable in the wizard. `isCarFeature: true` marks
 * services that require car equipment: cars declare which of them they
 * provide, and the assignment service matches them (design D11).
 */
export class TaxiExtraServiceDto {
  @ApiProperty({
    description: 'Unique service name',
    example: 'Детское кресло',
  })
  name: string;

  @ApiProperty({
    description: 'Surcharge added to the base price (rubles)',
    example: 300,
  })
  surcharge: number;

  @ApiProperty({
    description: 'Requires car equipment; drives the auto-assignment matching',
    default: false,
  })
  isCarFeature: boolean;

  @ApiProperty({
    description: 'Inactive services are hidden from the wizard',
    default: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Manual order within the wizard step',
    example: 0,
  })
  sortOrder: number;

  @ApiProperty({ description: 'cuid of the service', example: 'clx…' })
  id: string;

  constructor(partial: Partial<TaxiExtraServiceDto> = {}) {
    Object.assign(this, partial);
  }
}

export class TaxiExtraServiceListDto {
  @ApiProperty({ type: TaxiExtraServiceDto, isArray: true })
  services: TaxiExtraServiceDto[];

  constructor(partial: Partial<TaxiExtraServiceListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `POST /taxi/services`. */
export class CreateTaxiExtraServiceRequestDto {
  @ApiProperty({
    description: 'Unique service name',
    example: 'Wi-Fi в салоне',
  })
  name: string;

  @ApiProperty({
    description: 'Surcharge added to the base price (rubles)',
    example: 150,
  })
  surcharge: number;

  @ApiProperty({
    description: 'Requires car equipment (car-feature service)',
    required: false,
    default: false,
  })
  isCarFeature?: boolean;

  @ApiProperty({ required: false, default: true })
  isActive?: boolean;

  @ApiProperty({ required: false, default: 0 })
  sortOrder?: number;

  constructor(partial: Partial<CreateTaxiExtraServiceRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/services/:id`. Omitted fields stay unchanged. */
export class UpdateTaxiExtraServiceRequestDto {
  @ApiProperty({ description: 'Unique service name', required: false })
  name?: string;

  @ApiProperty({
    description: 'Surcharge added to the base price (rubles)',
    required: false,
  })
  surcharge?: number;

  @ApiProperty({
    description: 'Requires car equipment (car-feature service)',
    required: false,
  })
  isCarFeature?: boolean;

  @ApiProperty({ required: false })
  isActive?: boolean;

  @ApiProperty({ required: false })
  sortOrder?: number;

  constructor(partial: Partial<UpdateTaxiExtraServiceRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/* ----------------------------- departure slots ----------------------------- */

/** Recurring daily departure time offered by the wizard (`HH:MM`). */
export class TaxiDepartureSlotDto {
  @ApiProperty({ description: 'Departure time, `HH:MM`', example: '12:00' })
  time: string;

  @ApiProperty({
    description: 'Inactive slots are hidden from the wizard',
    default: true,
  })
  isActive: boolean;

  @ApiProperty({ description: 'Manual order; ties break by time', example: 0 })
  sortOrder: number;

  @ApiProperty({ description: 'cuid of the slot', example: 'clx…' })
  id: string;

  constructor(partial: Partial<TaxiDepartureSlotDto> = {}) {
    Object.assign(this, partial);
  }
}

export class TaxiDepartureSlotListDto {
  @ApiProperty({ type: TaxiDepartureSlotDto, isArray: true })
  slots: TaxiDepartureSlotDto[];

  constructor(partial: Partial<TaxiDepartureSlotListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `POST /taxi/departure-slots`. */
export class CreateTaxiDepartureSlotRequestDto {
  @ApiProperty({ description: 'Departure time, `HH:MM`', example: '09:30' })
  time: string;

  @ApiProperty({ required: false, default: true })
  isActive?: boolean;

  @ApiProperty({ required: false, default: 0 })
  sortOrder?: number;

  constructor(partial: Partial<CreateTaxiDepartureSlotRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/departure-slots/:id`. Omitted fields stay unchanged. */
export class UpdateTaxiDepartureSlotRequestDto {
  @ApiProperty({ description: 'Departure time, `HH:MM`', required: false })
  time?: string;

  @ApiProperty({ required: false })
  isActive?: boolean;

  @ApiProperty({ required: false })
  sortOrder?: number;

  constructor(partial: Partial<UpdateTaxiDepartureSlotRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/* ---------------------------- passenger options ---------------------------- */

/** Passenger-count option offered by the wizard. */
export class TaxiPassengerOptionDto {
  @ApiProperty({ description: 'Allowed passenger count', example: 3 })
  count: number;

  @ApiProperty({
    description: 'Inactive options are hidden from the wizard',
    default: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Manual order within the wizard step',
    example: 0,
  })
  sortOrder: number;

  @ApiProperty({ description: 'cuid of the option', example: 'clx…' })
  id: string;

  constructor(partial: Partial<TaxiPassengerOptionDto> = {}) {
    Object.assign(this, partial);
  }
}

export class TaxiPassengerOptionListDto {
  @ApiProperty({ type: TaxiPassengerOptionDto, isArray: true })
  options: TaxiPassengerOptionDto[];

  constructor(partial: Partial<TaxiPassengerOptionListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `POST /taxi/passenger-options`. */
export class CreateTaxiPassengerOptionRequestDto {
  @ApiProperty({ description: 'Allowed passenger count (unique)', example: 5 })
  count: number;

  @ApiProperty({ required: false, default: true })
  isActive?: boolean;

  @ApiProperty({ required: false, default: 0 })
  sortOrder?: number;

  constructor(partial: Partial<CreateTaxiPassengerOptionRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/passenger-options/:id`. Omitted fields stay unchanged. */
export class UpdateTaxiPassengerOptionRequestDto {
  @ApiProperty({
    description: 'Allowed passenger count (unique)',
    required: false,
  })
  count?: number;

  @ApiProperty({ required: false })
  isActive?: boolean;

  @ApiProperty({ required: false })
  sortOrder?: number;

  constructor(partial: Partial<UpdateTaxiPassengerOptionRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/* -------------------------- drivers and their cars ------------------------- */

/**
 * Car of one driver. `seats` is the required capacity matched against the
 * passenger count; `features` mirrors the car-feature services the car
 * provides (design D11). Requests carry `featureServiceIds` instead.
 */
export class TaxiCarDto {
  @ApiProperty({ description: 'Car model', example: 'Toyota Camry' })
  model: string;

  @ApiProperty({
    description: 'Unique state license plate',
    example: 'А123ВС77',
  })
  plate: string;

  @ApiProperty({
    description: 'Body color (optional)',
    required: false,
    nullable: true,
    type: String,
  })
  color?: string | null;

  @ApiProperty({
    description: 'Seat capacity used by the auto-assignment',
    example: 4,
  })
  seats: number;

  @ApiProperty({
    description: 'Car-feature services this car provides',
    type: TaxiExtraServiceDto,
    isArray: true,
  })
  features: TaxiExtraServiceDto[];

  @ApiProperty({
    description: 'Inactive cars are skipped by the assignment',
    default: true,
  })
  isActive: boolean;

  @ApiProperty({ description: 'Id of the owning driver' })
  driverId: string;

  @ApiProperty({ description: 'cuid of the car', example: 'clx…' })
  id: string;

  constructor(partial: Partial<TaxiCarDto> = {}) {
    Object.assign(this, partial);
  }
}

export class TaxiCarListDto {
  @ApiProperty({ type: TaxiCarDto, isArray: true })
  cars: TaxiCarDto[];

  constructor(partial: Partial<TaxiCarListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Driver with the nested list of his cars. */
export class TaxiDriverDto {
  @ApiProperty({ description: 'Driver full name', example: 'Иван Петров' })
  fullName: string;

  @ApiProperty({ description: 'Contact phone', example: '+7 900 000-00-00' })
  phone: string;

  @ApiProperty({
    description: 'Inactive drivers are hidden from orders',
    default: true,
  })
  isActive: boolean;

  @ApiProperty({ type: TaxiCarDto, isArray: true })
  cars: TaxiCarDto[];

  @ApiProperty({ description: 'cuid of the driver', example: 'clx…' })
  id: string;

  constructor(partial: Partial<TaxiDriverDto> = {}) {
    Object.assign(this, partial);
  }
}

export class TaxiDriverListDto {
  @ApiProperty({ type: TaxiDriverDto, isArray: true })
  drivers: TaxiDriverDto[];

  constructor(partial: Partial<TaxiDriverListDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `POST /taxi/drivers`. */
export class CreateTaxiDriverRequestDto {
  @ApiProperty({ description: 'Driver full name', example: 'Иван Петров' })
  fullName: string;

  @ApiProperty({ description: 'Contact phone', example: '+7 900 000-00-00' })
  phone: string;

  @ApiProperty({ required: false, default: true })
  isActive?: boolean;

  constructor(partial: Partial<CreateTaxiDriverRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/drivers/:id`. Omitted fields stay unchanged. */
export class UpdateTaxiDriverRequestDto {
  @ApiProperty({ description: 'Driver full name', required: false })
  fullName?: string;

  @ApiProperty({ description: 'Contact phone', required: false })
  phone?: string;

  @ApiProperty({ required: false })
  isActive?: boolean;

  constructor(partial: Partial<UpdateTaxiDriverRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/**
 * Body of `POST /taxi/drivers/:driverId/cars`. `featureServiceIds` lists the
 * car-feature services the car provides; ids of services without the
 * `isCarFeature` flag are rejected (400), unknown ids — 404.
 */
export class CreateTaxiCarRequestDto {
  @ApiProperty({ description: 'Car model', example: 'Toyota Camry' })
  model: string;

  @ApiProperty({
    description: 'Unique state license plate',
    example: 'А123ВС77',
  })
  plate: string;

  @ApiProperty({
    description: 'Seat capacity (positive integer) used by the auto-assignment',
    example: 4,
  })
  seats: number;

  @ApiProperty({ description: 'Body color (optional)', required: false })
  color?: string;

  @ApiProperty({
    description: 'Ids of car-feature services the car provides',
    required: false,
    type: String,
    isArray: true,
  })
  featureServiceIds?: string[];

  @ApiProperty({ required: false, default: true })
  isActive?: boolean;

  constructor(partial: Partial<CreateTaxiCarRequestDto> = {}) {
    Object.assign(this, partial);
  }
}

/** Body of `PATCH /taxi/drivers/:driverId/cars/:carId`. Omitted fields stay unchanged. */
export class UpdateTaxiCarRequestDto {
  @ApiProperty({ description: 'Car model', required: false })
  model?: string;

  @ApiProperty({ description: 'Unique state license plate', required: false })
  plate?: string;

  @ApiProperty({
    description: 'Seat capacity (positive integer)',
    required: false,
  })
  seats?: number;

  @ApiProperty({
    description: 'Body color (optional)',
    required: false,
    nullable: true,
    type: String,
  })
  color?: string | null;

  @ApiProperty({
    description: 'Replaces the whole car-feature list',
    required: false,
    type: String,
    isArray: true,
  })
  featureServiceIds?: string[];

  @ApiProperty({ required: false })
  isActive?: boolean;

  constructor(partial: Partial<UpdateTaxiCarRequestDto> = {}) {
    Object.assign(this, partial);
  }
}
