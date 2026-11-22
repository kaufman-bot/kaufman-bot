import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { X_API_KEY } from '../constants/api-key.constants.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import {
  TaxiOrderDto,
  TaxiOrderListDto,
  UpdateTaxiOrderStatusRequestDto,
} from '../dto/taxi-orders.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { TaxiOrdersService } from '../services/taxi-orders.service.js';

/**
 * Operational view of submitted taxi orders: list (default: active orders
 * only) and status transitions. COMPLETED/CANCELLED free the assigned car
 * for the next auto-assignment (design D11).
 */
@ApiTags('taxi')
@Controller('taxi/orders')
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
export class TaxiOrdersController {
  constructor(private readonly orders: TaxiOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Submitted orders (newest first); drafts are never listed',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description:
      'Explicit status filter; omitted → only NEW and CONFIRMED are returned',
    enum: ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  @ApiOkResponse({ type: TaxiOrderListDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Unknown status filter value',
  })
  list(@Query('status') status?: string): Promise<TaxiOrderListDto> {
    return this.orders.list(status);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Change order status; COMPLETED/CANCELLED release the assigned car',
  })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ type: TaxiOrderDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Unknown status or wizard draft order',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Order not found' })
  @HttpCode(200)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaxiOrderStatusRequestDto,
  ): Promise<TaxiOrderDto> {
    return this.orders.updateStatus(id, dto);
  }
}
