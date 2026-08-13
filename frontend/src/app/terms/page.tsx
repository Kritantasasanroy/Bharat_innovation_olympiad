import Link from 'next/link';
import { TERMS_VERSION } from '@/lib/constants';

/**
 * Terms & conditions for the olympiad.
 *
 * Referenced by the checkbox on the registration presence step, whose accepted
 * version is recorded against the student. Bump `TERMS_VERSION` in
 * `lib/constants.ts` whenever anything here changes materially, so an old
 * acceptance is never mistaken for agreement to new text.
 *
 * ⚠️ DRAFTING NOTE: this text was written to be complete and accurate about how
 * the product actually behaves — the fee, the proctoring, the slot lock, the
 * disqualification path, the data handling. It has NOT been reviewed by a lawyer.
 * Have counsel review it before the season opens, particularly the DPDP and
 * refund clauses.
 */

const SECTIONS: { heading: string; paragraphs: string[]; list?: string[] }[] = [
    {
        heading: '1. Who may participate',
        paragraphs: [
            'The Bharat Innovation Olympiad ("the Olympiad") is open to participants studying in Grades 6 to 12 at a recognised school in India. One account per participant. A participant may hold only one registration per season.',
            'Registration must be completed by the participant, with a parent or legal guardian present. The face scan captured during registration identifies the participant in every exam they sit; enrolling any other person\'s face is grounds for disqualification.',
        ],
    },
    {
        heading: '2. Parental consent and children\'s data',
        paragraphs: [
            'Every participant is a minor or may be a minor. In line with the Digital Personal Data Protection Act, 2023, we collect verifiable consent from a parent or legal guardian before a ward sits any exam. That consent covers both the ward\'s participation and the processing of their personal data for the purposes described below.',
            'A parent or guardian may withdraw consent at any time by contacting us. Withdrawal after an exam has been sat does not oblige us to delete results already published, but no further processing will take place.',
        ],
    },
    {
        heading: '3. Registration fee',
        paragraphs: [
            'The registration fee is a one-time platform fee. Paying it unlocks every published Olympiad exam on the account for the current season. There is no per-exam charge and no renewal within the season.',
            'The fee is NON-REFUNDABLE and NON-TRANSFERABLE. It cannot be moved to another participant, another account, or a later season. This applies whether or not the participant goes on to sit an exam.',
            'The free practice paper is available without payment.',
        ],
    },
    {
        heading: '4. Exam schedules',
        paragraphs: [
            'Each exam is sat on a schedule chosen by the participant, subject to availability. Places on each schedule are limited.',
            'A schedule selection is FINAL once confirmed and cannot be changed by the participant. Only the organisers may move a confirmed booking, at their discretion, and only where there is good reason. A participant who does not appear for their schedule has no automatic right to another sitting.',
        ],
    },
    {
        heading: '5. Exam conditions and proctoring',
        paragraphs: [
            'Exams are taken online under AI-assisted proctoring. By sitting an exam the ward and their guardian accept the following conditions.',
        ],
        list: [
            'The exam runs in fullscreen. Leaving fullscreen, switching tabs or opening another application is recorded and pauses the exam.',
            'The webcam must stay on for the whole exam. Face analysis runs inside the participant\'s own browser and no video is ever recorded or stored. Only the resulting events are transmitted, together with a single still photo captured at the moment a violation is recorded, which is kept with that attempt for human review.',
            'The following are logged: more than one face in frame, looking away from the screen for an extended period, no face in frame, a face that does not match the one enrolled, and leaving fullscreen or switching away.',
            'Repeated violations will cause the exam to be submitted automatically. Answers already given are preserved.',
            'The timer runs on our servers. It continues if the participant\'s connection drops.',
            'The participant must sit the exam alone, without notes, books, additional devices, or help from anyone.',
        ],
    },
    {
        heading: '6. Review, disqualification and appeals',
        paragraphs: [
            'Proctoring events do not by themselves decide anything. Where an exam raises serious concerns, a human reviewer examines the recorded evidence before any conclusion is drawn. A decision to disqualify is made by a person, is recorded with reasons, and is never automatic.',
            'A disqualified attempt receives no score, no rank and no certificate, and is excluded from the published results.',
            'A participant who believes a decision is wrong may raise a grievance from their results page. Grievances are reviewed by the organisers, whose decision is final.',
        ],
    },
    {
        heading: '7. Results and certificates',
        paragraphs: [
            'Immediately after an exam the participant may see a PROVISIONAL, unverified score. A provisional score is not a result: it may change as a consequence of proctoring review, grievances, or the fair-score normalisation applied across all participants.',
            'Final scores, ranks, percentiles, dimension-wise analysis and the answer key are published once the season\'s marking and verification are complete. Only published final results are authoritative.',
            'Certificates are issued for completed exams and carry a verification number that anyone can check.',
        ],
    },
    {
        heading: '8. What we do with personal data',
        paragraphs: [
            'We collect the participant\'s name, email, mobile number, class, section, school, a face template, parent or guardian contact details, optional demographic details, and the records generated by taking an exam.',
            'We use them to run the Olympiad: to identify the participant, to deliver and proctor exams, to mark and rank, to issue certificates, and to contact the ward and their guardian about the Olympiad.',
            'The face scan is stored as an encrypted mathematical descriptor, not as an image, and is used only to check that the person sitting an exam is the person who registered.',
            'Results may be shared with the participant\'s school and, where a school or partner enrolled the participant, with that partner. We do not sell personal data.',
            'A parent or guardian may request access to, correction of, or deletion of their child\'s personal data by contacting us through the support page.',
        ],
    },
    {
        heading: '9. Technology requirements',
        paragraphs: [
            'It is the participant\'s responsibility to have a suitable device, browser and internet connection, as published on the registration and instructions pages. We are not responsible for an exam disrupted by the participant\'s own equipment, power supply or internet connection.',
            'The practice paper exists so these can be checked in advance, and we strongly recommend using it on the same device the participant intends to use for the real exam.',
        ],
    },
    {
        heading: '10. Changes to these terms',
        paragraphs: [
            'We may revise these terms. Each version is recorded, and the version a participant accepted is stored against their registration. Where a revision materially affects participants, we will ask for fresh acceptance rather than relying on the earlier one.',
        ],
    },
    {
        heading: '11. Contact',
        paragraphs: [
            'The Olympiad is organised by Lemon Ideas. For any question about these terms, your data, or a decision affecting a participant, use the support page in the portal.',
        ],
    },
];

