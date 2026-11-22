import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
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
  AutoCalcRequestDto,
  AutoCalcResultDto,
  SetPairPriceRequestDto,
  TaxiPriceMatrixDto,
  TaxiPricePairDto,
} from '../dto/taxi-price-matrix.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { TaxiPriceMatrixService } from '../services/taxi-price-matrix.service.js';

/**
 * Admin endpoints of the taxi price matrix: read the whole matrix, set one
 * symmetric pair price, or auto-calc every pair from the price between the
 * extreme cities (design D5/D6).
 */
@ApiTags('taxi')
@Controller('taxi/price-matrix')
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
export class TaxiPriceMatrixController {
  constructor(private readonly matrix: TaxiPriceMatrixService) {}

  @Get()
  @ApiOperation({ summary: 'Cities (by km marker) plus all pair prices' })
  @ApiOkResponse({ type: TaxiPriceMatrixDto })
  getMatrix(): Promise<TaxiPriceMatrixDto> {
    return this.matrix.getMatrix();
  }

  @Put(':fromCityId/:toCityId')
  @ApiOperation({
    summary: 'Create or overwrite the price of one unordered pair',
  })
  @ApiParam({ name: 'fromCityId', description: 'First city id' })
  @ApiParam({ name: 'toCityId', description: 'Second city id' })
  @ApiOkResponse({ type: TaxiPricePairDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Negative/fractional price or identical city ids',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'One of the cities does not exist',
  })
  setPairPrice(
    @Param('fromCityId') fromCityId: string,
    @Param('toCityId') toCityId: string,
    @Body() dto: SetPairPriceRequestDto,
  ): Promise<TaxiPricePairDto> {
    return this.matrix.setPairPrice(fromCityId, toCityId, dto);
  }

  @Post('auto-calc')
  @ApiOperation({
    summary: 'Recalculate every pair from the extreme-cities price',
  })
  @ApiOkResponse({ type: AutoCalcResultDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Invalid price or fewer than two active cities',
  })
  autoCalc(@Body() dto: AutoCalcRequestDto): Promise<AutoCalcResultDto> {
    return this.matrix.autoCalc(dto);
  }
}
