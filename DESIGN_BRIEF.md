# Bharat Innovation Olympiad — UI Design Brief
**Input file for Claude Design / Figma / Frontend redesign**

> Platform: National online competitive exam for Indian school students (classes 6–12, ages 11–18)  
> Made by: Lemon Ideas ("Bring ideas to life")  
> Two apps: **Student Portal** (exam-taking) + **Admin Portal** (management)

---

## 1. Brand Identity

### Logo & Wordmark
The **Lemon Ideas** logo features:
- **"lemon"** in deep forest green wordmark
- The **"o"** replaced by a glowing lemon/lightbulb icon — bright yellow circle, white lightbulb silhouette inside, two green leaves sprouting from the top
- **"Ideas"** in a slightly darker forest green beneath
- Tagline: *"Bring ideas to life"* in muted green italic

The **Bharat Innovation Olympiad (BIO)** identity should feel like a national competition — prestigious, energetic, and achievement-oriented — while remaining approachable and encouraging for school kids.

---

## 2. Color System

### Primary Palette — extracted from BIO/Lemon Ideas logo
```
Lemon Yellow  #ffd60a   (the glow; CTAs, highlights, active states)
Warm Yellow   #ffcb05   (slightly deeper; gradients)
Lime Green    #7dc832   (the leaves; success, accents, secondary CTAs)
Mid Green     #63b81b   (body accents)
Deep Green    #4f9a12   (darker accent, hover states)
Forest Green  #2d7d32   (Lemon Ideas wordmark; footer, trust elements)
```

### Semantic Colors
```
Success    #22c55e  (correct answers, verified, confirmed)
Warning    #f59e0b  (timer warning, caution states)
Danger     #ef4444  (violations, errors, wrong answers)
Info       #3b82f6  (tips, notes)
```

### Background Strategy — TWO MODES

**Student Portal** should use a **light/bright theme** — kids prefer energetic, colorful, game-like UIs. Dark mode optional toggle.
```
Light mode (default for students):
  Page background:  #f7f8fa   (near-white, slightly warm)
  Card background:  #ffffff
  Card hover:       #fafafa
  Sidebar:          #f0f2f5
  Input:            #ffffff
  Text primary:     #1a1a2e
  Text secondary:   #4a5568
  Text muted:       #9ca3af
  Border subtle:    rgba(0,0,0,0.06)
  Border default:   rgba(0,0,0,0.12)
```

**Admin Portal** should use a **dark professional theme** — admins work long hours, prefer focused dark UI.
```
Dark mode (default for admin):
  Page background:  #0d0d0f
  Card background:  #1a1a1f
  Card hover:       #222228
  Sidebar:          #141418
  Input:            #1e1e24
  Text primary:     #f1f5f9
  Text secondary:   #94a3b8
  Text muted:       #64748b
  Border subtle:    rgba(255,255,255,0.06)
  Border default:   rgba(255,255,255,0.10)
```

### Gradients
```
Brand gradient:    linear-gradient(135deg, #ffd60a 0%, #7dc832 100%)
Warm gradient:     linear-gradient(135deg, #ffd60a 0%, #f59e0b 100%)
Green gradient:    linear-gradient(135deg, #7dc832 0%, #2d7d32 100%)
Hero glow (light): radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,214,10,0.18), transparent)
Hero glow (dark):  radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,214,10,0.10), transparent)
```

---

## 3. Typography

```
Display font:  'Nunito'       — rounded, friendly, great for kids (weights 700, 800, 900)
Body font:     'Inter'        — clean, highly legible for long exam reading
Mono font:     'JetBrains Mono' — timer, codes, scores
```

### Scale
```
Hero title:      3.5rem / 900 weight / letter-spacing -0.03em
Page title:      2rem   / 800 weight
Section heading: 1.5rem / 700 weight
Card heading:    1.1rem / 700 weight
Body:            1rem   / 400 weight / line-height 1.7
Body small:      0.875rem / 400
Caption:         0.75rem / 500 / uppercase + letter-spacing 0.06em
```

**Important for kids:** Minimum body text 16px. Question text 18px. Generous line-height 1.7+.

---

## 4. Spacing & Radius

