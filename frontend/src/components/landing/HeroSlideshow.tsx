'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { EVENT_PHOTOS } from '@/lib/copy/landing';

/**
 * The hero background: real event photos, crossfading every 7 seconds.
 *
 * All frames are stacked and the active one fades in over the previous — a
 * 1.2s opacity transition reads as a smooth dissolve, not a cut. A dark
 * gradient veil sits on top (part of this component), so the photos are a
 * translucent backdrop and the headline stays readable over any frame.
 *
 * `prefers-reduced-motion` freezes the slideshow on the first photo: a
 * rotating background is exactly the kind of motion that motion-sensitive
 * visitors need to be able to switch off.
 */
export default function HeroSlideshow({ overlay = 0.52 }: { overlay?: number }) {
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const timer = setInterval(() => setActive((a) => (a + 1) % EVENT_PHOTOS.length), 7000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
            {EVENT_PHOTOS.map((photo, i) => (
                <div key={photo.src} className="lp-slide" style={{ opacity: i === active ? 1 : 0 }}>
                    <Image
                        src={photo.src}
                        alt=""
                        fill
                        // Only the first slide may compete for LCP; the rest load lazily.
                        priority={i === 0}
                        sizes="100vw"
                        style={{ objectFit: 'cover' }}
                    />
                </div>
            ))}
            {/* Dark translucent veil — heavy enough that white text passes
                contrast over any photo, light enough to keep the photos visible. */}
            <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(180deg, rgba(8,18,4,${overlay + 0.14}) 0%, rgba(8,18,4,${overlay}) 45%, rgba(8,18,4,${overlay + 0.2}) 100%)`,
            }} />
        </div>
    );
}
