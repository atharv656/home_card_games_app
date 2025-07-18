# 🚀 Deployment Guide

## Quick Summary

**✅ Best for your Socket.IO app**: Railway (single service) or Render  
**⚠️ Vercel limitation**: Doesn't support persistent WebSocket connections  
**🔧 Vercel workaround**: Frontend on Vercel + Backend elsewhere  

## Option 1: Railway (Recommended - Easiest)

### Why Railway?
- ✅ Perfect for Socket.IO/WebSockets
- ✅ Deploy both frontend & backend together
- ✅ Automatic deploys from GitHub
- ✅ Free tier available

### Steps:
1. **Push to GitHub** (if not already done)
2. **Go to [Railway](https://railway.app)** and sign up
3. **Connect your repository**
4. **Deploy** - Railway auto-detects and builds everything!

```bash
# Your project is already configured with:
# - railway.json (deployment config)
# - package.json scripts (build:all, start)
# - Static file serving in backend
```

### Environment Variables (set in Railway dashboard):
```
NODE_ENV=production
PORT=5001
```

---

## Option 2: Hybrid - Frontend on Vercel + Backend on Railway

### Steps:

#### Deploy Backend to Railway:
1. **Create separate repo** for backend or use Railway's subdirectory deploy
2. **Set environment variables**:
   ```
   NODE_ENV=production
   PORT=5001
   ```

#### Deploy Frontend to Vercel:
1. **Set environment variable** in Vercel dashboard:
   ```
   VITE_SERVER_URL=https://your-backend-url.railway.app
   ```
2. **Deploy**: `cd frontend && vercel --prod`

---

## Option 3: Render (Alternative to Railway)

### Steps:
1. **Go to [Render](https://render.com)**
2. **Create Web Service** from your GitHub repo
3. **Configure**:
   - Build Command: `npm run build:all`
   - Start Command: `npm start`
   - Environment: `NODE_ENV=production`

---

## Option 4: Self-Hosted (VPS/DigitalOcean)

### Steps:
1. **Get a VPS** (DigitalOcean, Linode, etc.)
2. **Install Node.js** and **nginx**
3. **Clone your repo** and run:
   ```bash
   npm run install:all
   npm run build:all
   NODE_ENV=production npm start
   ```
4. **Configure nginx** to proxy to your Node.js app

---

## Testing Your Deployment

### Before deploying:
```bash
# Test production build locally
npm run build:all
NODE_ENV=production npm start
# Visit http://localhost:5001
```

### After deploying:
- ✅ Frontend loads correctly
- ✅ Socket.IO connects (check browser console)
- ✅ Can create/join rooms
- ✅ Real-time gameplay works

---

## Troubleshooting

### Common Issues:
1. **Socket.IO connection fails**: Check CORS settings and server URL
2. **Frontend shows 404**: Ensure static files are served correctly
3. **Build fails**: Check all dependencies are installed

### Debug Commands:
```bash
# Check if frontend built correctly
ls frontend/dist/

# Check if backend compiled
ls backend/dist/

# Test connection
curl https://your-app-url.com/api/health
```

---

## Cost Comparison

| Service | Free Tier | Paid |
|---------|-----------|------|
| Railway | ✅ $5/month after free usage | $5-20/month |
| Render | ✅ Limited free tier | $7/month |
| Vercel | ✅ Generous free tier | $20/month |
| DigitalOcean | ❌ No free tier | $5/month |

**Recommendation**: Start with Railway's free tier! 