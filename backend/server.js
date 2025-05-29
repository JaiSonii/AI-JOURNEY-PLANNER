// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const dotenv = require('dotenv')
const polyline = require('@mapbox/polyline');
const {google} = require('googleapis')


dotenv.config()

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const REDIS_URL = process.env.REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const ORS_API_KEY = process.env.ORS_API_KEY
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Initialize services
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const redis = new Redis(REDIS_URL);
const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Validate session
app.get('/auth/validate', authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.userId)
      .single();

    if (user) {
      res.json({ valid: true, user });
    } else {
      res.status(401).json({ valid: false });
    }
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/auth/google/callback'
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });

    const { data: userInfo } = await oauth2.userinfo.get();

    // Store user + refresh_token (not access_token)
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', userInfo.email)
      .single();

    let user;
    if (!existingUser) {
      const { data: newUser } = await supabase
        .from('users')
        .insert([{
          email: userInfo.email,
          name: userInfo.name,
          oauth_id: userInfo.id,
          oauth_provider: 'google',
          google_calendar_token: tokens.refresh_token,
          preferences: {}
        }])
        .select()
        .single();
      user = newUser;
    } else {
      await supabase
        .from('users')
        .update({ google_calendar_token: tokens.refresh_token })
        .eq('id', existingUser.id);
      user = existingUser;
    }

    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Redirect to frontend
    res.redirect(`http://localhost:5173?authToken=${jwtToken}`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).send('Authentication failed.');
  }
});

// Authentication
// app.post('/auth/google', async (req, res) => {
//   try {
//     const { token } = req.body;
//     const {tokens} = await client.getToken(token);
//     const ticket = await client.verifyIdToken({
//       idToken: token,
//       audience: GOOGLE_CLIENT_ID,
//     });

//     const payload = ticket.getPayload();
//     const userId = payload['sub'];

//     // Check if user exists
//     const { data: existingUser } = await supabase
//       .from('users')
//       .select('*')
//       .eq('oauth_id', userId)
//       .single();

//     let user;
//     if (!existingUser) {
//       // Create new user
//       const { data: newUser, error } = await supabase
//         .from('users')
//         .insert([
//           {
//             oauth_id: userId,
//             email: payload.email,
//             name: payload.name,
//             oauth_provider: 'google',
//             google_calendar_token : tokens.access_token,
//             preferences: {}
//           }
//         ])
//         .select()
//         .single();

//       if (error) throw error;
//       user = newUser;
//     } else {
//       user = existingUser;
//     }

//     // Generate JWT
//     const jwtToken = jwt.sign(
//       { userId: user.id, email: user.email },
//       JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     res.json({ token: jwtToken, user });
//   } catch (error) {
//     console.error('Auth error:', error);
//     res.status(400).json({ error: 'Authentication failed' });
//   }
// });

// Route Planning
app.post('/routes/plan', async (req, res) => {
  try {
    const { origin, destination, mode, departureTime } = req.body;

    // Check cache first
    const cacheKey = `route:${origin}:${destination}:${mode}:${departureTime}`;
    const cachedRoute = await redis.get(cacheKey);

    if (cachedRoute) {
      return res.json(JSON.parse(cachedRoute));
    }

    // Convert addresses to coordinates
    const originCoords = await geocodeAddress(origin);
    const destCoords = await geocodeAddress(destination);

    if (!originCoords || !destCoords) {
      return res.status(400).json({ error: 'Unable to geocode addresses' });
    }

    // Calculate routes for different modes
    const routes = await calculateMultiModalRoutes(originCoords, destCoords, mode);
    // Get traffic data and enrich routes
    const enrichedRoutes = await Promise.all(
      routes.map(async (route, index) => {
        const traffic = await getTrafficData(route);
        return {
          id: index + 1,
          mode: route.mode,
          duration: Math.round(route.duration + (traffic.delay || 0)),
          distance: route.distance,
          cost: calculateCost(route),
          carbonFootprint: calculateCarbonFootprint(route),
          steps: route.instructions || ['Route details'],
          coordinates: route.coordinates,
          traffic: traffic
        };
      })
    );

    // Cache results for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(enrichedRoutes));

    res.json(enrichedRoutes);
  } catch (error) {
    console.error('Route planning error:', error);
    res.status(500).json({ error: 'Failed to plan route' });
  }
});

