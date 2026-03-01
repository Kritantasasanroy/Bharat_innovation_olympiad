import { Module } from '@nestjs/common';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { SebConfigService } from './seb-config.service';

@Module({
    controllers: [ExamController],
    providers: [ExamService, SebConfigService],
    exports: [ExamService, SebConfigService],
})
export class ExamModule { }
