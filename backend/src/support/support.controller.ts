import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role, SupportTicketSource, SupportTicketStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
    AuthenticatedPartner,
    CurrentPartner,
    PartnerJwtGuard,
} from '../partner/partner-jwt.guard';
import { CreateSupportTicketDto, DecideSupportTicketDto } from './dto/support.dto';
import { SupportService } from './support.service';

/** Partner-raised support tickets (authenticated via the partner JWT). */
@Controller('partner/support')
@UseGuards(PartnerJwtGuard)
export class PartnerSupportController {
    constructor(private support: SupportService) {}

    @Post()
    create(@CurrentPartner() partner: AuthenticatedPartner, @Body() dto: CreateSupportTicketDto) {
        return this.support.create(
            SupportTicketSource.PARTNER,
            { id: partner.partnerId, name: partner.orgName, email: partner.email },
            dto,
        );
    }

    @Get()
    listMine(@CurrentPartner() partner: AuthenticatedPartner) {
        return this.support.listForSubmitter(partner.partnerId);
    }
}

/** School-coordinator-raised support tickets. */
@Controller('school/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCHOOL)
export class SchoolSupportController {
    constructor(private support: SupportService) {}

    @Post()
    create(
        @CurrentUser('id') userId: string,
        @CurrentUser('firstName') firstName: string,
        @CurrentUser('lastName') lastName: string,
        @CurrentUser('email') email: string,
        @Body() dto: CreateSupportTicketDto,
    ) {
        return this.support.create(
            SupportTicketSource.SCHOOL,
            { id: userId, name: `${firstName} ${lastName}`.trim(), email },
            dto,
        );
    }

    @Get()
    listMine(@CurrentUser('id') userId: string) {
        return this.support.listForSubmitter(userId);
    }
}

/** Admin view of every partner/school support ticket. */
@Controller('admin/support-tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminSupportController {
    constructor(private support: SupportService) {}

    @Get()
    list(
        @Query('status') status?: SupportTicketStatus,
        @Query('source') source?: SupportTicketSource,
    ) {
        return this.support.listAll({ status, source });
    }

    @Patch(':id')
    decide(
        @Param('id') id: string,
        @Body() dto: DecideSupportTicketDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.support.decide(id, dto, adminId);
    }
}
