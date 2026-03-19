# Setup Instructions - Fullscreen Monitoring

## Quick Start

### 1. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd backend
npm install
```

### 2. Run Database Migration

```bash
cd backend
npx prisma migrate dev
```

This will apply the migration that:
- Removes `SEB_VIOLATION` from ProctorEventType enum
- Adds `EXIT_FULLSCREEN` to ProctorEventType enum
- Changes `requireSeb` default to `false`

### 3. Start Services

#### Using Docker (Recommended)
```bash
docker-compose up -d
```

#### Manual Start

**Database (if not using Docker)**
```bash
# Ensure PostgreSQL is running
# Update backend/.env with your DATABASE_URL
```

**Backend**
```bash
cd backend
npm run start:dev
```

**Frontend**
```bash
cd frontend
npm run dev
```

**Proctor Service (Optional)**
```bash
cd proctor-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Proctor Service: http://localhost:5000

## Testing the Fullscreen Feature

### Test Scenario 1: Normal Exam Flow

1. Navigate to http://localhost:3000/login
2. Login as a student
3. Go to available exams
4. Click on an exam
5. Review instructions page
6. Click "Start Exam"
7. **Verify**: Browser automatically enters fullscreen
8. Answer some questions
9. Submit exam normally

### Test Scenario 2: Exit Fullscreen

1. Start an exam (as above)
2. Press `Esc` key to exit fullscreen
3. **Verify**: 
   - Pause overlay appears
   - Message shows "Fullscreen exited"
   - Violation counter shows "1 / 3"
   - Warning about 20-second auto-submit
4. Press `F11` or click fullscreen button to return
5. **Verify**: Exam resumes, overlay disappears

### Test Scenario 3: Tab Switch

1. Start an exam
2. Press `Alt+Tab` (Windows/Linux) or `Cmd+Tab` (Mac)
3. Switch to another application
4. **Verify**: Exam pauses (check by returning to tab)
5. Return to exam tab
6. **Verify**: Exam resumes

### Test Scenario 4: 20-Second Auto-Submit

1. Start an exam
2. Exit fullscreen (press `Esc`)
3. Wait 20 seconds without returning to fullscreen
4. **Verify**: 
   - Exam auto-submits
   - Alert shows "Exam auto-submitted: Exam paused for more than 20 seconds"
   - Redirects to results page

### Test Scenario 5: 3 Violations

1. Start an exam
2. Exit fullscreen (press `Esc`)
3. Return to fullscreen (press `F11`)
4. Repeat steps 2-3 two more times (total 3 violations)
5. **Verify**: 
   - On 3rd violation, exam immediately auto-submits
   - Alert shows "Exam auto-submitted: Maximum violations reached (3)"
   - Redirects to results page

### Test Scenario 6: Interaction Blocking

1. Start an exam
2. Exit fullscreen to trigger pause
3. While paused, try to:
   - Click on answer options
   - Navigate to next/previous question
   - Flag a question
   - Click question numbers in sidebar
4. **Verify**: All interactions are disabled/blocked

## Configuration

### Adjust Violation Limits

Edit `frontend/src/app/exams/[id]/play/page.tsx`:

```typescript
const { isPaused, violationCount, isFullscreen } = useFullscreenMonitor({
  onViolation: async (type, count) => { ... },
  onPause: () => { ... },
  onResume: () => { ... },
  onAutoSubmit: handleAutoSubmit,
  maxViolations: 3,        // Change this number
  pauseTimeoutSec: 20,     // Change this number (in seconds)
});
```

### Disable Fullscreen for Development

If you need to test without fullscreen enforcement during development:

1. Comment out the fullscreen request in `useFullscreenMonitor.ts`:
```typescript
// requestFullscreen(); // Commented for dev testing
```

2. Or modify the violation handler to not pause:
```typescript
const handleViolation = (type) => {
  console.log('Violation detected but ignored for dev:', type);
  // Don't actually pause
};
```

## Troubleshooting

### Issue: Fullscreen doesn't work

**Solution**: 
- Ensure you're using a modern browser (Chrome 71+, Firefox 64+, Safari 16.4+)
- Check browser console for errors
- Try a different browser

### Issue: Migration fails

**Solution**:
```bash
# Reset database (WARNING: This deletes all data)
cd backend
npx prisma migrate reset

# Or manually run the migration
npx prisma migrate deploy
```

### Issue: TypeScript errors

**Solution**:
```bash
# Regenerate Prisma client
cd backend
npx prisma generate

# Clear Next.js cache
cd frontend
rm -rf .next
npm run dev
```

### Issue: Exam doesn't pause on tab switch

**Solution**:
- Check browser console for errors
- Ensure JavaScript is enabled
- Try in incognito/private mode (extensions can interfere)

### Issue: Violations not logged to backend

**Solution**:
- Check backend is running (http://localhost:4000)
- Check browser network tab for failed API calls
- Verify JWT token is valid (login again)

## Browser Compatibility

### Fully Supported
- Chrome/Edge 71+
- Firefox 64+
- Safari 16.4+
- Opera 58+

### Limited Support
- iOS Safari (fullscreen API limited)
- Older browsers (may need polyfills)

### Not Supported
- Internet Explorer (deprecated)

## Production Deployment

### Environment Variables

**Backend (.env)**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/exam_db"
JWT_SECRET="your-secret-key-change-in-production"
FRONTEND_URL="https://your-domain.com"
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_API_URL="https://api.your-domain.com"
NEXT_PUBLIC_WS_URL="wss://api.your-domain.com"
```

### Build Commands

**Frontend**
```bash
cd frontend
npm run build
npm run start
```

**Backend**
```bash
cd backend
npm run build
npm run start:prod
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Next Steps

1. Test all scenarios above
2. Customize violation limits if needed
3. Review proctor events in admin dashboard
4. Configure production environment variables
5. Deploy to production

## Support

For issues or questions:
1. Check the FULLSCREEN_IMPLEMENTATION.md for detailed technical info
2. Review browser console for errors
3. Check backend logs for API errors
4. Ensure all services are running

## Rollback

If you need to rollback to SEB-based system:

1. Restore previous code version
2. Restore database backup
3. Redeploy services

Note: SEB-related code is still in the codebase but not actively used, so partial rollback is possible.