```
Base unit: 4px

Spacing:  4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80px

Radius:
  sm:   8px   (badges, tags, small inputs)
  md:   12px  (buttons, inputs, small cards)
  lg:   16px  (cards)
  xl:   24px  (modals, large cards)
  2xl:  32px  (hero panels, feature cards)
  full: 9999px (pills, avatars)
```

---

## 5. Component Library

### Buttons
```
Primary:   brand gradient bg, #0d0d0f text, shadow: 0 4px 20px rgba(255,214,10,0.35)
Secondary: white/dark bg, border 1px, text primary color
Ghost:     transparent, border on hover
Danger:    #ef4444 bg, white text
Sizes:     sm (32px h), md (40px h), lg (48px h), xl (56px h — hero CTAs)
Shape:     radius-md for all, rounded full available as modifier
```

**For kids:** Buttons should be large (min 44px touch target), with clear icons alongside text where possible.

### Cards
```
Base:      white/dark bg, 1px border, radius-lg, box-shadow: 0 2px 8px rgba(0,0,0,0.06)
Elevated:  same + shadow: 0 8px 32px rgba(0,0,0,0.10)
Brand:     left border 3px solid #ffd60a OR subtle brand gradient tint background
Hover:     translateY(-2px) + shadow increase + border-color shift to brand yellow
```

### Badges / Tags
```
Success:   #dcfce7 bg / #166534 text  (light) | rgba(34,197,94,0.15) / #4ade80  (dark)
Warning:   #fef3c7 / #92400e          (light) | rgba(245,158,11,0.15) / #fbbf24  (dark)
Danger:    #fee2e2 / #991b1b           (light) | rgba(239,68,68,0.15) / #f87171   (dark)
Primary:   #fefce8 / #713f12           (light) | rgba(255,214,10,0.12) / #ffd60a   (dark)
```

### Inputs
```
Height: 48px (generous for touch)
Border: 1px, radius-md
Focus ring: 0 0 0 3px rgba(255,214,10,0.25), border-color: #ffd60a
Placeholder: text-muted
```

### Progress Bars
```
Track:  bg-elevated, height 10px, radius-full
Fill:   brand gradient, animated width transition 0.4s ease
Micro:  height 4px for inline progress in cards
```

---

## 6. Design Principles for Kids (Ages 11–18)

1. **Chunky, readable text** — no text under 14px anywhere interactive. Exam text min 18px.
2. **High contrast** — all body text WCAG AA compliant. Exam options must be crystal clear.
3. **Encouraging tone** — success states use trophies, stars, celebration. Not clinical checkmarks.
4. **Gamification cues** — progress rings, streak counters, "answered X of Y" live counters.
5. **Zero cognitive overload in exam** — exam player stripped of ALL non-essential chrome.
6. **Clear CTA hierarchy** — one dominant action per page. Kids shouldn't have to hunt for "Start Exam."
7. **Large touch targets** — all interactive elements min 44×44px. Works on school tablets.
8. **Friendly error states** — "Oops, something went wrong! Try again" not "Error 500."
9. **Instant feedback** — answering a question should animate (option highlights, count updates).
10. **Trust signals** — show Lemon Ideas / BIO branding on all pages. Kids + parents need to trust it.

---

## 7. Illustration & Icon Style

- **Icons:** Use Lucide or Heroicons — outline style, 24px default, 2px stroke
- **Hero illustrations:** Flat-style with brand yellow + green. Think: rocket, trophy, books, lightbulb, India map silhouette. SVG inline, not stock photos.
- **Avatars:** Colorful initial avatars with brand gradient background. No grey placeholders.
- **Empty states:** Friendly illustration + warm message. E.g., "No exams yet — check back soon!"
- **Achievement badges:** Shield / star / medal shapes using brand gradient fill.

---

## 8. Animation Guidelines

```
Micro-interactions:   150ms ease-out  (hover, focus, button press)
Page transitions:     250ms ease-out  (fade + 8px slide)
Modals:               300ms ease-out  (scale 0.95→1 + fade)
Progress fill:        400ms ease      (number count-up + bar fill)
Success celebration:  600ms           (bounce + confetti burst)
Timer pulse (danger): 1s infinite     (glow pulse on red timer)
Skeleton loaders:     1.5s shimmer
```

**Respect `prefers-reduced-motion`** — disable all non-essential animations.

---

## 9. STUDENT PORTAL — All Pages

### 9.1 Landing Page (`/`)

