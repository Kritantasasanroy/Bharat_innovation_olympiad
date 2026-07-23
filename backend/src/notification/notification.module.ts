import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Global so any feature module can send a transactional message without
 * re-importing this one — notifications hang off flows all over the app
 * (registration, payment, submission) and carry no state of their own.
 */
@Global()
@Module({
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule {}
