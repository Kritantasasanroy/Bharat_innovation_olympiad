'use client';

import { useEffect } from 'react';

/**
 * Brings any error message that appears into view.
 *
 * Every portal renders validation and server errors into a banner near the top
 * of its form (`.auth-error`, `.form-error`, `.notice--error`, …). On a long
 * form — registration is the worst case — the submit button is far below that
 * banner, so a student who fills the form, scrolls down, and presses submit sees
 * *nothing happen*: the error is real and rendered, just off-screen above them.
 * That is the "Invalid origin" / "Error during registration" report — the error
 * was there, it was simply never shown to the person who needed to read it.
 *
 * Rather than wire a ref + scroll into all ~80 places that call `setError`, this
 * watches the DOM once, from the root layout, and reacts to any error node
 * appearing or changing. New error banners are covered automatically.
 *
 * It also fixes the accessibility half of the same bug: an error that is only a
 * red `<div>` is never announced. Anything matched here gets `role="alert"` and
 * `aria-live`, and is focused, so a screen reader reads it out.
 */

/** Every error-banner class used across the four portals, plus explicit alerts. */
const ERROR_SELECTOR = [
    '.auth-error',
    '.form-error',
    '.error-alert',
    '.notice--error',
    '[data-error]',
    '[role="alert"]',
].join(',');

/** Ignore a node we have already scrolled to, so re-renders do not fight the user. */
const HANDLED = 'data-scrolled-into-view';

function isVisible(el: HTMLElement): boolean {
    if (!el.isConnected) return false;
    if (!el.textContent?.trim()) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/** Already comfortably on screen? Then scrolling would be a jolt for no gain. */
function isInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= (window.innerHeight || 0);
}

function reveal(el: HTMLElement) {
    if (el.getAttribute(HANDLED) === el.textContent?.trim()) return;
    el.setAttribute(HANDLED, el.textContent?.trim() ?? '');

    // Announce it. A red div says nothing to a screen reader on its own.
    if (!el.hasAttribute('role')) el.setAttribute('role', 'alert');
    if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'assertive');

    if (!isInViewport(el)) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }

    // Focus so the next Tab continues from the error, not from the top of the page.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try {
        el.focus({ preventScroll: true });
    } catch {
        /* focus is a nicety; never let it break the page */
    }
}

export default function ScrollToError() {
    useEffect(() => {
        let frame = 0;

        const scan = () => {
            cancelAnimationFrame(frame);
            // One pass per frame — React can emit a burst of mutations per render.
            frame = requestAnimationFrame(() => {
                // Array.from, not `for...of` over the NodeList: admin-frontend's
                // tsconfig targets below ES2015, where iterating a NodeList needs
                // --downlevelIteration and otherwise fails the type check.
                const nodes = Array.from(document.querySelectorAll<HTMLElement>(ERROR_SELECTOR));
                for (const el of nodes) {
                    if (isVisible(el)) {
                        reveal(el);
                        return; // topmost error wins; do not fight over two banners
                    }
                    el.removeAttribute(HANDLED);
                }
            });
        };

        const observer = new MutationObserver(scan);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        scan(); // catch an error already rendered on first paint

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, []);

    return null;
}
