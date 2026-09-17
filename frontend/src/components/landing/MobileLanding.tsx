'use client';

import Link from 'next/link';
import Image from 'next/image';
import AlumniCarousel from '@/components/landing/AlumniCarousel';
import HeroSlideshow from '@/components/landing/HeroSlideshow';
import ExpandableCard from '@/components/landing/ExpandableCard';
import RegistrationPopup from '@/components/landing/RegistrationPopup';
import SchoolPartnerForm from '@/components/landing/SchoolPartnerForm';
import ReferralCapture from '@/components/ReferralCapture';
import ThemeToggle from '@/components/ThemeToggle';
import { TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
import {
    Rocket, Lightbulb, Users, Medal, Globe,
    Target, ScrollText, ArrowRight, CheckCircle2, Minus,
    GraduationCap, FlaskConical, BadgeCheck, Menu, X, LogIn,
    MessageCircle, Instagram, Linkedin, Mail, PenLine, Briefcase,
} from 'lucide-react';
import { useState } from 'react';
import {
    CREDIBILITY_STATEMENT,
    COURSE_VALUE,
    DIMENSIONS,
    JOURNEY_STAGES,
    RECEIVES,
    SCHOOL_PARTNER_EMAIL,
    STATISTICS,
    TAKEAWAYS,
    COMMUNITY_LINKS,
    nextOlympiadDate,
} from '@/lib/copy/landing';

const BENEFITS = [
    { Icon: Medal, col: '#4f9a12', bg: 'rgba(125,200,50,0.12)', title: 'National Rankings', desc: 'Verified All-India, State, City & School ranks.' },
    { Icon: Lightbulb, col: '#ffcb05', bg: 'rgba(255,203,5,0.12)', title: 'Innopreneurs Advantage', desc: 'A pathway into startup contests and innovation labs.' },
    { Icon: Globe, col: '#7baff5', bg: 'rgba(59,111,224,0.12)', title: 'World Skill Challenge', desc: 'Qualify for global future-skills challenges.' },
    { Icon: FlaskConical, col: '#f97316', bg: 'rgba(249,115,22,0.12)', title: 'Experiential Learning Opportunity', desc: 'Pre-Incubation cohort, startup internship, and bootcamp.' },
];

const TRUST = [
    { Icon: Target, title: 'Fairness', teaser: 'Same exam, same conditions, server-run timer.', body: 'Every participant sits the same Innovation Olympiad exam under the same conditions, on their booked schedule, on a server-run timer that does not stop if their internet does. Question order is randomised per participant.' },
    { Icon: BadgeCheck, title: 'Authenticity', teaser: 'The registered participant is the one who sits the exam.', body: 'A face scan taken at registration confirms the registered participant is the one sitting the exam, and the same face is checked again continuously during the paper.' },
    { Icon: ScrollText, title: 'Credibility', teaser: 'A human reviews every flag, with written reasons.', body: CREDIBILITY_STATEMENT },
    { Icon: Users, title: 'Child-friendly', teaser: 'No recordings, no warning pile-ups.', body: 'No warnings pile up mid-exam and no video is ever recorded. Analysis runs inside the participant’s own browser; only the events leave the device.' },
];

/**
 * The public landing page, as its own mobile screen.
 *
 * The desktop page (`app/page.tsx`) is a wide two-column hero, a five-panel
 * gallery grid and inline pixel styles tuned for a 1200px canvas — none of
 * that reflows into something worth reading on a phone, so this is a
 * separate, shorter, single-column pass over the same content rather than a
 * squeezed copy of it. The copy itself comes from `lib/copy/landing.ts`, the
 * same module the desktop page reads, so the two can never drift.
 */
export default function MobileLanding() {
    const [menuOpen, setMenuOpen] = useState(false);

    // The brief (#5): the first Sunday on/after today+15.
    const nextDate = nextOlympiadDate();

    return (
        <div className="mob-lp">
            <ReferralCapture />
            <RegistrationPopup />

            <nav className="mob-lp-nav">
                <div className="mob-lp-nav__brand">
                    {/* The lockup carries the full name — no written wordmark (#1). */}
                    <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" height={34} width={112} style={{ height: 30, width: 'auto' }} />
                </div>
                <div className="mob-lp-nav__actions">
                    <Link
                        href="/login"
                        className="btn btn-secondary btn-sm"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        <LogIn size={13} /> Login
                    </Link>
                    <ThemeToggle />
                    <button type="button" className="mob-lp-nav__burger" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
                        {menuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </nav>

            {menuOpen && (
                <div className="mob-lp-menu">
                    <Link href="/register" className="btn btn-primary btn-lg" onClick={() => setMenuOpen(false)} style={{ width: '100%', justifyContent: 'center' }}>
                        <Rocket size={16} /> Register Now
                    </Link>
                    <Link href="/login" className="btn btn-secondary" onClick={() => setMenuOpen(false)} style={{ width: '100%', justifyContent: 'center' }}>
                        Participant Login
                    </Link>
                    <Link href="/about" onClick={() => setMenuOpen(false)}>About the Olympiad</Link>
                    <Link href="/terms" onClick={() => setMenuOpen(false)}>Terms &amp; Conditions</Link>
                    <Link href="/support" onClick={() => setMenuOpen(false)}>Support</Link>
                </div>
            )}

            <div className="mob-lp-nextdate">
                Next Olympiad · <b>{nextDate}</b> — Only 500 exam slots per week
            </div>

            <section className="mob-lp-hero" style={{ position: 'relative', overflow: 'hidden', background: '#0c1a06' }}>
                <HeroSlideshow overlay={0.66} />
                <div style={{ position: 'relative', zIndex: 1, color: '#fff' }}>
                    <div className="mob-lp-badge" style={{
                        background: 'rgba(125,200,50,0.16)', border: '1px solid rgba(125,200,50,0.4)', color: '#a9e35b',
                    }}>
                        India&apos;s Innovation &amp; Future Skills Movement · Grades 6&ndash;12
                    </div>
                    <h1 className="mob-lp-hero__title" style={{ color: '#fff' }}>
                        Bharat <span className="mob-lp-hero__accent">Innovation</span> Olympiad
                    </h1>
                    <p className="mob-lp-hero__sub" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        Discover your potential beyond academics: the mindset, skills and awareness to
                        innovate, solve real-world problems and shape the future.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.2rem', width: '100%' }}>
                        <Link href="/register" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                            <Rocket size={17} /> Register Now <ArrowRight size={15} />
                        </Link>
                        <span style={{
                            display: 'block', textAlign: 'center', fontSize: '0.8rem',
                            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: 10, padding: '8px 12px', color: '#fff',
                        }}>
                            Program value <s style={{ opacity: 0.65 }}>{COURSE_VALUE.mrp}</s>{' '}
                            <b style={{ color: '#ffcb05' }}>{COURSE_VALUE.price}</b>{' '}
                            <span style={{ opacity: 0.7, fontWeight: 400 }}>({COURSE_VALUE.note})</span>
                        </span>
                    </div>
                    <div className="mob-lp-stats" style={{ borderTop: '1px solid rgba(255,255,255,0.25)' }}>
                        {STATISTICS.map((s) => (
                            <div key={s.label}>
                                <strong style={{ color: '#ffcb05' }}>{s.value}</strong>
                                <span style={{ color: 'rgba(255,255,255,0.78)' }}>{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section style={{ padding: '1.2rem 1rem 0.2rem', background: 'var(--bg-secondary)' }}>
                <div className="mob-card mob-lp-price">
                    <div>
                        Program value <s>{COURSE_VALUE.mrp}</s> · Offered price{' '}
                        <b className="mob-lp-price__offer">{COURSE_VALUE.price}</b>{' '}
                        <span className="mob-lp-price__note">({COURSE_VALUE.note})</span>
                    </div>
                    <div className="mob-lp-price__meta">Next Olympiad: <b>{nextDate}</b> (Sunday) · Only 500 exam slots available per week</div>
                    <Link href="/register" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                        <Rocket size={16} /> Register Now <ArrowRight size={15} />
                    </Link>
                </div>
            </section>

            <section style={{ position: 'relative', overflow: 'hidden', background: '#0c1a06' }}>
                <Image
                    src="/assets/events/event-winners-cheque.jpg"
                    alt="Innopreneurs Junior winners with certificates and award cheque"
                    width={800} height={420}
                    sizes="100vw"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                />
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(180deg, rgba(8,18,4,0.25), rgba(8,18,4,0.72))',
                    display: 'flex', alignItems: 'flex-end',
                }}>
                    <div style={{ padding: '1rem 1rem', color: '#fff', width: '100%' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ffcb05', marginBottom: 4 }}>
                            Since 2013 · Lemon Ideas
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', letterSpacing: -0.3 }}>
                            Real classrooms. Real innovators. Real stages.
                        </div>
                    </div>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">The Participant Journey</h2>
                <div className="mob-card mob-lp-journey">
                    {JOURNEY_STAGES.map((stage, i) => {
                        const icons = [Rocket, GraduationCap, PenLine, Lightbulb, FlaskConical, Briefcase];
                        const StepIcon = icons[i];
                        const last = i === JOURNEY_STAGES.length - 1;
                        return (
                            <div key={stage.title} className="mob-lp-journey__row">
                                <div className="mob-lp-journey__dot" style={last ? { background: 'linear-gradient(135deg,#4f9a12,#35700a)' } : undefined}>
                                    <StepIcon size={16} color={last ? '#fff' : '#4f9a12'} />
                                </div>
                                <div className="mob-lp-journey__body">
                                    <strong>{stage.title}</strong>
                                    <p>{stage.sub}</p>
                                </div>
                                {!last && <div className="mob-lp-journey__line" />}
                            </div>
                        );
                    })}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.6rem 0.2rem 0' }}>
                    Capacity building = training, material resources, and guidance &amp; mentoring — included with registration.
                </p>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">Message from the Founder</h2>
                <div className="mob-card mob-lp-founder">
                    <Image
                        src="/assets/founder-deepak.jpg"
                        alt="Deepak Menaria, Founder of Lemon Ideas"
                        width={96} height={96}
                        style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.8rem', display: 'block', border: '2px solid rgba(125,200,50,0.5)' }}
                    />
                    <blockquote>
                        &ldquo;Since 2013, Lemon Ideas has worked to nurture entrepreneurial thinking and
                        innovation across India &amp; beyond. Our journey with young minds through Junior
                        Innopreneurs reinforced a simple belief — every child has the potential to become a
                        creator of change when equipped with the right mindset and opportunities. The Bharat
                        Innovation Olympiad is our invitation to every child to discover their potential,
                        become future-ready, and help build a confident, innovative and developed India by 2047.&rdquo;
                    </blockquote>
                    <p className="mob-lp-founder__byline">— Deepak Menaria, Founder, Lemon Ideas</p>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">What is Bharat Innovation Olympiad?</h2>
                <div className="mob-card">
                    <p>
                        A national Innovation &amp; Future Skills Olympiad for Grades 6–12, <strong>since 2013</strong>,
                        built on the Innopreneurs movement by Lemon Ideas — assessing curiosity, creativity and
                        real-world problem solving across five dimensions.
                    </p>
                    <Link href="/about" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                        Know More <ArrowRight size={14} />
                    </Link>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">A fair, authentic and credible assessment</h2>
                <p className="mob-lp-section__sub">Taken from home, judged like a hall exam. Tap a card to read more.</p>
                <div className="mob-lp-trust">
                    {TRUST.map(({ Icon, title, teaser, body }) => (
                        <ExpandableCard key={title} title={title} teaser={teaser} detail={body} accent="#4f9a12" />
                    ))}
                </div>
                <div className="mob-card" style={{ marginTop: '0.8rem' }}>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.6rem' }}>
                        <FlaskConical size={16} color="#4f9a12" /> What you need to take the exam
                    </strong>
                    <dl style={{ margin: 0 }}>
                        {TECH_REQUIREMENTS.map((req) => (
                            <div key={req.label} style={{ display: 'flex', gap: 8, fontSize: '0.85rem', padding: '4px 0', color: 'var(--text-secondary)' }}>
                                <dt style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: 108 }}>{req.label}</dt>
                                <dd style={{ margin: 0 }}>{req.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">Real Participants. Real Ideas. Real Impact.</h2>
                <AlumniCarousel />
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">Why This Olympiad Is Different</h2>
                <div className="mob-lp-compare">
                    <div className="mob-lp-compare__col">
                        <span className="mob-lp-compare__label">Traditional</span>
                        {['Memory', 'Marks', 'Knowledge', 'Exam & Ranking only', 'Academic & syllabus based'].map((t) => (
                            <div key={t} className="mob-lp-compare__row mob-lp-compare__row--no"><Minus size={14} /> {t}</div>
                        ))}
                    </div>
                    <div className="mob-lp-compare__col mob-lp-compare__col--yes">
                        <span className="mob-lp-compare__label">Innovation Olympiad</span>
                        {['Creativity', 'Innovation', 'Problem Solving', 'Training, pitch contests & mentoring', 'No syllabus, real life based'].map((t) => (
                            <div key={t} className="mob-lp-compare__row mob-lp-compare__row--yes"><CheckCircle2 size={14} /> {t}</div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">The Five Dimensions</h2>
                {DIMENSIONS.map((d) => (
                    <ExpandableCard
                        key={d.n}
                        title={`${d.n} · ${d.title}`}
                        teaser={d.teaser}
                        detail={d.body}
                        accent="#4f9a12"
                    />
                ))}
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">One Registration. Four Powerful Benefits.</h2>
                <div className="mob-lp-benefits">
                    {BENEFITS.map(({ Icon, col, bg, title, desc }) => (
                        <div key={title} className="mob-card mob-lp-benefit">
                            <span className="mob-lp-benefit__icon" style={{ background: bg }}><Icon size={20} color={col} /></span>
                            <strong>{title}</strong>
                            <p>{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">What Every Participant Receives</h2>
                <div className="mob-card mob-lp-what">
                    <strong className="mob-lp-what__head">What every participant receives</strong>
                    {RECEIVES.map((item) => (
                        <div key={item} className="mob-lp-what__row"><CheckCircle2 size={14} color="#4f9a12" /> {item}</div>
                    ))}
                </div>
                <div className="mob-card mob-lp-what">
                    <strong className="mob-lp-what__head">Takeaways for participants</strong>
                    {TAKEAWAYS.map((item) => (
                        <div key={item} className="mob-lp-what__row"><CheckCircle2 size={14} color="#ffcb05" /> {item}</div>
                    ))}
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">The Ecosystem Behind the Olympiad</h2>
                <div className="mob-card mob-lp-what">
                    <strong className="mob-lp-what__head">About Lemon Ideas</strong>
                    <p>An entrepreneurship ecosystem working since 2013, nurturing innovators, entrepreneurs and changemakers across India and beyond.</p>
                    <a href="https://www.lemonideas.in" target="_blank" rel="noopener noreferrer" className="mob-lp-what__link">www.lemonideas.in ↗</a>
                </div>
                <div className="mob-card mob-lp-what">
                    <strong className="mob-lp-what__head">About Innopreneurs Junior</strong>
                    <p>The flagship junior innovation movement behind the Olympiad — where school participants across India identify problems, build solutions and present their ideas on a national stage.</p>
                    <a href="https://www.innopreneurs.in/junior-contest" target="_blank" rel="noopener noreferrer" className="mob-lp-what__link">www.innopreneurs.in/junior-contest ↗</a>
                </div>
                <SchoolPartnerForm email={SCHOOL_PARTNER_EMAIL} />
            </section>

            <section className="mob-lp-cta">
                <h2>Every idea starts small. Every innovator starts somewhere.</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
                    <Link href="/register" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                        <Rocket size={17} /> Register Now <ArrowRight size={15} />
                    </Link>
                    <Link
                        href="/login"
                        className="btn btn-secondary btn-lg"
                        style={{
                            width: '100%',
                            justifyContent: 'center',
                            fontWeight: 700,
                            border: '1.5px solid var(--border-default)',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        <LogIn size={17} /> Participant Login
                    </Link>
                </div>
            </section>

            <footer className="mob-lp-footer">
                <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" height={28} width={92} style={{ height: 28, width: 'auto' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem' }}>
                    <a href={COMMUNITY_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" className="lp-social-link"><MessageCircle size={14} /> WhatsApp</a>
                    <a href={COMMUNITY_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="lp-social-link"><Instagram size={14} /> Instagram</a>
                    <a href={COMMUNITY_LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="lp-social-link"><Linkedin size={14} /> LinkedIn</a>
                    <a href={`mailto:${COMMUNITY_LINKS.email}`} className="lp-social-link"><Mail size={14} /> Email</a>
                </div>
                <nav>
                    <Link href="/about">About</Link>
                    <Link href="/terms">Terms &amp; Conditions</Link>
                    <Link href="/support">Support</Link>
                    <Link href="/register">Register</Link>
                    <Link href="/login">Participant login</Link>
                    <a href="https://lemonideas.in" target="_blank" rel="noopener noreferrer">Lemon Ideas ↗</a>
                    <a href="https://www.innopreneurs.in/junior-contest" target="_blank" rel="noopener noreferrer">Innopreneurs Junior ↗</a>
                </nav>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
                    <span style={{ fontSize: '0.75rem' }}>Powered by</span>
                    <Image src="/lemon-ideas-logo.png" alt="Lemon Ideas" height={22} width={110} style={{ height: 22, width: 'auto' }} />
                </div>
                <div className="mob-lp-footer__legal">
                    © 2026 Bharat Innovation Olympiad
                    <br />
                    © Bharat Innovation Olympiad is owned by Lemon Ideas Innovations Pvt Ltd.
                </div>
            </footer>
        </div>
    );
}
