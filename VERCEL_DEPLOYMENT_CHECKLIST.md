# Vercel Deployment Checklist - Production URL Configuration

## Current Configuration
- **Backend URL**: `https://lumina-backend-psdz.onrender.com`
- **Frontend URL**: `https://lumina-delta-lake.vercel.app`
- **Environment Variable**: `EXPO_PUBLIC_API_URL`

---

## ✅ Files Updated with Production Backend URL

### 1. Root `.env` File
```
EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com
```
**Status**: ✅ Updated

### 2. `.env.example` File
```
EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com
```
**Status**: ✅ Updated

### 3. `client/.env.example` File
```
EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com
```
**Status**: ✅ Updated

---

## ⚠️ CRITICAL: Vercel Environment Variables Setup

You **MUST** set the environment variable in Vercel Dashboard:

### How to Set Vercel Environment Variables

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard

2. **Select Project**
   - Find "lumina-delta-lake" project

3. **Go to Settings**
   - Click "Settings" tab

4. **Add Environment Variable**
   - Go to "Environment Variables" section
   - Click "Add Environment Variable"
   - Name: `EXPO_PUBLIC_API_URL`
   - Value: `https://lumina-backend-psdz.onrender.com`
   - Select which environments: ✅ Production, ✅ Preview, ✅ Development
   - Click "Save"

### Environment Variable Details
```json
{
  "name": "EXPO_PUBLIC_API_URL",
  "value": "https://lumina-backend-psdz.onrender.com",
  "environments": ["production", "preview", "development"]
}
```

---

## API URL Resolution Flow

### Web (Vercel) - How It Works

1. **Build Time**: Vercel reads `EXPO_PUBLIC_API_URL` from environment variables
2. **Runtime**: Browser-side code uses `https://lumina-backend-psdz.onrender.com`
3. **Client Code**: `client/services/api.ts` reads the env variable

### Code in `client/services/api.ts`

```typescript
const getApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  
  // Use explicit environment URL if set (production/web)
  if (envUrl && envUrl.trim()) {
    return envUrl;  // ← Returns Vercel env var
  }

  // Mobile fallback logic
  if (Platform.OS !== 'web') {
    // ... mobile detection
  }

  return 'http://localhost:8000';  // ← Dev fallback
};
```

---

## Verification Steps

### Step 1: Commit and Push Changes
```bash
cd d:\Lumina
git add .env .env.example client/.env.example
git commit -m "chore: set production backend URL to https://lumina-backend-psdz.onrender.com"
git push origin main
```

### Step 2: Vercel Auto-Deploy
- Vercel automatically detects push to main
- Builds and deploys automatically
- Check https://vercel.com/dashboard for build status

### Step 3: Set Environment Variable in Vercel
1. Go to https://vercel.com/dashboard
2. Select "lumina-delta-lake" project
3. Click "Settings" → "Environment Variables"
4. Add: `EXPO_PUBLIC_API_URL` = `https://lumina-backend-psdz.onrender.com`
5. Select all environments (Production, Preview, Development)
6. Save and redeploy

### Step 4: Trigger Redeploy
- Go to Vercel Deployments tab
- Click "Redeploy" on latest deployment
- Wait for build to complete

### Step 5: Test Deployment
1. Hard refresh: `Ctrl+Shift+R` / `Cmd+Shift+R`
2. Navigate to https://lumina-delta-lake.vercel.app/login
3. Login with valid credentials
4. Check browser DevTools → Network tab
5. Verify API calls go to `https://lumina-backend-psdz.onrender.com/api/v1/*`

---

## Testing Checklist

### Login Page
- [ ] Page loads without black screen
- [ ] Form is visible and interactive
- [ ] API calls show in Network tab going to `https://lumina-backend-psdz.onrender.com`

### Dashboard
- [ ] Loads after successful login
- [ ] No black screen
- [ ] Sidebar visible
- [ ] Header visible
- [ ] Content loads

### Network Requests
- [ ] Open DevTools (F12)
- [ ] Go to Network tab
- [ ] Perform login
- [ ] Check requests:
  - [ ] POST to `/api/v1/auth/login` → should be 200 or 401
  - [ ] GET to `/api/v1/auth/me` → should be 200
  - [ ] No CORS errors
  - [ ] No timeouts

### API Connectivity
```bash
# Test backend is running
curl https://lumina-backend-psdz.onrender.com/health

# Should return:
# {"status": "ok"}
```

---

## Common Issues & Fixes

### Issue: API calls still going to localhost

**Cause**: Vercel environment variable not set

**Fix**:
1. Go to Vercel Dashboard
2. Settings → Environment Variables
3. Add `EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com`
4. Redeploy project

### Issue: CORS errors in Network tab

**Cause**: Backend not allowing Vercel URL in CORS

**Fix**:
1. Backend needs CORS_ORIGINS to include: `https://lumina-delta-lake.vercel.app`
2. Check Render dashboard for backend service
3. Update CORS_ORIGINS environment variable
4. Restart backend service

### Issue: 401 Unauthorized on login

**Cause**: Could be correct - invalid credentials or backend issue

**Solution**:
1. Check Network tab response for error details
2. Verify credentials are correct
3. Check backend is running: https://lumina-backend-psdz.onrender.com/health
4. Check Render logs for backend errors

### Issue: Timeout errors

**Cause**: Backend sleeping or not responding

**Solution**:
1. Visit https://lumina-backend-psdz.onrender.com/health
2. Should wake up Render backend
3. Wait a few seconds and retry login
4. Check Render dashboard service status

---

## Files Changed

```
.env
.env.example
client/.env.example
```

---

## Environment Variable Summary

| Variable | Value | Where Set |
|----------|-------|-----------|
| `EXPO_PUBLIC_API_URL` | `https://lumina-backend-psdz.onrender.com` | Vercel Dashboard (critical!) |
| Backend Base URL | `https://lumina-backend-psdz.onrender.com` | Render (already deployed) |
| Frontend URL | `https://lumina-delta-lake.vercel.app` | Vercel (auto-assigned) |

---

## Next Steps

1. ✅ Files updated with production URL
2. ⏳ **TODO: Git commit and push**
   ```bash
   git add .
   git commit -m "chore: configure production backend URL"
   git push origin main
   ```
3. ⏳ **TODO: Set Vercel environment variable**
   - Go to Vercel Dashboard
   - Add `EXPO_PUBLIC_API_URL=https://lumina-backend-psdz.onrender.com`
   - Save and redeploy
4. ⏳ **TODO: Verify deployment**
   - Hard refresh browser
   - Test login and dashboard
   - Check Network tab for correct API URLs

---

## Quick Vercel Setup Command

If you have Vercel CLI installed:

```bash
# Set production environment variable
vercel env add EXPO_PUBLIC_API_URL https://lumina-backend-psdz.onrender.com

# Or manually set environment variable
vercel env add EXPO_PUBLIC_API_URL https://lumina-backend-psdz.onrender.com --prod
```

---

## Deployment Status

- **Backend**: ✅ Deployed on Render (https://lumina-backend-psdz.onrender.com)
- **Frontend**: ✅ Deployed on Vercel (https://lumina-delta-lake.vercel.app)
- **Files Updated**: ✅ Production URL configured
- **Environment Variable**: ⏳ **MUST be set in Vercel Dashboard**
- **Ready to Deploy**: ✅ Yes, pending env variable setup

---

**Last Updated**: August 27, 2026
**Status**: Ready for final deployment with Vercel environment setup