// Save journey history
app.post('/user/journey', authenticateToken, async (req, res) => {
  try {
    const { origin, destination, mode, timestamp } = req.body;
    const userId = req.user.userId;

    const { data, error } = await supabase
      .from('journeys')
      .insert([
        {
          user_id: userId,
          origin: { address: origin },
          destination: { address: destination },
          mode: mode,
          timestamp: timestamp || new Date()
        }
      ])
      .select();

    if (error) throw error;

    // Update user patterns in background
    updateUserPatterns(userId);

    res.json({ success: true, journey: data[0] });
  } catch (error) {
    console.error('Journey save error:', error);
    res.status(500).json({ error: 'Failed to save journey' });
  }
});

// AI Chat Integration
app.post('/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { message, context } = req.body;
    const userId = req.user.userId;

    // Get user preferences and history
    const { data: userPatterns } = await supabase
      .from('user_patterns')
      .select('*')
      .eq('user_id', userId);

    // Prepare AI prompt
    const prompt = buildAIPrompt(message, context, userPatterns);

    // Call DeepSeek API
    const aiResponse = await callGeminiAPI(prompt);

    // Parse AI response for journey intent
    const journeyIntent = parseJourneyIntent(aiResponse);

    // Save chat history
    await supabase
      .from('chat_history')
      .insert([
        {
          user_id: userId,
          message: message,
          response: aiResponse,
          intent: journeyIntent
        }
      ]);

    res.json({
      response: aiResponse,
      intent: journeyIntent,
      suggestedRoutes: journeyIntent ? await (async () => {
        const originCoords = await geocodeAddress(journeyIntent.origin);
        const destCoords = await geocodeAddress(journeyIntent.destination);
        if (!originCoords || !destCoords) return null;
        return await calculateRoutes(originCoords, destCoords, journeyIntent.mode);
      })() : null
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// User Patterns Analysis
app.get('/user/patterns', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get journey history
    const { data: journeys } = await supabase
      .from('journeys')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(100);

    // Analyze patterns
    const patterns = analyzeUserPatterns(journeys);

    // Update patterns in database
    await supabase
      .from('user_patterns')
      .upsert([
        {
          user_id: userId,
          pattern_type: 'commute',
          pattern_data: patterns,
          confidence: patterns.confidence,
          updated_at: new Date()
        }
      ]);

    res.json(patterns);
  } catch (error) {
    console.error('Pattern analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze patterns' });
  }
});

