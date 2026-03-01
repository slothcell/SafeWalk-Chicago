# SafeWalk Loop (Chicago MVP)

SafeWalk Loop is a lightweight web‑app prototype built for people living in the heart of Chicago. Its **core purpose** is to help users navigate along the *safest possible walking routes* to their destination by taking recent crime data into account and alerting them if anything dangerous appears nearby.

---

## 🚧 What this MVP uses

- **Frontend:** Vue 3 (TypeScript) with Vite
- **Styling/UI:** PrimeVue components and custom CSS
- **Mapping:** Google Maps (via browser API) for display, geocoding, and routing
- **Weather:** Open‑Meteo API for a simple onsite weather widget
- **Backend:** minimal FastAPI service used for SOS alerts

---

## 🧭 Safety criteria & route coloring

- **Safe (green):** no known danger within a one‑mile radius of the route
- **Moderate (yellow):** danger exists nearby but not within a half‑mile radius
- **Avoid (red):** at least one dangerous checkpoint lies within a half‑mile of the path

Whenever a hazard is detected along a route, the user is notified and the route badge changes accordingly.

---

## 🚀 User experience flow

1. On first load the app asks the user for location permission and uses it as the origin.
2. A search bar at the top asks you your location and the destination.
3. After entering a destination in Chicago, the app calculates multiple walking routes, scores them by safety, and displays them in a side panel.
4. The user picks one of the suggested routes.
5. Checkpoints marked as dangerous are automatically updated on the map and shown to the user as they move.
6. During navigation, the map keeps the user‑location arrow recentred.
7. Upon arrival, the screen fades and a message **“you have arrived!”** appears for five seconds before disappearing.

---

## 🧑‍💻 Profile & emergency features

Users are prompted to enter basic profile information:
- Name, phone number, address, email
- Blood group, birthday

Within the profile they may manage a list of emergency contacts. When the **"I feel unsafe"** button in the bottom tab is pressed, the user’s current location is sent to those contacts. An SOS button in the top‑right corner immediately contacts 911 (simulated by the backend alert endpoint).


### 🗂 Additional app features

- The current route is always visible on the map with live updates.
- Bottom tab can be dragged up to reveal the unsafe‑button and other controls.
- History of previously travelled routes, ability to star/favorite destinations (MVP placeholder – not yet implemented).

---

## 📁 Running the project

### Backend
```bash
cd backend
python -m venv venv
# activate (Windows: .\venv\Scripts\Activate.ps1)
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend listens on port 8000 and exposes a single `/api/alert` endpoint for logging SOS alerts.

### Frontend
```bash
cd safewalk-web
npm install
# create .env.local with your Google Maps API key:
# VITE_GOOGLE_MAPS_KEY=...
npm run dev
```

App runs at `http://localhost:5173` by default.

---

## 💡 Purpose & outlook

This repository represents an MVP: a proof‑of‑concept showing how location, crime data, and mapping can be combined to help Chicago residents make safer route choices. The goal is to iterate toward a full‑featured mobile/web service with user profiles, real‑time hazard updates, emergency contact integration, and persistent route history.

Feel free to fork, experiment, and contribute!

