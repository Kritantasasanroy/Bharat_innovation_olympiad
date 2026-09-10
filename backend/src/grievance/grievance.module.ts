import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../common/services/s3.module';
import { GrievanceController } from './grievance.controller';
import { GrievanceService } from './grievance.service';

@Module({
    imports: [PrismaModule, S3Module],
    controllers: [GrievanceController],
    providers: [GrievanceService],
    exports: [GrievanceService],
})
export class GrievanceModule {}
