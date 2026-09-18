/**
 * Detects the platforms the exam does not support: Android (phones and
 * tablets) and ChromeOS. The published requirement is a laptop or desktop
 * running Windows 10+ or macOS 10.14+.
 *
 * Both signals are checked because some Chromium versions freeze the classic
 * user-agent string and only expose the platform through User-Agent Client
 * Hints — either one matching is enough to block.
 */
export function isUnsupportedExamPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ?? '';
    const isAndroid = /Android/i.test(ua) || uaPlatform === 'Android';
    const isChromeOS = /\bCrOS\b/.test(ua) || uaPlatform === 'Chrome OS';
    return isAndroid || isChromeOS;
}
