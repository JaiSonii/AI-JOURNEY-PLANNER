# Environment Setup Guide

## Prerequisites
- Node.js 18+
- npm or yarn
- Git
- Google Cloud Console account
- Supabase account
- Vercel account (for frontend deployment)
- Railway account (for backend deployment)

## Step 1: Clone and Setup Project Structure

```bash
# Create project directory
mkdir asean-journey-planner
cd asean-journey-planner

# Create frontend and backend directories
mkdir frontend backend

# Initialize git
git init
```

## Step 2: Setup Frontend

```bash
cd frontend

# Create React app with TypeScript
npx create-react-app . --template typescript

# Install dependencies
npm install axios leaflet react-leaflet lucide-react zustand
npm install -D @types/leaflet tailwindcss

# Initialize Tailwind CSS
npx tailwindcss init -p

# Update tailwind.config.js
```

**tailwind.config.js:**
```javascript
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Add to src/index.css:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Step 3: Setup Backend

```bash
cd ../backend

# Initialize package.json
npm init -y

# Install dependencies
npm install express cors axios jsonwebtoken bcrypt
npm install @supabase/supabase-js ioredis bull
npm install google-auth-library dotenv
npm install -D nodemon @types/node @types/express typescript

# Create tsconfig.json (optional for TypeScript)
```

## Step 4: Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable APIs:
   - Google Calendar API
   - Google+ API

4. Create OAuth 2.0 credentials:
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (development)
     - `https://your-app.vercel.app` (production)
   - Add authorized redirect URIs:
     - `http://localhost:3000/auth/callback`
     - `https://your-app.vercel.app/auth/callback`

5. Save Client ID and Client Secret

## Step 5: Supabase Setup

1. Create account at [Supabase](https://supabase.com)
2. Create new project
3. Go to SQL Editor and run the database schema (from database-schema artifact)
4. Get your project URL and anon key from Project Settings → API

## Step 6: Redis Setup (Upstash)

1. Create account at [Upstash](https://upstash.com)
2. Create new Redis database
3. Get your Redis connection string

## Step 7: DeepSeek API Setup

1. Sign up at [DeepSeek Platform](https://platform.deepseek.com)
2. Create API key
3. Note: You get $1 free credits, very cost-effective for development

## Step 8: OpenRouteService Setup

1. Sign up at [OpenRouteService](https://openrouteservice.org)
2. Get free API key (2,000 requests/day)

## Step 9: Environment Variables

**Frontend (.env):**
```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id-here
```

**Backend (.env):**
```env
# Server
NODE_ENV=development
PORT=3001

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# Redis
REDIS_URL=redis://default:your-password@your-redis-url:port

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# APIs
DEEPSEEK_API_KEY=your-deepseek-api-key
ORS_API_KEY=your-openrouteservice-api-key

# Optional
SENTRY_DSN=your-sentry-dsn-for-error-tracking
```

## Step 10: Local Development

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

## Step 11: Deployment

### Frontend (Vercel)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd frontend
vercel
```

3. Add environment variables in Vercel dashboard:
   - `REACT_APP_API_URL` = Your Railway backend URL
   - `REACT_APP_GOOGLE_CLIENT_ID` = Your Google Client ID

### Backend (Railway)

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Login and initialize:
```bash
railway login
cd backend
railway init
```

3. Add environment variables in Railway dashboard
4. Deploy:
```bash
railway up
```

## Step 12: Post-Deployment

1. Update Google OAuth authorized origins with production URLs
2. Update CORS settings in backend for production frontend URL
3. Test all features in production
4. Set up monitoring (optional):
   - Vercel Analytics for frontend
   - Railway metrics for backend
   - Sentry for error tracking

## Troubleshooting

### Common Issues:

1. **CORS errors**: Make sure backend CORS is configured for frontend URL
2. **OAuth not working**: Check redirect URIs match exactly
3. **Database connection**: Verify Supabase URL and key
4. **Map not showing**: Leaflet CSS must be imported
5. **Routes not found**: Check OpenRouteService API key and quotas

### Testing Checklist:

- [ ] Google OAuth login/logout
- [ ] Route search and display
- [ ] Map visualization
- [ ] AI chat functionality
- [ ] User patterns detection
- [ ] Calendar integration
- [ ] Route saving
- [ ] Traffic updates
- [ ] Cost calculations
- [ ] Mobile responsive design

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files
   - Use different keys for development/production
   - Rotate JWT secrets regularly

2. **API Security**:
   ```javascript
   const rateLimit = require('express-rate-limit');
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   
   app.use('/api/', limiter);
   ```

3. **Input Validation**:
   - Validate all user inputs
   - Use parameterized queries
   - Sanitize data before storage

4. **CORS Configuration**:
   - Use specific origins in production
   - Avoid using `*` for Access-Control-Allow-Origin

## Performance Optimization

1.  **Database Indexes** (already included in schema)
2.  **Connection Pooling** for Supabase
3.  **Redis Caching** for frequently accessed data
4.  **API Response Compression**
5.  **Frontend Code Splitting**

## Monitoring and Analytics

1. **Frontend**: Vercel Analytics
2. **Backend**: Railway Metrics
3. **Error Tracking**: Sentry (optional)
4. **Database**: Supabase Dashboard
5. **API Usage**: Track with middleware

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Vercel Documentation](https://vercel.com/docs)
- [Google OAuth Guide](https://developers.google.com/identity/protocols/oauth2)
- [OpenRouteService API](https://openrouteservice.org/dev/#/api-docs)

## Support

For issues or questions:
- GitHub Issues for bug reports
- Stack Overflow for technical questions
- Official documentation for each service

Your ASEAN Journey Planner is now fully integrated with:
- ✅ Complete Google OAuth authentication
- ✅ Frontend-backend API integration
- ✅ Real-time route calculation
- ✅ AI-powered chat with DeepSeek
- ✅ User pattern analysis
- ✅ Calendar synchronization
- ✅ Secure JWT authentication
- ✅ Redis caching for performance
- ✅ Production-ready deployment configuration

The application is ready to help commuters across ASEAN cities optimize their daily journeys! [ ] Google OAuth login/logout
- [ ] Route search and display
- [ ] Map visualization
- [ ] AI chat functionality
- [ ] User patterns detection
- [ ] Calendar integration
- [ ] Route saving
- [ ] Traffic updates
- [ ] Cost calculations
- [ ] Mobile responsive design