export const metadata = {
    title: 'Terms & Conditions · Bharat Innovation Olympiad',
    description:
        'Participation terms for the Bharat Innovation Olympiad: eligibility, fees, exam conditions, proctoring, results and personal data.',
};

export default function TermsPage() {
    return (
        <div className="legal-page">
            <div className="legal-container">
                <Link href="/" className="legal-back">
                    ← Back to home
                </Link>

                <header className="legal-header">
                    <h1>Terms &amp; Conditions</h1>
                    <p className="legal-meta">
                        Bharat Innovation Olympiad · Version {TERMS_VERSION}
                    </p>
                    <p className="legal-intro">
                        Please read these terms before registering. Registering, and ticking the box
                        on the registration form, means the ward and their parent or guardian
                        accept them.
                    </p>
                </header>

                {SECTIONS.map((section) => (
                    <section key={section.heading} className="legal-section">
                        <h2>{section.heading}</h2>
                        {section.paragraphs.map((text) => (
                            <p key={text.slice(0, 40)}>{text}</p>
                        ))}
                        {section.list && (
                            <ul>
                                {section.list.map((item) => (
                                    <li key={item.slice(0, 40)}>{item}</li>
                                ))}
                            </ul>
                        )}
                    </section>
                ))}

                <footer className="legal-footer">
                    <p>
                        Questions about these terms? <Link href="/support">Contact support</Link>.
                    </p>
                </footer>
            </div>
        </div>
    );
}