**Purpose:** Convert visitors (students + parents) to register.

**Layout:** Full-width, single scroll, 4 sections.

**Section 1 — Hero:**
- Navbar: BIO logo left, "Login" + "Register" CTAs right
- Center: BIO logo large (80px h) with green leaf glow drop-shadow
- Tagline separator: thin brand gradient line with "by Lemon Ideas" centered
- H1 (split line): "Bharat Innovation" on line 1, "Olympiad 2026" on line 2 with "2026" in brand gradient
- Subtext: "The national science & technology competition for students of Classes 6–12"
- 2 CTAs: [Register Now →] (brand gradient, XL) + [Learn More] (ghost)
- Trust stats row: "12,000+ Students" · "28 States" · "3 Subjects" — each as a mini stat with a number in gradient text
- Background: light warm white with subtle hero glow from top center (yellow radial gradient)
- Floating decorative SVG shapes: lemon/lightbulb icon + leaf motifs at corners, very faint (opacity 0.06)

**Section 2 — How it Works:**
- "3 Simple Steps" heading
- 3 step cards with icon + number badge + description:
  1. Register & Create Profile (👤 icon)
  2. Book Your Exam Slot (📅 icon)
  3. Appear & Win Prizes (🏆 icon)
- Step connector line between cards (dashed, brand gradient)

**Section 3 — Why BIO?:**
- "Why choose Bharat Innovation Olympiad?" heading
- 6 feature cards in 3×2 grid:
  - 🔒 Fully Secure — Anti-cheat, proctored exam
  - ⏱️ Fair Timing — Server-authoritative countdown
  - 📊 Instant Results — Scores available immediately
  - 🏅 National Rankings — Compete with students across India
  - 🧪 Expert Questions — Curated by top educators
  - 📱 Any Device — Works on laptop, tablet, desktop
- Cards: white bg, brand accent left border, icon in yellow circle

**Section 4 — Footer:**
- Logo + tagline
- 3 column links: Students / Schools / About
- Copyright + "Made with ❤️ by Lemon Ideas"

---

### 9.2 Login Page (`/login`)

**Layout:** Split screen (left: illustration, right: form) on desktop. Stack on mobile.

**Left panel:** 
- Background brand gradient (yellow→green diagonal)
- Large BIO logo centered (white filter)
- Tagline in white
- 3 mini trust badges: "Secure OTP Login" · "No Password Needed" · "Instant Access"
- Decorative: floating question marks, stars, books in white opacity 0.15

**Right panel:**
- White card, max-width 400px, centered vertically
- "Welcome Back!" heading (Nunito 800)
- Subtext: "Enter your registered email to receive a login OTP"
- Email input with 📧 icon prefix
- [Send OTP →] primary button (full width)
- OTP input (6 large digit boxes, auto-focus advance) — shows after email submitted
- [Verify & Login] button
- "New here? Register →" link at bottom
- Lemon Ideas byline at very bottom

---

### 9.3 Register Page (`/register`)

**Layout:** Centered card, max-width 520px, multi-step form.

**Step indicator:** 3 dots with connecting line at top of card — Step 1: Email, Step 2: Verify OTP, Step 3: Profile.

**Step 1 — Email:**
- "Join BIO 2026" heading
- Email input + [Send OTP →]

**Step 2 — Verify OTP:**
- "Check your inbox!" heading with 📬 icon
- OTP 6-box input
- "Resend in 0:45" countdown
- [Verify →]

**Step 3 — Complete Profile:**
- "Tell us about yourself" heading
- 2-column grid: First Name / Last Name inputs
- Class (dropdown: Class 6 through Class 12) with school icon
- School search (type-ahead dropdown with school name + city)
- Phone number (optional, helper: "For exam reminders")
- [Create My Account 🎉] CTA (full width, brand gradient)
- Privacy note in caption: "Your data is secured and never shared."

---

### 9.4 Student Dashboard (`/dashboard`)

**Layout:** Navbar (sticky) + main content area with left sidebar (hidden on mobile, hamburger toggle).

**Navbar:**
- BIO logo + name left
- Links: Dashboard · Exams · Profile
- Notification bell (badge count)
- User avatar + name + "Class 10" chip
- Theme toggle

