import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit() {
        // Retry connecting on startup to handle Neon DB cold-start delays
        const maxRetries = 5;
        const retryDelayMs = 3000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.$connect();
                this.logger.log('Database connected successfully');
                return;
            } catch (error: any) {
                this.logger.warn(
                    `DB connection attempt ${attempt}/${maxRetries} failed: ${error?.message?.split('\n')[0]}`
                );
                if (attempt < maxRetries) {
                    this.logger.log(`Retrying in ${retryDelayMs / 1000}s...`);
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                } else {
                    this.logger.error('All DB connection attempts failed. Starting without verified DB connection.');
                    // Don't throw — let the app start anyway. First actual query will retry.
                }
            }
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
