'use client';

import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { schoolPartnerMailto } from '@/lib/copy/landing';

/**
 * "Become a School Partner" inquiry (#22).
 *
 * The brief wants the request to arrive **by mail**, and this change is
 * frontend-only — so the form composes a prefilled email in the visitor's
 * own mail client instead of POSTing anywhere. A form (rather than a bare
 * mailto link) because it tells the school exactly which fields the
 * partnership team needs, and the compose window that opens carries them
 * all, structured.
 */
export default function SchoolPartnerForm({ email }: { email?: string }) {
    const [school, setSchool] = useState('');
    const [city, setCity] = useState('');
    const [contact, setContact] = useState('');
    const [reach, setReach] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (!school.trim() || !contact.trim() || !reach.trim()) {
            setError('Please fill in the school name, a contact person and a way to reach you.');
            return;
        }
        window.location.href = schoolPartnerMailto({
            to: email,
            school: school.trim(),
            city: city.trim() || '—',
            contact: contact.trim(),
            phoneEmail: reach.trim(),
        });
    };

    return (
        <div className="lp-school-form">
            <div className="lp-school-form__head">
                <span className="lp-icon-wrap" style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(125,200,50,0.12)' }}>
                    <Mail size={20} color="#7dc832" />
                </span>
                <div>
                    <h3>Become a School Partner</h3>
                    <p>
                        Bring the Innovation Olympiad to your school — training, assessment and a
                        detailed innovation report for every participant. Leave your details and
                        our team will get in touch.
                    </p>
                </div>
            </div>
            <div className="lp-school-form__grid">
                <input aria-label="School name" placeholder="School name *" value={school} onChange={(e) => setSchool(e.target.value)} />
                <input aria-label="City" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                <input aria-label="Contact person" placeholder="Contact person *" value={contact} onChange={(e) => setContact(e.target.value)} />
                <input aria-label="Phone or email" placeholder="Phone or email" value={reach} onChange={(e) => setReach(e.target.value)} />
            </div>
            {error && <p className="lp-school-form__error">{error}</p>}
            <button type="button" className="lp-btn-primary lp-school-form__submit" onClick={handleSubmit}>
                <Send size={15} /> Send inquiry by email
            </button>
            <p className="lp-school-form__hint">
                Opens your email app with the details filled in — nothing is stored on this site.
            </p>
        </div>
    );
}