**Left Sidebar (280px):**
- Student avatar (large, gradient circle with initials)
- Student name + class + school
- Progress ring: "Profile X% complete" in brand gradient
- Quick links: My Exams / Results / Admit Card / Help

**Main Content:**
- Greeting: "Good morning, Arjun! 👋" (Nunito 800, 28px)
- Subtext: "You have 1 upcoming exam. All the best! 🍀"
- **Stats row** (4 cards): Exams Available · Exams Attempted · Best Score · Rank
  - Numbers large (Nunito 900, gradient text), icon in brand yellow circle
- **Upcoming Exams** section:
  - Section heading + "View All →" link
  - Exam cards (horizontal list): exam name, subject chips, date/time, duration, [View Details] CTA
  - Empty state: illustration of a student + "No upcoming exams. Check back soon!"
- **Recent Results** section:
  - Score cards with circular progress ring showing percentage, exam name, date
  - Correct / Wrong / Skipped mini stat row per card

---

### 9.5 Exam List Page (`/exams`)

**Layout:** Page header + filter bar + card grid.

**Filter bar:**
- Subject filter chips: All · Science · Math · Technology
- "Available for Class X" auto-applied chip (dismissible)
- Search input (exam name)

**Exam Cards** (3-column grid, 2 on tablet, 1 on mobile):
- Top: color strip with subject icon (🔬 Science, ➕ Math, 💻 Tech)
- Card body: exam title (bold), description (2 lines clamped), class badge
- Meta row: 🕐 Duration · 📝 Questions · ⭐ Marks
- Status badge: [Available] [Registration Open] [Upcoming] [Closed]
- Footer: Date range + [View Details →] button

**Empty state:** Friendly SVG + "No exams available for your class right now. Check back later!"

---

### 9.6 Exam Instructions Page (`/exams/[id]/instructions`)

**Layout:** Centered single-column, max-width 720px.

**Header card:**
- Exam title (large, Nunito 800)
- Subject chip + Class chip + Duration badge
- "Exam Slot: 10 Jun 2026, 10:00 AM – 12:00 PM" with calendar icon

**Device Check card:**
- "Before You Begin" heading
- 3 check items (webcam ✅, fullscreen ✅, stable connection ✅)
- Each with icon: green checkmark (pass) / red X (fail) / spinning dot (checking)
- Error state: "Your browser doesn't support fullscreen. Please use Chrome/Edge."

**Instructions card:**
- "Exam Rules" heading with ⚠️ icon
- Numbered list (not bullets) — large enough for kids to scan:
  1. Exam must be taken in fullscreen mode — exiting = violation
  2. Webcam must remain on throughout
  3. 3 violations = automatic submission
  4. Negative marking applies: -0.5 per wrong answer
  5. Do not switch tabs or windows
  6. ... etc
- SEB notice (if requireSeb): amber warning card with download link

**Marking Scheme card:**
- 3-column grid: ✅ Correct (+2 marks) · ❌ Wrong (−0.5 marks) · ⬜ Skipped (0 marks)

**CTA section:**
- Large [🚀 Start Exam] button (brand gradient, xl size, full width on mobile)
- Caption: "You have 2 hours once you begin. Make sure you're ready!"
- [← Back to Exams] ghost link

---

### 9.7 Exam Player (`/exams/[id]/play`)

**This is the most critical page — maximum focus, minimum distraction.**

**Overall layout:** 2-column grid (main panel 1fr, sidebar 280px fixed right). 100vh, overflow hidden. Fullscreen only.

**Top Header bar (64px, sticky):**
- Left: BIO mini logo + exam title (truncated)
- Center: Timer display (monospace font, large — 32px) with color states:
  - Normal: white on dark bg
  - Warning (<10 min): amber background pulse
  - Danger (<3 min): red background fast pulse + shake animation
- Right: 
  - Question progress "Q 12 / 45"
  - Webcam mini thumbnail (60×45px) + green live dot
  - [🏳️ Flag] icon button + [Submit Exam] button (danger/outline)

**Main panel — Question area:**
- Question number chip (e.g., "Question 12")
- Section label chip (e.g., "Physics")
- Question text (18px, Inter, generous padding, white-bg card, radius-lg)
  - Support for LaTeX rendering (placeholder for equations)
  - Support for question images (centered, max 60% width)
