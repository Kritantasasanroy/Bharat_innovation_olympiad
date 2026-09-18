import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/layout/Navbar';
import ThemeToggle from '@/components/ThemeToggle';
import { ArrowRight, Rocket, Star, Newspaper, CalendarDays, GraduationCap, FlaskConical, Briefcase } from 'lucide-react';
import { COURSE_VALUE, JOURNEY_STAGES, EVENT_PHOTOS, nextOlympiadDate } from '@/lib/copy/landing';

/**
 * About the Bharat Innovation Olympiad.
 *
 * The landing page's "Know More" buttons point here. This page carries the
 * long-form content that used to bloat the landing page: the full article,
 * the innovator journey roadmap (moved off the landing page per the brief),
 * the exam structure and device requirements, the program calendar, and the
 * blogs & news links from the brief.
 */
export const metadata: Metadata = {
    title: 'About — Bharat Innovation Olympiad',
    description:
        'The Bharat Innovation Olympiad by Lemon Ideas — since 2013 — assessing curiosity, creativity and real-world problem solving for Grades 6–12, and opening pathways to Innopreneurs Juniors, pre-incubation and startup internships.',
};

const EXAM_SECTIONS = [
    { part: 'Problem Solving & Innovation', questions: '8–12', correct: '1', incorrect: '0' },
    { part: 'Entrepreneurship Mindset', questions: '10–14', correct: '1', incorrect: '0' },
    { part: 'Emerging Technologies & Digital Readiness', questions: '8–12', correct: '1', incorrect: '0' },
    { part: 'Future Readiness & Global Awareness', questions: '8–12', correct: '1', incorrect: '0' },
    { part: 'Financial Readiness', questions: '6–10', correct: '1', incorrect: '0' },
    { part: 'Super Olympiad', questions: '5', correct: '2', incorrect: '-1' },
];

const CALENDAR = [
    ['Registrations start', 'September'],
    ['Registrations end', '19th December'],
    ['Training & orientation session access (online)', 'September – 31st December'],
    ['Live Q&A (online)', 'Last Saturday of every month, 6–7 PM'],
    ['Preparatory / acclimatisation tests (15 mins)', 'September – 31st December · 3 PM to 10 PM'],
    ['Exam window', '27th September – 27th December'],
    ['Exam slots', 'Sundays, 8:30 AM – 7 PM (no exams on Diwali / 8 Nov)'],
    ['Result announcement & ranks', '16th January 2027 · National Startup Day'],
    ['Innopreneurs Next Gen finale, investor pitch & bootcamp', 'May 2027'],
    ['Pre-Incubation cohort start (1 year) — mentoring & training', 'July 2027'],
    ['Startup internships', 'May – July 2028'],
];

const BLOGS = [
    {
        label: 'Empowering Juniors: Students to Shape the Future Through Innovation',
        href: 'https://www.innopreneurs.in/post/empowering-juniors-students-to-shape-the-future-through-innovation',
    },
    {
        label: 'Young Minds, Big Ideas',
        href: 'https://www.innopreneurs.in/post/young-minds-big-ideas',
    },
    {
        label: 'Schoolkids Enter Shark Tank Styled Contest — Times of India',
        href: 'https://timesofindia.indiatimes.com/city/nagpur/startup-ideas-incubate-school-kids-too-join-the-bandwagon/articleshow/130179463.cms',
    },
];

const ROADMAP_ICONS = [Rocket, GraduationCap, CalendarDays, Star, FlaskConical, Briefcase];

