import { Global, Module } from '@nestjs/common';
import { AdminMailController } from './admin-mail.controller';
import { NotificationService } from './notification.service';
import { SmsHealthController } from './sms-health.controller';

/**
 * Global so any feature module can send a transactional message without
 * re-importing this one — notifications hang off flows all over the app
 * (registration, payment, submission) and carry no state of their own.
 *
 * Also hosts the admin outbound-mail endpoint (`/admin/mail/*`), which sends
 * announcements through the same provider, and `/admin/notifications/*`, which
 * reports SMS gateway health.
 */
@Global()
@Module({
    controllers: [AdminMailController, SmsHealthController],
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule {}