- Options list (A/B/C/D):
  - Large option rows (min 60px height)
  - Option letter in a circle (bold)
  - Full text next to it
  - Selected state: border changes to brand yellow, left strip accent, background tint
  - Hover: subtle lift + border color change
- Navigation row: [← Previous] · [Clear Answer] · [Next →]

**Right Sidebar:**
- Section tabs (if multi-section exam): Physics · Chemistry · Math — scrollable tabs
- "Question Navigator" grid (5 cols × N rows):
  - Answered: green fill
  - Current: yellow border + fill tint
  - Flagged: amber fill
  - Unanswered: empty/outline
- Legend below grid (color → meaning)
- Progress bar: "32 of 45 answered"
- [Submit Exam] button (full width, danger colored, prominent)

**Violation Overlay (fullscreen gate):**
- Blurred dark overlay (backdrop-filter blur 24px)
- Warning icon (large, amber)
- "You Exited Fullscreen" heading
- Violation count display: "⚠️ Warning 2 of 3"
- Progress: 2 red dots filled, 1 empty — very visual
- Auto-submit countdown: "Auto-submitting in 0:18" (red, urgent)
- [↩ Return to Fullscreen] primary button (large, prominent)

---

### 9.8 Results Page (`/results`)

**Layout:** Centered, max-width 860px.

**Hero result card (top, prominent):**
- Confetti animation on load (for pass/high score)
- Circular score ring (SVG): large donut chart showing percentage
  - Inside: score number (large, gradient), "/total"
  - Ring color: green (>60%) / amber (40–60%) / red (<40%)
- Exam name + date
- Status badge: [✅ Submitted] or [⏰ Auto-submitted]
- 4 stat chips below ring: Correct · Wrong · Skipped · Time Taken

**Section-wise breakdown accordion:**
- Each section: section name, correct/total, mini progress bar
- Expandable: shows each question with student answer + correct answer + explanation

**Performance message card:**
- Personalized message based on score band:
  - >80%: "Outstanding! 🏆 You're among the top performers."
  - 60–80%: "Great work! Keep practicing and you'll ace it next time."
  - <60%: "Good attempt! Review the topics below and try again."

**Action buttons row:**
- [📥 Download Report] · [🔁 Practice Again] · [← Back to Dashboard]

---

### 9.9 Profile Setup Wizard (`/profile/setup`)

**Layout:** Centered card, max-width 640px, 4-step wizard.

**Step progress bar:** 4 steps, active step highlighted in brand yellow. Step labels below each dot.

**Step 1 — Personal Info:**
- First Name, Last Name (2-col)
- Phone number (with +91 prefix picker)
- Date of Birth (date input)
- Parent name + parent phone

**Step 2 — School:**
- School search (type-ahead, shows school name + city + board)
- "Can't find your school?" link (manual entry fallback)
- Class selector (large tiles: "6" "7" "8" ... "12" — tap to select)

**Step 3 — Photo:**
- Profile photo upload: dashed border dropzone with camera icon
- Preview thumbnail after upload
- "Take a clear selfie — used for identity verification during exam"
- Upload progress bar

**Step 4 — Documents:**
- Document type selector: School ID / Marksheet / Other
- File dropzone
- Uploaded files list with status
- [Complete Profile →] CTA

**Bottom of each step:** [← Back] ghost · [Continue →] primary

---

### 9.10 Slot Booking Page (`/exams/[id]/slots`)

**Layout:** Page with exam summary header + slot grid.

**Exam header:** Title, date range, fee amount badge.

**Slot grid (2-column):**
- Each slot card:
  - Date (large, Nunito bold)
  - Time range
  - Availability bar: "120 of 200 seats available" + colored progress bar
  - [Book This Slot] button
  - "Full" badge overlay when booked >= capacity
  - "Your Slot" highlighted badge if already booked

**Selected slot confirmation modal:**
- Slot details recap
- Fee amount (or "FREE" in green)
- [Proceed to Payment →] or [Confirm Free Booking →]

---

### 9.11 Payment Page (`/payment/[bookingId]`)

**Layout:** 2-column: left = order summary, right = payment.

**Order Summary card:**
- Exam name
- Slot: date + time
- Fee breakdown (if applicable): Base fee + taxes
- Coupon input with [Apply] button
- Total amount (large, bold)

