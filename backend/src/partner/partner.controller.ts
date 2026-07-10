import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApplyPartnerDto, DecidePartnerDto, PartnerLoginDto } from './dto/partner.dto';
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
}
