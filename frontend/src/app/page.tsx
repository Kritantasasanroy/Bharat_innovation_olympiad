'use client';

import Link from 'next/link';
import Image from 'next/image';
import AlumniCarousel from '@/components/landing/AlumniCarousel';
import HeroSlideshow from '@/components/landing/HeroSlideshow';
import ExpandableCard from '@/components/landing/ExpandableCard';
import RegistrationPopup from '@/components/landing/RegistrationPopup';
import SchoolPartnerForm from '@/components/landing/SchoolPartnerForm';
import NavJoinMenu from '@/components/landing/NavJoinMenu';
import MobileLanding from '@/components/landing/MobileLanding';
import ReferralCapture from '@/components/ReferralCapture';
import ThemeToggle from '@/components/ThemeToggle';
import { useIsMobile } from '@/hooks/useIsMobile';
import { TECH_REQUIREMENTS } from '@/lib/copy/onboarding';
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
  EVENT_PHOTOS,
  PARTNERS,
  nextOlympiadDate,
} from '@/lib/copy/landing';
import {
  Rocket, Lightbulb, Users, Medal, Globe,
  Target, ScrollText, Star, ArrowRight, CheckCircle2, Minus,
  Award, Sparkles, GraduationCap, FlaskConical,
  BadgeCheck, PenLine, Briefcase, CalendarDays,
  MessageCircle, Instagram, Linkedin, Mail, Monitor,
} from 'lucide-react';