**Payment card:**
- Razorpay checkout button (styled to match brand)
- Security note: "🔒 Secure payment via Razorpay. Your card details are never stored."

---

### 9.12 Payment Success + Admit Card (`/payment/success`)

**Layout:** Centered celebration card.

- ✅ Green checkmark animation (bounce in)
- "Booking Confirmed! 🎉" heading
- Slot summary
- [📥 Download Admit Card] primary CTA
- [← Back to Dashboard] secondary

---

### 9.13 Notifications Page (`/notifications`)

**Layout:** Navbar + centered list, max-width 720px.

**Notification items:**
- Icon (bell / 🎉 / ⚠️ based on type) in colored circle
- Title + body text (2 lines)
- Timestamp (relative: "2 hours ago")
- Unread: left accent border + very light tint background
- [Mark All Read] button in page header

---

## 10. ADMIN PORTAL — All Pages

*Admin portal uses the **dark theme** by default. Professional, data-dense, sidebar nav.*

### Global Admin Layout

**Sidebar (240px, fixed left):**
- BIO logo + "Admin Portal" at top
- Nav sections:
  - Overview: Dashboard
  - Exams: Exams · Question Bank · Analytics
  - Students: Students · Schools · Slots
  - Finance: Payments · Coupons
  - Monitoring: Live Proctor · Audit Log
  - System: Notifications · Roles · Settings
- Active state: brand yellow left border + yellow text
- Hover: subtle bg tint
- Bottom: logged-in admin avatar + name + [Logout]

**Top bar:**
- Page title (dynamic) + breadcrumb
- Search bar (global)
- Notification bell
- Quick actions: [+ New Exam] if on exams

---

### 10.1 Admin Dashboard (`/dashboard`)

**Stats row (4 KPI cards):**
- Total Students (registered)
- Active Exams
- Total Attempts Today
- Revenue This Month
- Each card: icon in brand circle, number (large, gradient), label, trend arrow (+12% vs last week)

**Charts row (2-column):**
- Left: Line chart — daily attempts last 30 days (brand yellow line, subtle fill)
- Right: Donut chart — attempts by subject

**Recent Activity table:**
- Columns: Student, Exam, Score, Status, Time
- Clickable rows → attempt detail

**Alerts card:**
- Recent proctor flags (last 1 hour)
- If none: green "All clear ✅"

---

### 10.2 Exam Management (`/exams`)

**Split layout: exam list left, detail panel right (master-detail on desktop). Tabs on mobile.**

**Exam List:**
- Search + filter bar (status: Draft / Published / Closed)
- Each exam row: title, class chips, question count, status badge, [Edit] [Analytics] [...more]
- [+ Create New Exam] prominent CTA in header

**Exam Detail Panel (right side):**

*Tabs: Overview | Sections & Questions | Instances | Analytics*

**Overview tab:**
- Exam title (editable inline)
- Metadata: class bands, duration, total marks, published toggle
- Description textarea
- Difficulty split: Easy/Medium/Hard percentage sliders (visual, brand gradient)

**Sections & Questions tab:**
- Section list (drag-reorder handle)
- Each section expands: question list (drag to reorder)
- [+ Add Question] inline in section
- [+ Create Section] button
- Bulk import: [↑ Upload JSON] button → shows preview modal before confirming
- Question preview card: shows text (truncated), difficulty badge, marks, [Edit] [Remove]

**Instances tab:**
- Timeline view: instances as event blocks on a date axis
- Each block: start/end time, slot count, [Edit] [Delete]
- [+ Schedule New Instance] CTA

---

### 10.3 Question Bank (`/questions`)

**Layout:** Filter sidebar (left, collapsible) + question table.

**Filter sidebar:**
- Difficulty (EASY / MEDIUM / HARD checkboxes)
- Subject tags (multi-select chips)
- Exam (which exam uses it)
- Class band

**Question table:**
- Columns: Preview (first 60 chars), Type, Difficulty, Marks, Used In, Actions
- Row hover reveals [Edit] [Duplicate] [Delete]
- [+ New Question] and [↑ Bulk Import] in header
- Inline question editor (slide-out panel):
  - Question text (rich textarea)
  - 4 option inputs (A/B/C/D) + correct answer radio
  - Marks + negative marks inputs
  - Tags input (chip-style)
  - Explanation (optional)

---

