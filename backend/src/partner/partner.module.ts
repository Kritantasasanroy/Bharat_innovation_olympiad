import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../common/jwt-secret';
import { PrismaModule } from '../prisma/prisma.module';
import { ResultsModule } from '../results/results.module';
import { SchoolModule } from '../school/school.module';
import { PartnerAdminApiClient } from './admin-api.client';
import { PartnerDirectoryService } from './partner-directory.service';
import { PartnerJwtGuard } from './partner-jwt.guard';
import { PartnerPortalController } from './partner-portal.controller';
import { PartnerPortalService } from './partner-portal.service';
import { PartnerSchoolController } from './partner-school.controller';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';

@Module({
    imports: [
        PrismaModule,
        // Partners onboard schools through the same service a school self-applies
        // to; SchoolService in turn needs this module's PartnerAdminApiClient.
        forwardRef(() => SchoolModule),
        // Partner result downloads reuse the admin export builder, scoped to the
        // partner's own schools and gated on the PARTNERS release audience.
        ResultsModule,
        JwtModule.register({ secret: getJwtSecret() }),
    ],
    controllers: [PartnerController, PartnerSchoolController, PartnerPortalController],
    providers: [
        PartnerService,
        PartnerAdminApiClient,
        PartnerJwtGuard,
        PartnerDirectoryService,
        PartnerPortalService,
    ],
    // Exported so AuthModule (signup) and PaymentModule (paid conversion) can
    // fire best-effort referral attribution into the partner engine, and so the
    // school portal can resolve its partner (`PartnerDirectoryService`).
    exports: [PartnerAdminApiClient, PartnerDirectoryService],
})
export class PartnerModule {}
