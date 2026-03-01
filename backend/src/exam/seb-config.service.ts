import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SebConfigService {
    constructor(private prisma: PrismaService) { }

    /**
     * Generate a SEB configuration object for an exam instance.
     * In production, this would be serialized to XML plist format,
     * gzipped, and then AES-256-CBC encrypted.
     * For v1, we return a JSON config that can be imported via SEB Config Tool.
     */
    async generateConfig(instanceId: string): Promise<object> {
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: instanceId },
            include: { exam: true },
        });

        if (!instance) throw new Error('Exam instance not found');

        const baseUrl = process.env.APP_URL || 'https://exam.bharatolympiad.in';

        return {
            // ── Core settings ──
            startURL: `${baseUrl}/exams/${instanceId}/play`,
            startURLAllowDeepLink: false,

            // ── Browser Exam Key ──
            sendBrowserExamKey: true,
            browserExamKey: instance.browserExamKey || '',
            examSessionClearCookiesOnStart: true,

            // ── Quit settings ──
            quitURL: instance.quitUrl || `${baseUrl}/seb-quit/${instanceId}`,
            allowQuit: false,
            quitURLConfirm: false,

            // ── Security restrictions ──
            allowSwitchToApplications: false,
            allowFlashFullscreen: false,
            allowPdfPlugIn: false,
            allowPreferencesWindow: false,
            allowSpellCheck: false,
            allowDictionaryLookup: false,
            allowScreenSharing: false,
            enableScreenCapture: false,

            // ── URL filtering ──
            enableURLFilter: true,
            enableURLContentFilter: false,
            URLFilterRules: [
                { active: true, regex: false, expression: `${baseUrl}/*`, action: 1 },  // Allow
                { active: true, regex: false, expression: '*', action: 0 },             // Block
            ],

            // ── Browser chrome ──
            showTaskBar: false,
            showReloadButton: false,
            showTime: true,
            showInputLanguage: false,
            enableBrowserWindowToolbar: false,
            hideBrowserWindowToolbar: true,

            // ── Misc ──
            mainBrowserWindowWidth: '100%',
            mainBrowserWindowHeight: '100%',
            mainBrowserWindowPositioning: 1,
            enableSebBrowser: true,
            browserWindowWebView: 3,

            // ── Exam metadata ──
            examTitle: instance.exam.title,
            examDuration: instance.exam.durationMinutes * 60,
        };
    }

    /**
     * Generate a seb:// protocol URL for launching SEB with this config.
     */
    getSebLaunchUrl(instanceId: string): string {
        const baseUrl = process.env.APP_URL || 'https://exam.bharatolympiad.in';
        return `seb://${baseUrl.replace(/^https?:\/\//, '')}/api/seb/config/${instanceId}`;
    }
}