### 10.4 Exam Analytics (`/analytics`)

**Filter row:** Exam selector dropdown + date range picker.

**Summary KPIs (4 cards):**
- Avg Score (with % bar)
- Completion Rate
- Median Time
- Top Score

**Charts row:**
- Score distribution: Bar chart (10% buckets: 0-10, 10-20, ... 90-100). Brand yellow bars.
- Question difficulty analysis: scatter plot (avg time vs avg correct rate per question)
- Attempt over time: area chart

**Top Performers table:**
- Rank · Name · School · Score · Time · [View Report]

**Proctor flags summary:**
- Number of flagged attempts + breakdown by type (pie chart)

---

### 10.5 Per-Attempt Detail (`/analytics/attempt/[id]`)

**Student info header:**
- Avatar + Name + Class + School
- Score ring + stats
- Attempt status badge + timestamps

**Proctor Timeline:**
- Horizontal scrollable timeline showing events as color-coded dots
- Red = violation, Amber = warning, Green = normal
- Hover tooltip: event type + details + timestamp
- Event log table below: type, severity, details, time

**Question-by-question breakdown:**
- Table: Q# · Question preview · Student Answer · Correct Answer · Score · Time Spent
- Row color: green (correct) / red (wrong) / grey (skipped)

---

### 10.6 School Management (`/schools`)

**Tabs:** Pending (with count badge) · Verified · Rejected

**School card list:**
- School name + city + state
- UDISE code badge
- Board chip: CBSE / ICSE / State Board
- Student count
- Status badge
- [Approve ✅] [Reject ❌] action buttons (Pending tab only)

**School detail side panel:**
- All school info
- Message thread with school admin
- Student roster (count by status)

---

### 10.7 Student Verification Queue (`/students`)

**Filter tabs:** Pending · Verified · Rejected

**Student verification card:**
- Photo thumbnail
- Name, Class, School
- Documents uploaded (list with status)
- [View Documents] → modal with image viewer
- [Approve] [Reject with Reason] actions

---

### 10.8 Slot Management (`/slots`)

**Layout:** Exam selector → slot list below.

**Slot cards:**
- Date + time range
- Capacity + booked count
- Availability progress bar (green → amber → red as fills up)
- [View Bookings] shows students table

**[+ Create Slot] form:**
- Date/time pickers (start + end)
- Capacity input
- Exam instance selector

---

### 10.9 Payments & Revenue (`/payments`)

**Summary cards row:**
- Total Revenue · This Month · Pending · Refunds

**Payments table:**
- Student · Exam · Amount · Status · Date · Invoice · Actions
- Status chips: Paid (green) / Pending (amber) / Failed (red) / Refunded (grey)
- [Refund] action (danger, with confirmation modal)

**Coupon management panel (right sidebar or tab):**
- Coupon list: code, discount%, usage counter
- [+ Create Coupon] form: code, discount%, max uses, expiry

---

### 10.10 Live Proctor Monitoring (`/proctor`)

**Auto-refreshes every 30s. Shows alerts from last 5 minutes.**

**Page header:** "Live Monitoring" + last-refreshed timestamp + auto-refresh toggle.

**Alert grid (3-column):**
- Each student card:
  - Name + exam
  - Violation type badge (EXIT_FULLSCREEN / TAB_SWITCH / MULTIPLE_FACES / NO_FACE)
  - Severity indicator: 3 red dots for high, 2 amber for medium, 1 green for low
  - Timestamp: "2 mins ago"
  - [View Attempt →] link
- Cards sorted by severity desc, then by time desc
- Empty state: "🟢 No active flags in the last 5 minutes"

---

### 10.11 Audit Log (`/audit`)

**Filter bar:**
- Action type (CREATE / UPDATE / DELETE)
- Resource (exam / question / attempt / user)
- User search
- Date range picker

**Log table:**
- Timestamp · User · Action badge · Resource · IP Address · [View Details]
- Details modal: full request body JSON

---

### 10.12 Notification Templates (`/notifications`)

**Left: Template list**
- Template name + channel chip (EMAIL / SMS / WHATSAPP / IN_APP)
- Last edited timestamp
- [Edit] action

**Right: Template editor**
- Subject input (email only)
- Body editor with `{{variable}}` syntax highlighting
- Variable hints: `{{studentName}}`, `{{examName}}`, `{{slotTime}}`, etc.
- Preview tab: renders template with sample data
- [Save Template] + [Send Test] buttons

