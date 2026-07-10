import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GeoModule } from '../geo/geo.module';
import { PartnerModule } from '../partner/partner.module';
import { PrismaModule } from '../prisma/prisma.module';
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
        // engine client. PartnerModule imports SchoolModule too (for
        // /partner/schools), so the cycle is broken with forwardRef.
        forwardRef(() => PartnerModule),
        JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-jwt-secret' }),
    ],
    controllers: [SchoolController, SchoolDirectoryController, SchoolPortalController],
    providers: [SchoolService, SchoolDirectoryService, SchoolPortalService],
    // PartnerModule's school-onboarding route submits requests through SchoolService.
    exports: [SchoolService],
})
export class SchoolModule {}