// Calendar Integration
app.get('/calendar/events', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.userId;

    // Get user's Google Calendar token
    const { data: user } = await supabase
      .from('users')
      .select('google_calendar_token')
      .eq('id', userId)
      .single();

    if (!user?.google_calendar_token) {
      return res.status(400).json({ error: 'Calendar not connected' });
    }

    // Fetch calendar events
    const events = await fetchGoogleCalendarEvents(
      user.google_calendar_token,
      startDate,
      endDate
    );

    // Filter events with locations
    const eventsWithLocations = events.filter(event => event.location);

    // Suggest departure times
    const eventsWithSuggestions = await Promise.all(
      eventsWithLocations.map(async (event) => {
        const suggestion = await suggestDepartureTime(event, userId);
        return { ...event, suggestion };
      })
    );

    res.json(eventsWithSuggestions);
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// Helper Functions

async function geocodeAddress(address) {
  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search`,
      {
        params: {
          q: address,
          format: 'json',
          limit: 1
        },
        headers: {
          'User-Agent': 'ASEAN-Journey-Planner/1.0'
        }
      }
    );

    console.log("Geo Code Response : ", JSON.stringify(response.data))

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon)
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

async function calculateMultiModalRoutes(origin, destination, preferredMode) {
  const modes = preferredMode === 'optimal'
    ? ['driving-car', 'foot-walking', 'cycling-regular']
    : [mapModeToORS(preferredMode)];

  console.log(modes)

  const routes = await Promise.all(
    modes.map(mode => calculateRoutes(origin, destination, mode))
  );

  return routes.flat().filter(route => route !== null);
}

function mapModeToORS(mode) {
  const modeMap = {
    'car': 'driving-car',
    'motorcycle': 'driving-car',
    'walk': 'foot-walking',
    'public': 'foot-walking',
    'cycling': 'cycling-regular',
    'optimal': 'driving-car'
  };
  return modeMap[mode?.toLowerCase()?.trim()] || 'driving-car';
}

async function calculateRoutes(origin, destination, mode) {
  try {
    mode = mapModeToORS(mode);  // ✅ Enforce valid mode mapping

    if (!origin?.lat || !origin?.lon || !destination?.lat || !destination?.lon) {
      throw new Error('Invalid origin or destination coordinates');
    }

    const response = await axios.post(
      `https://api.openrouteservice.org/v2/directions/${mode}`,
      {
        coordinates: [[origin.lon, origin.lat], [destination.lon, destination.lat]],
        elevation: false,
        instructions: true,
        units: 'km'
      },
      {
        headers: {
          Authorization: ORS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(JSON.stringify(response.data))

    if (response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const coordinates = polyline.decode(route.geometry);
      return {
        mode: mapORSToMode(mode),
        duration: Math.round(route.summary.duration / 60), // Convert to minutes
        distance: route.summary.distance, // Convert to km
        coordinates: coordinates, // Flip to lat,lng
        instructions: route.segments[0].steps.map(step => step.instruction)
      };
    }
    return null;
  } catch (error) {
    console.error('Routing API error:', JSON.stringify(error));
    return null;
  }
}

function mapORSToMode(orsMode) {
  const modeMap = {
    'driving-car': 'Car',
    'foot-walking': 'Walking',
    'cycling-regular': 'Cycling'
  };
  return modeMap[orsMode] || orsMode;
}

function calculateCost(route) {
  // Cost calculation in IDR
  const costPerKm = {
    'Car': 5000,
    'Motorcycle': 2500,
    'Walking': 0,
    'Cycling': 0,
    'Public Transit': 1000
  };

  const baseCost = (costPerKm[route.mode] || 3000) * route.distance;

  // Add parking cost for cars/motorcycles
  if (route.mode === 'Car') return baseCost + 10000;
  if (route.mode === 'Motorcycle') return baseCost + 5000;

  return Math.round(baseCost);
}

function calculateCarbonFootprint(route) {
  // CO2 emissions in kg
  const emissionsPerKm = {
    'Car': 0.21,
    'Motorcycle': 0.11,
    'Walking': 0,
    'Cycling': 0,
    'Public Transit': 0.05
  };

  const emissions = (emissionsPerKm[route.mode] || 0.1) * route.distance;
  return Math.round(emissions * 10) / 10;
}

async function getTrafficData(route) {
  // Simulate traffic data based on current time
  const hour = new Date().getHours();
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

  let congestion = 'low';
  let delay = 0;

  if (route.mode === 'Car' || route.mode === 'Motorcycle') {
    if (isRushHour) {
      congestion = 'high';
      delay = route.duration * 0.4; // 40% delay
    } else if (hour >= 10 && hour <= 16) {
      congestion = 'medium';
      delay = route.duration * 0.2; // 20% delay
    }
  }

  return {
    congestion,
    delay: Math.round(delay),
    timestamp: new Date()
  };
}

async function updateUserPatterns(userId) {
  try {
    setTimeout(async () => {
      const { data: journeys, error } = await supabase
        .from('journeys')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Failed to fetch journeys for pattern analysis:', error);
        return;
      }

      const patterns = analyzeUserPatterns(journeys);

      await supabase
        .from('user_patterns')
        .upsert([{
          user_id: userId,
          pattern_type: 'commute',
          pattern_data: patterns,
          confidence: patterns.confidence,
          updated_at: new Date()
        }]);
    }, 1000);
  } catch (error) {
    console.error('Pattern update error:', error);
  }
}


function buildAIPrompt(message, context, userPatterns) {
  return `You are an AI journey planner for ASEAN cities. 
User message: "${message}"
Context: ${JSON.stringify(context)}
User patterns: ${JSON.stringify(userPatterns)}

Extract journey planning intent and provide helpful route suggestions.
Consider traffic patterns, user preferences, and local transportation options.
Return a JSON object with: origin, destination, departureTime, mode, preferences.`;
}

async function callGeminiAPI(prompt) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    // Gemini returns response in this nested format
    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    return content || '';
  } catch (error) {
    console.error('Gemini API error:', error?.response?.data || error);
    throw error;
  }
}


