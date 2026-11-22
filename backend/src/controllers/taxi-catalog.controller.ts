import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { X_API_KEY } from '../constants/api-key.constants.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import {
  CreateTaxiCarRequestDto,
  CreateTaxiCityRequestDto,
  CreateTaxiDepartureSlotRequestDto,
  CreateTaxiDriverRequestDto,
  CreateTaxiExtraServiceRequestDto,
  CreateTaxiPassengerOptionRequestDto,
  TaxiCarDto,
  TaxiCarListDto,
  TaxiCityDto,
  TaxiCityListDto,
  TaxiDepartureSlotDto,
  TaxiDepartureSlotListDto,
  TaxiDriverDto,
  TaxiDriverListDto,
  TaxiExtraServiceDto,
  TaxiExtraServiceListDto,
  TaxiPassengerOptionDto,
  TaxiPassengerOptionListDto,
  UpdateTaxiCarRequestDto,
  UpdateTaxiCityRequestDto,
  UpdateTaxiDepartureSlotRequestDto,
  UpdateTaxiDriverRequestDto,
  UpdateTaxiExtraServiceRequestDto,
  UpdateTaxiPassengerOptionRequestDto,
} from '../dto/taxi-catalog.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { TaxiCatalogService } from '../services/taxi-catalog.service.js';

/**
 * Admin CRUD over the taxi dictionaries. Every sub-resource requires the
 * ApiKeyGuard + AdminGuard pair (same envelope as AdminUsersController);
 * value validation happens in TaxiCatalogService (design D2/D3).
 */
@ApiTags('taxi')
@Controller('taxi')
@UseGuards(ApiKeyGuard, AdminGuard)
@ApiHeader({
  name: X_API_KEY,
  required: false,
  description: 'API key of an ADMIN account (?apiKey= also works).',
})
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'No valid API key' })
@ApiForbiddenResponse({
  type: ApiErrorDto,
  description: 'Authenticated account is not an admin',
})
export class TaxiCatalogController {
  constructor(private readonly catalog: TaxiCatalogService) {}

  /* --------------------------------- cities --------------------------------- */

  @Get('cities')
  @ApiOperation({ summary: 'List cities ordered by km marker' })
  @ApiOkResponse({ type: TaxiCityListDto })
  listCities(): Promise<TaxiCityListDto> {
    return this.catalog.listCities();
  }

  @Post('cities')
  @ApiOperation({ summary: 'Create a city' })
  @ApiCreatedResponse({ type: TaxiCityDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty name or negative/non-integer distanceKm',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'City name already exists',
  })
  createCity(@Body() dto: CreateTaxiCityRequestDto) {
    return this.catalog.createCity(dto);
  }

  @Patch('cities/:id')
  @ApiOperation({ summary: 'Update a city' })
  @ApiParam({ name: 'id', description: 'City id' })
  @ApiOkResponse({ type: TaxiCityDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid field values',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'City name already exists',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'City not found' })
  updateCity(@Param('id') id: string, @Body() dto: UpdateTaxiCityRequestDto) {
    return this.catalog.updateCity(id, dto);
  }

  @Delete('cities/:id')
  @ApiOperation({
    summary:
      'Delete a city (price pairs cascade; wizard drafts referencing it reset)',
  })
  @ApiParam({ name: 'id', description: 'City id' })
  @ApiNoContentResponse({ description: 'City deleted' })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'City is referenced by submitted taxi orders',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'City not found' })
  @HttpCode(204)
  async removeCity(@Param('id') id: string): Promise<void> {
    await this.catalog.removeCity(id);
  }

  /* -------------------------------- services -------------------------------- */

  @Get('services')
  @ApiOperation({ summary: 'List extra services ordered for the wizard step' })
  @ApiOkResponse({ type: TaxiExtraServiceListDto })
  listServices(): Promise<TaxiExtraServiceListDto> {
    return this.catalog.listServices();
  }

  @Post('services')
  @ApiOperation({ summary: 'Create an extra service' })
  @ApiCreatedResponse({ type: TaxiExtraServiceDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty name or negative/non-integer surcharge',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Service name already exists',
  })
  createService(@Body() dto: CreateTaxiExtraServiceRequestDto) {
    return this.catalog.createService(dto);
  }

