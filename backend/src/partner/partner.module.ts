import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { PartnerAdminApiClient } from './admin-api.client';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';

@Module({
    imports: [
        PrismaModule,
        JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-jwt-secret' }),
    ],
    controllers: [PartnerController],
    providers: [PartnerService, PartnerAdminApiClient],
})
export class PartnerModule {}
