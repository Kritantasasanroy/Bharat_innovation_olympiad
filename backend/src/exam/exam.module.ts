import { Module } from '@nestjs/common';
import { SlotModule } from '../slot/slot.module';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';

@Module({
    // Creating or publishing an exam has to be able to schedule the
    // participants who are already registered for it.
    imports: [SlotModule],
    controllers: [ExamController],
    providers: [ExamService],
    exports: [ExamService],
})
export class ExamModule { }
