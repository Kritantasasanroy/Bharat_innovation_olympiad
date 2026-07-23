import { Global, Module } from '@nestjs/common';
import { AdminMailController } from './admin-mail.controller';
import { NotificationService } from './notification.service';

/**
 * Global so any feature module can send a transactional message without
 * re-importing this one — notifications hang off flows all over the app
 * (registration, payment, submission) and carry no state of their own.
 *
 * Also hosts the admin outbound-mail endpoint (`/admin/mail/*`), which sends
 * announcements through the same provider.
 */
@Global()
@Module({
    controllers: [AdminMailController],
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule {}
