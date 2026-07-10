import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CertificateService } from './certificate.service';

export class RevokeCertificateDto {
    @IsString()
    @IsNotEmpty()
    reason: string;
}

@Controller()
export class CertificateController {
    constructor(private certificateService: CertificateService) {}

    /**
     * PUBLIC — anyone holding a certificate number can check it (spec Student §28).
     * Intentionally unauthenticated and mounted before any guard.
     */
    @Get('certificates/verify/:number')
    verify(@Param('number') certificateNumber: string) {
        return this.certificateService.verify(certificateNumber);
    }

    // ── Student ───────────────────────────────────────────────────────────────

    @Get('certificates/me')
    @UseGuards(JwtAuthGuard)
    listMine(@CurrentUser('id') userId: string) {
        return this.certificateService.listForUser(userId);
    }

    @Get('certificates/:id')
    @UseGuards(JwtAuthGuard)
    getMine(@CurrentUser('id') userId: string, @Param('id') id: string) {
        return this.certificateService.getForUser(userId, id);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    @Post('admin/exam-instances/:id/certificates')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    generate(@Param('id') examInstanceId: string, @CurrentUser('id') adminId: string) {
        return this.certificateService.generateForInstance(examInstanceId, adminId);
    }

    @Get('admin/certificates')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    listForInstance(@Query('examInstanceId') examInstanceId: string) {
        return this.certificateService.listForInstance(examInstanceId);
    }

    @Patch('admin/certificates/:id/revoke')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    revoke(
        @Param('id') id: string,
        @Body() dto: RevokeCertificateDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.certificateService.revoke(id, dto.reason, adminId);
    }
}
