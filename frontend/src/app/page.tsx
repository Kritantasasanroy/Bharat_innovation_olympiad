'use client';

import Link from 'next/link';
import Image from 'next/image';
import AlumniCarousel from '@/components/landing/AlumniCarousel';
import MobileLanding from '@/components/landing/MobileLanding';
import ReferralCapture from '@/components/ReferralCapture';
import ThemeToggle from '@/components/ThemeToggle';
import { useIsMobile } from '@/hooks/useIsMobile';
import { TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
import {
  Rocket, Trophy, BarChart3, Lightbulb, Users, Medal, Globe,
  Target, ScrollText, Star, ArrowRight, CheckCircle2, XCircle,
  Award, TrendingUp, Zap, Sparkles, GraduationCap, FlaskConical,
  Handshake, BadgeCheck,
} from 'lucide-react';

export default function LandingPage() {
  // Separate mobile screen: the desktop hero/gallery below is tuned for a
  // 1200px canvas with hand-placed inline styles and does not reflow into
  // something worth reading on a phone. Desktop JSX beneath is untouched.
  const isMobile = useIsMobile();
  if (isMobile) return <MobileLanding />;

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      {/* Captures a partner's `?ref=CODE` on first touch (PRD-046 attribution). */}
      <ReferralCapture />

      {/* ── NAV ── */}
      <nav className="lp-nav" style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad: Become Future Ready" height={38} width={126} style={{ height: 38, width: 'auto', display: 'block' }} />
            <span className="lp-brand-name">Bharat Innovation Olympiad</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/login" className="lp-btn-secondary" style={{
              border: '1px solid var(--border-default)', background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', fontWeight: 600, fontSize: 14,
              padding: '9px 20px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              Participant Login
            </Link>
            <Link href="/register" className="lp-btn-primary" style={{
              background: 'linear-gradient(135deg,#7dc832,#4f9a12)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              padding: '10px 22px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 7,
              boxShadow: '0 8px 24px rgba(125,200,50,0.3)',
            }}>
              <Rocket size={14} /> Register Now
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        {/* BG glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(ellipse 60% 55% at 10% 50%, rgba(125,200,50,0.07), transparent), radial-gradient(ellipse 50% 45% at 90% 20%, rgba(255,203,5,0.07), transparent)',
        }} />
        {/* decorative SVG grid dots */}
        <svg viewBox="0 0 1200 480" aria-hidden="true" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, opacity: 0.35, pointerEvents: 'none' }}>
          <g stroke="rgba(125,200,50,0.4)" strokeWidth="1.2" fill="none">
            <line x1="1000" y1="64" x2="1086" y2="38" /><line x1="1086" y1="38" x2="1150" y2="104" />
            <line x1="1000" y1="64" x2="1052" y2="132" /><line x1="1052" y1="132" x2="1150" y2="104" />
            <line x1="1052" y1="132" x2="1118" y2="196" /><line x1="1118" y1="196" x2="1150" y2="104" />
          </g>
          <g fill="rgba(125,200,50,0.5)">
            <circle cx="1000" cy="64" r="4" /><circle cx="1086" cy="38" r="4" />
            <circle cx="1150" cy="104" r="4" /><circle cx="1052" cy="132" r="4" /><circle cx="1118" cy="196" r="4" />
          </g>
          <g stroke="rgba(255,203,5,0.4)" strokeWidth="1.1" fill="none">
            <line x1="70" y1="300" x2="150" y2="332" /><line x1="150" y1="332" x2="210" y2="286" /><line x1="210" y1="286" x2="282" y2="320" />
          </g>
          <g fill="rgba(255,203,5,0.5)">
            <circle cx="70" cy="300" r="3.5" /><circle cx="150" cy="332" r="3.5" /><circle cx="210" cy="286" r="3.5" /><circle cx="282" cy="320" r="3.5" />
          </g>
          <polygon fill="rgba(255,203,5,0.4)" points="172,118 178,136 196,142 178,148 172,166 166,148 148,142 166,136" />
          <polygon fill="rgba(125,200,50,0.4)" points="912,300 917,314 931,319 917,324 912,338 907,324 893,319 907,314" />
        </svg>

        <div className="lp-hero-grid">
          {/* Left */}
          <div>
            <div className="lp-fade-up lp-badge-glow" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(125,200,50,0.1)', border: '1px solid rgba(125,200,50,0.25)',
              color: '#7dc832', fontWeight: 600, fontSize: 12.5, letterSpacing: '0.04em',
              padding: '7px 14px', borderRadius: 999, marginBottom: 22,
            }}>
              <Sparkles size={12} />
              India&apos;s National Innovation &amp; Future Skills Movement · Grades 6–12
            </div>

            <h1 className="lp-fade-up-1" style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 46, lineHeight: 1.08,
              letterSpacing: -1.5, margin: '0 0 18px',
            }}>
              Bharat{' '}
              <span style={{ background: 'linear-gradient(135deg,#7dc832,#ffcb05)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Innovation
              </span>
              {' '}Olympiad: Become Future Ready
            </h1>

            <p className="lp-fade-up-2" style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)', margin: '0 0 30px', maxWidth: 520 }}>
              Discover your potential beyond academics by developing the mindset, skills and awareness
              to innovate, solve real-world problems and confidently shape the future of India and the world.
            </p>

            <div className="lp-fade-up-3" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link href="/register" className="lp-btn-primary" style={{
                background: 'linear-gradient(135deg,#7dc832,#4f9a12)', color: '#fff',
                fontWeight: 700, fontSize: 15.5, padding: '14px 28px', borderRadius: 13,
                display: 'inline-flex', alignItems: 'center', gap: 9,
                boxShadow: '0 12px 30px rgba(125,200,50,0.35)',
              }}>
                <Rocket size={17} /> Register Now <ArrowRight size={15} />
              </Link>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 36, marginTop: 44, paddingTop: 28, borderTop: '1px solid var(--border-subtle)' }}>
              <div className="lp-stat-1">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 28, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>2,400+</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>Partner Schools</div>
              </div>
              <div className="lp-stat-2">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 28, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>1.8L+</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>Young Innovators</div>
              </div>
              <div className="lp-stat-3">
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 28, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>28</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>States &amp; UTs</div>
              </div>
            </div>
          </div>

          {/* Right — journey card */}
          <div className="lp-fade-up-2 lp-float" style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: 24, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.3px', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 20 }}>The Participant Journey</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {([
                { Icon: Trophy,    title: 'Innovation Olympiad', sub: 'Take the national assessment',  bg: 'rgba(125,200,50,0.12)',  col: '#7dc832' },
                { Icon: BarChart3, title: 'Innovation Profile',  sub: 'Build your skill identity',     bg: 'rgba(255,203,5,0.12)',   col: '#ffcb05' },
                { Icon: Lightbulb, title: 'Innopreneurs',        sub: 'Enter startup challenges',      bg: 'rgba(125,200,50,0.12)',  col: '#7dc832' },
                { Icon: Handshake, title: 'Mentorship',          sub: 'Learn from innovators',         bg: 'rgba(255,203,5,0.12)',   col: '#ffcb05' },
              ] as const).map(({ Icon, title, sub, bg, col }, i) => (
                <div key={i}>
                  <div className="lp-step" style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: 13,
                  }}>
                    <span className="lp-icon-wrap" style={{ width: 40, height: 40, borderRadius: 11, background: bg, flexShrink: 0 }}>
                      <Icon size={18} color={col} />
                    </span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>
                    </div>
                  </div>
                  {i < 3 && <div style={{ height: 16, width: 2, background: 'var(--border-default)', marginLeft: 33 }} />}
                </div>
              ))}
              <div style={{ height: 16, width: 2, background: 'var(--border-default)', marginLeft: 33 }} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                background: 'linear-gradient(135deg,#7dc832,#4f9a12)', borderRadius: 13,
                boxShadow: '0 10px 28px rgba(125,200,50,0.3)',
              }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Rocket size={18} color="#fff" />
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#fff' }}>Future Innovator</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Your journey continues</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BAND ──
          "Prominently on website — Online olympiad with fair, authentic and
          credible assessment." Placed directly under the hero, above the
          alumni stories, because it is the objection a parent has *before*
          they are interested in anything else: is an online exam real? */}
      <section className="lp-trust">
        <div className="lp-trust__inner">
          <div className="lp-trust__head">
            <BadgeCheck size={22} />
            <h2>A fair, authentic and credible online assessment</h2>
            <p>
              Taken from home, judged like a hall exam. Here is exactly how we make an
              online olympiad something a school, a parent and a participant can all trust.
            </p>
          </div>

          <div className="lp-trust__grid">
            {([
              {
                Icon: Target,
                title: 'Fairness',
                body: 'Every participant sits the same Innovation Olympiad exam under the same conditions, on their booked schedule, on a server-run timer that does not stop if their internet does.',
              },
              {
                Icon: BadgeCheck,
                title: 'Authenticity',
                body: 'A face scan taken at registration confirms the registered participant is the one sitting the Innovation Olympiad exam, so a rank belongs to the person who earned it.',
              },
              {
                Icon: ScrollText,
                title: 'Credibility',
                body: 'Innovation Olympiad exams flagged during the exam are reviewed by a person, with written reasons, before anything is concluded. Nothing is decided by the computer alone.',
              },
              {
                Icon: Users,
                title: 'Child-friendly',
                body: 'No warnings pile up mid-exam and no video is ever recorded. Analysis runs inside the participant’s own browser, only the events leave the device.',
              },
            ] as const).map(({ Icon, title, body }) => (
              <div key={title} className="lp-trust__card">
                <span className="lp-trust__icon"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>

          {/* The published tech requirements, on the way in rather than after
              a family has paid and discovered they need a webcam. */}
          <details className="lp-trust__tech">
            <summary>What you need to take the exam</summary>
            <dl className="lp-trust__techlist">
              {TECH_REQUIREMENTS.map((req) => (
                <div key={req.label}>
                  <dt>{req.label}</dt>
                  <dd>{req.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </section>

      {/* ── SUCCESS STORIES ── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-primary)', padding: '76px 32px 84px' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 55% 40% at 80% 20%, rgba(255,203,5,0.04), transparent)' }} />

        <div style={{ maxWidth: 1080, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 48px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'rgba(255,203,5,0.08)', border: '1px solid rgba(255,203,5,0.2)',
              color: '#ffcb05', fontWeight: 700, fontSize: 11, letterSpacing: '1.3px', textTransform: 'uppercase',
              padding: '7px 15px', borderRadius: 999, marginBottom: 18,
            }}>
              <Star size={10} fill="#ffcb05" color="#ffcb05" /> Innovation Alumni · Where Are They Now
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 38, margin: '0 0 14px', letterSpacing: -0.8, lineHeight: 1.1 }}>
              Real Participants. Real Ideas. Real Impact.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 600, lineHeight: 1.65 }}>
              Every one of them began with a single spark of curiosity, right where you are now.
            </p>
          </div>

          <AlumniCarousel />

          <div className="lp-fade-up" style={{ textAlign: 'center', marginTop: 48 }}>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, margin: '0 0 8px', letterSpacing: -0.4 }}>Today they are participants. Tomorrow, they&apos;ll build the future of Bharat.</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 26px' }}>Your innovation journey could be next · Powered by Lemon Ideas · Connected to Innopreneurs Junior</p>
            <Link href="/register" className="lp-btn-primary" style={{
              background: 'linear-gradient(135deg,#7dc832,#4f9a12)', color: '#fff',
              fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 13,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 12px 30px rgba(125,200,50,0.32)',
            }}>
              Start your story <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── WHY DIFFERENT ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>Why This Olympiad Is Different</h2>
          <p className="lp-fade-up" style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: '0 auto 46px', maxWidth: 520 }}>We don&apos;t test what participants memorise. We measure how they think, create and solve.</p>

          <div className="lp-compare-grid">
            <div style={{ padding: '34px 30px', textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 22 }}>Traditional Olympiad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[['Memory', 'Rewards'], ['Marks', 'Measures'], ['Knowledge', 'Tests']].map(([thing, verb]) => (
                  <div key={thing} className="lp-compare-row" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 15 }}>
                    <XCircle size={16} color="var(--danger-400)" style={{ flexShrink: 0 }} />
                    <span>{verb} <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{thing}</b></span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border-default)' }} />
            <div style={{ padding: '34px 30px', textAlign: 'left', background: 'rgba(125,200,50,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#7dc832', marginBottom: 22 }}>Innovation Olympiad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[['Creativity', 'Rewards'], ['Innovation', 'Measures'], ['Problem Solving', 'Builds']].map(([thing, verb]) => (
                  <div key={thing} className="lp-compare-row" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 8px', color: 'var(--text-primary)', fontSize: 15 }}>
                    <CheckCircle2 size={16} color="#7dc832" style={{ flexShrink: 0 }} />
                    <span>{verb} <b style={{ fontWeight: 700 }}>{thing}</b></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT IT IS ──
          The "Description" section from the Innovation Olympiad brief: why the Olympiad exists
          and where it sits, in the organisation's own words. */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 20px', letterSpacing: -0.6, textAlign: 'center' }}>
            Building a Future-Ready India
          </h2>
          <div className="lp-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 15.5, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text-primary)' }}>Innovation has no syllabus, because the future has no fixed Innovation Olympiad exam.</b>{' '}
              The Bharat Innovation Olympiad reflects this belief by moving beyond conventional
              examinations that reward memorisation. Instead, it assesses curiosity, creativity,
              adaptability and real-world thinking, preparing participants not just for the next exam,
              but for the next decade.
            </p>
            <p style={{ margin: 0 }}>
              Conceived by <b style={{ color: 'var(--text-primary)' }}>Lemon Ideas</b>, an entrepreneurship
              ecosystem with over 12 years of experience nurturing innovators, entrepreneurs and
              changemakers across India, the Olympiad bridges the gap between classroom learning and
              the capabilities needed to thrive in an uncertain, technology-driven and rapidly
              evolving world.
            </p>
            <p style={{ margin: 0 }}>
              Built on the foundation of <b style={{ color: 'var(--text-primary)' }}>Innopreneurs</b>,
              Lemon Ideas&apos; flagship innovation and entrepreneurship movement, it is far more than
              another Olympiad, it is the beginning of a lifelong innovation ecosystem. Participants from
              Grades 6 to 12 assess themselves across five future-focused dimensions through a balanced
              mix of knowledge-based, situational and future-oriented questions.
            </p>
            <p style={{ margin: 0 }}>
              What truly distinguishes it is its purpose: creating{' '}
              <b style={{ color: 'var(--text-primary)' }}>future-ready citizens, not just high scorers</b>.
              Closely aligned with the vision of Viksit Bharat 2047, it inspires young minds to become
              innovators, creators and responsible leaders who can shape India&apos;s future with
              courage, compassion and creativity.
            </p>
          </div>
        </div>
      </section>

      {/* ── FIVE DIMENSIONS ──
          What the paper actually assesses. These are the same five pillars the
          exam is built from, so a student sees the structure here before they
          meet it as section headings mid-exam. */}
      <section style={{ background: 'var(--bg-secondary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6, textAlign: 'center' }}>
            The Five Dimensions
          </h2>
          <p className="lp-fade-up" style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: '0 auto 46px', maxWidth: 560, textAlign: 'center' }}>
            Every participant is assessed across five future-focused dimensions, the same five sections
            that make up the Innovation Olympiad exam.
          </p>

          <div className="lp-dimensions">
            {[
              {
                n: '01',
                title: 'Entrepreneurship Mindset',
                body: 'Entrepreneurship is not just about starting a business, it is a way of thinking. This dimension develops the ability to identify opportunities, take initiative, solve problems creatively and make responsible decisions, through customer empathy, teamwork, planning, resource management and ethics.',
              },
              {
                n: '02',
                title: 'Problem Solving & Innovation',
                body: 'Innovation begins with understanding problems that matter. Participants observe the world around them, think creatively, explore multiple solutions and validate ideas through experimentation, drawing on design thinking, adaptability and evidence-based reasoning.',
              },
              {
                n: '03',
                title: 'Emerging Technologies & Digital Readiness, STEM',
                body: 'Beginning with strong STEM foundations, this dimension introduces computational thinking, coding logic, robotics, artificial intelligence, machine learning and cybersecurity, then expands to frontier technologies such as space technology, biotechnology and quantum computing.',
              },
              {
                n: '04',
                title: 'Future Readiness & Global Awareness',
                body: 'Preparing for the future demands adaptability, lifelong learning and global awareness. This dimension develops an understanding of future careers, sustainability, climate action and well-being, and inspires participants to contribute towards Viksit Bharat 2047.',
              },
              {
                n: '05',
                title: 'Financial Readiness',
                body: 'Financial literacy is an essential life skill. Participants learn money management, saving, investing, budgeting and responsible financial decision-making, alongside digital banking, UPI, financial safety, cyber awareness and the global economy.',
              },
            ].map((d) => (
              <div key={d.n} className="lp-dimension-card lp-fade-up">
                <span className="lp-dimension-num">{d.n}</span>
                <h3 className="lp-dimension-title">{d.title}</h3>
                <p className="lp-dimension-body">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOUR BENEFITS ── */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 50 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>One Registration. Four Powerful Benefits.</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: 0 }}>Everything a young innovator needs to be recognised and grow.</p>
          </div>
          <div className="lp-grid-4">
            {([
              { Icon: Medal,        col: '#7dc832',  bg: 'rgba(125,200,50,0.1)',  title: 'National Rankings',          desc: 'Stand out with verified All-India, State, City & School ranks.' },
              { Icon: Lightbulb,    col: '#ffcb05',  bg: 'rgba(255,203,5,0.1)',   title: 'Innopreneurs Advantage',      desc: 'A direct pathway into startup contests and innovation labs.' },
              { Icon: Globe,        col: '#7baff5',  bg: 'rgba(59,111,224,0.1)',  title: 'World Skill Challenge',      desc: 'Qualify for global future-skills challenges and exposure.' },
              { Icon: GraduationCap,col: '#f97316',  bg: 'rgba(249,115,22,0.1)', title: 'Entrepreneurship Bootcamp',  desc: 'Hands-on bootcamps to turn ideas into real ventures.' },
            ] as const).map(({ Icon, col, bg, title, desc }, i) => (
              <div key={i} className="lp-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 18, padding: 26 }}>
                <div className="lp-icon-wrap" style={{ width: 52, height: 52, borderRadius: 14, background: bg, marginBottom: 18 }}>
                  <Icon size={24} color={col} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── JOURNEY ROADMAP ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '78px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, margin: '0 0 10px', letterSpacing: -0.5 }}>The Innovation Journey Roadmap</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: 0 }}>From your first Olympiad to becoming a recognised innovator.</p>
          </div>
          <div className="lp-grid-5">
            {([
              { n: '01', Icon: Trophy,        label: 'Register & Assess',  sub: 'Sign up and take the Olympiad',    col: '#7dc832', bg: 'rgba(125,200,50,0.15)' },
              { n: '02', Icon: BarChart3,      label: 'Get Ranked',         sub: 'National & school recognition',    col: '#ffcb05', bg: 'rgba(255,203,5,0.15)' },
              { n: '03', Icon: FlaskConical,   label: 'Innopreneurs',        sub: 'Compete in startup contests',      col: '#7dc832', bg: 'rgba(125,200,50,0.15)' },
              { n: '04', Icon: Users,          label: 'Mentorship',          sub: 'Guidance from innovators',         col: '#ffcb05', bg: 'rgba(255,203,5,0.15)' },
              { n: '05', Icon: Rocket,         label: 'Future Innovator',   sub: 'Build real ventures',              col: '#fff',    bg: 'linear-gradient(135deg,#7dc832,#ffcb05)' },
            ] as const).map(({ n, Icon, label, sub, col, bg }, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="lp-road-dot" style={{ width: 58, height: 58, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', flexDirection: 'column', gap: 1 }}>
                  <Icon size={20} color={col} />
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 11, color: col, letterSpacing: '0.04em', lineHeight: 1 }}>{n}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT EVERY STUDENT RECEIVES ── */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 50 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>What Every Participant Receives</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: 0 }}>Far more than a score: a complete innovation identity.</p>
          </div>
          <div className="lp-grid-3">
            {([
              { Icon: Trophy,        col: '#7dc832', bg: 'rgba(125,200,50,0.1)',  title: 'Rankings',                 desc: 'National, State, City & School ranks.' },
              { Icon: BarChart3,     col: '#ffcb05', bg: 'rgba(255,203,5,0.1)',   title: 'Innovation Profile',       desc: 'A skill radar across 5 dimensions.' },
              { Icon: BadgeCheck,    col: '#7baff5', bg: 'rgba(59,111,224,0.1)',  title: 'Certificate',              desc: 'Verifiable digital certificate.' },
              { Icon: Zap,           col: '#f97316', bg: 'rgba(249,115,22,0.1)', title: 'Opportunities',            desc: 'Contests, challenges & events.' },
              { Icon: Users,         col: '#a78bfa', bg: 'rgba(167,139,250,0.1)', title: 'Mentorship',              desc: 'Access to expert innovators.' },
              { Icon: Rocket,        col: '#7dc832', bg: 'rgba(125,200,50,0.1)',  title: 'Entrepreneurship Exposure', desc: 'Bootcamps to launch ventures.' },
            ] as const).map(({ Icon, col, bg, title, desc }, i) => (
              <div key={i} className="lp-receives-item" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span className="lp-icon-wrap" style={{ width: 46, height: 46, borderRadius: 12, background: bg, flexShrink: 0 }}>
                  <Icon size={22} color={col} />
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, marginBottom: 5 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NATIONAL STAGE GALLERY ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '80px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(125,200,50,0.1)', border: '1px solid rgba(125,200,50,0.2)',
              color: '#7dc832', fontWeight: 700, fontSize: 11, letterSpacing: '1.3px', textTransform: 'uppercase',
              padding: '7px 15px', borderRadius: 999, marginBottom: 18,
            }}>
              <Award size={12} /> Proven Legacy · Powered by Innopreneurs Junior
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 12px', letterSpacing: -0.6 }}>Real Participants. Real Ideas. Real Impact.</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 640, lineHeight: 1.65 }}>For over four years, Innopreneurs Junior has helped school participants across India identify problems, build solutions and present their ideas on a national stage.</p>
          </div>
          <div className="lp-gallery-grid">
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 7', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 308 }}>
              <Image src="/assets/hof-grand-finale-group.jpg" alt="Innopreneurs Junior Grand Finale cohort" fill sizes="(max-width: 900px) 100vw, 600px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '34px 18px 14px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 1 }}>Grand Finale · The national cohort of young innovators</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 5', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 308 }}>
              <Image src="/assets/hof-winners.jpg" alt="National winners with certificate" fill sizes="(max-width: 900px) 100vw, 450px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '34px 18px 14px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 1 }}>Winners felicitated on the main stage</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 4', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 232 }}>
              <Image src="/assets/hof-pitch-duo.jpg" alt="Participants pitching their innovation" fill sizes="(max-width: 900px) 100vw, 380px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 12px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1 }}>Pitching to a national jury</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 4', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 232 }}>
              <Image src="/assets/hof-national-stage.jpg" alt="National stage recognition" fill sizes="(max-width: 900px) 100vw, 380px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 12px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1 }}>Recognised by national leaders</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 4', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 232 }}>
              <Image src="/assets/hof-certificates.jpg" alt="Regional round participants with certificates" fill sizes="(max-width: 900px) 100vw, 380px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 12px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1 }}>City rounds across India</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section style={{ background: 'linear-gradient(135deg,#1a3a0a,#0e2206)', padding: '70px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(125,200,50,0.12), transparent)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, color: '#fff', margin: '0 0 12px', letterSpacing: -0.5 }}>Every idea starts small. Every innovator starts somewhere.</h2>
          <p className="lp-fade-up-1" style={{ fontSize: 17, color: 'rgba(255,255,255,0.7)', margin: '0 0 30px' }}>Join India&apos;s most complete innovation ecosystem today.</p>
          <Link href="/register" className="lp-btn-primary" style={{
            background: 'linear-gradient(135deg,#7dc832,#ffcb05)', color: '#0a0a0a',
            fontWeight: 800, fontSize: 17, padding: '16px 36px', borderRadius: 14,
            display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 16px 40px rgba(125,200,50,0.35)',
          }}>
            <Rocket size={18} /> Register Now <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand">
            <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad: Become Future Ready" height={34} width={112} style={{ height: 34, width: 'auto', display: 'block' }} />
            <span className="lp-brand-name" style={{ fontSize: '0.95rem' }}>Bharat Innovation Olympiad</span>
          </div>

          <nav className="lp-footer__links" aria-label="Footer">
            <Link href="/terms">Terms &amp; Conditions</Link>
            <Link href="/support">Support</Link>
            <Link href="/register">Register</Link>
            <Link href="/login">Participant login</Link>
            <a href="https://lemonideas.in" target="_blank" rel="noopener noreferrer">
              Lemon Ideas ↗
            </a>
            <a href="https://innopreneurs.in" target="_blank" rel="noopener noreferrer">
              Innopreneurs ↗
            </a>
            <a href="https://worldskillchallenge.com" target="_blank" rel="noopener noreferrer">
              World Skill Challenge ↗
            </a>
          </nav>

          <div className="lp-footer__powered">
            <span>Powered by</span>
            <Image src="/lemon-ideas-logo.png" alt="Lemon Ideas" height={15} width={75} style={{ height: 15, width: 'auto', filter: 'brightness(0.7)' }} />
          </div>

          <div className="lp-footer__legal">
            © 2026 Bharat Innovation Olympiad · An Innovation &amp; Future Skills Ecosystem
          </div>
        </div>
      </footer>

    </div>
  );
}
