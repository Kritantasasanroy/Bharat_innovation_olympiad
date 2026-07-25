"use client";

import { useEffect } from "react";
import { captureReferralFromUrl } from "../lib/referral";

/**
 * Renders nothing; captures a `?ref=CODE` from the URL on first load so a school
 * arriving via a partner's onboarding link is attributed when it applies.
 * Mounted once at the app root.
 */
export function ReferralCapture() {
	useEffect(() => {
		captureReferralFromUrl();
	}, []);
	return null;
}