export default function AboutPage() {
    return (
        <div style={{ minHeight: '100vh' }}>
            <Navbar />
            <ThemeToggle />

            {/* ── HERO ── */}
            <section style={{ position: 'relative', overflow: 'hidden', background: '#0c1a06', padding: '64px 24px 56px', textAlign: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden="true">
                    <Image src={EVENT_PHOTOS[0].src} alt="" fill sizes="100vw" priority style={{ objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,18,4,0.78), rgba(8,18,4,0.62) 50%, rgba(8,18,4,0.85))' }} />
                </div>
                <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto' }}>
                    <Link href="/" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 999, padding: '7px 16px', background: 'rgba(255,255,255,0.08)' }}>
                        ← Back to home
                    </Link>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 38, color: '#fff', margin: '0 0 14px', letterSpacing: -1 }}>
                        About Bharat Innovation Olympiad
                    </h1>
                    <p style={{ fontSize: 16, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)', margin: '0 0 26px' }}>
                        A national Innovation &amp; Future Skills Olympiad for Grades 6–12 — since 2013 —
                        built on the Innopreneurs movement by Lemon Ideas.
                    </p>
                    <Link href="/register" className="lp-btn-primary" style={{
                        background: 'linear-gradient(135deg,#4f9a12,#35700a)', color: '#fff',
                        fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 13,
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        boxShadow: '0 12px 30px rgba(125,200,50,0.35)',
                    }}>
                        <Rocket size={16} /> Register Now — {COURSE_VALUE.price}
                    </Link>
                </div>
            </section>

            {/* ── THE FULL ARTICLE (moved off the landing page) ── */}
            <section className="about-section">
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, margin: '0 0 20px', letterSpacing: -0.5 }}>
                    Bharat Innovation Olympiad — Building Future-Ready India
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontSize: 15.5, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    <p style={{ margin: 0 }}>
                        <b style={{ color: 'var(--text-primary)' }}>Become Future Ready.</b>{' '}
                        Discover your potential beyond academics by developing the mindset, skills and awareness
                        to innovate, solve real-world problems and confidently shape the future of India and the world.
                    </p>
                    <p style={{ margin: 0 }}>
                        <b style={{ color: 'var(--text-primary)' }}>Innovation has no syllabus because the future has no question paper.</b>{' '}
                        The Bharat Innovation Olympiad reflects this belief by moving beyond conventional
                        examinations that reward memorisation. Instead, it assesses curiosity, creativity,
                        adaptability and real-world thinking — preparing participants not just for the next exam,
                        but for the next decade.
                    </p>
                    <p style={{ margin: 0 }}>
                        Conceived by <b style={{ color: 'var(--text-primary)' }}>Lemon Ideas</b>, an entrepreneurship
                        ecosystem working since 2013, nurturing innovators, entrepreneurs and
                        changemakers across India, the Olympiad bridges the gap between classroom learning and
                        the capabilities needed to thrive in an uncertain, technology-driven and rapidly
                        evolving world.
                    </p>
                    <p style={{ margin: 0 }}>
                        Built on the strong foundation of <b style={{ color: 'var(--text-primary)' }}>Innopreneurs</b>,
                        Lemon Ideas&apos; flagship innovation and entrepreneurship movement, the Bharat Innovation
                        Olympiad is far more than another Olympiad — it is the beginning of a lifelong innovation
                        ecosystem. It provides students from Grades 6 to 12 with a unique opportunity to assess
                        themselves across five future-focused dimensions: Entrepreneurship Mindset, Problem Solving
                        &amp; Innovation, Emerging Technologies &amp; Digital Readiness, Future Readiness &amp;
                        Global Awareness, and Financial Readiness. Through a balanced mix of knowledge-based,
                        situational and future-oriented questions, students are encouraged to think critically,
                        solve authentic problems, make responsible decisions and develop the confidence to embrace change.
                    </p>
                    <p style={{ margin: 0 }}>
                        What truly distinguishes the Bharat Innovation Olympiad is its purpose of creating{' '}
                        <b style={{ color: 'var(--text-primary)' }}>future-ready citizens, not just high scorers</b>.
                        It serves as a gateway to innovation challenges, entrepreneurial journeys, mentorship
                        opportunities, school innovation initiatives and the larger Innopreneurs community. Closely
                        aligned with the vision of Viksit Bharat 2047, the Olympiad inspires young minds to become
                        innovators, creators and responsible leaders who can shape India&apos;s future with courage,
                        compassion and creativity.
                    </p>
                </div>
            </section>

            {/* ── THE INNOVATOR JOURNEY ROADMAP (moved from the landing page) ── */}
            <section style={{ background: 'var(--bg-secondary)', padding: '56px 24px' }}>
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, margin: '0 0 10px', letterSpacing: -0.4, textAlign: 'center' }}>
                        The Innovator Journey Roadmap
                    </h2>
                    <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', margin: '0 auto 34px', textAlign: 'center' }}>
                        From your first registration to building real ventures.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>
                        {JOURNEY_STAGES.map((stage, i) => {
                            const StepIcon = ROADMAP_ICONS[i];
                            const last = i === JOURNEY_STAGES.length - 1;
                            return (
                                <div key={stage.title} style={{ display: 'flex', gap: 14 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span style={{
                                            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                            background: last ? 'linear-gradient(135deg,#4f9a12,#ffcb05)' : (i % 2 === 0 ? 'rgba(125,200,50,0.14)' : 'rgba(255,203,5,0.14)'),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <StepIcon size={18} color={last ? '#0a0a0a' : i % 2 === 0 ? '#4f9a12' : '#ffcb05'} />
                                        </span>
                                        {!last && <span style={{ width: 2, flex: 1, minHeight: 22, background: 'var(--border-default)' }} />}
                                    </div>
                                    <div style={{ paddingBottom: last ? 0 : 18 }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, color: 'var(--text-primary)' }}>
                                            {String(i + 1).padStart(2, '0')} · {stage.title}
                                        </div>
                                        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{stage.sub}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── EXAM STRUCTURE ── */}
            <section className="about-section">
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, margin: '0 0 10px', letterSpacing: -0.4 }}>
                    Exam Structure
                </h2>
                <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', margin: '0 0 18px' }}>
                    55 questions · 60 marks · 60-minute exam · 90-minute slot including login and
                    acclimatisation. Scoring: +1 per correct answer, 0 for incorrect — except the Super
                    Olympiad round: +2 correct, −1 incorrect.
                </p>
                <div style={{ overflowX: 'auto' }}>
                    <table className="about-table">
                        <thead>
                            <tr><th>Part / Section</th><th>Questions</th><th>Correct</th><th>Incorrect</th></tr>
                        </thead>
                        <tbody>
                            {EXAM_SECTIONS.map((s) => (
                                <tr key={s.part}>
                                    <td>{s.part}</td><td>{s.questions}</td><td>{s.correct}</td><td>{s.incorrect}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '16px 0 0' }}>
                    Program value <s>{COURSE_VALUE.mrp}</s> — offered price{' '}
                    <b style={{ color: '#4f9a12' }}>{COURSE_VALUE.price}</b> ({COURSE_VALUE.note}).
                    Registration works on any device, including mobile phones.
                </p>
            </section>

            {/* ── PROGRAM CALENDAR ── */}
            <section style={{ background: 'var(--bg-secondary)', padding: '56px 24px' }}>
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, margin: '0 0 18px', letterSpacing: -0.4, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CalendarDays size={22} color="#4f9a12" /> Program Calendar
                    </h2>
                    <div className="about-table" style={{ display: 'grid', gap: 8 }}>
                        {CALENDAR.map(([what, when]) => (
                            <div key={what} style={{
                                display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
                                background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                                borderRadius: 12, padding: '12px 16px', fontSize: 14,
                            }}>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{what}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{when}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── BLOGS & NEWS ── */}
            <section className="about-section">
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, margin: '0 0 18px', letterSpacing: -0.4, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Newspaper size={22} color="#ffcb05" /> Blogs &amp; News
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {BLOGS.map((b) => (
                        <a key={b.href} href={b.href} target="_blank" rel="noopener noreferrer" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                            borderRadius: 12, padding: '14px 18px', textDecoration: 'none',
                            color: 'var(--text-primary)', fontSize: 14.5, fontWeight: 600,
                        }}>
                            {b.label} <ArrowRight size={15} color="#4f9a12" />
                        </a>
                    ))}
                </div>
            </section>

            {/* ── CTA ── */}
            <section style={{ background: 'linear-gradient(135deg,#1a3a0a,#0e2206)', padding: '56px 24px', textAlign: 'center' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#fff', margin: '0 0 10px' }}>
                    Ready to become future ready?
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, margin: '0 0 24px' }}>
                    Next Olympiad: <b style={{ color: '#ffcb05' }}>{nextOlympiadDate()}</b> · Program value <s>{COURSE_VALUE.mrp}</s> · Offered price <b style={{ color: '#ffcb05' }}>{COURSE_VALUE.price}</b>
                </p>
                <Link href="/register" className="lp-btn-primary" style={{
                    background: 'linear-gradient(135deg,#4f9a12,#ffcb05)', color: '#0a0a0a',
                    fontWeight: 800, fontSize: 16, padding: '14px 32px', borderRadius: 13,
                    display: 'inline-flex', alignItems: 'center', gap: 9,
                    boxShadow: '0 16px 40px rgba(125,200,50,0.35)',
                }}>
                    <Rocket size={17} /> Register Now <ArrowRight size={15} />
                </Link>
            </section>
        </div>
    );
}
