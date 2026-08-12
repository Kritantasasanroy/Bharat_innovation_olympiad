import { Global, Module } from '@nestjs/common';
import { AdminMailController } from './admin-mail.controller';
import { NotificationService } from './notification.service';
import { SmsHealthController } from './sms-health.controller';
import { WhatsAppHealthController } from './whatsapp-health.controller';
import { WhatsAppReminderService } from './whatsapp-reminder.service';
import { WhatsAppService } from './whatsapp.service';

/**
 * Global so any feature module can send a transactional message without
 * re-importing this one — notifications hang off flows all over the app
 * (registration, payment, submission) and carry no state of their own.
 *
 * Also hosts the admin outbound-mail endpoint (`/admin/mail/*`), which sends
 * announcements through the same provider, `/admin/notifications/*`, which
 * reports SMS gateway health, and `/admin/whatsapp/*` for the WATI channel.
 *
 * `WhatsAppReminderService` is listed as a provider even though nothing injects
 * it besides its own controller: it is a timer that must start with the app, and
 * Nest only runs `onModuleInit` on providers it has instantiated.
 */
@Global()
@Module({
    controllers: [AdminMailController, SmsHealthController, WhatsAppHealthController],
    providers: [NotificationService, WhatsAppService, WhatsAppReminderService],
    exports: [NotificationService, WhatsAppService],
})
export class NotificationModule {}
