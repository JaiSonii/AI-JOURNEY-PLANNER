import { useState, useEffect, } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { Calendar, Clock, DollarSign, Navigation, MessageSquare, Search, Settings, ChevronRight, Loader2, AlertCircle, LogOut } from 'lucide-react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import './App.css';
import './index.css'
import MarkDown from 'react-markdown'
// Fix for default markers in react-leaflet
import L from 'leaflet';

// Extend the Window interface to include 'google'
declare global {
  interface Window {
    google?: any;
  }
}


// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Axios instance with interceptor
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Google OAuth Script
// const loadGoogleScript = () => {
//   return new Promise((resolve) => {
//     if (window.google) {
//       resolve();
//       return;
//     }
//     const script = document.createElement('script');
//     script.src = 'https://accounts.google.com/gsi/client';
//     script.onload = resolve;
//     document.body.appendChild(script);
//   });
// };

const App = () => {
  const [activeTab, setActiveTab] = useState<string>('planner');
  const [origin, setOrigin] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('optimal');
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [userPatterns, setUserPatterns] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const transportModes = [
    { id: 'optimal', name: 'Optimal', icon: '🎯' },
    { id: 'public', name: 'Public Transit', icon: '🚇' },
    { id: 'car', name: 'Car', icon: '🚗' },
    { id: 'motorcycle', name: 'Motorcycle', icon: '🏍️' },
    { id: 'walk', name: 'Walk', icon: '🚶' }
  ];

  // Initialize Google OAuth
  // useEffect(() => {
  //   const initGoogleAuth = async () => {
  //     await loadGoogleScript();

  //     if (window.google) {
  //       window.google.accounts.id.initialize({
  //         client_id: GOOGLE_CLIENT_ID,
  //         callback: handleGoogleResponse,
  //       });

  //       window.google.accounts.id.renderButton(
  //         document.getElementById('googleSignInButton'),
  //         { 
  //           theme: 'outline', 
  //           size: 'large',
  //           width: 200,
  //           text: 'signin_with'
  //         }
  //       );
  //     }
  //   };

  //   // Check for existing session
  //   const token = localStorage.getItem('authToken');
  //   if (token) {
  //     validateSession(token);
  //   }

  //   initGoogleAuth();
  // }, []);

  // Validate existing session

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) validateSession(token);
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('authToken');
    if (authToken) {
      localStorage.setItem('authToken', authToken);
      validateSession(authToken);
      window.history.replaceState({}, document.title, window.location.pathname); // Clean URL
    }
  }, []);



  const handleGoogleRedirectLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = `${API_URL}/auth/google/callback`;

    const scope = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'openid',
      'email',
      'profile'
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `scope=${encodeURIComponent(scope)}`;

    console.log('Redirecting to:', authUrl);
    window.location.href = authUrl;
  };



  const validateSession = async (token : string) => {
    try {
      console.log(token)
      const response = await api.get('/auth/validate');
      if (response.data.user) {
        setIsLoggedIn(true);
        setUser(response.data.user);
        fetchUserPatterns();
      }
    } catch (error) {
      localStorage.removeItem('authToken');
    }
  };

  // Handle Google OAuth response
  // const handleGoogleResponse = async (response) => {
  //   try {
  //     const { data } = await api.post('/auth/google', {
  //       token: response.credential,
  //     });

  //     localStorage.setItem('authToken', data.token);
  //     setIsLoggedIn(true);
  //     setUser(data.user);
  //     setError(null);

  //     // Fetch user data after login
  //     fetchUserPatterns();
  //     fetchCalendarEvents();
  //   } catch (error) {
  //     console.error('Login failed:', error);
  //     setError('Login failed. Please try again.');
  //   }
  // };

  // Logout function
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsLoggedIn(false);
    setUser(null);
    setUserPatterns(null);
    setCalendarEvents([]);

    // Re-render Google button
    if (window.google ) {
      window.google.accounts.id.renderButton(
        document.getElementById('googleSignInButton'),
        { theme: 'outline', size: 'large' }
      );
    }
  };

  // Fetch user patterns
  const fetchUserPatterns = async () => {
    try {
      const { data } = await api.get('/user/patterns');
      setUserPatterns(data);
    } catch (error) {
      console.error('Failed to fetch user patterns:', error);
    }
  };

  // Fetch calendar events
  const fetchCalendarEvents = async () => {
    try {
      const startDate = new Date().toISOString();
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data } = await api.get('/calendar/events', {
        params: { startDate, endDate }
      });

      setCalendarEvents(data);
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
    }
  };

  // Search for routes
  const handleSearch = async () => {
    if (!origin || !destination) {
      setError('Please enter both origin and destination');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/routes/plan', {
        origin,
        destination,
        mode: selectedMode,
        departureTime: new Date().toISOString(),
      });

      setRoutes(data);
      if (data.length > 0) {
        setSelectedRoute(data[0]);
      }

      // Save journey to history if logged in
      if (isLoggedIn) {
        await api.post('/user/journey', {
          origin,
          destination,
          mode: selectedMode,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Route search failed:', error);
      setError('Failed to find routes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle chat submission
  const handleChatSubmit = async (e : any) => {
    e.preventDefault();
    setThinking(true);

    if (!chatMessage.trim()) return;

    if (!isLoggedIn) {
      setError('Please login to use AI chat features');
      return;
    }

    const userMsg = { type: 'user', content: chatMessage };
    setChatHistory([...chatHistory, userMsg]);
    setChatMessage('');

    try {
      const { data } = await api.post('/ai/chat', {
        message: chatMessage,
        context: {
          currentLocation: origin,
          recentSearches: routes.slice(0, 3),
          userPatterns,
        },
      });

      const aiResponse = {
        type: 'ai',
        content: data.response,
        intent: data.intent,
        suggestedRoutes: data.suggestedRoutes,
      };

      setChatHistory(prev => [...prev, aiResponse]);

      // If AI extracted journey intent, populate the form
      if (data.intent) {
        if (data.intent.origin) setOrigin(data.intent.origin);
        if (data.intent.destination) setDestination(data.intent.destination);
        if (data.intent.mode) setSelectedMode(data.intent.mode);

        // Auto-search if we have origin and destination
        if (data.intent.origin && data.intent.destination) {
          handleSearch();
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = {
        type: 'ai',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setThinking(false)
    }
  };

  // Plan route from calendar event
  const planRouteFromEvent = (event : any) => {
    setDestination(event.location);
    setActiveTab('planner');

    if (event.suggestion) {
      // Show departure time suggestion
      const departTime = new Date(event.suggestion.departureTime);
      const timeStr = departTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });

      setError(`Suggested departure time: ${timeStr} for your ${event.title}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">🚀 ASEAN Journey Planner</h1>
            </div>
            <div className="flex items-center space-x-4">
              {isLoggedIn ? (
                <>
                  <button
                    className="text-gray-700 hover:text-gray-900"
                    onClick={fetchCalendarEvents}
                  >
                    <Calendar className="w-5 h-5" />
                  </button>
                  <button className="text-gray-700 hover:text-gray-900">
                    <Settings className="w-5 h-5" />
                  </button>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                    <span className="text-sm text-gray-700">{user?.name}</span>
                    <button
                      onClick={handleLogout}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleGoogleRedirectLogin}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Journey Planner */}
          <div className="lg:col-span-1 space-y-4">
            {/* Tab Navigation */}
            <div className="bg-white rounded-lg shadow-sm p-1">
              <div className="flex space-x-1">
                <button
                  onClick={() => setActiveTab('planner')}
                  className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'planner'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  Planner
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'chat'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  AI Chat
                </button>
              </div>
            </div>

            {/* Journey Planner */}
            {activeTab === 'planner' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="Enter origin location"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Enter destination"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Transport Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {transportModes.map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setSelectedMode(mode.id)}
                          className={`flex items-center justify-center p-2 rounded-md border text-sm ${selectedMode === mode.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          <span className="mr-1">{mode.icon}</span>
                          {mode.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleSearch}
                    disabled={loading || !origin || !destination}
                    className="w-full flex items-center justify-center bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Find Routes
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* AI Chat */}
            {activeTab === 'chat' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="space-y-4">
                  <div className="h-64 overflow-y-auto space-y-2 mb-4">
                    {chatHistory.length === 0 ? (
                      <div className="text-center text-gray-500 mt-8">
                        <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>Ask me anything about your journey!</p>
                        <p className="text-sm mt-2">e.g., "I need to reach SCBD by 9 AM tomorrow"</p>
                      </div>
                    ) : (
                      chatHistory.map((msg : any, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${msg.type === 'user'
                            ? 'bg-blue-100 ml-auto max-w-[80%]'
                            : 'bg-gray-100 mr-auto max-w-[80%]'
                            }`}
                        >
                          <p className="text-sm"><MarkDown>{msg.content}</MarkDown></p>
                          {msg.intent && (
                            <div className="mt-2 text-xs text-gray-600">
                              📍 {msg.intent.origin} → {msg.intent.destinatioWn}
                            </div>
                          )}

                        </div>
                      ))
                    )}
                    {thinking && <div className='p-3 rounded-lg bg-gray-100 mr-auto max-w-[80%]'>
                      <p className='text-sm'>Typing...</p>
                    </div>}
                  </div>

                  <form onSubmit={handleChatSubmit} className="flex space-x-2">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder={isLoggedIn ? "Type your message..." : "Please login to use AI chat"}
                      disabled={!isLoggedIn}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                    <button
                      type="submit"
                      disabled={!isLoggedIn}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Route Options */}
            {routes.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">Route Options</h3>
                <div className="space-y-3">
                  {routes.map((route : any) => (
                    <button
                      key={route.id}
                      onClick={() => setSelectedRoute(route)}
                      className={`w-full p-4 rounded-lg border text-left transition-all ${selectedRoute?.id === route.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{route.mode}</h4>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                            <span className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              {route.duration} min
                            </span>
                            <span className="flex items-center">
                              <DollarSign className="w-4 h-4 mr-1" />
                              {(route.cost / 1000).toFixed(0)}k IDR
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`inline-block px-2 py-1 text-xs rounded-full ${route.traffic?.congestion === 'low' ? 'bg-green-100 text-green-800' :
                            route.traffic?.congestion === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                            {route.traffic?.congestion || 'normal'} traffic
                          </span>
                          <div className="text-xs text-gray-500 mt-1">
                            {route.carbonFootprint} kg CO₂
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Map and Details */}
          <div className="lg:col-span-2 space-y-4">
            {/* Map */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <MapContainer
                center={[-6.2088, 106.8456]}
                zoom={12}
                style={{ height: '400px', width: '100%' }}
                className="rounded-lg"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {selectedRoute && selectedRoute.coordinates && (
                  <>
                    <Marker position={selectedRoute.coordinates[0]}>
                      <Popup>Origin</Popup>
                    </Marker>
                    <Marker position={selectedRoute.coordinates[selectedRoute.coordinates.length - 1]}>
                      <Popup>Destination</Popup>
                    </Marker>
                    <Polyline
                      positions={selectedRoute.coordinates}
                      color={
                        selectedRoute.traffic?.congestion === 'low' ? '#10b981' :
                          selectedRoute.traffic?.congestion === 'medium' ? '#f59e0b' :
                            '#ef4444'
                      }
                      weight={5}
                      opacity={0.7}
                    />
                  </>
                )}
              </MapContainer>
            </div>

            {/* Route Details */}
            {selectedRoute && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">Route Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Clock className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold">{selectedRoute.duration}</p>
                    <p className="text-sm text-gray-600">minutes</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <DollarSign className="w-6 h-6 mx-auto mb-2 text-green-600" />
                    <p className="text-2xl font-bold">{(selectedRoute.cost / 1000).toFixed(0)}k</p>
                    <p className="text-sm text-gray-600">IDR</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Navigation className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                    <p className="text-2xl font-bold">{selectedRoute.distance}</p>
                    <p className="text-sm text-gray-600">km</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                    <p className="text-2xl font-bold">{selectedRoute.carbonFootprint}</p>
                    <p className="text-sm text-gray-600">kg CO₂</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">Step by Step Directions</h4>
                  {selectedRoute.steps?.map((step : any, idx : number) => (
                    <div key={idx} className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-700">{step}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    </div>
                  ))}
                </div>

                {userPatterns && userPatterns.confidence > 0.5 && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">💡 Smart Tip</h4>
                    <p className="text-sm text-blue-700">
                      Based on your travel patterns, leaving 10 minutes earlier could save you 15 minutes in traffic.
                      We've noticed you usually travel this route on {userPatterns.peakHours?.[0]?.hour}:00.
                    </p>
                  </div>
                )}

                <div className="mt-4 flex space-x-3">
                  <button className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
                    Start Navigation
                  </button>
                  <button className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300">
                    Save Route
                  </button>
                </div>
              </div>
            )}

            {/* Calendar Integration */}
            {isLoggedIn && calendarEvents.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Calendar className="w-5 h-5 mr-2" />
                  Upcoming Trips
                </h3>
                <div className="space-y-3">
                  {calendarEvents.map((event : any, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(event.startTime).toLocaleString()}
                        </p>
                        {event.location && (
                          <p className="text-xs text-gray-500">📍 {event.location}</p>
                        )}
                      </div>
                      <button
                        onClick={() => planRouteFromEvent(event)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Plan Route
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">ASEAN Journey Planner</h3>
              <p className="text-gray-400">
                AI-powered journey planning for urban commuters across Southeast Asia.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-3">Supported Cities</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Jakarta, Indonesia</li>
                <li>Kuala Lumpur, Malaysia</li>
                <li>Bangkok, Thailand</li>
                <li>Manila, Philippines</li>
                <li>Hanoi, Vietnam</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-3">Features</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Real-time Traffic Updates</li>
                <li>Multi-modal Transportation</li>
                <li>AI Trip Planning</li>
                <li>Calendar Integration</li>
                <li>Cost Comparison</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-700 text-center text-gray-400">
            <p>&copy; 2025 ASEAN Journey Planner. Built with ❤️ for urban commuters.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;