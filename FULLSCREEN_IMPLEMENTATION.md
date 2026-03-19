# Fullscreen Monitoring Implementation

## Overview
Removed Safe Exam Browser (SEB) dependency and implemented browser-based fullscreen monitoring with automatic pause and violation tracking.

## Changes Made

### Frontend Changes

#### 1. New Hook: `useFullscreenMonitor.ts`
- Monitors fullscreen state and tab visibility
- Tracks violations (exit fullscreen, tab switch)
- Implements pause/resume logic
- Auto-submits exam after:
  - 20 seconds of being paused
  - 3 total violations
- Handles all fullscreen API variants (standard, webkit, moz, ms)

#### 2. Updated `useDeviceCheck.ts`
- Removed SEB browser check
- Added fullscreen capability check
- Validates browser supports fullscreen API

#### 3. Updated `frontend/src/app/exams/[id]/play/page.tsx`
- Integrated fullscreen monitoring
- Added pause overlay with violation counter
- Disabled all interactions when paused
- Shows fullscreen status badge
- Logs violations to backend via proctor API

#### 4. Updated `frontend/src/app/exams/[id]/instructions/page.tsx`
- Removed SEB launch instructions
- Updated rules to mention fullscreen requirement
- Changed device checks from SEB to fullscreen support
- Updated start button to require fullscreen capability

#### 5. Updated Types
- `frontend/src/types/proctor.ts`: Changed `seb` to `fullscreen` in DeviceCheckStatus
- Added `EXIT_FULLSCREEN` event type, removed `SEB_VIOLATION`

#### 6. Updated Stores
- `frontend/src/store/proctorStore.ts`: Changed device check from `seb` to `fullscreen`

### Backend Changes

#### 1. Updated `backend/src/attempt/attempt.controller.ts`
- Removed `@UseGuards(SebGuard)` from exam start endpoint
- Exams now work in any browser

#### 2. Updated `backend/src/proctor/proctor.service.ts`
- Removed `SEB_VIOLATION` from severity map
- Added `EXIT_FULLSCREEN` with severity 4

#### 3. Updated `backend/prisma/schema.prisma`
- Changed `ProctorEventType` enum: removed `SEB_VIOLATION`, added `EXIT_FULLSCREEN`
- Changed `ExamInstance.requireSeb` default from `true` to `false`

#### 4. Created Migration
- `backend/prisma/migrations/20260319000000_remove_seb_add_fullscreen/migration.sql`
- Updates enum and default value

### Documentation Changes

#### Updated `README.md`
- Changed description from "SEB integration" to "fullscreen monitoring"
- Updated security features section
- Removed SEB testing instructions
- Added fullscreen behavior notes

## How It Works

### Exam Flow

1. **Instructions Page**
   - Checks for fullscreen API support
   - Validates webcam and microphone access
   - User clicks "Start Exam"

2. **Exam Start**
   - Automatically requests fullscreen mode
   - Starts webcam proctoring
   - Begins monitoring for violations

3. **During Exam**
   - Monitors fullscreen state continuously
   - Detects tab switches via visibility API
   - Detects window blur events

4. **Violation Handling**
   - **First violation**: Exam pauses, 20-second timer starts
   - **Return to fullscreen**: Exam resumes, timer cancelled
   - **20 seconds elapsed**: Exam auto-submits
   - **3rd violation**: Exam auto-submits immediately

5. **Violation Types**
   - `EXIT_FULLSCREEN`: User pressed Esc or exited fullscreen
   - `TAB_SWITCH`: User switched tabs or minimized window

### Technical Implementation

#### Fullscreen Detection
```typescript
// Check if in fullscreen
const inFullscreen = !!(
  document.fullscreenElement ||
  document.webkitFullscreenElement ||
  document.mozFullScreenElement ||
  document.msFullscreenElement
);
```

#### Tab Switch Detection
```typescript
// Visibility API
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // User switched tabs
  }
});

// Window blur (Alt+Tab, clicking outside)
window.addEventListener('blur', () => {
  // Window lost focus
});
```

#### Pause Timer
```typescript
// Start 20-second countdown
pauseTimerRef.current = setTimeout(() => {
  onAutoSubmit('Exam paused for more than 20 seconds');
}, 20000);

// Cancel on resume
clearTimeout(pauseTimerRef.current);
```

## Testing

### Manual Testing Steps

1. **Start Exam**
   - Verify fullscreen is automatically requested
   - Verify exam loads in fullscreen

