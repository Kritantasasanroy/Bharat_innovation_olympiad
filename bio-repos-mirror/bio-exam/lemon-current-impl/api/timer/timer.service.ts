import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AttemptService } from '../attempt/attempt.service';

/**
 * Server-authoritative timer service.
 *
 * Key principle: NEVER trust client clocks.
 * Store exam start time server-side and compute remaining time from there.
 * Client only receives and displays server-pushed remaining time.
 */
@Injectable()
export class TimerService {
    private activeTimers = new Map<string, NodeJS.Timeout>();

    constructor(private attemptService: AttemptService) { }

    async startTimer(client: Socket, attemptId: string) {
        // Get attempt with exam duration
        const attempt = await this.attemptService.findById(attemptId);
        if (!attempt || !attempt.startedAt) return;

        const exam = attempt.examInstance.exam;
        const startedAt = new Date(attempt.startedAt).getTime();
        const durationMs = exam.durationMinutes * 60 * 1000;
        const endsAt = startedAt + durationMs;

        // Clear any existing timer for this attempt
        this.stopTimer(attemptId);

        // Tick every second
        const interval = setInterval(async () => {
            const now = Date.now();
            const remainingMs = Math.max(0, endsAt - now);
            const remainingSecs = Math.ceil(remainingMs / 1000);

            // Emit timer tick to client
            client.emit('timer-tick', {
                remainingSecs,
                totalSecs: exam.durationMinutes * 60,
            });

            // Auto-submit on expiry
            if (remainingSecs <= 0) {
                this.stopTimer(attemptId);

                try {
                    await this.attemptService.autoSubmit(attemptId);
                    client.emit('exam-expired', { attemptId });
                } catch (err) {
                    console.error(`[Timer] Auto-submit failed for ${attemptId}:`, err);
                }
            }
        }, 1000);

        this.activeTimers.set(attemptId, interval);
    }

    stopTimer(attemptId: string) {
        const existing = this.activeTimers.get(attemptId);
        if (existing) {
            clearInterval(existing);
            this.activeTimers.delete(attemptId);
        }
    }

    getActiveTimerCount(): number {
        return this.activeTimers.size;
    }
}
