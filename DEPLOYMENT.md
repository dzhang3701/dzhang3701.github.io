# Deployment Guide

## GitHub Pages Deployment (dzhang3701.github.io)

### Prerequisites
- GitHub repository named `dzhang3701.github.io`
- Backend hosted somewhere (see Backend Hosting Options below)

### Step 1: Create GitHub Repo

Create a new repository named **exactly** `dzhang3701.github.io`

### Step 2: Move Files to New Repo

From the `human_baseline` folder, copy all files to your new repo:

```bash
# From human_baseline directory
cp -r ./* /path/to/dzhang3701.github.io/
cp .env.* /path/to/dzhang3701.github.io/
cp -r .github /path/to/dzhang3701.github.io/
```

### Step 3: Update Backend URL

Edit `.env.production` and set your backend URL:
```
NEXT_PUBLIC_API_URL=https://your-backend-url.com
```

### Step 4: Enable GitHub Pages

1. Go to repository settings on GitHub (dzhang3701.github.io)
2. Navigate to Pages section
3. Under "Build and deployment":
   - Source: **GitHub Actions**

### Step 5: Push to Deploy

```bash
cd /path/to/dzhang3701.github.io
git add .
git commit -m "Initial deployment"
git push origin main
```

The GitHub Action will automatically build and deploy to:
**`https://dzhang3701.github.io/`**

## Backend Hosting Options

Since GitHub Pages only hosts static files, you need to deploy the Flask backend elsewhere:

### Option 1: Railway (Recommended - Free tier available)

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. From the `human_baseline/backend` directory:
```bash
cd backend
railway init
railway up
```
4. Get your backend URL from Railway dashboard
5. Update `.env.production` with this URL

### Option 2: Render (Free tier available)

1. Create account at render.com
2. New Web Service
3. Connect your GitHub repo
4. Configure:
   - Root Directory: `human_baseline/backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python api.py`
5. Get your backend URL
6. Update `.env.production`

### Option 3: Vercel (Deploy both together)

Instead of GitHub Pages, use Vercel for everything:

```bash
cd human_baseline
npm i -g vercel
vercel
```

This will handle both frontend and backend.

## Local Testing

Test the production build locally:

```bash
cd human_baseline
npm run build
npx serve out
```

Visit http://localhost:3000 to test.

## Troubleshooting

### CORS Issues
Make sure your backend allows requests from your GitHub Pages domain:

In `backend/api.py`, update CORS:
```python
CORS(app, origins=[
    "http://localhost:3000",
    "https://dzhang.github.io"
])
```

### 404 on Refresh
This is expected with static export. Users should navigate via the app.

### API Connection Failed
- Check backend is running
- Verify `.env.production` has correct URL
- Check CORS settings
- Verify backend accepts HTTPS if GitHub Pages uses HTTPS