export default function LandingPage() {
  // Separate mobile screen: the desktop hero/gallery below is tuned for a
  // 1200px canvas with hand-placed inline styles and does not reflow into
  // something worth reading on a phone. Desktop JSX beneath is untouched.
  const isMobile = useIsMobile();
  if (isMobile) return <MobileLanding />;

  // The brief (#5): the displayed date is the first Sunday on/after today+15.
  const nextDate = nextOlympiadDate();

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      {/* Captures a partner's `?ref=CODE` on first touch (PRD-046 attribution). */}
      <ReferralCapture />
      <RegistrationPopup />

      {/* ── NAV ──
          One bar, one Register CTA. The next-Olympiad date lives here as a
          slim chip (the old separate announcement band duplicated the
          Register CTA a few pixels below it). */}
      <nav className="lp-nav" style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* The logo lockup already carries the full name — no written
              wordmark beside it (#1). */}
          <Link href="/" aria-label="Bharat Innovation Olympiad — home">
            <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad: Become Future Ready" height={46} width={152} style={{ height: 46, width: 'auto', display: 'block' }} priority />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Next-Olympiad date (#5) as a quiet chip — informative, not a
                second CTA. */}
            <span className="lp-date-chip" title="Exam slots open every Sunday, 8:30 AM – 7 PM">
              <CalendarDays size={14} />
              <span>Next Olympiad</span>
              <b>{nextDate}</b>
            </span>
            <NavJoinMenu />
            <Link href="/login" className="lp-btn-secondary" style={{
              border: '1px solid var(--border-default)', background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', fontWeight: 600, fontSize: 14,
              padding: '9px 20px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              Participant Login
            </Link>
            <Link href="/register" className="lp-btn-primary" style={{
              background: 'linear-gradient(135deg,#4f9a12,#35700a)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              padding: '10px 22px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 7,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}>
              <Rocket size={14} /> Register Now
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* ── HERO — real event photos crossfading behind a dark translucent
          veil (#18/#20). Text is forced light: it sits on the photos, not on
          the theme background. ── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: '#0c1a06' }}>
        <HeroSlideshow />

        <div className="lp-hero-grid" style={{ position: 'relative', zIndex: 1 }}>
          {/* Left */}
          <div>
            <div className="lp-fade-up lp-badge-glow" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.28)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              color: '#fff', fontWeight: 600, fontSize: 12.5, letterSpacing: '0.04em',
              padding: '7px 14px', borderRadius: 999, marginBottom: 22,
            }}>
              <Sparkles size={12} />
              India&apos;s National Innovation &amp; Future Skills Movement · Grades 6–12
            </div>

            <h1 className="lp-fade-up-1" style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 46, lineHeight: 1.08,
              letterSpacing: -1.5, margin: '0 0 18px', color: '#fff',
            }}>
              Bharat{' '}
              <span style={{ background: 'linear-gradient(135deg,#a4e04c,#ffcb05)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Innovation
              </span>
              {' '}Olympiad: Become Future Ready
            </h1>

            <p className="lp-fade-up-2" style={{ fontSize: 15.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.82)', margin: '0 0 22px', maxWidth: 520 }}>
              Discover your potential beyond academics by developing the mindset, skills and awareness
              to innovate, solve real-world problems and confidently shape the future of India and the world.
            </p>

            {/* Course value beside the CTA (#2): the offer is visible at the
                moment of decision, not two sections later. */}
            <div className="lp-fade-up-3" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/register" className="lp-btn-primary" style={{
                background: 'linear-gradient(135deg,#4f9a12,#35700a)', color: '#fff',
                fontWeight: 700, fontSize: 15.5, padding: '14px 28px', borderRadius: 13,
                display: 'inline-flex', alignItems: 'center', gap: 9,
                boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
              }}>
                <Rocket size={17} /> Register Now <ArrowRight size={15} />
              </Link>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                color: '#fff', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 11,
              }}>
                Program value <s style={{ opacity: 0.65 }}>{COURSE_VALUE.mrp}</s>
                <b style={{ fontSize: 16, color: '#ffcb05' }}>{COURSE_VALUE.price}</b>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>({COURSE_VALUE.note})</span>
              </span>
            </div>

            {/* Stats (#4: 250+ schools · 1 Lakh+ innovators · 25+ States & UTs) */}
            <div style={{ display: 'flex', gap: 36, marginTop: 44, paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.18)' }}>
              {STATISTICS.map((s, i) => (
                <div key={s.label} className={`lp-stat-${i + 1}`}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 28, color: '#ffcb05' }}>{s.value}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — the participant journey (#3), exactly the sequence the
              brief specifies, with capacity building's three ingredients.
              Glass over the photo slideshow: translucent, blurred, light text. */}
          <div className="lp-fade-up-2 lp-float" style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 24, padding: 28,
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.3px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: 20 }}>The Participant Journey</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {JOURNEY_STAGES.map((stage, i) => {
                const last = i === JOURNEY_STAGES.length - 1;
                const icons = [Rocket, GraduationCap, PenLine, Lightbulb, FlaskConical, Briefcase];
                const StepIcon = icons[i];
                return (
                  <div key={stage.title}>
                    <div className="lp-step" style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px',
                      background: last ? 'rgba(79,154,18,0.28)' : 'rgba(255,255,255,0.07)',
                      border: last ? '1px solid rgba(125,200,50,0.45)' : '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 13,
                    }}>
                      <span className="lp-icon-wrap" style={{
                        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                        background: last ? 'rgba(125,200,50,0.3)' : (i % 2 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.1)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <StepIcon size={18} color={last ? '#a4e04c' : i % 2 === 0 ? '#a4e04c' : '#ffcb05'} />
                      </span>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#fff' }}>{stage.title}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{stage.sub}</div>
                      </div>
                    </div>
                    {!last && <div style={{ height: 14, width: 2, background: 'rgba(255,255,255,0.25)', marginLeft: 33 }} />}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '14px 2px 0', lineHeight: 1.5 }}>
              Capacity building = training, material resources, and guidance &amp; mentoring — included with registration.
            </p>
          </div>
        </div>
      </section>

      {/* ── PRICING BAND (#2) ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '14px 32px 48px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: 20, padding: '26px 32px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 18,
          }}>
            <div>
              <div style={{ fontSize: 14.5, color: 'var(--text-secondary)' }}>
                Program value{' '}
                <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>{COURSE_VALUE.mrp}</span>{' '}
                for Training, Exam and Report · Offered price{' '}
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 20, color: '#4f9a12' }}>{COURSE_VALUE.price}</span>{' '}
                <span style={{ fontSize: 12 }}>({COURSE_VALUE.note})</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 8 }}>
                Next Olympiad: <b style={{ color: 'var(--text-primary)' }}>{nextDate}</b> (Sunday) · Only 500 exam slots available per week
              </div>
            </div>
            <Link href="/register" className="lp-btn-primary" style={{
              background: 'linear-gradient(135deg,#4f9a12,#35700a)', color: '#fff',
              fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 13,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
            }}>
              Register Now <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PHOTO BAND — real event photos, high on the page. The olympiad is
          people on stages and in classrooms; showing that early says more
          than another paragraph could. ── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: '#0c1a06' }}>
        <Image
          src={EVENT_PHOTOS[1].src}
          alt={EVENT_PHOTOS[1].alt}
          fill
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 30%' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(8,18,4,0.82) 0%, rgba(8,18,4,0.55) 55%, rgba(8,18,4,0.75) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '56px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#ffcb05', marginBottom: 8 }}>
              Since 2013 · Lemon Ideas
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#fff', letterSpacing: -0.5, lineHeight: 1.25 }}>
              Real classrooms. Real innovators. Real stages.
            </div>
          </div>
          <Link href="/about" style={{
            color: '#fff', fontWeight: 700, fontSize: 14,
            border: '1px solid rgba(255,255,255,0.4)', borderRadius: 999,
            padding: '10px 22px', display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(6px)',
          }}>
            See the journey <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── TRUST (#6) — cards expand on click; the credibility card carries
          the brief's exact statement. ── */}
      <section className="lp-trust">
        <div className="lp-trust__inner">
          <div className="lp-trust__head">
            <BadgeCheck size={22} />
            <h2>A fair, authentic and credible online assessment</h2>
            <p>
              Taken from home, judged like a hall exam. Click any card to see exactly how we make an
              online olympiad something a school, a parent and a participant can all trust.
            </p>
          </div>

          <div className="lp-trust__grid">
            {([
              {
                Icon: Target,
                title: 'Fairness',
                teaser: 'Same exam, same conditions, server-run timer.',
                body: 'Every participant sits the same Innovation Olympiad exam under the same conditions, on their booked schedule, on a server-run timer that does not stop if their internet does. Question order is randomised per participant, and the paper is encrypted until the exam opens.',
              },
              {
                Icon: BadgeCheck,
                title: 'Authenticity',
                teaser: 'The registered participant is the one who sits the exam.',
                body: 'A face scan taken at registration confirms the registered participant is the one sitting the Innovation Olympiad exam, and the same face is checked again continuously during the paper — so a rank belongs to the person who earned it.',
              },
              {
                Icon: ScrollText,
                title: 'Credibility',
                teaser: 'A human reviews every flag, with written reasons.',
                body: CREDIBILITY_STATEMENT,
              },
              {
                Icon: Users,
                title: 'Child-friendly',
                teaser: 'No recordings, no warning pile-ups.',
                body: 'No warnings pile up mid-exam and no video is ever recorded. Analysis runs inside the participant’s own browser, only the events leave the device, and consent for the face scan is recorded separately under the DPDP Act.',
              },
            ] as const).map(({ Icon, title, teaser, body }) => (
              <ExpandableCard
                key={title}
                title={title}
                teaser={teaser}
                detail={body}
                accent="#4f9a12"
                icon={<span className="lp-trust__icon"><Icon size={18} /></span>}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── PARTNERS (#21) — ecosystem partners, above "What you need".
          Data-driven: the next partner is one entry in PARTNERS. ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '0 32px 76px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 34 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, margin: '0 0 8px', letterSpacing: -0.5 }}>
              Our Partners
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>
              The ecosystem behind the Olympiad — organisations that share the belief that
              skills are built by doing.
            </p>
          </div>
          <div className="lp-partners">
            {PARTNERS.map((p) => (
              <a
                key={p.name}
                href={p.website}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-partner-card lp-fade-up"
              >
                <span className="lp-partner-card__logo">
                  <Image src={p.logo} alt={`${p.name} logo`} width={128} height={128} style={{ objectFit: 'contain', width: 128, height: 128 }} />
                </span>
                <span className="lp-partner-card__body">
                  <span className="lp-partner-card__kicker">Ecosystem Partner</span>
                  <strong>{p.name}</strong>
                  <em>“{p.motto}”</em>
                  <span className="lp-partner-card__blurb">{p.blurb}</span>
                  <span className="lp-partner-card__site">{p.website.replace('https://', '').replace(/\/$/, '')} ↗</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU NEED (#7) — promoted from a collapsed <details> to its
          own prominent section: a family should know the device requirements
          before they pay, not after. ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '0 32px 76px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid rgba(0,0,0,0.3)',
            borderRadius: 22, padding: '36px 36px 30px', boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span className="lp-icon-wrap" style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(125,200,50,0.12)' }}>
                <Monitor size={22} color="#4f9a12" />
              </span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, margin: 0, letterSpacing: -0.4 }}>
                What You Need to Take the Exam
              </h2>
            </div>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', margin: '0 0 22px' }}>
              Register from any device, including a mobile phone. For the exam itself:
            </p>
            <div className="lp-tech-grid">
              {TECH_REQUIREMENTS.map((req) => (
                <div key={req.label} className="lp-tech-item">
                  <dt>{req.label}</dt>
                  <dd>{req.value}</dd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SUCCESS STORIES (existing carousel — kept) ── */}
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
              background: 'linear-gradient(135deg,#4f9a12,#35700a)', color: '#fff',
              fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 13,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
            }}>
              Start your story <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── WHY DIFFERENT (#8: no red crosses — neutral markers) ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>Why This Olympiad Is Different</h2>
          <p className="lp-fade-up" style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: '0 auto 46px', maxWidth: 520 }}>We don&apos;t test what participants memorise. We measure how they think, create and solve.</p>

          <div className="lp-compare-grid">
            <div style={{ padding: '34px 30px', textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 22 }}>Traditional Olympiad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  ['Memory', 'Rewards'],
                  ['Marks', 'Measures'],
                  ['Knowledge', 'Tests'],
                  ['Exam & Ranking', 'Only'],
                  ['Academic & syllabus based', ''],
                ].map(([thing, verb]) => (
                  <div key={thing} className="lp-compare-row" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 15 }}>
                    <Minus size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                    <span>{verb} <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{thing}</b></span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border-default)' }} />
            <div style={{ padding: '34px 30px', textAlign: 'left', background: 'rgba(125,200,50,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#4f9a12', marginBottom: 22 }}>Innovation Olympiad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  ['Creativity', 'Rewards'],
                  ['Innovation', 'Measures'],
                  ['Problem Solving', 'Builds'],
                  ['Training, Pitch contests & Mentoring', 'Includes'],
                  ['No syllabus, real life based', ''],
                ].map(([thing, verb]) => (
                  <div key={thing} className="lp-compare-row" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 8px', color: 'var(--text-primary)', fontSize: 15 }}>
                    <CheckCircle2 size={16} color="#4f9a12" style={{ flexShrink: 0 }} />
                    <span>{verb} <b style={{ fontWeight: 700 }}>{thing}</b></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT IT IS (#15: 2–3 lines + Know More; the long article moved
          to /about) ── */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 18px', letterSpacing: -0.6 }}>
            What is Bharat Innovation Olympiad?
          </h2>
          <p className="lp-fade-up" style={{ fontSize: 16.5, lineHeight: 1.75, color: 'var(--text-secondary)', margin: '0 auto 26px', maxWidth: 720 }}>
            A national Innovation &amp; Future Skills Olympiad for Grades 6–12, <b style={{ color: 'var(--text-primary)' }}>Since 2013</b> built on the
            Innopreneurs movement by Lemon Ideas — assessing curiosity, creativity and real-world
            problem solving across five future-focused dimensions, and opening the door to a lifelong
            innovation ecosystem.
          </p>
          <Link href="/about" className="lp-btn-primary" style={{
            background: 'linear-gradient(135deg,#4f9a12,#35700a)', color: '#fff',
            fontWeight: 700, fontSize: 14.5, padding: '12px 26px', borderRadius: 12,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
          }}>
            Know More <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* ── MESSAGE BY THE FOUNDER (#10: real photograph) ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', gap: 36, alignItems: 'flex-start' }}>
          <Image
            src="/assets/founder-deepak.jpg"
            alt="Deepak Menaria, Founder of Lemon Ideas, speaking at an Innopreneurs event"
            width={168} height={168}
            style={{
              width: 168, height: 168, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
              border: '3px solid rgba(125,200,50,0.5)', boxShadow: '0 14px 34px rgba(0,0,0,0.35)',
            }}
          />
          <div>
            <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, margin: '0 0 18px', letterSpacing: -0.5 }}>
              Message from the Founder
            </h2>
            <blockquote style={{
              margin: 0, padding: 0, border: 'none',
              fontFamily: 'var(--font-display)', fontSize: 19, lineHeight: 1.7,
              color: 'var(--text-primary)', fontStyle: 'normal',
            }}>
              &ldquo;Since 2013, Lemon Ideas has worked to nurture entrepreneurial thinking and innovation
              across India &amp; beyond. Our journey with young minds through Junior Innopreneurs reinforced
              a simple belief — every child has the potential to become a creator of change when equipped
              with the right mindset and opportunities. The Bharat Innovation Olympiad is our invitation
              to every child to discover their potential, become future-ready, and help build a confident,
              innovative and developed India by 2047.&rdquo;
            </blockquote>
            <div className="lp-fade-up-1" style={{ marginTop: 18, fontWeight: 700, color: 'var(--text-secondary)', fontSize: 15 }}>
              — Deepak Menaria, Founder, Lemon Ideas
            </div>
          </div>
        </div>
      </section>

      {/* ── FIVE DIMENSIONS (#11: Problem Solving first, EQ second; click a
          title to read the full explanation) ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6, textAlign: 'center' }}>
            The Five Dimensions
          </h2>
          <p className="lp-fade-up" style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: '0 auto 46px', maxWidth: 560, textAlign: 'center' }}>
            Every participant is assessed across five future-focused dimensions — the same five sections
            that make up the exam. Click a dimension to read more.
          </p>

          <div className="lp-dimensions">
            {DIMENSIONS.map((d) => (
              <ExpandableCard
                key={d.n}
                title={`${d.n} · ${d.title}`}
                teaser={d.teaser}
                detail={d.body}
                accent="#4f9a12"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── FOUR BENEFITS (#12) ── */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 50 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>One Registration. Four Powerful Benefits.</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: 0 }}>Everything a young innovator needs to be recognised and grow.</p>
          </div>
          <div className="lp-grid-4">
            {([
              { Icon: Medal,        col: '#4f9a12',  bg: 'rgba(125,200,50,0.1)',  title: 'National Rankings',              desc: 'Stand out with verified All-India, State, City & School ranks.' },
              { Icon: Lightbulb,    col: '#ffcb05',  bg: 'rgba(255,203,5,0.1)',   title: 'Innopreneurs Advantage',          desc: 'A direct pathway into startup contests and innovation labs.' },
              { Icon: Globe,        col: '#7baff5',  bg: 'rgba(59,111,224,0.1)',  title: 'World Skill Challenge',          desc: 'Qualify for global future-skills challenges and exposure.' },
              { Icon: FlaskConical, col: '#f97316',  bg: 'rgba(249,115,22,0.1)', title: 'Experiential Learning Opportunity', desc: 'Pre-Incubation cohort, startup internship, and bootcamp.' },
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

      {/* ── RECEIVES + TAKEAWAYS (#13: one section, side by side, deduped;
          #16: Top 2%, pre-finale, ₹5 lakh) ── */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>What Every Participant Receives</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: 0 }}>
              Far more than a score — and what the top performers unlock.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
            <div className="lp-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '30px 28px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, marginBottom: 18, color: '#4f9a12' }}>What every participant receives</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {RECEIVES.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={16} color="#4f9a12" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lp-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '30px 28px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, marginBottom: 18, color: '#ffcb05' }}>Takeaways for participants</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {TAKEAWAYS.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={16} color="#ffcb05" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── NATIONAL STAGE GALLERY (#20: real event photos woven in) ── */}
      <section style={{ background: 'var(--bg-secondary)', padding: '80px 32px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(125,200,50,0.1)', border: '1px solid rgba(125,200,50,0.2)',
              color: '#4f9a12', fontWeight: 700, fontSize: 11, letterSpacing: '1.3px', textTransform: 'uppercase',
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
              <Image src={EVENT_PHOTOS[1].src} alt={EVENT_PHOTOS[1].alt} fill sizes="(max-width: 900px) 100vw, 450px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '34px 18px 14px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 1 }}>Winners felicitated on the main stage</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 4', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 232 }}>
              <Image src="/assets/hof-pitch-duo.jpg" alt="Participants pitching their innovation" fill sizes="(max-width: 900px) 100vw, 380px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 12px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1 }}>Pitching to a national jury</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 4', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 232 }}>
              <Image src={EVENT_PHOTOS[0].src} alt={EVENT_PHOTOS[0].alt} fill sizes="(max-width: 900px) 100vw, 380px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 12px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1 }}>Recognised by national leaders</div>
            </div>
            <div className="lp-gallery-cell" style={{ gridColumn: 'span 4', position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border-default)', height: 232 }}>
              <Image src={EVENT_PHOTOS[2].src} alt={EVENT_PHOTOS[2].alt} fill sizes="(max-width: 900px) 100vw, 380px" className="lp-gallery-img" style={{ objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 12px', background: 'linear-gradient(transparent,rgba(0,0,0,0.85))', color: '#fff', fontSize: 12.5, fontWeight: 600, zIndex: 1 }}>City rounds across India</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM + SCHOOL PARTNER (#22) ── */}
      <section style={{ background: 'var(--bg-primary)', padding: '76px 32px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="lp-fade-up" style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: '0 0 10px', letterSpacing: -0.6 }}>The Ecosystem Behind the Olympiad</h2>
            <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', margin: 0 }}>
              Built on a legacy of nurturing innovators and entrepreneurs across India — since 2013.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
            <div className="lp-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '30px 28px' }}>
              <span className="lp-icon-wrap" style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(125,200,50,0.1)', marginBottom: 18 }}>
                <Lightbulb size={24} color="#4f9a12" />
              </span>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>About Lemon Ideas</div>
              <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 14px' }}>
                An entrepreneurship ecosystem working since 2013, nurturing innovators,
                entrepreneurs and changemakers across India and beyond.
              </p>
              <a href="https://www.lemonideas.in" target="_blank" rel="noopener noreferrer" style={{ color: '#4f9a12', fontWeight: 700, fontSize: 14 }}>
                www.lemonideas.in ↗
              </a>
            </div>
            <div className="lp-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '30px 28px' }}>
              <span className="lp-icon-wrap" style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,203,5,0.1)', marginBottom: 18 }}>
                <Users size={24} color="#ffcb05" />
              </span>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>About Innopreneurs Junior</div>
              <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 14px' }}>
                The flagship junior innovation movement behind the Olympiad — where school participants
                across India identify problems, build solutions and present their ideas on a national stage.
              </p>
              <a href="https://www.innopreneurs.in/junior-contest" target="_blank" rel="noopener noreferrer" style={{ color: '#ffcb05', fontWeight: 700, fontSize: 14 }}>
                www.innopreneurs.in/junior-contest ↗
              </a>
            </div>
          </div>

          {/* #22 — school partner inquiry, form composes an email */}
          <div style={{ marginTop: 22 }}>
            <SchoolPartnerForm email={SCHOOL_PARTNER_EMAIL} />
          </div>
        </div>
      </section>

      {/* ── CTA BAND (#18/#20: photo background, heavy overlay) ── */}
      <section style={{ background: '#0c1a06', padding: '70px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <HeroSlideshow overlay={0.82} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="lp-fade-up" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, color: '#fff', margin: '0 0 12px', letterSpacing: -0.5 }}>Every idea starts small. Every innovator starts somewhere.</h2>
          <p className="lp-fade-up-1" style={{ fontSize: 17, color: 'rgba(255,255,255,0.78)', margin: '0 0 12px' }}>Join India&apos;s most complete innovation ecosystem today.</p>
          <p className="lp-fade-up-1" style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: '0 0 30px' }}>
            Program value <s>{COURSE_VALUE.mrp}</s> · Offered price <b style={{ color: '#ffcb05' }}>{COURSE_VALUE.price}</b> ({COURSE_VALUE.note})
          </p>
          <Link href="/register" className="lp-btn-primary" style={{
            background: 'linear-gradient(135deg,#4f9a12,#ffcb05)', color: '#0a0a0a',
            fontWeight: 800, fontSize: 17, padding: '16px 36px', borderRadius: 14,
            display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
          }}>
            <Rocket size={18} /> Register Now <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── FOOTER (#19: social links + bigger Lemon Ideas mark) ── */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand">
            <Image src="/bio-logo.png" alt="Bharat Innovation Olympiad: Become Future Ready" height={40} width={132} style={{ height: 40, width: 'auto', display: 'block' }} />
          </div>

          <div className="lp-footer__social" aria-label="Community links">
            <a href={COMMUNITY_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" className="lp-social" title="WhatsApp Community">
              <MessageCircle size={18} /> WhatsApp Community
            </a>
            <a href={COMMUNITY_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="lp-social-link">
              <Instagram size={18} /> Instagram
            </a>
            <a href={COMMUNITY_LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="lp-social-link">
              <Linkedin size={18} /> LinkedIn
            </a>
            <a href={`mailto:${COMMUNITY_LINKS.email}`} className="lp-social-link">
              <Mail size={18} /> {COMMUNITY_LINKS.email}
            </a>
          </div>

          <nav className="lp-footer__links" aria-label="Footer">
            <Link href="/about">About</Link>
            <Link href="/terms">Terms &amp; Conditions</Link>
            <Link href="/support">Support</Link>
            <Link href="/register">Register</Link>
            <Link href="/login">Participant login</Link>
            <a href="https://lemonideas.in" target="_blank" rel="noopener noreferrer">
              Lemon Ideas ↗
            </a>
            <a href="https://www.innopreneurs.in/junior-contest" target="_blank" rel="noopener noreferrer">
              Innopreneurs Junior ↗
            </a>
            <a href="https://worldskillchallenge.com" target="_blank" rel="noopener noreferrer">
              World Skill Challenge ↗
            </a>
          </nav>

          <div className="lp-footer__powered">
            <span>Powered by</span>
            <Image src="/lemon-ideas-logo.png" alt="Lemon Ideas" height={30} width={150} style={{ height: 30, width: 'auto' }} />
          </div>

          <div className="lp-footer__legal">
            © 2026 Bharat Innovation Olympiad · An Innovation &amp; Future Skills Ecosystem
            <br />
            © Bharat Innovation Olympiad is owned by Lemon Ideas Innovations Pvt Ltd.
          </div>
        </div>
      </footer>

    </div>
  );
}
