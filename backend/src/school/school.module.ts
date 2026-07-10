import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
    imports: [
        PrismaModule,
        JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-jwt-secret' }),
    ],
    controllers: [SchoolController],
    providers: [SchoolService],
})
export class SchoolModule {}
