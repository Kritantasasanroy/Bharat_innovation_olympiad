import { Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PartnerDirectoryService } from './partner-directory.service';
import { PartnerPortalService } from './partner-portal.service';
import { AuthenticatedPartner, CurrentPartner, PartnerJwtGuard } from './partner-jwt.guard';
import { PartnerService } from './partner.service';
import { UpdatePartnerProfileDto } from './dto/partner.dto';

/**
 * The partner's own view of its footprint: its schools, their students, and the
 * results an admin has released to partners.
 *
 * Every route derives its scope from `partner.partnerId` on the JWT. Nothing here
 * takes a partner id from the client.
 */
@Controller('partner/portal')
@UseGuards(PartnerJwtGuard)
export class PartnerPortalController {
    constructor(
        private portal: PartnerPortalService,
        private directory: PartnerDirectoryService,
        private partnerService: PartnerService,
    ) {}

    @Get('overview')
    overview(@CurrentPartner() partner: AuthenticatedPartner) {
        return this.portal.overview(partner.partnerId);
    }

    /** The schools assigned to this partner. */
    @Get('schools')
    schools(@CurrentPartner() partner: AuthenticatedPartner) {
        return this.portal.schools(partner.partnerId);
    }

    /** Every student across those schools; `?schoolId=` narrows to one of them. */
    @Get('students')
    students(
        @CurrentPartner() partner: AuthenticatedPartner,
        @Query('schoolId') schoolId?: string,
    ) {
        return this.portal.students(partner.partnerId, schoolId);
    }

    /** Exam instances whose results have been released to partners. */
    @Get('results')
    releasedInstances(@CurrentPartner() partner: AuthenticatedPartner) {
        return this.portal.releasedInstances(partner.partnerId);
    }

    /** Student-level results for one released instance. */
    @Get('results/:examInstanceId')
    results(
        @CurrentPartner() partner: AuthenticatedPartner,
        @Param('examInstanceId') examInstanceId: string,
    ) {
        return this.portal.results(partner.partnerId, examInstanceId);
    }

    /** The same results as a downloadable Excel workbook. */
    @Get('results/:examInstanceId/export.xlsx')
    async exportResults(
        @CurrentPartner() partner: AuthenticatedPartner,
        @Param('examInstanceId') examInstanceId: string,
        @Res() res: Response,
    ) {
        const { buffer, filename } = await this.portal.resultsWorkbook(
            partner.partnerId,
            examInstanceId,
        );

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    }

    // ── Profile (item 14) ────────────────────────────────────────────────────

    @Get('profile')
    profile(@CurrentPartner() partner: AuthenticatedPartner) {
        return this.partnerService.profile(partner.partnerId);
    }

    /**
     * A partner edits its own contact details. The org's *status* and commission
     * are staff decisions and are not writable here.
     */
    @Patch('profile')
    updateProfile(
        @CurrentPartner() partner: AuthenticatedPartner,
        @Body() dto: UpdatePartnerProfileDto,
    ) {
        return this.partnerService.updateProfile(partner.partnerId, dto);
    }
}
