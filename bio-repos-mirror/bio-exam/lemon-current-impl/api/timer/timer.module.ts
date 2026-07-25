import { Module } from '@nestjs/common';
import { AttemptModule } from '../attempt/attempt.module';
import { AuthModule } from '../auth/auth.module';
import { TimerGateway } from './timer.gateway';
import { TimerService } from './timer.service';

@Module({
    imports: [AttemptModule, AuthModule],
    providers: [TimerGateway, TimerService],
    exports: [TimerService],
})
export class TimerModule { }
