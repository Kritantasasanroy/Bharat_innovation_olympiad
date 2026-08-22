import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
    ApplyPartnerDto,
    DecidePartnerDto,
    GenerateStatementDto,
    PartnerLoginDto,
    UpdatePayoutStatusDto,
} from './dto/partner.dto';
import { PartnerService } from './partner.service';

@Controller()
export class PartnerController {
    constructor(private partnerService: PartnerService) {}

    /** PUBLIC — a brand-new partner requests access (no token). */
    @Post('partner/apply')
    apply(@Body() dto: ApplyPartnerDto) {
        return this.partnerService.apply(dto);
    }

    /** PUBLIC — approved partner signs in with email + password, or an access token. */
    @Post('partner/login')
    login(@Body() dto: PartnerLoginDto) {
        return this.partnerService.login(dto);
    }

    /** ADMIN — partner review queue for the admin Access Management page. */
    @Get('admin/partner-requests')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    list() {
        return this.partnerService.list();
    }

    /** ADMIN — grant / reject / revoke / re-grant a partner's access. */
    @Patch('admin/partner-requests/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    decide(
        @Param('id') id: string,
        @Body() dto: DecidePartnerDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.partnerService.decide(id, dto, adminId);
    }

    /** ADMIN — handover card, including the partner's access token in the clear. */
    @Get('admin/partner-requests/:id/card')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    card(@Param('id') id: string) {
        return this.partnerService.card(id);
    }

    /** ADMIN — issue a fresh token, invalidating the previous one immediately. */
    @Post('admin/partner-requests/:id/rotate-token')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    rotate(@Param('id') id: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.rotateToken(id, adminId);
    }

    /** ADMIN — re-send the current access details, e.g. "they said they never got the email". */
    @Post('admin/partner-requests/:id/resend')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    resend(@Param('id') id: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.resendAccess(id, adminId);
    }

    // ── Admin visibility into the partner engine (campaigns/funnel/statements/payouts) ──

    /** ADMIN — a partner's whole engine workspace in one call: identity, campaigns, funnel, statements, payouts. */
    @Get('admin/partners/:partnerId/engine')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    engineSnapshot(@Param('partnerId') partnerId: string) {
        return this.partnerService.engineSnapshot(partnerId);
    }

    /** ADMIN — close out a commission period for a partner on their behalf. */
    @Post('admin/partners/:partnerId/statements')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    generateStatement(@Param('partnerId') partnerId: string, @Body() dto: GenerateStatementDto) {
        return this.partnerService.generateStatement(partnerId, dto.period);
    }

    /** ADMIN/FINANCE — advance a payout: PENDING -> SIGNED_OFF -> RELEASED. */
    @Patch('admin/payouts/:payoutId/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    updatePayoutStatus(@Param('payoutId') payoutId: string, @Body() dto: UpdatePayoutStatusDto) {
        return this.partnerService.updatePayoutStatus(payoutId, dto.status, dto.approver, dto.reason);
    }
}
