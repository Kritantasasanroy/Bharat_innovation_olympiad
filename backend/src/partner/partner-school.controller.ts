import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplySchoolDto } from '../school/dto/school.dto';
import { SchoolService } from '../school/school.service';
import { AuthenticatedPartner, CurrentPartner, PartnerJwtGuard } from './partner-jwt.guard';

/**
 * Partners onboard schools, not just students. A partner submits a school's
 * access request on its behalf; staff review it in the same queue as a
 * self-applying school, and see who brought it in.
 *
 * The partner never gains access to the school — approval issues the token to
 * the school's own coordinator, exactly as with a self-application.
 */
@Controller('partner/schools')
@UseGuards(PartnerJwtGuard)
export class PartnerSchoolController {
    constructor(
        private schoolService: SchoolService,
        private prisma: PrismaService,
    ) {}

    /** Submit a school for onboarding, attributed to the calling partner. */
    @Post()
    onboard(@CurrentPartner() partner: AuthenticatedPartner, @Body() dto: ApplySchoolDto) {
        return this.schoolService.apply(dto, partner.partnerId);
    }

    /** The schools this partner has brought in, and where each one stands. */
    @Get()
    async list(@CurrentPartner() partner: AuthenticatedPartner) {
        const requests = await this.prisma.schoolRequest.findMany({
            where: { submittedByPartnerId: partner.partnerId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                schoolName: true,
                board: true,
                udiseCode: true,
                city: true,
                state: true,
                pincode: true,
                coordinatorName: true,
                coordinatorEmail: true,
                coordinatorPhone: true,
                status: true,
                // Which campaign drove this school (null for a direct onboard),
                // so the partner portal can count schools per campaign.
                submittedViaReferralCode: true,
                decisionReason: true,
                createdAt: true,
                decidedAt: true,
                // The partner sees the school's code once it is onboarded, but
                // never its access token — that is the coordinator's credential.
                school: { select: { code: true } },
            },
        });

        return requests.map(({ school, ...request }) => ({
            ...request,
            schoolCode: school?.code ?? null,
        }));
    }
}