2. **Exit Fullscreen (Press Esc)**
   - Verify pause overlay appears
   - Verify violation counter shows 1/3
   - Verify 20-second warning message
   - Press F11 or click fullscreen to resume
   - Verify exam resumes

3. **Tab Switch (Alt+Tab or Cmd+Tab)**
   - Switch to another application
   - Verify exam pauses
   - Return to exam tab
   - Verify exam resumes

4. **20-Second Timeout**
   - Exit fullscreen
   - Wait 20 seconds without returning
   - Verify exam auto-submits
   - Verify redirect to results page

5. **3 Violations**
   - Exit fullscreen 3 times (returning each time)
   - On 3rd violation, verify immediate auto-submit

6. **Interaction Blocking**
   - While paused, try to:
     - Select an answer (should be disabled)
     - Navigate questions (should be disabled)
     - Flag questions (should be disabled)
   - Verify all interactions are blocked

## Browser Compatibility

### Supported Browsers
- Chrome/Edge 71+
- Firefox 64+
- Safari 16.4+
- Opera 58+

### Fullscreen API Support
All modern browsers support the Fullscreen API. The implementation includes fallbacks for vendor-prefixed versions.

## Security Considerations

### What This Prevents
- Tab switching to search for answers
- Using other applications during exam
- Minimizing the exam window
- Exiting fullscreen to access other content

### What This Doesn't Prevent
- Multiple monitors (user can look at another screen)
- Physical notes or books
- Another person helping
- Screen sharing to another device

### Additional Security Layers
- Webcam proctoring (AI face detection)
- Server-side timer (prevents time manipulation)
- Answer auto-save (prevents data loss)
- IP address tracking
- Device fingerprinting

## Migration Guide

### For Existing Deployments

1. **Backup Database**
   ```bash
   pg_dump exam_db > backup.sql
   ```

2. **Run Migration**
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

3. **Update Existing Exam Instances**
   ```sql
   -- Optional: Update existing instances to not require SEB
   UPDATE "ExamInstance" SET "requireSeb" = false;
   ```

4. **Deploy Frontend**
   ```bash
   cd frontend
   npm run build
   ```

5. **Deploy Backend**
   ```bash
   cd backend
   npm run build
   npm run start:prod
   ```

### For New Deployments

Simply follow the standard deployment process. The migration will run automatically.

## Configuration

### Adjustable Parameters

In `frontend/src/hooks/useFullscreenMonitor.ts`:

```typescript
const { isPaused, violationCount } = useFullscreenMonitor({
  maxViolations: 3,        // Change max violations before auto-submit
  pauseTimeoutSec: 20,     // Change pause timeout in seconds
  onViolation: ...,
  onPause: ...,
  onResume: ...,
  onAutoSubmit: ...,
});
```

### Environment Variables

No new environment variables required. Existing configuration works as-is.

## Future Enhancements

### Potential Improvements
1. **Configurable per exam**: Allow admins to set violation limits per exam
2. **Grace period**: First violation could be a warning without pause
3. **Violation history**: Show detailed timeline of violations in proctor report
4. **Mobile support**: Detect and handle mobile browsers differently
5. **Picture-in-picture detection**: Detect if user enables PiP mode
6. **Multiple monitor detection**: Warn if multiple monitors detected

### Known Limitations
1. **Mobile browsers**: Limited fullscreen support on iOS Safari
2. **Browser extensions**: Some extensions can interfere with fullscreen
3. **Accessibility**: Screen readers may have issues in fullscreen
4. **Keyboard shortcuts**: Some OS shortcuts can't be blocked

## Support

### Common Issues

**Q: Fullscreen doesn't work on my browser**
A: Ensure you're using a modern browser (Chrome 71+, Firefox 64+, Safari 16.4+)

**Q: Exam pauses when I didn't switch tabs**
A: Some browser extensions or OS notifications can trigger blur events

**Q: Can I test without fullscreen?**
A: For development, you can modify the `useFullscreenMonitor` hook to skip checks

**Q: What happens if my internet disconnects?**
A: Answers are auto-saved. Reconnect and resume where you left off.

## Rollback Plan

If issues arise, you can rollback:

1. **Revert Frontend**: Deploy previous version
2. **Revert Backend**: Deploy previous version  
3. **Revert Database**: 
   ```sql
   -- Restore from backup
   psql exam_db < backup.sql
   ```

Note: SEB-related code remains in the codebase for backward compatibility but is not actively used.
