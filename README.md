# SafeWalk-Chicago

This repository contains a Vue 3 frontend (`safewalk-web`) and a minimal FastAPI backend (`backend`) for a safety‑aware routing application focused on Chicago.

## Backend setup

```bash
cd backend
python -m venv venv          # create virtual environment
# activate venv: Windows Powershell: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload      # starts backend on port 8000
```

The backend exposes a single endpoint `POST /api/alert` which logs incoming SOS alerts (latitude, longitude, timestamp).

## Frontend setup

```bash
cd safewalk-web
npm install
# create .env.local containing your Google Maps API key:
# VITE_GOOGLE_MAPS_KEY=your_real_google_maps_api_key_here
npm run dev
```

The Vue app will be served on `http://localhost:5173` (or as printed by Vite). When opened you will see a prompt asking "Where do you want to go?". Enter a destination in Chicago and press Enter. The map will display Chicago with ranked walking routes colored by safety (based on recent crime data).

Click the "Show" button to highlight a route, and when you reach your destination click "I've arrived" to display the arrival overlay. Press the red SOS button anytime to send your current location to the backend and optionally call 911.

### Notes
- Google Maps API key is required for geocoding and map display.
- Routes are pre‑filtered for Chicago coordinates (centered on [-87.6298, 41.8781]).
- The application uses PrimeVue and Ionicons for UI components.