  @Patch('services/:id')
  @ApiOperation({ summary: 'Update an extra service' })
  @ApiParam({ name: 'id', description: 'Service id' })
  @ApiOkResponse({ type: TaxiExtraServiceDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid field values',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Service name already exists',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Service not found' })
  updateService(
    @Param('id') id: string,
    @Body() dto: UpdateTaxiExtraServiceRequestDto,
  ) {
    return this.catalog.updateService(id, dto);
  }

  @Delete('services/:id')
  @ApiOperation({ summary: 'Delete an extra service' })
  @ApiParam({ name: 'id', description: 'Service id' })
  @ApiNoContentResponse({ description: 'Service deleted' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Service not found' })
  @HttpCode(204)
  async removeService(@Param('id') id: string): Promise<void> {
    await this.catalog.removeService(id);
  }

  /* ----------------------------- departure slots ----------------------------- */

  @Get('departure-slots')
  @ApiOperation({ summary: 'List departure slots ordered for the wizard step' })
  @ApiOkResponse({ type: TaxiDepartureSlotListDto })
  listDepartureSlots(): Promise<TaxiDepartureSlotListDto> {
    return this.catalog.listDepartureSlots();
  }

  @Post('departure-slots')
  @ApiOperation({ summary: 'Create a departure slot' })
  @ApiCreatedResponse({ type: TaxiDepartureSlotDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'time must be HH:MM (00:00..23:59)',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Departure time already exists',
  })
  createDepartureSlot(@Body() dto: CreateTaxiDepartureSlotRequestDto) {
    return this.catalog.createDepartureSlot(dto);
  }

  @Patch('departure-slots/:id')
  @ApiOperation({ summary: 'Update a departure slot' })
  @ApiParam({ name: 'id', description: 'Slot id' })
  @ApiOkResponse({ type: TaxiDepartureSlotDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid time format',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Departure time already exists',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Slot not found' })
  updateDepartureSlot(
    @Param('id') id: string,
    @Body() dto: UpdateTaxiDepartureSlotRequestDto,
  ) {
    return this.catalog.updateDepartureSlot(id, dto);
  }

  @Delete('departure-slots/:id')
  @ApiOperation({ summary: 'Delete a departure slot' })
  @ApiParam({ name: 'id', description: 'Slot id' })
  @ApiNoContentResponse({ description: 'Slot deleted' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Slot not found' })
  @HttpCode(204)
  async removeDepartureSlot(@Param('id') id: string): Promise<void> {
    await this.catalog.removeDepartureSlot(id);
  }

  /* ---------------------------- passenger options ---------------------------- */

  @Get('passenger-options')
  @ApiOperation({ summary: 'List passenger-count options' })
  @ApiOkResponse({ type: TaxiPassengerOptionListDto })
  listPassengerOptions(): Promise<TaxiPassengerOptionListDto> {
    return this.catalog.listPassengerOptions();
  }

  @Post('passenger-options')
  @ApiOperation({ summary: 'Create a passenger-count option' })
  @ApiCreatedResponse({ type: TaxiPassengerOptionDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'count must be a positive integer',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Passenger option already exists',
  })
  createPassengerOption(@Body() dto: CreateTaxiPassengerOptionRequestDto) {
    return this.catalog.createPassengerOption(dto);
  }

  @Patch('passenger-options/:id')
  @ApiOperation({ summary: 'Update a passenger-count option' })
  @ApiParam({ name: 'id', description: 'Option id' })
  @ApiOkResponse({ type: TaxiPassengerOptionDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Invalid count' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Passenger option already exists',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Option not found' })
  updatePassengerOption(
    @Param('id') id: string,
    @Body() dto: UpdateTaxiPassengerOptionRequestDto,
  ) {
    return this.catalog.updatePassengerOption(id, dto);
  }

  @Delete('passenger-options/:id')
  @ApiOperation({ summary: 'Delete a passenger-count option' })
  @ApiParam({ name: 'id', description: 'Option id' })
  @ApiNoContentResponse({ description: 'Option deleted' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Option not found' })
  @HttpCode(204)
  async removePassengerOption(@Param('id') id: string): Promise<void> {
    await this.catalog.removePassengerOption(id);
  }

  /* -------------------------- drivers and their cars ------------------------- */

  @Get('drivers')
  @ApiOperation({ summary: 'List drivers with their nested cars' })
  @ApiOkResponse({ type: TaxiDriverListDto })
  listDrivers(): Promise<TaxiDriverListDto> {
    return this.catalog.listDrivers();
  }

  @Post('drivers')
  @ApiOperation({ summary: 'Create a driver' })
  @ApiCreatedResponse({ type: TaxiDriverDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Empty fullName or phone',
  })
  createDriver(@Body() dto: CreateTaxiDriverRequestDto) {
    return this.catalog.createDriver(dto);
  }

  @Patch('drivers/:id')
  @ApiOperation({ summary: 'Update a driver' })
  @ApiParam({ name: 'id', description: 'Driver id' })
  @ApiOkResponse({ type: TaxiDriverDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid field values',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Driver not found' })
  updateDriver(
    @Param('id') id: string,
    @Body() dto: UpdateTaxiDriverRequestDto,
  ) {
    return this.catalog.updateDriver(id, dto);
  }

  @Delete('drivers/:id')
  @ApiOperation({
    summary:
      'Delete a driver together with his cars; blocked while any car is busy',
  })
  @ApiParam({ name: 'id', description: 'Driver id' })
  @ApiNoContentResponse({ description: 'Driver and his cars deleted' })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'A car of this driver is busy with an active order',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Driver not found' })
  @HttpCode(204)
  async removeDriver(@Param('id') id: string): Promise<void> {
    await this.catalog.removeDriver(id);
  }

  @Get('drivers/:driverId/cars')
  @ApiOperation({ summary: 'List cars of one driver' })
  @ApiParam({ name: 'driverId', description: 'Driver id' })
  @ApiOkResponse({ type: TaxiCarListDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Driver not found' })
  listCars(@Param('driverId') driverId: string): Promise<TaxiCarListDto> {
    return this.catalog.listCars(driverId);
  }

  @Post('drivers/:driverId/cars')
  @ApiOperation({ summary: 'Add a car to a driver' })
  @ApiParam({ name: 'driverId', description: 'Driver id' })
  @ApiCreatedResponse({ type: TaxiCarDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Non-positive seats, non-feature service or invalid fields',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'License plate already exists',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Driver or car-feature service not found',
  })
  createCar(
    @Param('driverId') driverId: string,
    @Body() dto: CreateTaxiCarRequestDto,
  ) {
    return this.catalog.createCar(driverId, dto);
  }

  @Patch('drivers/:driverId/cars/:carId')
  @ApiOperation({
    summary: 'Update a car (featureServiceIds replaces the whole feature list)',
  })
  @ApiParam({ name: 'driverId', description: 'Driver id' })
  @ApiParam({ name: 'carId', description: 'Car id' })
  @ApiOkResponse({ type: TaxiCarDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Non-positive seats, non-feature service or invalid fields',
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'License plate already exists',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Driver, car or car-feature service not found',
  })
  updateCar(
    @Param('driverId') driverId: string,
    @Param('carId') carId: string,
    @Body() dto: UpdateTaxiCarRequestDto,
  ) {
    return this.catalog.updateCar(driverId, carId, dto);
  }

  @Delete('drivers/:driverId/cars/:carId')
  @ApiOperation({ summary: 'Delete a car; blocked while it is busy' })
  @ApiParam({ name: 'driverId', description: 'Driver id' })
  @ApiParam({ name: 'carId', description: 'Car id' })
  @ApiNoContentResponse({ description: 'Car deleted' })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Car is busy with an active taxi order',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Driver or car not found',
  })
  @HttpCode(204)
  async removeCar(
    @Param('driverId') driverId: string,
    @Param('carId') carId: string,
  ): Promise<void> {
    await this.catalog.removeCar(driverId, carId);
  }
}
