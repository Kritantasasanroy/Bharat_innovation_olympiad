import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
    imports: [PrismaModule],
    controllers: [TrainingController],
    providers: [TrainingService],
    // Exported because the certificates page reports training alongside exams.
    exports: [TrainingService],
})
export class TrainingModule {}