async function callDeepSeekAPI(prompt) {
  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful journey planning assistant for ASEAN cities.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('DeepSeek API error:', error);
    throw error;
  }
}

function parseJourneyIntent(aiResponse) {
  try {
    // Extract JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('Failed to parse journey intent:', error);
    return null;
  }
}

function analyzeUserPatterns(journeys) {
  if (!journeys || journeys.length === 0) {
    return { confidence: 0 };
  }

  // Analyze common routes
  const routeCounts = {};
  journeys.forEach(journey => {
    if (journey.origin && journey.destination) {
      const routeKey = `${journey.origin.address}-${journey.destination.address}`;
      routeCounts[routeKey] = (routeCounts[routeKey] || 0) + 1;
    }
  });

  // Find most common routes
  const commonRoutes = Object.entries(routeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([route, count]) => ({ route, count }));

  // Analyze travel times
  const hourCounts = {};
  journeys.forEach(journey => {
    const hour = new Date(journey.timestamp).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  // Find peak travel times
  const peakHours = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }));

  // Calculate confidence score
  const confidence = Math.min(journeys.length / 20, 1) * 0.8 +
    (commonRoutes.length > 0 ? 0.2 : 0);

  return {
    commonRoutes,
    peakHours,
    totalJourneys: journeys.length,
    confidence,
    lastUpdated: new Date()
  };
}

async function suggestDepartureTime(event, userId) {
  // Get user's common origin (home/office)
  const { data: patterns } = await supabase
    .from('user_patterns')
    .select('pattern_data')
    .eq('user_id', userId)
    .single();

  if (!patterns?.pattern_data?.commonOrigin) {
    return null;
  }

  // Calculate route to event location
  const route = await calculateRoutes(
    patterns.pattern_data.commonOrigin,
    event.location,
    'optimal'
  );

  if (!route || route.length === 0) {
    return null;
  }

  // Add buffer time for traffic
  const estimatedDuration = route[0].duration * 1.2; // 20% buffer
  const departureTime = new Date(event.start);
  departureTime.setMinutes(departureTime.getMinutes() - estimatedDuration);

  return {
    departureTime,
    estimatedDuration,
    route: route[0]
  };
}

async function fetchGoogleCalendarEvents(refreshToken, startDate, endDate) {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'http://localhost:3001/auth/google/callback'
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const eventsResponse = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(startDate).toISOString(),
    timeMax: new Date(endDate).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50, // tune as needed
  });

  return eventsResponse.data.items || [];
}

// Start server
app.listen(PORT, () => {
  console.log(`Journey Planner API running on port ${PORT}`);
});

// Export for testing
module.exports = app;