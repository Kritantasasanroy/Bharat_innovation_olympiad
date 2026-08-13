'use client';

import Link from 'next/link';
import Image from 'next/image';
import AlumniCarousel from '@/components/landing/AlumniCarousel';
import ReferralCapture from '@/components/ReferralCapture';
import ThemeToggle from '@/components/ThemeToggle';
import { TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
import {
    Rocket, Trophy, BarChart3, Lightbulb, Users, Medal, Globe,
    Target, ScrollText, ArrowRight, CheckCircle2, XCircle,
    GraduationCap, FlaskConical, BadgeCheck, Menu, X,
} from 'lucide-react';
import { useState } from 'react';

const DIMENSIONS = [
    { n: '01', title: 'Entrepreneurship Mindset', body: 'Identify opportunities, take initiative, solve problems creatively and make responsible decisions.' },
    { n: '02', title: 'Problem Solving & Innovation', body: 'Observe the world, think creatively, explore multiple solutions and validate ideas through experimentation.' },
    { n: '03', title: 'Emerging Technologies & STEM', body: 'Computational thinking, coding, robotics, AI, ML and cybersecurity, through to space and quantum tech.' },
    { n: '04', title: 'Future Readiness & Global Awareness', body: 'Adaptability, lifelong learning, sustainability, climate action and contributing to Viksit Bharat 2047.' },
    { n: '05', title: 'Financial Readiness', body: 'Money management, saving, investing, budgeting, digital banking, UPI and cyber safety.' },
];

const BENEFITS = [
    { Icon: Medal, col: '#7dc832', bg: 'rgba(125,200,50,0.12)', title: 'National Rankings', desc: 'Verified All-India, State, City & School ranks.' },
    { Icon: Lightbulb, col: '#ffcb05', bg: 'rgba(255,203,5,0.12)', title: 'Innopreneurs Advantage', desc: 'A pathway into startup contests and innovation labs.' },
    { Icon: Globe, col: '#7baff5', bg: 'rgba(59,111,224,0.12)', title: 'World Skill Challenge', desc: 'Qualify for global future-skills challenges.' },
    { Icon: GraduationCap, col: '#f97316', bg: 'rgba(249,115,22,0.12)', title: 'Entrepreneurship Bootcamp', desc: 'Hands-on bootcamps to turn ideas into ventures.' },
];

const JOURNEY = [
    { n: '01', Icon: Trophy, label: 'Register & Assess', sub: 'Sign up and take the Olympiad' },
    { n: '02', Icon: BarChart3, label: 'Get Ranked', sub: 'National & school recognition' },
    { n: '03', Icon: FlaskConical, label: 'Innopreneurs', sub: 'Compete in startup contests' },
    { n: '04', Icon: Users, label: 'Mentorship', sub: 'Guidance from innovators' },
    { n: '05', Icon: Rocket, label: 'Future Innovator', sub: 'Build real ventures' },
];

const TRUST = [
    { Icon: Target, title: 'Fairness', body: 'Every participant sits the same paper under the same conditions, on a server-run timer.' },
    { Icon: BadgeCheck, title: 'Authenticity', body: 'A face scan at registration confirms the registered participant sat the paper.' },
    { Icon: ScrollText, title: 'Credibility', body: 'Flagged papers are reviewed by a person, with written reasons, before anything is concluded.' },
    { Icon: Users, title: 'Child-friendly', body: "No warnings pile up mid-exam and no video is ever recorded." },
];

/**
 * The public landing page, as its own mobile screen.
 *
 * The desktop page (`app/page.tsx`) is a wide two-column hero, a five-panel
 * gallery grid and inline pixel styles tuned for a 1200px canvas — none of
 * that reflows into something worth reading on a phone, so this is a
 * separate, shorter, single-column pass over the same content rather than a
 * squeezed copy of it. Desktop's `LandingPage` is untouched; `app/page.tsx`
 * only decides which of the two to mount.
 */
export default function MobileLanding() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="mob-lp">
            <ReferralCapture />

            <nav className="mob-lp-nav">
                <div className="mob-lp-nav__brand">
                    <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" height={30} width={100} style={{ height: 30, width: 'auto' }} />
                </div>
                <div className="mob-lp-nav__actions">
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
                    <Link href="/terms" onClick={() => setMenuOpen(false)}>Terms &amp; Conditions</Link>
                    <Link href="/support" onClick={() => setMenuOpen(false)}>Support</Link>
                </div>
            )}

            <section className="mob-lp-hero">
                <div className="mob-lp-badge">
                    India&apos;s Innovation &amp; Future Skills Movement · Grades 6&ndash;12
                </div>
                <h1 className="mob-lp-hero__title">
                    Bharat <span className="mob-lp-hero__accent">Innovation</span> Olympiad
                </h1>
                <p className="mob-lp-hero__sub">
                    Discover your potential beyond academics: the mindset, skills and awareness to
                    innovate, solve real-world problems and shape the future.
                </p>
                <Link href="/register" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Rocket size={17} /> Register Now <ArrowRight size={15} />
                </Link>
                <div className="mob-lp-stats">
                    <div><strong>2,400+</strong><span>Partner Schools</span></div>
                    <div><strong>1.8L+</strong><span>Young Innovators</span></div>
                    <div><strong>28</strong><span>States &amp; UTs</span></div>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">A fair, authentic and credible assessment</h2>
                <p className="mob-lp-section__sub">Taken from home, judged like a hall exam.</p>
                <div className="mob-lp-trust">
                    {TRUST.map(({ Icon, title, body }) => (
                        <div key={title} className="mob-card mob-lp-trust__card">
                            <Icon size={18} color="#7dc832" />
                            <div>
                                <strong>{title}</strong>
                                <p>{body}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <details className="mob-lp-tech">
                    <summary>What you need to take the exam</summary>
                    <dl>
                        {TECH_REQUIREMENTS.map((req) => (
                            <div key={req.label}>
                                <dt>{req.label}</dt>
                                <dd>{req.value}</dd>
                            </div>
                        ))}
                    </dl>
                </details>
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
                        {['Memory', 'Marks', 'Knowledge'].map((t) => (
                            <div key={t} className="mob-lp-compare__row mob-lp-compare__row--no"><XCircle size={14} /> {t}</div>
                        ))}
                    </div>
                    <div className="mob-lp-compare__col mob-lp-compare__col--yes">
                        <span className="mob-lp-compare__label">Innovation Olympiad</span>
                        {['Creativity', 'Innovation', 'Problem Solving'].map((t) => (
                            <div key={t} className="mob-lp-compare__row mob-lp-compare__row--yes"><CheckCircle2 size={14} /> {t}</div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mob-lp-section">
                <h2 className="mob-lp-section__title">The Five Dimensions</h2>
                {DIMENSIONS.map((d) => (
                    <div key={d.n} className="mob-card mob-lp-dim">
                        <span className="mob-lp-dim__num">{d.n}</span>
                        <div>
                            <strong>{d.title}</strong>
                            <p>{d.body}</p>
                        </div>
                    </div>
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
                <h2 className="mob-lp-section__title">The Innovation Journey Roadmap</h2>
                <div className="mob-lp-journey">
                    {JOURNEY.map(({ n, Icon, label, sub }, i) => (
                        <div key={n} className="mob-lp-journey__row">
                            <div className="mob-lp-journey__dot"><Icon size={16} color="#7dc832" /></div>
                            <div className="mob-lp-journey__body">
                                <strong>{label}</strong>
                                <p>{sub}</p>
                            </div>
                            {i < JOURNEY.length - 1 && <div className="mob-lp-journey__line" />}
                        </div>
                    ))}
                </div>
            </section>

            <section className="mob-lp-cta">
                <h2>Every idea starts small. Every innovator starts somewhere.</h2>
                <Link href="/register" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                    <Rocket size={17} /> Register Now <ArrowRight size={15} />
                </Link>
            </section>

            <footer className="mob-lp-footer">
                <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad" height={28} width={92} style={{ height: 28, width: 'auto' }} />
                <nav>
                    <Link href="/terms">Terms &amp; Conditions</Link>
                    <Link href="/support">Support</Link>
                    <Link href="/register">Register</Link>
                    <Link href="/login">Participant login</Link>
                    <a href="https://lemonideas.in" target="_blank" rel="noopener noreferrer">Lemon Ideas ↗</a>
                    <a href="https://innopreneurs.in" target="_blank" rel="noopener noreferrer">Innopreneurs ↗</a>
                </nav>
                <div className="mob-lp-footer__legal">© 2026 Bharat Innovation Olympiad</div>
            </footer>
        </div>
    );
}
