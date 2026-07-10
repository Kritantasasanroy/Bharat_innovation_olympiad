import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GeoModule } from '../geo/geo.module';
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
        JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-jwt-secret' }),
    ],
    controllers: [SchoolController, SchoolDirectoryController, SchoolPortalController],
    providers: [SchoolService, SchoolDirectoryService, SchoolPortalService],
    // PartnerModule's school-onboarding route submits requests through SchoolService.
    exports: [SchoolService],
})
export class SchoolModule {}
