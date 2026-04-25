# Backend Agent - Auto Article Generation

Automated article generation service for TopNewsBlog with Firebase-controlled automation.

## Features

- **Automated Article Generation**: Generates articles at configurable intervals
- **Firebase Settings Integration**: Reads automation settings from Firebase
- **Health Check Endpoint**: Admin panel can check if server is running
- **Manual Generation**: Trigger article generation via API
- **Auto-sync Settings**: Checks Firebase every 30 seconds for setting changes
- 🤖 **Auto-generates articles** every 120 seconds (configurable)
- 🧠 **AI-powered** with Groq (primary) and Gemini (fallback)
- 🖼️ **Smart image sourcing**: 70% Unsplash, 30% AI-generated
- 🔥 **Firebase integration** for article storage
- 📊 **Rich content**: Tables, YouTube embeds, external links
- ⭐ **Featured article management** with manual override
- 🎯 **Topic generation** from configured categories

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

**Important:** You need to get Firebase Admin SDK credentials:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Extract the values and add to `.env`:
   - `FIREBASE_PRIVATE_KEY_ID`
   - `FIREBASE_PRIVATE_KEY` (keep the quotes and \\n)
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_CLIENT_ID`
   - `FIREBASE_CERT_URL`

### 3. Configure Topics & Settings

Edit `config.json` to customize:
- **categories**: Topics the agent will write about
- **newsSources**: URLs to gather context from
- **articleSettings**: Probabilities for features (tables, videos, etc.)

### 4. Run the Server

**NEW: The backend agent now runs as an Express server**

```bash
# Run the server (recommended)
npm run server
```

The server will:
- Start on port 3001 (or PORT env variable)
- Fetch automation settings from Firebase on startup
- Check Firebase every 30 seconds for setting changes
- Auto-start/stop article generation based on Firebase settings

**Old method (direct execution):**
```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and automation state.

### Manual Article Generation
```
POST /generate
```
Manually trigger article generation (works even if automation is disabled).
```
GET /api/articles/featured
```

### Set Featured Article (Manual Override)
```
POST /api/articles/featured/:id
```

### Unlock Featured Article (Auto Mode)
```
POST /api/articles/featured/unlock
```

### Generate Article Manually
```
POST /api/generate
```

### Start Agent
```
POST /api/agent/start
```

### Stop Agent
```
POST /api/agent/stop
```

## How It Works

1. **Topic Generation**: AI generates a trending topic from configured categories
2. **Content Creation**: Groq AI writes the article (falls back to Gemini if needed)
3. **Image Sourcing**: Fetches from Unsplash (70%) or generates with Cloudflare AI (30%)
4. **Firebase Storage**: Saves article with metadata, timestamp, category
5. **Featured Logic**: Auto-sets latest as featured (unless manual override is active)

## Configuration

### Article Generation Interval
Change in `.env`:
```
ARTICLE_GENERATION_INTERVAL=120000  # 120 seconds
```

### Content Features
Adjust probabilities in `config.json`:
```json
{
  "articleSettings": {
    "shortPostProbability": 0.3,
    "twoImageProbability": 0.2,
    "includeTableProbability": 0.4,
    "includeYouTubeProbability": 0.3
  }
}
```

## Troubleshooting

### Firebase Connection Issues
- Ensure service account credentials are correct
- Check Firebase project ID matches
- Verify Firestore is enabled in Firebase Console

### AI Generation Fails
- Check API keys are valid
- Monitor rate limits (Groq has free tier limits)
- Gemini will auto-fallback if Groq fails

### Images Not Loading
- Verify Unsplash access key
- Check Cloudflare API token
- Ensure Firebase Storage rules allow public read

## License

ISC
