import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmailOtpService } from '../common/email-otp.service';
import { getJwtSecret } from '../common/jwt-secret';
import { GeoModule } from '../geo/geo.module';
import { PartnerModule } from '../partner/partner.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResultsModule } from '../results/results.module';
import { SlotModule } from '../slot/slot.module';
import { SchoolDirectoryController } from './school-directory.controller';
import { SchoolDirectoryService } from './school-directory.service';
import { SchoolPortalController } from './school-portal.controller';
import { SchoolPortalService } from './school-portal.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
    imports: [
        PrismaModule,
        GeoModule,
        // SchoolService resolves a campaign referral code to a partner via the
        // engine client; SchoolPortalService resolves the school's partner card
        // via PartnerDirectoryService. PartnerModule imports SchoolModule too (for
        // /partner/schools), so the cycle is broken with forwardRef.
        forwardRef(() => PartnerModule),
        // A school picking its own slot goes through the same auto-allocation path
        // staff use, so a school-picked slot and a staff-assigned one behave alike.
        SlotModule,
        // School result downloads reuse the admin export builder, scoped to the
        // school and gated on the SCHOOLS release audience.
        ResultsModule,
        JwtModule.register({ secret: getJwtSecret() }),
    ],
    controllers: [SchoolController, SchoolDirectoryController, SchoolPortalController],
    providers: [SchoolService, SchoolDirectoryService, SchoolPortalService, EmailOtpService],
    // PartnerModule's school-onboarding route submits requests through SchoolService.
    exports: [SchoolService],
})
export class SchoolModule {}
