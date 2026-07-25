import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RefundStatus, Role } from '@prisma/client';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RefundService } from './refund.service';

export class CreateRefundDto {
    @IsString()
    @IsNotEmpty()
    paymentId: string;

    @IsString()
    @IsNotEmpty()
    reason: string;
}

export class DecideRefundDto {
    @IsIn(['APPROVED', 'REJECTED'])
    decision: 'APPROVED' | 'REJECTED';

    @IsString()
    @IsNotEmpty()
    reason: string;
}

@Controller()
export class RefundController {
    constructor(private refundService: RefundService) {}

    // ── Student ───────────────────────────────────────────────────────────────

    @Post('refunds')
    @UseGuards(JwtAuthGuard)
    request(@CurrentUser('id') userId: string, @Body() dto: CreateRefundDto) {
        return this.refundService.request(userId, dto.paymentId, dto.reason);
    }

    @Get('refunds/me')
    @UseGuards(JwtAuthGuard)
    listMine(@CurrentUser('id') userId: string) {
        return this.refundService.listForUser(userId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    @Get('admin/refunds')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    listAll(@Query('status') status?: RefundStatus) {
        return this.refundService.listAll(status);
    }

    @Patch('admin/refunds/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    decide(
        @Param('id') id: string,
        @Body() dto: DecideRefundDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.refundService.decide(id, dto.decision, dto.reason, adminId);
    }
}
