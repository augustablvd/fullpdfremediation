# Dreary ☂

The phone weather app that **celebrates** rainy weather and overcast days.
Where other apps apologize for rain, Dreary throws it a party.

## What it does

- **Right now** — current temperature (°F/°C toggle), conditions with
  celebratory copy, feels-like, cloud cover, and humidity. Rain animates on
  screen when it's actually raining.
- **Next dreary day** — the first properly gloomy day in the forecast, with
  its Dreariness Score, expected rainfall, and rain chance.
- **The month ahead** — a calendar heat-grid of the next 30 days colored by
  dreariness. Forecast skill reaches 16 days out (the limit of medium-range
  forecasting); days beyond that are shown as "beyond the forecast."
- **Rainiest days ahead** — the forecast window's gloomiest days, ranked.
  Tap any of them to save it to your calendar.
- **Precipitation chart** — a 16-day bar chart with tap tooltips and an
  accessible table view.
- **The asks** — on first load Dreary asks whether you'd like the next dreary
  day on your calendar (Apple/Outlook `.ics` download or Google Calendar) and
  whether you'd like notifications when gloom approaches.

## The Dreariness Score

Each day gets a 0–100 score: rain amount (40%), rain probability (30%), and
mean cloud cover (30%). A day counts as *dreary* at score ≥ 50, ≥ 1 mm of
rain, or a ≥ 60% rain chance under ≥ 70% cloud. Words to live by:

| Score | Verdict |
|---|---|
| 85+ | Peak gloom |
| 65–84 | Deliciously drizzly |
| 50–64 | Properly dreary |
| 30–49 | Pleasantly grey |
| < 30 | Regrettably bright |

## Running it

It's a static PWA — no build step, no API keys (weather via
[Open-Meteo](https://open-meteo.com/)). Serve the folder over HTTP:

```bash
cd dreary
python3 -m http.server 8080
# open http://localhost:8080
```

On a phone, open it in the browser and use **Add to Home Screen** — it
installs as a standalone app (dark theme, offline shell via service worker).

Note: geolocation and notifications require a secure context (HTTPS or
localhost). If location is denied, Dreary defaults to Seattle — the
spiritual home of the app — and you can search for any city.

## Honest limitations

- Notifications are **local**: Dreary checks the forecast and notifies when
  you open the app (and taps the service worker to display them). True
  background push would need a push server.
- No forecast on Earth is skillful 30 days out; Dreary ranks the rainiest
  days across the 16-day medium-range window and says so rather than
  inventing weather for week five.
