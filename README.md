# CL650 Flight Tracker

A Challenger 650 flight log with a map of the aircraft's last recorded destination. Flights are ordered by landing time in UTC. The dashed line links the logged airports and represents an illustrative leg.

## Build and verify

Use Node.js 24 or later. Run `npm run build` to bundle the client, Worker, and public-domain OurAirports directory. To build from an existing copy of the directory, run `npm run build -- path/to/airports.csv`. Run `npm test` after building.

Deploy `dist/server/index.js` as an ES module Worker with a D1 binding named `DB` and apply the SQL in `drizzle/`. Keep access private because the database holds aircraft movements. The map uses Leaflet and OpenStreetMap.

Fuel used is logged in pounds. Fuel prices have their own currency and pricing unit. Oil additions are logged separately for engines 1 and 2 in US quarts. Unlisted airports can be entered by code, name, and coordinates.
