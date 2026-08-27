# Deployment Instructions - Black Screen Login Fix

## Quick Summary
Fixed black screen issue on Vercel web deployment login page. The issue was caused by:
1. Missing dark theme background on HTML root
2. API URL not being properly detected for web builds
3. Session restore blocking login page rendering
4. Loading state logic being too restrictive

## Before Deploying to Vercel

### 1. Verify Local Setup
```bash
cd d:\Lumina
npm install
npm run web
```
- Navigate to http://localhost:8081/login
- ✅ Login form should be visible (not black screen)
- ✅ Form should be interactive

### 2. Verify Vercel Environment Variables
Login to Vercel Dashboard → lumina-delta-lake project → Settings → Environment Variables

**Required Variable:**
```
EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com
```

**Verify it exists and is set correctly.** If not, add it now.

### 3. Git Commit & Push
```bash
cd d:\Lumina
git add .
git commit -m "fix: black screen login issue on web deployment

- Fixed HTML root background color (#131313) to prevent white/black flashing
- Improved API URL detection for web builds
- Fixed session restore blocking login page render
- Fixed WebLayout loading state logic
- Login page now renders immediately on Vercel"
git push origin main
```

## Deployment Steps

### Option A: Automatic Deployment (Recommended)
1. Push to `main` branch (if Vercel is connected)
2. Vercel will automatically rebuild
3. Wait for deployment to complete (~2-3 minutes)

### Option B: Manual Deployment
1. Go to https://vercel.com/dashboard
2. Select `lumina-delta-lake` project
3. Click "Deployments"
4. Click "Redeploy"
5. Verify build completes successfully

## Post-Deployment Verification

### 1. Clear Browser Cache
- Open DevTools (F12)
- Right-click refresh button → "Empty cache and hard refresh"
- Or use: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

### 2. Test Login Page
- Visit https://lumina-delta-lake.vercel.app/login
- ✅ Page should load (not black)
- ✅ Login form should be visible with:
  - Email input field
  - Password input field
  - Authenticate button
  - "Forgot password?" link
  - "Create workspace" link

### 3. Test Login Flow
- Enter valid credentials
- ✅ Should redirect to dashboard
- ✅ Should display user info in sidebar
- ✅ Should show dashboard content

### 4. Test Error Handling
- Enter invalid credentials
- ✅ Should show error message below login form
- ✅ Should remain on login page

### 5. Test Mobile Responsiveness
- Resize browser to mobile width
- ✅ Layout should adapt properly
- ✅ Form should remain visible and usable

## Troubleshooting

### Issue: Still Seeing Black Screen
1. **Clear cache aggressively:**
   - Ctrl+Shift+Delete (open Clear Browsing Data)
   - Select "All time"
   - Check "Cookies and cached images"
   - Click "Clear data"
   - Hard refresh the page

2. **Check API Connection:**
   - Open DevTools → Network tab
   - Look for API requests to `https://lumina-backend-psdz.onrender.com/api/v1`
   - If failing, check Render backend is running

3. **Check Vercel Environment:**
   - Go to Vercel project settings
   - Verify `EXPO_PUBLIC_API_URL` is set
   - Redeploy project

### Issue: Login Works Locally But Not on Vercel
1. **Verify API URL:**
   - Vercel env variable is set: `EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com`
   - No typos in URL

2. **Check CORS:**
   - Backend must have Vercel URL in CORS_ORIGINS
   - Should be: `https://lumina-delta-lake.vercel.app`

3. **Check Render Backend:**
   - Visit https://lumina-backend-psdz.onrender.com/health
   - Should return 200 OK

### Issue: API Requests Failing
1. Check browser console for CORS errors
2. Verify Render backend CORS_ORIGINS includes Vercel URL
3. Check network tab for actual response errors

## Rollback Plan (If Issues Arise)
```bash
git revert <commit-hash>
git push origin main
# Vercel will automatically redeploy
```

## Files Changed in This Fix
- `client/app/+html.tsx` - Fixed root HTML styling
- `client/services/api.ts` - Fixed API URL detection
- `client/app/_layout.tsx` - Improved session restore
- `client/web/layouts/WebLayout.tsx` - Fixed loading state
- `client/web/pages/Login/index.tsx` - Added theme and auth redirect
- `client/app/(auth)/login.tsx` - Added auth redirect

## Success Criteria
✅ Login page loads without black screen
✅ Login form is fully visible and interactive
✅ Valid credentials allow login and redirect to dashboard
✅ Invalid credentials show error message
✅ Mobile and desktop layouts both work
✅ API requests connect to Render backend successfully

## Contact/Support
If issues persist after deployment:
1. Check Vercel deployment logs: https://vercel.com/dashboard
2. Check browser console for JavaScript errors (F12)
3. Check network tab to see API requests and responses
4. Verify Render backend is running: https://lumina-backend-psdz.onrender.com/health

