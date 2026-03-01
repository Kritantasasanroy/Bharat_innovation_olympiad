import { Module } from '@nestjs/common';
import { AttemptModule } from '../attempt/attempt.module';
import { TimerGateway } from './timer.gateway';
import { TimerService } from './timer.service';

@Module({
    imports: [AttemptModule],
    providers: [TimerGateway, TimerService],
    exports: [TimerService],
})
export class TimerModule { }
