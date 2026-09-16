"""
Build STUDENT_PORTAL_CONTENT_CATALOG.xlsx
Catalogs instructional / informational / guideline content of the student portal.
Current Content and blank New Content columns are placed side by side.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Each row: (Area, CurrentContent, PortalLocation, DisplayLocation, CodeFile, Lines,
#            Trigger, Audience, Notes)
# NewContent column is intentionally left blank for reviewer.
ROWS = []

def add(area, current, portal_loc, display_loc, code_file, lines, trigger, audience, notes=""):
    ROWS.append((area, current, portal_loc, display_loc, code_file, lines, trigger, audience, notes))

# ============================================================
# 1. Shared copy / helpers  (src/lib/errors.ts)
# ============================================================
AREA = "Shared error helpers (errors.ts)"
add(AREA, "You appear to be offline, so we couldn't ${action}. Reconnect to the internet and try again, nothing you've entered has been lost.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "56",
    "navigator.onLine === false", "Student (any logged-in user)",
    "Template: ${action} is filled by caller, e.g. 'save your details'.")
add(AREA, "We couldn't reach our servers to ${action}. This is usually a brief connection problem, check your internet and try again in a moment.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "63",
    "No response from server (network/timeout)", "Student (any logged-in user)",
    "Template: ${action} interpolated.")
add(AREA, "${fromServer}",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "67-72",
    "HTTP 400/422 with a usable server message", "Student (any logged-in user)",
    "Pass-through of server-provided message; review with backend team.")
add(AREA, "Some of the details weren't accepted. Check what you've entered and try again.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "72",
    "HTTP 400/422 with no usable server message", "Student (any logged-in user)", "")
add(AREA, "Your session has expired, so we couldn't ${action}. Please sign in again, your progress is saved.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "75",
    "HTTP 401", "Student (any logged-in user)", "Template: ${action} interpolated.")
add(AREA, "You don't have permission to ${action}. If you think that's wrong, contact support and we'll sort it out.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "78",
    "HTTP 403", "Student (any logged-in user)", "Template: ${action} interpolated.")
add(AREA, "We couldn't find what we needed to ${action}. Refresh the page and try again; if it keeps happening, contact support.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "81",
    "HTTP 404", "Student (any logged-in user)", "Template: ${action} interpolated.")
add(AREA, "That's already been done, so we didn't ${action} again. Refresh the page to see the current state.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "84",
    "HTTP 409", "Student (any logged-in user)", "Template: ${action} interpolated.")
add(AREA, "That file is too large to upload. Pick a smaller one, or photograph the document again at a lower resolution, and try again.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "87",
    "HTTP 413", "Student (any logged-in user)", "")
add(AREA, "You've tried a few times in quick succession. Wait about a minute, then try again.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "90",
    "HTTP 429", "Student (any logged-in user)", "")
add(AREA, "Something went wrong on our side while trying to ${action}. It isn't anything you did. Please try again in a moment, if it keeps happening, contact support.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "93",
    "HTTP 500+", "Student (any logged-in user)", "Template: ${action} interpolated.")
add(AREA, "We couldn't ${action} just now. Please try again.",
    "Any form / action page", "Inline error / toast", "frontend/src/lib/errors.ts", "96",
    "Any other error (fallback)", "Student (any logged-in user)", "Template: ${action} interpolated.")

# Camera errors
AREA = "Camera error helpers (errors.ts)"
add(AREA, "Your browser is blocking the camera. Click the padlock (or camera icon) in the address bar, set Camera to Allow, then reload this page.",
    "Face enrollment / exam start", "Camera error banner", "frontend/src/lib/errors.ts", "113",
    "NotAllowedError / PermissionDeniedError", "Student", "")
add(AREA, "We couldn't find a camera on this device. Plug in a webcam, or switch to a laptop or tablet that has one built in.",
    "Face enrollment / exam start", "Camera error banner", "frontend/src/lib/errors.ts", "116",
    "NotFoundError / DevicesNotFoundError", "Student", "")
add(AREA, "Your camera is already being used by another app. Close Zoom, Meet, Teams or any other tab using the camera, then try again.",
    "Face enrollment / exam start", "Camera error banner", "frontend/src/lib/errors.ts", "119",
    "NotReadableError / TrackStartError", "Student", "")
add(AREA, "Your camera doesn't support the quality we need. Try a different camera if you have one.",
    "Face enrollment / exam start", "Camera error banner", "frontend/src/lib/errors.ts", "121",
    "OverconstrainedError", "Student", "")
add(AREA, "The camera can only be used on a secure connection. Make sure the address starts with https:// and try again.",
    "Face enrollment / exam start", "Camera error banner", "frontend/src/lib/errors.ts", "123",
    "SecurityError", "Student", "")
add(AREA, "We couldn't start your camera. Check that no other app is using it, allow camera access when your browser asks, then try again.",
    "Face enrollment / exam start", "Camera error banner", "frontend/src/lib/errors.ts", "125",
    "Any other camera error (fallback)", "Student", "")

# Oversize file
AREA = "Upload error helper (errors.ts)"
add(AREA, "That file is ${mb(bytes)} MB, and the limit is ${mb(maxBytes)} MB. Take the photo again at a lower resolution, or use your phone's built-in option to reduce the image size, then upload it again.",
    "Guardian / ID upload", "Upload error hint", "frontend/src/lib/errors.ts", "132",
    "File exceeds MAX_DOCUMENT_BYTES", "Student / Guardian", "Template: ${mb(bytes)} and ${mb(maxBytes)} interpolated.")

# Schools fallback
AREA = "School picker fallbacks (schools.ts)"
add(AREA, "Could not load schools.",
    "Registration - school picker", "School search error", "frontend/src/lib/schools.ts", "39",
    "School directory fails to load", "Student", "")
add(AREA, "No school has that code.",
    "Registration - school picker", "School code error", "frontend/src/lib/schools.ts", "47",
    "School code lookup fails", "Student", "")
add(AREA, "Could not add your school.",
    "Registration - school picker", "Add-school error", "frontend/src/lib/schools.ts", "60",
    "Add-school API fails", "Student", "")
add(AREA, "Could not find that pincode.",
    "Registration - school picker", "Pincode lookup error", "frontend/src/lib/schools.ts", "69",
    "Pincode lookup fails", "Student", "")

# OTP fallback
AREA = "OTP fallback (auth-client.ts)"
add(AREA, "Request failed (${res.status})",
    "Login / registration", "Generic OTP error", "frontend/src/lib/auth-client.ts", "19",
    "Neon OTP API failure", "Student", "Template: ${res.status} interpolated.")
add(AREA, "Could not send the code.",
    "Login / registration", "Phone OTP error", "frontend/src/lib/auth-client.ts", "107",
    "Phone OTP request fails", "Student", "")

# ============================================================
# 2. Exam integrity copy (examIntegrity.ts)
# ============================================================
AREA = "Exam integrity - violations (examIntegrity.ts)"
add(AREA, "You left fullscreen - The exam window stopped being fullscreen, usually the Escape key, F11, or the Windows/Command key. Return to fullscreen and stay there until you submit.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "46-48",
    "exit_fullscreen violation", "Exam participant", "Title / what / fix combined for review.")
add(AREA, "You switched away from the exam - This browser tab was hidden, which happens when another tab, window or app comes to the front. Keep only the exam on screen. Close other tabs and apps before continuing.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "52-54",
    "tab_switch violation", "Exam participant", "")
add(AREA, "The exam window lost focus - Something outside the exam took focus: another window, a notification, or a second screen. Click back into the exam and silence notifications on your device.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "58-60",
    "window_blur violation", "Exam participant", "")
add(AREA, "Your face was not visible - The camera could not find your face for several seconds in a row. Sit squarely in front of the camera with your face lit and unobstructed.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "64-66",
    "no_face violation", "Exam participant", "")
add(AREA, "You were looking away from the screen - The camera saw your face turned away from the screen for several seconds in a row. Keep your eyes on the exam. Look up only briefly if you must.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "70-72",
    "looking_away violation", "Exam participant", "")
add(AREA, "The face on camera did not match your profile - The face in frame did not match the photo you enrolled when you registered. Only the registered participant may sit this Innovation Olympiad exam. Make sure it is you in frame, well lit.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "76-78",
    "face_mismatch violation", "Exam participant", "")
add(AREA, "More than one person was on camera - The camera saw more than one face in the frame. Sit alone. Ask anyone else in the room to move out of the camera view.",
    "Exam player", "Violation banner", "frontend/src/lib/examIntegrity.ts", "82-84",
    "multiple_faces violation", "Exam participant", "")
add(AREA, "Screen capture attempt - A screenshot or print command was detected. Exam questions may not be copied, photographed or printed. Do not press Print Screen, Ctrl+P, or use any capture tool during the exam.",
    "Exam player", "Violation banner / capture mask", "frontend/src/lib/examIntegrity.ts", "88-90",
    "screen_capture violation", "Exam participant", "")
add(AREA, "Exam rule broken - An exam integrity rule was broken. Follow the on-screen instructions and keep the exam in fullscreen.",
    "Exam player", "Violation banner fallback", "frontend/src/lib/examIntegrity.ts", "97-99",
    "Unknown violation kind", "Exam participant", "")

AREA = "Exam integrity - consequences (examIntegrity.ts)"
add(AREA, "That is ${count} violation(s) recorded on this Innovation Olympiad exam. Your exam has not been stopped and you can carry on, but it has passed the point where a person will review what was recorded before your result is confirmed.",
    "Exam player", "Violation banner consequence line", "frontend/src/lib/examIntegrity.ts", "119",
    "count >= VIOLATION_REVIEW_THRESHOLD", "Exam participant", "Template: ${count} interpolated.")
add(AREA, "That is ${count} violation(s) recorded on this Innovation Olympiad exam. Nothing has been taken away, keep going. Violations are only a record, and a person reads them before anything is concluded.",
    "Exam player", "Violation banner consequence line", "frontend/src/lib/examIntegrity.ts", "121",
    "count < VIOLATION_REVIEW_THRESHOLD", "Exam participant", "Template: ${count} interpolated.")

AREA = "Exam integrity - auto-submit (examIntegrity.ts)"
add(AREA, "Time is up - Your allotted time for this Innovation Olympiad exam has run out, so the exam was submitted for you. Every answer you selected before the timer reached zero has been saved and counted. Unanswered questions are simply left blank.",
    "Exam player", "Auto-submit overlay", "frontend/src/lib/examIntegrity.ts", "191-193",
    "time_up auto-submit", "Exam participant", "")
add(AREA, "Exam ended: away too long - Your exam paused because ${cause}, and it was not brought back within ${secs} seconds, so it was submitted for you. Every answer you gave before the pause has been saved and counted. This attempt has been flagged for review by the exam team.",
    "Exam player", "Auto-submit overlay", "frontend/src/lib/examIntegrity.ts", "208-210",
    "paused_too_long auto-submit", "Exam participant", "Templates: ${cause}, ${secs} interpolated.")
add(AREA, "Could not reach the server.",
    "Exam player", "Auto-submit error line", "frontend/src/lib/examIntegrity.ts", "129",
    "Automatic or manual submission fails (no message available)", "Exam participant",
    "Fallback when neither res.data.message nor err.message is available.")

# ============================================================
# 3. Onboarding copy (lib/copy/onboarding.ts)
# ============================================================
AREA = "Onboarding - tech requirements (onboarding.ts)"
add(AREA, "Device: Laptop or desktop (preferred), or a tablet with a webcam",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "17",
    "Always when expanded", "Student", "")
add(AREA, "Webcam: Working, 720p or better",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "18",
    "Always when expanded", "Student", "")
add(AREA, "Microphone: Working",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "19",
    "Always when expanded", "Student", "")
add(AREA, "Internet: At least 2 Mbps",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "20",
    "Always when expanded", "Student", "")
add(AREA, "Browser: Google Chrome or Microsoft Edge, latest version",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "21",
    "Always when expanded", "Student", "")
add(AREA, "Screen: 1024 x 768 or larger",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "22",
    "Always when expanded", "Student", "")
add(AREA, "Operating system: Windows 10+, macOS 10.14+, or ChromeOS",
    "Registration presence / Too-small screen", "Tech requirements list", "frontend/src/lib/copy/onboarding.ts", "23",
    "Always when expanded", "Student", "")

AREA = "Onboarding - presence points (onboarding.ts)"
add(AREA, "The participant must be present - Registration ends with a face scan that identifies the participant in every exam. If someone else's face is enrolled, the participant will be flagged during their Innovation Olympiad exam and may be disqualified.",
    "Registration presence step", "Info card", "frontend/src/lib/copy/onboarding.ts", "37-38",
    "Always", "Student / Guardian", "")
add(AREA, "The camera will be switched on - We ask for camera permission to capture the face scan. It is stored as an encrypted set of numbers used to verify the participant during their exam, and this one photo is kept and printed on their certificate. During an exam a further photo is saved only if a violation is recorded, and it is kept with that Innovation Olympiad exam for the review team.",
    "Registration presence step", "Info card", "frontend/src/lib/copy/onboarding.ts", "42-47",
    "Always", "Student / Guardian", "")
add(AREA, "A parent or guardian is needed too - One section of the form is for a parent or guardian, including their consent. The participant cannot sit an exam until it is completed.",
    "Registration presence step", "Info card", "frontend/src/lib/copy/onboarding.ts", "51-53",
    "Always", "Student / Guardian", "")
add(AREA, "Keep a school or photo ID card handy - You will need it to fill in your school and class details accurately, and to have ready on exam day for verification.",
    "Registration presence step", "Info card", "frontend/src/lib/copy/onboarding.ts", "56-57",
    "Always", "Student / Guardian", "")
add(AREA, "Set aside about ten minutes - Registration runs in one sitting: details, email verification, face scan, the parent section, and payment.",
    "Registration presence step", "Info card", "frontend/src/lib/copy/onboarding.ts", "61-63",
    "Always", "Student / Guardian", "")

AREA = "Onboarding - next steps (onboarding.ts)"
add(AREA, "Choose your exam schedule - Places in each sitting are limited. Once you confirm a schedule it cannot be changed from your account, so pick a time you are certain about.",
    "Registration payment success", "Next-steps list", "frontend/src/lib/copy/onboarding.ts", "69-70",
    "After payment", "Student", "")
add(AREA, "Take the practice Innovation Olympiad exam - It runs in exactly the same environment as the real exam: fullscreen, webcam, timer and all. It is not scored, you can retake it, and it is required before your real Innovation Olympiad exam will start.",
    "Registration payment success", "Next-steps list", "frontend/src/lib/copy/onboarding.ts", "73-74",
    "After payment", "Student", "")
add(AREA, "Check your device early - Do not leave the camera and internet check until exam day. Run the practice Innovation Olympiad exam on the device you actually intend to use.",
    "Registration payment success", "Next-steps list", "frontend/src/lib/copy/onboarding.ts", "77-78",
    "After payment", "Student", "")
add(AREA, "On the day - Sit somewhere quiet and well-lit with a plain wall behind you, keep a school or photo ID nearby, and be signed in fifteen minutes before your schedule opens.",
    "Registration payment success", "Next-steps list", "frontend/src/lib/copy/onboarding.ts", "81-83",
    "After payment", "Student", "")

AREA = "Onboarding - thank-you (onboarding.ts)"
add(AREA, "You're registered. Welcome to the Olympiad. - Your place is confirmed and your roll number is issued. We have emailed it to you, so keep that email, as support will ask for it.",
    "Registration payment success", "Success card", "frontend/src/lib/copy/onboarding.ts", "88-90",
    "After payment confirmed", "Student", "")

AREA = "Onboarding - monitored activities (onboarding.ts)"
add(AREA, "Someone else in the picture as well as you",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "101",
    "Always", "Exam participant", "")
add(AREA, "You looking away from the screen for a long stretch",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "102",
    "Always", "Exam participant", "")
add(AREA, "Your face not being visible at all",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "103",
    "Always", "Exam participant", "")
add(AREA, "A face that is not the one you scanned when you registered",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "104",
    "Always", "Exam participant", "")
add(AREA, "Leaving fullscreen, switching tabs, or opening another app",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "105",
    "Always", "Exam participant", "")
add(AREA, "Taking a screenshot, or trying to print the Innovation Olympiad exam",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "109",
    "Always", "Exam participant", "")
add(AREA, "Nothing moving on your screen for a long stretch",
    "Exam instructions", "Rules list", "frontend/src/lib/copy/onboarding.ts", "110",
    "Always", "Exam participant", "")

# ============================================================
# 4. Mascot copy (lib/mascot.ts)
# ============================================================
AREA = "Mascot toasts (mascot.ts)"
add(AREA, "Limon is keeping an eye out, so just focus on your Innovation Olympiad exam.",
    "Exam player", "Mascot toast footer", "frontend/src/lib/mascot.ts", "56",
    "Every mascot toast", "Exam participant", "")
add(AREA, "Timer check - You're about a third of the way through. Keep going at your own pace, there's plenty of time left.",
    "Exam player", "Mascot toast", "frontend/src/lib/mascot.ts", "103-105",
    "30% elapsed", "Exam participant", "")
add(AREA, "Timer check - Two thirds of the way through. Great effort so far, remember an unanswered question costs the same as a wrong one, so attempt everything.",
    "Exam player", "Mascot toast", "frontend/src/lib/mascot.ts", "108-110",
    "60% elapsed", "Exam participant", "")
add(AREA, "Timer check - Final stretch. Now's a good moment to go back to anything you skipped rather than starting something new.",
    "Exam player", "Mascot toast", "frontend/src/lib/mascot.ts", "113-115",
    "90% elapsed", "Exam participant", "")
add(AREA, "${FINAL_WARNING_MINUTES} minutes left - Finish the question you are on, then check that every question has an answer. Your Innovation Olympiad exam is submitted automatically when the timer runs out.",
    "Exam player", "Mascot toast warning", "frontend/src/lib/mascot.ts", "118-120",
    "<= 3 minutes left", "Exam participant", "Template: ${FINAL_WARNING_MINUTES} interpolated.")

# ============================================================
# 5. Limon tours (lib/limon/tours.ts)
# ============================================================
AREA = "Limon tour - Registration (tours.ts)"
add(AREA, "Hi, I'm Limon! I'll help you register. It takes about ten minutes, and I'll explain each bit as we go. You can skip me any time.",
    "Registration", "Tour intro", "frontend/src/lib/limon/tours.ts", "67",
    "First /register visit", "Student", "")
add(AREA, "Six steps, in this order - Your details, your email code, a face scan, payment, then your parent's section. You can stop after the face scan and finish the rest later from your dashboard.",
    "Registration", "Tour step", "frontend/src/lib/limon/tours.ts", "71-72",
    "First /register visit", "Student", "")
add(AREA, "Choose your class carefully - This decides which Innovation Olympiad exam you sit and who you're ranked against, and it's final once it's set. If you pick the wrong one you'll need to raise a support ticket to fix it.",
    "Registration", "Tour step", "frontend/src/lib/limon/tours.ts", "78-79",
    "First /register visit", "Student", "")
add(AREA, "Find your school, then your section - Just type the school's name. Only use a school code if your school actually gave you one. Most participants don't have one, and you can add your school if it isn't listed. Once you pick it, put your section exactly as your school writes it: A, B2, Rose. Write NA if your school doesn't use sections.",
    "Registration", "Tour step", "frontend/src/lib/limon/tours.ts", "89-90",
    "First /register visit", "Student", "")
add(AREA, "One thing I have to be firm about - The face scan at step 4 has to be done by you, not a parent. It's what I use to recognise you in the exam. If someone else's face is scanned, you'll be flagged during your Innovation Olympiad exam.",
    "Registration", "Tour step", "frontend/src/lib/limon/tours.ts", "95-96",
    "First /register visit", "Student", "")
add(AREA, "That's everything. Fill it in at your own pace, I'll be on your dashboard when you're done.",
    "Registration", "Tour outro", "frontend/src/lib/limon/tours.ts", "100",
    "First /register visit", "Student", "")

AREA = "Limon tour - Dashboard (tours.ts)"
add(AREA, "Welcome in! I'm Limon. Let me show you around, it's quick, and then you'll know where everything lives.",
    "Dashboard", "Tour intro", "frontend/src/lib/limon/tours.ts", "112",
    "First /dashboard visit", "Student", "")
add(AREA, "Your roll number - This is you, for the whole season. Support will ask for it, so keep the email we sent you.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "116-117",
    "First /dashboard visit", "Student", "")
add(AREA, "How you are doing - Exams open to you now, how many you have finished, and your average score so far.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "123-124",
    "First /dashboard visit", "Student", "")
add(AREA, "Your exams - Everything you can sit. Start with the free practice Innovation Olympiad exam: it runs in exactly the same screen as the real thing, and you can retake it as often as you like.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "130-131",
    "First /dashboard visit", "Student", "")
add(AREA, "Training - Tick off the training sessions you have attended here. Your school and the review team can see it, and it appears on your certificates page.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "137-138",
    "First /dashboard visit", "Student", "")
add(AREA, "Exams - The full list, with schedules and instructions. This is where you book your sitting once you have paid.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "144-145",
    "First /dashboard visit", "Student", "")
add(AREA, "Results - Your scores appear here once marking is released. Provisional first, then your final rank and a breakdown across the five pillars when the season closes.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "151-152",
    "First /dashboard visit", "Student", "")
add(AREA, "Certificates - Your olympiad certificates and your training certificates, kept separately so you can find either one.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "158-159",
    "First /dashboard visit", "Student", "")
add(AREA, "Support - If anything goes wrong (a power cut during your exam, a wrong class, a score that looks off), tell us here and a person will answer.",
    "Dashboard", "Tour step", "frontend/src/lib/limon/tours.ts", "165-166",
    "First /dashboard visit", "Student", "")
add(AREA, "That's the whole portal. Take the practice Innovation Olympiad exam when you're ready, and I'll walk you through the exam screen there.",
    "Dashboard", "Tour outro", "frontend/src/lib/limon/tours.ts", "171",
    "First /dashboard visit", "Student", "")

AREA = "Limon tour - Practice exam (tours.ts)"
add(AREA, "This is the real exam screen: same buttons, same timer, same camera. Nothing here is scored, so let me show you what each part does.",
    "Practice exam", "Tour intro", "frontend/src/lib/limon/tours.ts", "184",
    "First /exams/:id/play on trial", "Exam participant", "")
add(AREA, "The question - Click an answer to pick it. It saves the instant you click: there is nothing to press to save, and no way to lose an answer.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "188-189",
    "First trial play", "Exam participant", "")
add(AREA, "Moving around - Previous and Next step one at a time. Clear wipes your answer to this question. There is no negative marking, so a guess always beats a blank.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "195-196",
    "First trial play", "Exam participant", "")
add(AREA, "Mark for later - For a question you want to come back to. It turns orange in the list on the right so you can find it fast. It does not change your answer and nobody is told about it.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "202-203",
    "First trial play", "Exam participant", "")
add(AREA, "Jump anywhere - Every question in the Innovation Olympiad exam. Click any number to go straight there, in any order, as often as you like. Green is answered, orange is marked, grey you have not opened yet.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "209-210",
    "First trial play", "Exam participant", "")
add(AREA, "Your time - Counts down from the start. It runs on our servers, so a wobbly internet connection cannot steal time from you. Orange at five minutes, red at one.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "216-217",
    "First trial play", "Exam participant", "")
add(AREA, "This number - Things I have to record: leaving fullscreen, switching apps, my not being able to see your face. It does not end your exam. A person just reads it afterwards. Hover the little i for the full list.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "223-224",
    "First trial play", "Exam participant", "")
add(AREA, "If the page looks stuck - Use this, not F5. It keeps your answers and your time. An image that will not load is the usual reason.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "230-231",
    "First trial play", "Exam participant", "")
add(AREA, "Finishing - Submit when you are done. I will tell you how many questions are still blank and ask you to confirm, so one stray click cannot end your Innovation Olympiad exam.",
    "Practice exam", "Tour step", "frontend/src/lib/limon/tours.ts", "237-238",
    "First trial play", "Exam participant", "")
add(AREA, "That is the lot. Have a go at these questions, nothing here counts. When you are comfortable, your real Innovation Olympiad exam will feel like somewhere you have already been.",
    "Practice exam", "Tour outro", "frontend/src/lib/limon/tours.ts", "243",
    "First trial play", "Exam participant", "")

# ============================================================
# 6. Login (app/login)
# ============================================================
AREA = "Login (login/page.tsx)"
add(AREA, "Enter a valid mobile number.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "47",
    "Phone chosen but invalid", "Student", "")
add(AREA, "Failed to send code. Make sure this ${isPhone ? 'number' : 'email'} is registered.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "56",
    "OTP send fails", "Student", "Template: conditional on isPhone.")
add(AREA, "Calling ${identifier} now with your 6-digit code...",
    "Login", "Success banner", "frontend/src/app/login/page.tsx", "61",
    "Voice OTP sent", "Student", "Template: ${identifier} interpolated.")
add(AREA, "A 6-digit code has been sent to ${identifier}",
    "Login", "Success banner", "frontend/src/app/login/page.tsx", "62",
    "Email/SMS OTP sent", "Student", "Template: ${identifier} interpolated.")
add(AREA, "Network error. Please check your connection.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "68",
    "Network exception on send", "Student", "")
add(AREA, "Please enter the 6-digit code.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "84",
    "OTP step, code not 6 digits", "Student", "")
add(AREA, "Invalid or expired code. Please try again.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "96",
    "Email verify fails", "Student", "")
add(AREA, "No account found. Please register first.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "107",
    "Backend says 'no account'", "Student", "")
add(AREA, "Sign in failed. Please try again.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "109",
    "Generic sign-in failure", "Student", "")
add(AREA, "Failed to resend code.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "123",
    "Resend fails", "Student", "")
add(AREA, "A new code has been sent to your ${isPhone ? 'phone' : 'email'}.",
    "Login", "Success banner", "frontend/src/app/login/page.tsx", "125",
    "Resend succeeds", "Student", "Template: conditional on isPhone.")
add(AREA, "Network error. Please try again.",
    "Login", "Inline error", "frontend/src/app/login/page.tsx", "128",
    "Resend network exception", "Student", "")
add(AREA, "SMS codes are temporarily unavailable, we'll call you with your code instead.",
    "Login", "Helper text under phone field", "frontend/src/app/login/page.tsx", "257",
    "SMS_OTP_ENABLED is false", "Student", "")

AREA = "Login mobile (login/LoginMobile.tsx)"
add(AREA, "Use the email you registered with.",
    "Login mobile", "Subtitle on identifier step", "frontend/src/app/login/LoginMobile.tsx", "56",
    "Identifier step", "Student", "")
add(AREA, "We sent a 6-digit code to ${email}",
    "Login mobile", "Subtitle on OTP step", "frontend/src/app/login/LoginMobile.tsx", "57",
    "OTP step", "Student", "Template: ${email} interpolated.")
add(AREA, "Don't have an account? Register here",
    "Login mobile", "Footer", "frontend/src/app/login/LoginMobile.tsx", "117",
    "Always", "Student", "")

# ============================================================
# 7. Registration (app/register)
# ============================================================
AREA = "Registration step labels (register/page.tsx)"
add(AREA, "Before you start / Your details / Verify email / Enrol your face / Payment / Parent details",
    "Registration", "Progress step labels", "frontend/src/app/register/page.tsx", "52-57",
    "Always", "Student", "Six step labels shown in progress indicator.")
add(AREA, "Please read this before you begin / Create your participant account / Verify your email / Enrol your face / Complete your registration / Parent or guardian details",
    "Registration", "Subtitle per step", "frontend/src/app/register/page.tsx", "60-67",
    "Per step", "Student", "Subtitle shown under step heading.")

AREA = "Registration - face step (register/page.tsx)"
add(AREA, "Loading face detection models...",
    "Registration - face step", "Face scan status", "frontend/src/app/register/page.tsx", "129",
    "Starting camera", "Student", "")
add(AREA, "Camera unavailable. Make sure a webcam is connected and permission is granted.",
    "Registration - face step", "Face scan status", "frontend/src/app/register/page.tsx", "135",
    "No camera stream", "Student", "")
add(AREA, "Position your face in the frame and click Capture.",
    "Registration - face step", "Face scan status", "frontend/src/app/register/page.tsx", "138",
    "Camera started", "Student", "")
add(AREA, "We couldn't see a face in the picture. Sit facing the camera in good light, with nothing covering your face, then capture again.",
    "Registration - face step", "Face scan error", "frontend/src/app/register/page.tsx", "152",
    "No face in captured frame", "Student", "")
add(AREA, "We couldn't save your face scan. Make sure your whole face is lit and in frame, then capture again.",
    "Registration - face step", "Face scan error", "frontend/src/app/register/page.tsx", "166",
    "Enrollment backend rejects", "Student", "")
add(AREA, "Face ID is required for AI-proctored exams. Your face is stored as an encrypted numeric descriptor used to verify you during the exam, and this one photo is kept and printed on your certificate. This step cannot be skipped, and the participant must do it themselves.",
    "Registration - face step", "Instruction paragraph", "frontend/src/app/register/page.tsx", "376-379",
    "Face step", "Student", "")

AREA = "Registration - details validation (register/page.tsx)"
add(AREA, "Please enter your full name.",
    "Registration - details", "Inline error", "frontend/src/app/register/page.tsx", "193",
    "Name missing", "Student", "")
add(AREA, "Please enter your email address.",
    "Registration - details", "Inline error", "frontend/src/app/register/page.tsx", "197",
    "Email missing", "Student", "")
add(AREA, "Please choose your school. Search for it, enter a school code, or add it.",
    "Registration - details", "Inline error", "frontend/src/app/register/page.tsx", "204",
    "No school selected", "Student", "")
add(AREA, "Please enter your class section, exactly as your school writes it.",
    "Registration - details", "Inline error", "frontend/src/app/register/page.tsx", "212",
    "Section empty", "Student", "")
add(AREA, "We couldn't send the code to that email address. Check it is spelled correctly, then try again.",
    "Registration - details/verify", "Inline error", "frontend/src/app/register/page.tsx", "221",
    "OTP send fails", "Student", "")
add(AREA, "A 6-digit code has been sent to ${formData.email}",
    "Registration - verify", "Success banner", "frontend/src/app/register/page.tsx", "224",
    "OTP sent", "Student", "Template: ${formData.email} interpolated.")
add(AREA, "Please enter the 6-digit code.",
    "Registration - verify", "Inline error", "frontend/src/app/register/page.tsx", "240",
    "Code not 6 digits", "Student", "")
add(AREA, "That code didn't work. Codes expire after a few minutes, use \"Resend code\" to get a fresh one, and check your spam folder.",
    "Registration - verify", "Inline error", "frontend/src/app/register/page.tsx", "250",
    "Verify fails", "Student", "")
add(AREA, "We couldn't send another code just now. Wait a moment and try again.",
    "Registration - verify", "Inline error", "frontend/src/app/register/page.tsx", "291",
    "Resend fails", "Student", "")
add(AREA, "A new code has been sent to your email.",
    "Registration - verify", "Success banner", "frontend/src/app/register/page.tsx", "293",
    "Resend succeeds", "Student", "")

# PresenceStep
AREA = "Registration - presence step (PresenceStep.tsx)"
add(AREA, "What you need to take the exam",
    "Registration presence", "Collapsible tech requirements toggle", "frontend/src/app/register/steps/PresenceStep.tsx", "64",
    "Always", "Student / Guardian", "")
add(AREA, "The ward is here with me now, and will do the face scan themselves.",
    "Registration presence", "Consent checkbox", "frontend/src/app/register/steps/PresenceStep.tsx", "85",
    "Always", "Guardian", "")
add(AREA, "I have read and accept the terms & conditions, including that the registration fee is non-refundable and non-transferable and that a confirmed exam slot cannot be changed.",
    "Registration presence", "Consent checkbox", "frontend/src/app/register/steps/PresenceStep.tsx", "97-102",
    "Always", "Student / Guardian", "")
add(AREA, "I agree that the details entered here may be processed to run the Olympiad, registering the participant, proctoring their exam, marking, ranking and issuing certificates. A parent or guardian confirms this again later in the form.",
    "Registration presence", "Consent checkbox", "frontend/src/app/register/steps/PresenceStep.tsx", "113-115",
    "Always", "Student / Guardian", "")
add(AREA, "Please tick all three boxes to continue.",
    "Registration presence", "Helper text", "frontend/src/app/register/steps/PresenceStep.tsx", "131",
    "Not all consents ticked", "Student / Guardian", "")

# PaymentStep
AREA = "Registration - payment step (PaymentStep.tsx)"
add(AREA, "We could not check whether you have already paid. You can still pay below, if you have already paid, use \"I have paid, check now\".",
    "Registration payment", "Inline error", "frontend/src/app/register/steps/PaymentStep.tsx", "89",
    "Initial pass check fails", "Student", "")
add(AREA, "We can't see your payment yet. Bank confirmations can take a minute or two, wait a moment and check again. If you have already been charged, use \"Already paid but still locked?\" below and we will unlock it by hand.",
    "Registration payment", "Inline error", "frontend/src/app/register/steps/PaymentStep.tsx", "148-150",
    "Manual check, pass not active", "Student", "")
add(AREA, "Could not send that automatically. Please email the payment id to support, your payment is safe.",
    "Registration payment", "Inline error", "frontend/src/app/register/steps/PaymentStep.tsx", "181-182",
    "Payment claim fails", "Student", "")
add(AREA, "On the payment page, enter this exact email address: ${studentEmail}. That is how your account is unlocked automatically once you pay.",
    "Registration payment", "Callout", "frontend/src/app/register/steps/PaymentStep.tsx", "247-249",
    "Pass not active", "Student", "Template: ${studentEmail} interpolated.")
add(AREA, "Waiting for payment confirmation...",
    "Registration payment", "Waiting banner", "frontend/src/app/register/steps/PaymentStep.tsx", "258",
    "Payment in progress", "Student", "")
add(AREA, "Finish the Rs.${rupees} payment in the other tab. This unlocks by itself, usually within a few seconds.",
    "Registration payment", "Waiting hint", "frontend/src/app/register/steps/PaymentStep.tsx", "261-262",
    "Payment in progress", "Student", "Template: ${rupees} interpolated.")
add(AREA, "Paid, but still locked? - Your payment is safe. Give us the Razorpay payment id from your confirmation message or email (it looks like pay_XXXXXXXXXXXX) and we will unlock your account by hand.",
    "Registration payment", "Claim form", "frontend/src/app/register/steps/PaymentStep.tsx", "288-292",
    "Polling exhausted or opened manually", "Student", "")
add(AREA, "Sent to support - We have your payment id. Someone will unlock your account, and you will get an email when it is done. You can close this page, your registration is saved.",
    "Registration payment", "Confirmation card", "frontend/src/app/register/steps/PaymentStep.tsx", "314-317",
    "Claim submitted", "Student", "")
add(AREA, "Already paid but still locked?",
    "Registration payment", "Link", "frontend/src/app/register/steps/PaymentStep.tsx", "324",
    "Before claim opened", "Student", "")

# SchoolPicker
AREA = "Registration - school picker (SchoolPicker.tsx)"
add(AREA, "Exactly as your school writes it: A, B2, Rose. This is how your teachers find your class in their results. If your school does not use sections, write NA.",
    "Registration - school", "Section hint", "frontend/src/components/SchoolPicker.tsx", "227-230",
    "After school selected", "Student", "")
add(AREA, "Your results are grouped by school, so your teachers can see how your class did. Every participant needs one. Most participants should just search by name: a school code is only for participants whose school handed them one.",
    "Registration - school", "School search hint", "frontend/src/components/SchoolPicker.tsx", "243-246",
    "Search mode", "Student", "")
add(AREA, "A school code looks like SCH-ABC123. Your school coordinator or class teacher gives it out, it may be on a circular or a message from the school. You do not need one: if you haven't been given a code, just search for your school by name instead.",
    "Registration - school", "Code mode hint", "frontend/src/components/SchoolPicker.tsx", "294-298",
    "Code mode", "Student", "")
add(AREA, "Adding your school - Type the full name as your school writes it, and the pincode of the area it is in. We fill in the city and state for you. If another student has already added it, we will use theirs rather than making a duplicate.",
    "Registration - school", "Add-school intro", "frontend/src/components/SchoolPicker.tsx", "308-314",
    "Add mode", "Student", "")
add(AREA, "Looking up your pincode...",
    "Registration - school", "Add-school hint", "frontend/src/components/SchoolPicker.tsx", "335",
    "Pincode lookup in flight", "Student", "")
add(AREA, "We could not find that pincode. Check the six digits and try again.",
    "Registration - school", "Add-school hint", "frontend/src/components/SchoolPicker.tsx", "340",
    "Pincode not found", "Student", "")
add(AREA, "City and state are filled in from your pincode.",
    "Registration - school", "Add-school hint", "frontend/src/components/SchoolPicker.tsx", "341",
    "Pincode incomplete", "Student", "")
add(AREA, "Searching...",
    "Registration - school", "Dropdown empty", "frontend/src/components/SchoolPicker.tsx", "371",
    "Search in flight", "Student", "")
add(AREA, "No schools match \"${query}\".",
    "Registration - school", "Dropdown empty", "frontend/src/components/SchoolPicker.tsx", "391",
    "No results", "Student", "Template: ${query} interpolated.")
add(AREA, "Can't find it? Add your school (it takes the name and a pincode).",
    "Registration - school", "Escape-hatch prompt", "frontend/src/components/SchoolPicker.tsx", "413-426",
    "Always", "Student", "")

# GuardianForm
AREA = "Registration - guardian form (GuardianForm.tsx)"
add(AREA, "This section is for a parent or legal guardian. It is required before ${studentName} can sit an exam.",
    "Guardian form", "Lede", "frontend/src/components/GuardianForm.tsx", "241-243",
    "Always", "Guardian", "Template: ${studentName} interpolated.")
add(AREA, "We use these to reach you about the ward's exam, not for marketing.",
    "Guardian form", "Contact hint", "frontend/src/components/GuardianForm.tsx", "302",
    "Always", "Guardian", "")
add(AREA, "Both are required. Neither affects the ward's score or rank. The date of birth has to match the ID you upload below, which is how we confirm the ward is who they registered as.",
    "Guardian form", "Ward info hint", "frontend/src/components/GuardianForm.tsx", "309-311",
    "Always", "Guardian", "")
add(AREA, "Please use the ward's school ID card if you have one. It is the document we prefer, because it shows the school and class the ward registered under. If there is no school card, an Aadhaar card or passport is accepted instead.",
    "Guardian form", "Document hint", "frontend/src/components/GuardianForm.tsx", "358-361",
    "Always", "Guardian", "")
add(AREA, "Both sides are required. The back of a school card usually carries the class, section and the school's stamp, and the back of an Aadhaar card carries the address, so one side on its own is not enough to check.",
    "Guardian form", "Document hint", "frontend/src/components/GuardianForm.tsx", "364-366",
    "Always", "Guardian", "")
add(AREA, "JPG, PNG, HEIC or PDF - max 10 MB",
    "Guardian form", "Upload label note", "frontend/src/components/GuardianForm.tsx", "397",
    "Always", "Guardian", "")
add(AREA, "Uploading ${fileName[side]}...",
    "Guardian form", "Upload hint", "frontend/src/components/GuardianForm.tsx", "408",
    "During upload", "Guardian", "Template: ${fileName[side]} interpolated.")
add(AREA, "Uploaded ${fileName[side] ? ': ' + fileName[side] : ''}",
    "Guardian form", "Upload success hint", "frontend/src/components/GuardianForm.tsx", "412",
    "After upload", "Guardian", "Template: conditional on fileName[side].")
add(AREA, "Upload the front of the ward's ${values.idDocumentType.toLowerCase()}.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "218",
    "Front not uploaded", "Guardian", "Template: ${values.idDocumentType} interpolated.")
add(AREA, "Upload the back of the ward's ${values.idDocumentType.toLowerCase()} as well. Both sides are needed.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "224",
    "Back not uploaded", "Guardian", "Template: ${values.idDocumentType} interpolated.")
add(AREA, "Both consents are required before the ward can sit an exam.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "229",
    "Consents not both ticked", "Guardian", "")
add(AREA, "Enter the parent or guardian's full name.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "190",
    "Name missing", "Guardian", "")
add(AREA, "Enter the parent or guardian's email address.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "194",
    "Email missing", "Guardian", "")
add(AREA, "Enter the parent or guardian's mobile number.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "198",
    "Phone missing", "Guardian", "")
add(AREA, "Enter the ward's date of birth.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "205",
    "DOB missing", "Guardian", "")
add(AREA, "Select the ward's gender.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "209",
    "Gender missing", "Guardian", "")
add(AREA, "Wait for the document to finish uploading.",
    "Guardian form", "Inline validation error", "frontend/src/components/GuardianForm.tsx", "213",
    "Upload still in progress", "Guardian", "")

# ============================================================
# 8. Dashboard & payment lock
# ============================================================
AREA = "Dashboard (dashboard/page.tsx)"
add(AREA, "One step left: parent or guardian details. - Required before any exam can be started, including the free practice Innovation Olympiad exam. It takes about two minutes.",
    "Dashboard", "Warning notice", "frontend/src/app/dashboard/page.tsx", "223-226",
    "guardianComplete === false", "Student", "")
add(AREA, "Your registration isn't finished yet - One payment completes your registration and unlocks every Olympiad exam on this account for the current season. Until then there is nothing here to start.",
    "Dashboard", "Paywall card", "frontend/src/app/dashboard/page.tsx", "239-242",
    "hasPass === false", "Student", "")
add(AREA, "Already paid but still seeing this? Tell us and we will fix it.",
    "Dashboard", "Hint under paywall CTA", "frontend/src/app/dashboard/page.tsx", "249-250",
    "hasPass === false", "Student", "")
add(AREA, "No exams available for your class yet. Check back soon!",
    "Dashboard", "Empty state", "frontend/src/app/dashboard/page.tsx", "325",
    "No exams returned", "Student", "")
add(AREA, "No results yet. Complete an exam to see your performance here.",
    "Dashboard", "Empty state", "frontend/src/app/dashboard/page.tsx", "368",
    "No recent results", "Student", "")

AREA = "Pay-to-unlock banner (PayToUnlockBanner.tsx)"
add(AREA, "Your exams are locked - One Rs.${rupees} payment unlocks every olympiad exam for the current season. The practice Innovation Olympiad exam stays free.",
    "Dashboard / exams", "Payment lock banner", "frontend/src/components/PayToUnlockBanner.tsx", "54-56",
    "Access pass not active", "Student", "Template: ${rupees} interpolated.")

AREA = "Payment terms (PaymentTerms.tsx)"
add(AREA, "One-time fee. It unlocks every published Olympiad exam on your account for this season. There is no per-exam charge and nothing to renew.",
    "Payment", "Terms list", "frontend/src/components/PaymentTerms.tsx", "21-22",
    "Always", "Student", "")
add(AREA, "Non-refundable. The fee cannot be refunded once paid, whether or not you go on to sit an exam.",
    "Payment", "Terms list", "frontend/src/components/PaymentTerms.tsx", "25-26",
    "Always", "Student", "")
add(AREA, "Non-transferable. It cannot be moved to another participant, another account, or a later season.",
    "Payment", "Terms list", "frontend/src/components/PaymentTerms.tsx", "29-30",
    "Always", "Student", "")
add(AREA, "Your schedule is separate, and final. After paying you choose a sitting for each exam. Once confirmed, a schedule cannot be changed from your account.",
    "Payment", "Terms list", "frontend/src/components/PaymentTerms.tsx", "33-35",
    "Always", "Student", "")
add(AREA, "The practice Innovation Olympiad exam stays free. You can take it as many times as you like, before or after paying.",
    "Payment", "Terms list", "frontend/src/components/PaymentTerms.tsx", "39-40",
    "When not compact", "Student", "")
add(AREA, "Payments are processed securely by Razorpay. We never see or store your card details. Full detail is in the terms & conditions.",
    "Payment", "Footer note", "frontend/src/components/PaymentTerms.tsx", "45-49",
    "Always", "Student", "")

# ============================================================
# 9. Profile (profile/page.tsx)
# ============================================================
AREA = "Profile (profile/page.tsx)"
add(AREA, "Your registered details. None of this can be edited here.",
    "Profile", "Page subheading", "frontend/src/app/profile/page.tsx", "135",
    "Always", "Student", "")
add(AREA, "Email address cannot be changed.",
    "Profile", "Locked field hint", "frontend/src/app/profile/page.tsx", "161",
    "Always", "Student", "")
add(AREA, "School assignment cannot be changed.",
    "Profile", "Locked field hint", "frontend/src/app/profile/page.tsx", "173",
    "Always", "Student", "")
add(AREA, "Your name cannot be changed here. If it is misspelt, raise a support ticket.",
    "Profile", "Locked field hint", "frontend/src/app/profile/page.tsx", "199-200",
    "Always", "Student", "")
add(AREA, "Used to reach you about your exam schedule and results. To add or change it, raise a support ticket.",
    "Profile", "Locked field hint", "frontend/src/app/profile/page.tsx", "213-214",
    "Always", "Student", "")
add(AREA, "Your class is final: it decides which Innovation Olympiad exam you sit and who you are ranked against. If it is wrong, raise a support ticket and we will correct it before your exam.",
    "Profile", "Locked field hint", "frontend/src/app/profile/page.tsx", "235-238",
    "Always", "Student", "")
add(AREA, "A parent or guardian has to give consent before you can start any exam, including the practice Innovation Olympiad exam. It takes about two minutes and only needs doing once.",
    "Profile", "Guardian prompt", "frontend/src/app/profile/page.tsx", "249-252",
    "No guardian profile", "Student", "")
add(AREA, "What your parent or guardian gave us, and when they agreed. To change any of it, reopen the parent form.",
    "Profile", "Guardian record intro", "frontend/src/app/profile/page.tsx", "260-262",
    "Guardian profile exists", "Student", "")
add(AREA, "Our consent wording has changed since your parent agreed, so it needs confirming once more before your next exam.",
    "Profile", "Guardian re-consent notice", "frontend/src/app/profile/page.tsx", "299-301",
    "!guardian.complete", "Student", "")
add(AREA, "Required for AI-proctored exams. Your face is stored as an encrypted numeric descriptor, no photo is saved.",
    "Profile", "Face ID intro", "frontend/src/app/profile/page.tsx", "310-311",
    "Always", "Student", "")
add(AREA, "Loading face detection models...",
    "Profile", "Face enrollment message", "frontend/src/app/profile/page.tsx", "86",
    "Opening camera", "Student", "")
add(AREA, "Could not access camera. Please allow camera permissions and try again.",
    "Profile", "Face enrollment error", "frontend/src/app/profile/page.tsx", "92, 98",
    "Camera open fails", "Student", "")
add(AREA, "Position your face in the frame and click Capture.",
    "Profile", "Face enrollment message", "frontend/src/app/profile/page.tsx", "95",
    "Camera started", "Student", "")
add(AREA, "Capturing...",
    "Profile", "Face enrollment message", "frontend/src/app/profile/page.tsx", "104",
    "During capture", "Student", "")
add(AREA, "No face detected. Ensure your face is clearly visible and try again.",
    "Profile", "Face enrollment error", "frontend/src/app/profile/page.tsx", "108",
    "No face in frame", "Student", "")
add(AREA, "Face enrolled successfully! You are ready for AI-proctored exams.",
    "Profile", "Face enrollment success", "frontend/src/app/profile/page.tsx", "116",
    "Enrollment succeeds", "Student", "")
add(AREA, "Enrollment failed. Please try again.",
    "Profile", "Face enrollment error", "frontend/src/app/profile/page.tsx", "118, 121",
    "Enrollment fails or throws", "Student", "")

# ============================================================
# 10. Guardian page (guardian/page.tsx)
# ============================================================
AREA = "Guardian page (guardian/page.tsx)"
add(AREA, "Parent consent recorded - Thank you. The ward can now sit their exams.",
    "Guardian", "Success card", "frontend/src/app/guardian/page.tsx", "88, 91",
    "After fresh save", "Guardian", "")
add(AREA, "This is already complete, there is nothing more to do here.",
    "Guardian", "Success card", "frontend/src/app/guardian/page.tsx", "92",
    "Profile already complete", "Guardian", "")
add(AREA, "Parent / guardian details - One more step before an exam can be started. It takes about two minutes, and only needs doing once.",
    "Guardian", "Page header", "frontend/src/app/guardian/page.tsx", "118-121",
    "Form view", "Guardian", "")
add(AREA, "Every participant is a school ward, so the law requires a parent or guardian to consent before we can proctor an exam or process their data. You can read what that covers in the terms & conditions.",
    "Guardian", "Info callout", "frontend/src/app/guardian/page.tsx", "131-137",
    "Form view", "Guardian", "")

# ============================================================
# 11. Results (results/page.tsx)
# ============================================================
AREA = "Results (results/page.tsx)"
add(AREA, "Your performance across every exam you have taken. Scores are provisional until the season closes and the final report is published.",
    "Results", "Page subheading", "frontend/src/app/results/page.tsx", "237-240",
    "Always", "Student", "")
add(AREA, "Could not load the answer key. Please try again.",
    "Results", "Answer-key error", "frontend/src/app/results/page.tsx", "138",
    "Answer-key fetch fails", "Student", "")
add(AREA, "The answer key for this Innovation Olympiad exam is not published yet.",
    "Results", "Answer-key empty", "frontend/src/app/results/page.tsx", "208",
    "No answer key", "Student", "")
add(AREA, "This attempt was disqualified - ${result.disqualificationNote}",
    "Results", "Disqualified card", "frontend/src/app/results/page.tsx", "301-302",
    "result.isDisqualified", "Student", "Template: ${result.disqualificationNote} interpolated.")
add(AREA, "Provisional: unverified score. This can still change while proctoring reviews and grievances are settled. Your rank, full analysis and the answer key are published once the season closes.",
    "Results", "Provisional banner", "frontend/src/app/results/page.tsx", "314-317",
    "result.isProvisional", "Student", "")
add(AREA, "${totalXp} XP earned - ${completed} exam(s) completed - keep going for more!",
    "Results", "XP card", "frontend/src/app/results/page.tsx", "276-281",
    "At least one completed, non-disqualified result", "Student", "Templates: ${totalXp}, ${completed} interpolated.")

# ============================================================
# 12. Exam instructions (exams/[id]/instructions/page.tsx)
# ============================================================
AREA = "Exam instructions - rules (instructions/page.tsx)"
add(AREA, "The exam fills your whole screen. It goes fullscreen by itself when you start, and it has to stay that way until you finish.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "57-58",
    "Always", "Exam participant", "")
add(AREA, "Your camera stays on the whole time. It checks that it is you sitting the Innovation Olympiad exam and that you are alone. Nothing is filmed, and nobody watches you live. A single photo is saved only at the moment a violation is recorded, and is kept with your Innovation Olympiad exam for the review team.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "61-64",
    "Always", "Exam participant", "")
add(AREA, "Sit in front of a plain wall, with light on your face. If the camera cannot see you clearly it may decide it cannot recognise you, and that counts against you. A blank wall and a lamp or window in front of you is all it takes.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "67-69",
    "Always", "Exam participant", "")
add(AREA, "If you leave fullscreen or switch to something else, the exam stops and waits for you. The clock keeps running while it waits. Come straight back and carry on.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "72-74",
    "Always", "Exam participant", "")
add(AREA, "If you stay away longer than ${EXAM_PAUSE_TIMEOUT_SEC} seconds, your Innovation Olympiad exam is sent in for you and you cannot go back to it. A countdown shows you exactly how long you have left to return. Along with your time running out, this is the only way your exam can end by itself.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "77-80",
    "Always", "Exam participant", "Template: ${EXAM_PAUSE_TIMEOUT_SEC} interpolated.")
add(AREA, "Some things are recorded as violations, but none of them stops your exam. Leaving fullscreen, switching tab or app, your face not being visible or not matching, more than one person on camera, a screenshot, or refreshing the page. Each one tells you on screen what happened, and a photo is taken at that moment. Once you pass ${VIOLATION_REVIEW_THRESHOLD}, a person reads the record before your result is confirmed. Keep answering, and tell us afterwards if something went wrong.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "83-88",
    "Always", "Exam participant", "Template: ${VIOLATION_REVIEW_THRESHOLD} interpolated.")
add(AREA, "Try not to refresh the page or press your browser's Back button. Your answers and your time survive it, but it is recorded on your Innovation Olympiad exam. If something looks broken, use the Reload button inside the exam instead: it does the same job and is not counted against you.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "94-97",
    "Always", "Exam participant", "")
add(AREA, "A short internet drop will not cost you any time. Your clock is kept on our servers, not in the page, so it stays right even if the countdown on screen freezes for a moment. It fixes itself. Keep answering, and do not refresh.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "100-102",
    "Always", "Exam participant", "")
add(AREA, "Your time does not start until you see your first question. There is a \"Getting your exam ready\" screen first, while your camera starts up. None of that comes out of your exam time.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "105-107",
    "Always", "Exam participant", "")
add(AREA, "The Innovation Olympiad exam has ${exam.sectionCount} parts. You go through them in order, and you can move back and forth between questions as much as you like.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "112-113",
    "Multi-section exam", "Exam participant", "Template: ${exam.sectionCount} interpolated.")
add(AREA, "Your answers save themselves the moment you choose one. There is nothing to press to save.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "119-120",
    "Always", "Exam participant", "")
add(AREA, "A wrong answer loses you marks on this Innovation Olympiad exam. If you truly have no idea, leaving it blank costs you less than guessing.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "124-125",
    "negativeMarking === true", "Exam participant", "")
add(AREA, "A wrong answer costs you nothing. There are no negative marks, so never leave a question blank, guess if you have to.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "128-129",
    "negativeMarking === false", "Exam participant", "")
add(AREA, "Press Submit when you are done, and confirm it. Do not just close the browser.",
    "Exam instructions", "Rules list", "frontend/src/app/exams/[id]/instructions/page.tsx", "132-133",
    "Always", "Exam participant", "")

AREA = "Exam instructions - face gate (instructions/page.tsx)"
add(AREA, "Loading face detection models...",
    "Exam instructions", "Face enrollment status", "frontend/src/app/exams/[id]/instructions/page.tsx", "295",
    "Preparing face enrollment", "Exam participant", "")
add(AREA, "Position your face in the frame and click Capture.",
    "Exam instructions", "Face enrollment status", "frontend/src/app/exams/[id]/instructions/page.tsx", "297",
    "Camera ready", "Exam participant", "")
add(AREA, "Could not access camera for face enrollment.",
    "Exam instructions", "Face enrollment error", "frontend/src/app/exams/[id]/instructions/page.tsx", "298",
    "Camera access fails", "Exam participant", "")
add(AREA, "No face detected. Ensure your face is clearly visible and try again.",
    "Exam instructions", "Face enrollment error", "frontend/src/app/exams/[id]/instructions/page.tsx", "308",
    "No face in capture", "Exam participant", "")
add(AREA, "Face enrolled successfully!",
    "Exam instructions", "Face enrollment success", "frontend/src/app/exams/[id]/instructions/page.tsx", "317",
    "Enrollment succeeds", "Exam participant", "")
add(AREA, "Enrollment failed. Please try again.",
    "Exam instructions", "Face enrollment error", "frontend/src/app/exams/[id]/instructions/page.tsx", "319",
    "Enrollment fails", "Exam participant", "")
add(AREA, "Enrollment error. Please try again.",
    "Exam instructions", "Face enrollment error", "frontend/src/app/exams/[id]/instructions/page.tsx", "322",
    "Enrollment throws", "Exam participant", "")

# ============================================================
# 13. Too-small device (TooSmallForExam.tsx)
# ============================================================
AREA = "Too-small device (TooSmallForExam.tsx)"
add(AREA, "Turn your device sideways - Your screen is big enough, it just needs to be landscape. Rotate it and this will clear on its own.",
    "Exam instructions / play", "Full-screen device warning", "frontend/src/components/TooSmallForExam.tsx", "56-59",
    "Tablet in portrait", "Exam participant", "")
add(AREA, "This device is too small for the exam - The Olympiad Innovation Olympiad exam needs a laptop, desktop, or a tablet. A phone screen cannot show the question list and the Innovation Olympiad exam side by side, and we would rather tell you now than halfway through your exam.",
    "Exam instructions / play", "Full-screen device warning", "frontend/src/components/TooSmallForExam.tsx", "64-68",
    "Screen too small", "Exam participant", "")
add(AREA, "Needed - ${MIN_VIEWPORT_WIDTH} x ${MIN_VIEWPORT_HEIGHT} or larger",
    "Exam instructions / play", "Requirement list", "frontend/src/components/TooSmallForExam.tsx", "75-77",
    "Always when device is too small", "Exam participant", "Templates: ${MIN_VIEWPORT_WIDTH}, ${MIN_VIEWPORT_HEIGHT}.")
add(AREA, "This screen - ${screen.w} x ${screen.h}",
    "Exam instructions / play", "Requirement list", "frontend/src/components/TooSmallForExam.tsx", "81-84",
    "Always when device is too small", "Exam participant", "Templates: ${screen.w}, ${screen.h}.")
add(AREA, "Everything you need for the exam:",
    "Exam instructions / play", "Tech requirements heading", "frontend/src/components/TooSmallForExam.tsx", "92",
    "Device too small, not rotatable", "Exam participant", "")
add(AREA, "Everything else (your dashboard, results, certificates and your slot) works fine on this device. It is only the exam itself that needs a bigger screen.",
    "Exam instructions / play", "Footer note", "frontend/src/components/TooSmallForExam.tsx", "105-106",
    "Device too small", "Exam participant", "")

# ============================================================
# 14. Exam player (exams/[id]/play/page.tsx)
# ============================================================
AREA = "Exam play - load/gate errors (play/page.tsx)"
add(AREA, "Face Enrollment Required - This is a proctored exam, you need to enroll your face before you can start it. It only takes a few seconds.",
    "Exam play", "Full-screen gate", "frontend/src/app/exams/[id]/play/page.tsx", "897-899",
    "error === 'FACE_ENROLLMENT_REQUIRED'", "Exam participant", "")
add(AREA, "Exam Access Locked - Your exam access pass is not active yet. One payment unlocks every olympiad exam for the current season, the practice Innovation Olympiad exam stays free.",
    "Exam play", "Full-screen gate", "frontend/src/app/exams/[id]/play/page.tsx", "914-917",
    "error === 'ACCESS_PASS_REQUIRED'", "Exam participant", "")
add(AREA, "Parent consent needed first - Every participant is a school ward, so a parent or guardian has to give consent before we can proctor an exam. It takes about two minutes and only needs doing once.",
    "Exam play", "Full-screen gate", "frontend/src/app/exams/[id]/play/page.tsx", "940-944",
    "error === 'GUARDIAN_CONSENT_REQUIRED'", "Exam participant", "")
add(AREA, "This exam is closed - You have already sat this Innovation Olympiad exam. An exam can only be attempted once, so it cannot be reopened, going back to this page will not start it again.",
    "Exam play", "Full-screen gate", "frontend/src/app/exams/[id]/play/page.tsx", "974-977",
    "already completed error", "Exam participant", "")
add(AREA, "Your answers were saved and submitted. Your result will appear under Results once marking is complete.",
    "Exam play", "Full-screen gate", "frontend/src/app/exams/[id]/play/page.tsx", "980-981",
    "already completed error", "Exam participant", "")
add(AREA, "Could not reach the exam server - This is almost always a brief internet problem. Your exam has not been lost, check your connection and try again.",
    "Exam play", "Full-screen error", "frontend/src/app/exams/[id]/play/page.tsx", "1006-1011",
    "looksTransient network error", "Exam participant", "")
add(AREA, "Failed to load exam - ${error}",
    "Exam play", "Full-screen error", "frontend/src/app/exams/[id]/play/page.tsx", "1007, 1010-1012",
    "Non-transient load error", "Exam participant", "Template: ${error} interpolated.")

AREA = "Exam play - blocked actions & breach notices (play/page.tsx)"
add(AREA, "Reloading is disabled during the exam. Use the Reload button in the header if the page looks wrong, it keeps your answers and your timer.",
    "Exam play", "Top notice (blocked)", "frontend/src/app/exams/[id]/play/page.tsx", "43",
    "Student presses F5/Ctrl+R", "Exam participant", "")
add(AREA, "The browser Back button is disabled during the exam. You cannot leave this page until you submit.",
    "Exam play", "Top notice (blocked)", "frontend/src/app/exams/[id]/play/page.tsx", "44",
    "Browser back blocked", "Exam participant", "")
add(AREA, "Printing the exam is not allowed. This attempt has been recorded.",
    "Exam play", "Top notice (blocked)", "frontend/src/app/exams/[id]/play/page.tsx", "45",
    "Print attempt blocked", "Exam participant", "")
add(AREA, "Screenshots are not allowed during the exam. This attempt has been recorded.",
    "Exam play", "Top notice / capture mask", "frontend/src/app/exams/[id]/play/page.tsx", "46",
    "Screenshot attempt", "Exam participant", "")
add(AREA, "Developer tools are disabled during the exam.",
    "Exam play", "Top notice (blocked)", "frontend/src/app/exams/[id]/play/page.tsx", "47",
    "DevTools opened", "Exam participant", "")
add(AREA, "Copying exam content is not allowed.",
    "Exam play", "Top notice (blocked)", "frontend/src/app/exams/[id]/play/page.tsx", "48",
    "Copy attempt", "Exam participant", "")
add(AREA, "The exam page was reloaded. Your answers and your remaining time were kept, and you can carry on. It has been recorded on your Innovation Olympiad exam, so use the Reload button above if you need to refresh again.",
    "Exam play", "Breach notice", "frontend/src/app/exams/[id]/play/page.tsx", "61",
    "Successful reload", "Exam participant", "")
add(AREA, "You navigated back into the exam. Your answers and your remaining time were kept, and you can carry on. It has been recorded on your Innovation Olympiad exam.",
    "Exam play", "Breach notice", "frontend/src/app/exams/[id]/play/page.tsx", "62",
    "Back navigation succeeded", "Exam participant", "")
add(AREA, "Screen capture is not allowed - Screenshots, screen recordings and printing are not permitted during the exam. This attempt has been recorded and counted as a violation.",
    "Exam play", "Full-screen capture mask", "frontend/src/app/exams/[id]/play/page.tsx", "1188-1191",
    "isMasked during/after capture", "Exam participant", "")

AREA = "Exam play - media / idle / status (play/page.tsx)"
add(AREA, "The image for this question didn't load. It is usually a brief network problem, your answers are saved, and the timer is unaffected.",
    "Exam play", "Question media error", "frontend/src/app/exams/[id]/play/page.tsx", "128-129",
    "Image load fails", "Exam participant", "")
add(AREA, "The video for this question didn't load. Your answers are saved and the timer is unaffected.",
    "Exam play", "Question media error", "frontend/src/app/exams/[id]/play/page.tsx", "182-183",
    "Video load fails", "Exam participant", "")
add(AREA, "Loading image...",
    "Exam play", "Question image placeholder", "frontend/src/app/exams/[id]/play/page.tsx", "159",
    "While image loads", "Exam participant", "")
add(AREA, "Nothing has moved on your screen for ${idleSeconds} seconds. Your timer is still running, so carry on when you are ready.",
    "Exam play", "Proctor toast", "frontend/src/app/exams/[id]/play/page.tsx", "740",
    "Student idle EXAM_IDLE_NUDGE_SEC", "Exam participant", "Template: ${idleSeconds} interpolated.")
add(AREA, "Loading AI models... / No face detected / Face detected / ${currentFaceCount} faces detected!",
    "Exam play", "Camera dot tooltip", "frontend/src/app/exams/[id]/play/page.tsx", "1409-1412",
    "Hovering face status dot", "Exam participant", "Template: ${currentFaceCount} interpolated.")

AREA = "Exam play - violation info tooltip (play/page.tsx)"
add(AREA, "What gets counted here - leaving fullscreen/switching tab or app; face not visible / other person / wrong face; looking away; screenshot/print; refresh/browser Back.",
    "Exam play", "Violation tooltip", "frontend/src/app/exams/[id]/play/page.tsx", "1359-1365",
    "Hover i icon", "Exam participant", "")
add(AREA, "This number does not end your exam. It is a record. Past ${VIOLATION_REVIEW_THRESHOLD}, a person reads what was recorded before your result is confirmed, and most of what lands here is an ordinary interruption.",
    "Exam play", "Violation tooltip", "frontend/src/app/exams/[id]/play/page.tsx", "1367-1369",
    "Hover i icon", "Exam participant", "Template: ${VIOLATION_REVIEW_THRESHOLD} interpolated.")
add(AREA, "What does end your exam - Only two things: your time running out, or leaving fullscreen or switching away and not coming back within ${PAUSE_TIMEOUT_SEC} seconds. A countdown shows you exactly how long you have.",
    "Exam play", "Violation tooltip", "frontend/src/app/exams/[id]/play/page.tsx", "1371-1375",
    "Hover i icon", "Exam participant", "Template: ${PAUSE_TIMEOUT_SEC} interpolated.")
add(AREA, "Does not count at all - Sitting still. If nothing moves for ${EXAM_IDLE_NUDGE_SEC} seconds Limon checks you are still there, but reading and thinking are not against the rules.",
    "Exam play", "Violation tooltip", "frontend/src/app/exams/[id]/play/page.tsx", "1377-1380",
    "Hover i icon", "Exam participant", "Template: ${EXAM_IDLE_NUDGE_SEC} interpolated.")
add(AREA, "Reload the exam page safely, your answers and timer are kept",
    "Exam play", "Reload button tooltip", "frontend/src/app/exams/[id]/play/page.tsx", "1397",
    "Hover reload button", "Exam participant", "")

AREA = "Exam play - reload & submit modals (play/page.tsx)"
add(AREA, "Reload the exam page? - Use this if the page looks wrong: a question image that will not load, or a timer that has stopped moving.",
    "Exam play", "Reload confirmation modal", "frontend/src/app/exams/[id]/play/page.tsx", "1608-1611",
    "Reload button clicked", "Exam participant", "")
add(AREA, "Your answers and your remaining time are kept, the timer runs on our server, not in this page. You will be asked to re-enter fullscreen and your camera will restart.",
    "Exam play", "Reload confirmation modal", "frontend/src/app/exams/[id]/play/page.tsx", "1613-1616",
    "Reload button clicked", "Exam participant", "")
add(AREA, "This is the only safe way to reload. Pressing F5 or your browser's reload button will end and lock your exam.",
    "Exam play", "Reload confirmation modal", "frontend/src/app/exams/[id]/play/page.tsx", "1618-1620",
    "Reload button clicked", "Exam participant", "")
add(AREA, "Submit Exam? - All ${questions.length} questions answered. You have not left anything blank.",
    "Exam play", "Submit confirmation modal", "frontend/src/app/exams/[id]/play/page.tsx", "1654-1660",
    "Submit clicked, all answered", "Exam participant", "Template: ${questions.length} interpolated.")
add(AREA, "${unansweredCount} question(s) still blank - You have answered ${answeredCount} of ${questions.length}. There is no negative marking, so a guess is always better than a blank.",
    "Exam play", "Submit confirmation modal", "frontend/src/app/exams/[id]/play/page.tsx", "1668-1672",
    "Submit clicked, blanks remain", "Exam participant", "Templates: ${unansweredCount}, ${answeredCount}, ${questions.length}.")
add(AREA, "This action cannot be undone.",
    "Exam play", "Submit confirmation modal", "frontend/src/app/exams/[id]/play/page.tsx", "1689",
    "Submit confirmation", "Exam participant", "")

# ============================================================
# 15. AutoSubmitNotice
# ============================================================
AREA = "Auto-submit notice (AutoSubmitNotice.tsx)"
add(AREA, "Submitting your exam in ${warningLeft} second(s)",
    "Exam play", "Auto-submit countdown", "frontend/src/components/exam/AutoSubmitNotice.tsx", "111",
    "status === 'warning'", "Exam participant", "Template: ${warningLeft} interpolated.")
add(AREA, "Please do not close this window.",
    "Exam play", "Auto-submit overlay", "frontend/src/components/exam/AutoSubmitNotice.tsx", "135",
    "status === 'submitting'", "Exam participant", "")
add(AREA, "Your exam ended, but we could not submit it - Every answer you gave is already saved on the server, nothing is lost. Check your internet connection and submit again.",
    "Exam play", "Auto-submit overlay", "frontend/src/components/exam/AutoSubmitNotice.tsx", "162-167",
    "status === 'failed'", "Exam participant", "")
add(AREA, "Continuing automatically in ${secondsLeft}s",
    "Exam play", "Auto-submit overlay", "frontend/src/components/exam/AutoSubmitNotice.tsx", "154",
    "status === 'done'", "Exam participant", "Template: ${secondsLeft} interpolated.")

# ============================================================
# 16. ExamPreparingOverlay
# ============================================================
AREA = "Exam preparing overlay (ExamPreparingOverlay.tsx)"
add(AREA, "Starting your exam... - Everything is set up. Fetching your Innovation Olympiad exam now.",
    "Exam play", "Preparing overlay", "frontend/src/components/exam/ExamPreparingOverlay.tsx", "100-103",
    "phase === 'starting'", "Exam participant", "")
add(AREA, "Getting your exam ready - Setting up your camera and proctoring before the Innovation Olympiad exam opens. Your exam timer has not started yet, it starts when your questions appear.",
    "Exam play", "Preparing overlay", "frontend/src/components/exam/ExamPreparingOverlay.tsx", "116-119",
    "phase === 'preparing'", "Exam participant", "")
add(AREA, "This screen never lasts longer than ${PREPARE_MAX_SECONDS} seconds, and none of it comes out of your exam time.",
    "Exam play", "Preparing overlay", "frontend/src/components/exam/ExamPreparingOverlay.tsx", "141-142",
    "phase === 'preparing'", "Exam participant", "Template: ${PREPARE_MAX_SECONDS} interpolated.")

# ============================================================
# 17. ExamTutorial
# ============================================================
AREA = "Exam tutorial (ExamTutorial.tsx)"
add(AREA, "What the exam screen looks like - A quick tour of where everything is, before you start. Worth two minutes if this is your first Innovation Olympiad exam.",
    "Exam instructions", "Collapsible tutorial", "frontend/src/components/exam/ExamTutorial.tsx", "150-153",
    "Always, default collapsed", "Exam participant", "")
add(AREA, "Which Innovation Olympiad exam you are on - Your grade and the exam name, so you can check at any moment that you are sitting the right Innovation Olympiad exam.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "44-45",
    "Expanded", "Exam participant", "")
add(AREA, "Which question you are on - Question 7 of 50. This number counts across the whole Innovation Olympiad exam, not just the part you are in, so question 7 always means the same question.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "49-50",
    "Expanded", "Exam participant", "")
add(AREA, "Your warnings - Starts at 0 of 3 and goes up if you break a rule. Each time it rises, a message tells you exactly what happened. Hover the small \"i\" for the full list.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "54-55",
    "Expanded", "Exam participant", "")
add(AREA, "Safe reload - The only safe way to refresh. Use this if an image will not load. Your answers and your time are kept. Never use F5 or your browser's refresh button.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "59-60",
    "Expanded", "Exam participant", "")
add(AREA, "Time left - Counts down from the start of the Innovation Olympiad exam. It turns orange with five minutes left and red with one. It is kept on our servers, so a brief internet drop cannot cost you time.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "64-65",
    "Expanded", "Exam participant", "")
add(AREA, "Your camera - A small preview so you can see what the camera sees. Green dot means it can see one face, yours. Red means it cannot see you.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "69-70",
    "Expanded", "Exam participant", "")
add(AREA, "The question - The question, and a picture or video if it has one. Click an answer to choose it. It saves the moment you click, there is nothing to press.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "74-75",
    "Expanded", "Exam participant", "")
add(AREA, "Moving around - Previous and Next step through the Innovation Olympiad exam one question at a time. Clear removes your answer to this question and leaves it blank.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "79-80",
    "Expanded", "Exam participant", "")
add(AREA, "Mark for later - For a question you want to come back to. It turns the question orange in the list on the right so you can find it again fast. It does not change your answer, and it is not reported to anyone.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "84-85",
    "Expanded", "Exam participant", "")
add(AREA, "Jump to any question - Every question in the Innovation Olympiad exam, grouped by part. Click any number to go straight there, in any order, as many times as you like.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "89-90",
    "Expanded", "Exam participant", "")
add(AREA, "What the colours mean - Green means answered. Orange means you marked it for later. Grey means you have not been there yet. The outlined one is where you are now.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "94-95",
    "Expanded", "Exam participant", "")
add(AREA, "How much you have done - Answered out of total. When every question is answered this turns green and says so.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "99-100",
    "Expanded", "Exam participant", "")
add(AREA, "Submit - Ends the Innovation Olympiad exam. You are asked to confirm first, and told how many questions are still blank, so one accidental click cannot end your exam.",
    "Exam instructions", "Tutorial legend", "frontend/src/components/exam/ExamTutorial.tsx", "104-105",
    "Expanded", "Exam participant", "")
add(AREA, "If a message appears mid-exam, read it, do not panic. Small notices in the corner are telling you something (your camera cannot see you, your identity was checked) and go away by themselves. A message across the middle of the screen means the Innovation Olympiad exam has paused and is waiting for you, and it always says what to do to carry on. Neither one takes your answers away.",
    "Exam instructions", "Tutorial note", "frontend/src/components/exam/ExamTutorial.tsx", "252-257",
    "Expanded", "Exam participant", "")
add(AREA, "The best version of this tour is the practice Innovation Olympiad exam. It is free, unlimited, and runs in exactly this screen with a real timer and a real camera. Sit it once on the device you plan to use, and none of the above will be new on exam day.",
    "Exam instructions", "Tutorial note", "frontend/src/components/exam/ExamTutorial.tsx", "260-263",
    "Expanded", "Exam participant", "")
add(AREA, "Diagram of the exam screen: a header with the Innovation Olympiad exam name, question number, warning count, reload button, timer and camera preview; a question area with answer options and navigation buttons; and a sidebar listing every question number.",
    "Exam instructions", "Tutorial SVG aria-label", "frontend/src/components/exam/ExamTutorial.tsx", "165",
    "Always (screen-reader)", "Exam participant", "Accessibility alt text for the diagram SVG.")

# ============================================================
# 18. Exam submitted page
# ============================================================
AREA = "Exam submitted (submitted/page.tsx)"
add(AREA, "Your exam has been submitted - Every answer you gave is saved on our servers. There is nothing more you need to do${user?.rollNumber ? ', ' + user.firstName : ''}.",
    "Exam submitted", "Hero", "frontend/src/app/exams/[id]/submitted/page.tsx", "79-82",
    "Always after submit", "Exam participant", "Template: conditional on user.rollNumber.")
add(AREA, "Roll number ${user.rollNumber}",
    "Exam submitted", "Hero", "frontend/src/app/exams/[id]/submitted/page.tsx", "86-87",
    "If roll number exists", "Exam participant", "Template: ${user.rollNumber} interpolated.")
add(AREA, "This is a provisional, unverified score. It can still change while proctoring reviews and grievances are settled.",
    "Exam submitted", "Score card", "frontend/src/app/exams/[id]/submitted/page.tsx", "95-107",
    "Score available", "Exam participant", "")
add(AREA, "This attempt was disqualified after review, so it carries no score.",
    "Exam submitted", "Score card", "frontend/src/app/exams/[id]/submitted/page.tsx", "111-112",
    "result.isDisqualified", "Exam participant", "")
add(AREA, "Your score is not published yet. It appears on your results page as soon as marking for this Innovation Olympiad exam is released, we will email you.",
    "Exam submitted", "Score card", "frontend/src/app/exams/[id]/submitted/page.tsx", "116-117",
    "No score yet", "Exam participant", "")
add(AREA, "Proctoring record - No violations were recorded. Nothing about your exam has been flagged for review.",
    "Exam submitted", "Violations card", "frontend/src/app/exams/[id]/submitted/page.tsx", "134-138",
    "violationCount === 0", "Exam participant", "")
add(AREA, "${violationCount} violation(s) recorded. These are the warnings you saw during the Innovation Olympiad exam: leaving fullscreen, switching away, a camera or face issue, or a screenshot attempt. A violation is not a decision. A person reviews anything serious before any conclusion is drawn, and most are ordinary interruptions. If something went wrong during your exam, tell us from the support page and it will be read alongside this record.",
    "Exam submitted", "Violations card", "frontend/src/app/exams/[id]/submitted/page.tsx", "142-154",
    "violationCount > 0", "Exam participant", "Template: ${violationCount} interpolated.")
add(AREA, "Your Innovation Olympiad exam is marked automatically as soon as it is submitted.",
    "Exam submitted", "What happens next", "frontend/src/app/exams/[id]/submitted/page.tsx", "167",
    "Always", "Exam participant", "")
add(AREA, "Once the exam window closes, every Innovation Olympiad exam goes through fair-score normalisation so students who sat different sittings are compared fairly. Any Innovation Olympiad exam the proctoring flagged is reviewed by a person, not by the computer, before anything is concluded from it.",
    "Exam submitted", "What happens next", "frontend/src/app/exams/[id]/submitted/page.tsx", "172-175",
    "Always", "Exam participant", "")
add(AREA, "Your score is published first as provisional. It is a real score, but it can still move while reviews and grievances are settled.",
    "Exam submitted", "What happens next", "frontend/src/app/exams/[id]/submitted/page.tsx", "181-183",
    "Always", "Exam participant", "")
add(AREA, "When the season closes we publish your final score, your rank and percentile, your breakdown across the five dimensions, and the answer key with an explanation for every question.",
    "Exam submitted", "What happens next", "frontend/src/app/exams/[id]/submitted/page.tsx", "188-190",
    "Always", "Exam participant", "")
add(AREA, "Everything recorded during your exam is kept with your attempt, so any question about it can be answered from the record rather than from memory.",
    "Exam submitted", "How result is verified", "frontend/src/app/exams/[id]/submitted/page.tsx", "201-202",
    "Always", "Exam participant", "")
add(AREA, "Nothing is decided automatically. A flagged Innovation Olympiad exam is looked at by a person, who has to write down their reasoning either way.",
    "Exam submitted", "How result is verified", "frontend/src/app/exams/[id]/submitted/page.tsx", "205-206",
    "Always", "Exam participant", "")
add(AREA, "If you think something has gone wrong (a power cut, a connection drop, a score that looks wrong) you can raise it and a person will respond.",
    "Exam submitted", "How result is verified", "frontend/src/app/exams/[id]/submitted/page.tsx", "209-210",
    "Always", "Exam participant", "")
add(AREA, "Something went wrong during my exam",
    "Exam submitted", "Support link", "frontend/src/app/exams/[id]/submitted/page.tsx", "223",
    "Always", "Exam participant", "")

# ============================================================
# 19. Mascot toast wrapper
# ============================================================
AREA = "Mascot toast wrapper (MascotToast.tsx)"
add(AREA, "${answeredCount} of ${totalQuestions} answered - ${minutesLeft} min left",
    "Exam play", "Mascot toast status", "frontend/src/components/MascotToast.tsx", "106-110",
    "Always", "Exam participant", "Templates: ${answeredCount}, ${totalQuestions}, ${minutesLeft}.")
add(AREA, "${unanswered} question(s) still unanswered.",
    "Exam play", "Mascot toast urgent line", "frontend/src/components/MascotToast.tsx", "118-119",
    "Warning cue, unanswered > 0", "Exam participant", "Template: ${unanswered} interpolated.")

# ============================================================
# 20. Limon help / avatar
# ============================================================
AREA = "Limon help / avatar (LimonHelp.tsx, LimonAvatar.tsx)"
add(AREA, "Need help? Click me for a guided tour of this page.",
    "Portal pages", "Help button (aria-label)", "frontend/src/components/limon/LimonHelp.tsx", "76",
    "Always", "Student", "Accessibility label on help button.")

# ============================================================
# Build workbook
# ============================================================
wb = Workbook()

# ----- Summary sheet -----
summary = wb.active
summary.title = "Summary"
summary["A1"] = "Student Portal Content Catalog"
summary["A1"].font = Font(bold=True, size=14)
summary["A2"] = "Scope: Instructional, informational, guideline, explanatory, and notice content only (no buttons or ordinary labels)."
summary["A2"].font = Font(italic=True, color="555555")
summary["A4"] = "Area / Page / Feature"
summary["B4"] = "Item count"
for c in ("A4", "B4"):
    summary[c].font = Font(bold=True)

# Count by area
from collections import Counter
counts = Counter(r[0] for r in ROWS)
row_idx = 5
for area, n in sorted(counts.items()):
    summary.cell(row=row_idx, column=1, value=area)
    summary.cell(row=row_idx, column=2, value=n)
    row_idx += 1
summary.cell(row=row_idx, column=1, value="TOTAL").font = Font(bold=True)
summary.cell(row=row_idx, column=2, value=len(ROWS)).font = Font(bold=True)
summary.column_dimensions["A"].width = 60
summary.column_dimensions["B"].width = 14

# ----- Content sheet -----
ws = wb.create_sheet("Student Content")

headers = [
    "Portal",
    "Area / Page / Feature",
    "Current Content",
    "New Content",
    "Portal Location",
    "Display Location",
    "Code File",
    "Line(s) / Searchable Location",
    "Trigger / Visibility Condition",
    "Audience / Context",
    "Notes",
]

header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
header_font = Font(bold=True, color="FFFFFF", size=11)
thin = Side(border_style="thin", color="BFBFBF")
border = Border(left=thin, right=thin, top=thin, bottom=thin)

for col, h in enumerate(headers, start=1):
    cell = ws.cell(row=1, column=col, value=h)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = border

wrap_top = Alignment(wrap_text=True, vertical="top")
for r_idx, row in enumerate(ROWS, start=2):
    area, current, portal_loc, display_loc, code_file, lines, trigger, audience, notes = row
    values = [
        "Student Portal",
        area,
        current,
        "",  # New Content - intentionally blank
        portal_loc,
        display_loc,
        code_file,
        lines,
        trigger,
        audience,
        notes,
    ]
    for c_idx, v in enumerate(values, start=1):
        cell = ws.cell(row=r_idx, column=c_idx, value=v)
        cell.alignment = wrap_top
        cell.border = border

# Column widths (Current and New side by side, wide)
widths = {
    "A": 14,   # Portal
    "B": 34,   # Area
    "C": 70,   # Current Content
    "D": 70,   # New Content
    "E": 26,   # Portal Location
    "F": 26,   # Display Location
    "G": 38,   # Code File
    "H": 18,   # Lines
    "I": 32,   # Trigger
    "J": 22,   # Audience
    "K": 32,   # Notes
}
for col, w in widths.items():
    ws.column_dimensions[col].width = w

# Freeze header row and first 3 columns (Portal, Area, Current)
ws.freeze_panes = "E2"
# Autofilter
ws.auto_filter.ref = f"A1:K{len(ROWS)+1}"
# Row heights
for r in range(2, len(ROWS) + 2):
    ws.row_dimensions[r].height = 60
ws.row_dimensions[1].height = 30

out_path = r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad\STUDENT_PORTAL_CONTENT_CATALOG.xlsx"
wb.save(out_path)
print(f"Saved: {out_path}")
print(f"Total rows: {len(ROWS)}")
print(f"Areas: {len(counts)}")
