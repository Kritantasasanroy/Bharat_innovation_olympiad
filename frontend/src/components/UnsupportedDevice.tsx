'use client';

import { TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
import Link from 'next/link';

/**
 * Shown when the exam is opened on an Android or ChromeOS device.
 *
 * These platforms are not supported for the exam — the published requirement
 * is a laptop or desktop (Windows 10+ / macOS 10.14+). The block is hard: the
 * device check (`useDeviceCheck` → `platform`) refuses to pass on either OS,
 * so the exam cannot be started from here regardless of screen size.
 *
 * The tone is the same as `TooSmallForExam`: say what is wrong, what to use
 * instead, and make clear everything outside the exam still works on this
 * device — a student should not feel locked out of their own account.
 */
export default function UnsupportedDevice() {
    return (
        <div className="too-small">
            <div className="too-small__card glass-card">
                <div className="too-small__icon" aria-hidden="true">💻</div>

                <h1>This device can&apos;t run the exam</h1>
                <p className="too-small__lede">
                    The Bharat Innovation Olympiad exam must be taken on a{' '}
                    <strong>laptop or desktop</strong>. Android phones and tablets, and ChromeOS
                    devices, are <strong>not supported</strong> for the exam.
                </p>

                <p className="too-small__sub">Everything you need for the exam:</p>
                <dl className="tech-req-list">
                    {TECH_REQUIREMENTS.map((req) => (
                        <div key={req.label} className="tech-req-row">
                            <dt>{req.label}</dt>
                            <dd>{req.value}</dd>
                        </div>
                    ))}
                </dl>

                <p className="too-small__note">
                    Everything else (your dashboard, results, certificates and your slot) works
                    fine on this device. It is only the exam itself that needs a laptop or desktop.
                </p>

                <Link href="/dashboard" className="btn btn-primary">
                    Back to my dashboard
                </Link>
            </div>
        </div>
    );
}
