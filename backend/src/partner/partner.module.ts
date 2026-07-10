import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { SchoolModule } from '../school/school.module';
import { PartnerAdminApiClient } from './admin-api.client';
import { PartnerJwtGuard } from './partner-jwt.guard';
import { PartnerSchoolController } from './partner-school.controller';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';

@Module({
    imports: [
        PrismaModule,
        // Partners onboard schools through the same service a school self-applies
        // to; SchoolService in turn needs this module's PartnerAdminApiClient.
        forwardRef(() => SchoolModule),
        JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-jwt-secret' }),
    ],
    controllers: [PartnerController, PartnerSchoolController],
    providers: [PartnerService, PartnerAdminApiClient, PartnerJwtGuard],
    // Exported so AuthModule (signup) and PaymentModule (paid conversion) can
    // fire best-effort referral attribution into the partner engine.
    exports: [PartnerAdminApiClient],
})
export class PartnerModule {}