**Broadcast panel (bottom):**
- Select template
- Filter: All students / By school / By class / By status
- Estimated recipients count
- [Send to X Recipients] with confirmation modal

---

### 10.13 Roles Management (`/roles`)

**User table with role management (SUPER_ADMIN only):**
- Avatar · Name · Email · Current Role · Last Active · [Change Role ▼]
- Role dropdown: STUDENT / SCHOOL_ADMIN / ADMIN / SUPER_ADMIN
- Confirmation modal before saving

**2FA Status column:**
- For admin users: shows [Enabled ✅] or [Not Set Up ⚠️]

---

## 11. Shared Patterns

### Navigation States
- Current page: brand yellow text + subtle yellow tint background in nav
- Breadcrumbs: Home › Exams › National Science Olympiad

### Loading States
```
Page load:   Skeleton shimmer cards (grey → lighter grey animated)
Button load: Spinner replaces icon, button disabled
Data fetch:  Skeleton rows in tables
```

### Empty States
Every empty state needs:
1. Friendly SVG illustration (brand colors)
2. Heading: "Nothing here yet"
3. Subtext: Contextual explanation
4. CTA if applicable (e.g., "Create your first exam")

### Error States
- Form validation: red border + message below field
- API error: toast notification (top-right, 4s auto-dismiss)
- Page error: friendly card with refresh/go-home option

### Toast Notifications
```
Position: top-right
Types:     success (green) / error (red) / warning (amber) / info (blue)
Duration:  4s auto-dismiss
Shape:     pill / rounded card with icon + text + X close
Animation: slide in from right, fade out
```

### Modal Dialogs
```
Overlay:   rgba(0,0,0,0.5) with blur(8px)
Modal:     white/dark card, max-width 480px, radius-xl
Header:    title + X close
Footer:    [Cancel] ghost + [Confirm] primary (or danger for destructive)
Animation: scale 0.95→1 + fade in (250ms)
```

---

## 12. Responsive Breakpoints

```
Mobile:   < 640px   (xs)
Tablet:   640–1024px (sm–md)
Desktop:  1024–1440px (lg–xl)
Wide:     > 1440px  (2xl)
```

**Student portal** must be fully usable on tablets (many school kids use tablets).
**Admin portal** optimized for 1280px+ desktop but functional at 1024px.

**Exam player** — desktop only enforced (fullscreen requirement). Mobile shows "Please use a desktop/laptop to take the exam" warning page.

---

## 13. Accessibility Requirements

- All color combinations WCAG AA compliant (4.5:1 ratio for body text, 3:1 for large text)
- Focus rings on all interactive elements (2px brand yellow outline, 2px offset)
- All images have alt text
- Form inputs have associated labels
- Error messages use `aria-live` regions
- Timer announces "5 minutes remaining" and "1 minute remaining" via `aria-live`
- Keyboard navigation works for exam (arrow keys to navigate options, Enter to select, Tab between questions)

---

## 14. Design Deliverables Expected

1. **Design tokens file** (CSS variables / Figma variables) — colors, spacing, radius, shadows, typography
2. **Component library** — all atoms (buttons, inputs, badges, chips) + molecules (cards, forms, modals)
3. **Student portal** — all 13 pages (desktop + tablet + mobile for each)
4. **Admin portal** — all 13 pages (desktop only with 1024px fallback)
5. **Exam player** — desktop full-screen state + violation overlay + all timer states
6. **Styleguide page** — showing all components + brand palette + typography scale

---

## 15. File Handoff Notes

- All components should be implemented in **Next.js + Tailwind CSS + custom CSS variables**
- Existing CSS variable names in `globals.css` should be preserved and extended (not replaced)
- The `lemon-ideas-logo.png` is at `frontend/public/lemon-ideas-logo.png` — use in navbar + landing
- Fonts loaded via Google Fonts: Inter (existing) + Nunito (add for headings/display)
- Tailwind config should extend `colors` with all brand tokens above
- Icon library: Lucide React (`npm install lucide-react`)
- All animations should respect `prefers-reduced-motion`
- Student portal uses **light theme by default** (override existing dark default)
- Admin portal keeps **dark theme as default**
