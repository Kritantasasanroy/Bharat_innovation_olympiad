import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExamFeedbackController } from './exam-feedback.controller';
import { ExamFeedbackService } from './exam-feedback.service';

@Module({
    imports: [PrismaModule],
    controllers: [ExamFeedbackController],
    providers: [ExamFeedbackService],
    exports: [ExamFeedbackService],
})
export class ExamFeedbackModule {}
