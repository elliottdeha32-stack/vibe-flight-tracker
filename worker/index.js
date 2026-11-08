const assets = __ASSETS__;
const airports = __AIRPORTS__;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function airportFor(code) {
  const entry = Object.hasOwn(airports, code) && airports[code];
  return entry ? { code: entry[0], name: entry[1], lat: entry[2], lon: entry[3] } : null;
}

function invalid(message) {
  throw new TypeError(message);
}

function number(value, label, min, max) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) invalid('Enter a valid ' + label + '.');
  return parsed;
}

function readAirport(data, side) {
  const code = String(data[side + 'Code'] ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) invalid('Enter a valid ' + side + ' airport code.');
  const name = String(data[side + 'Name'] ?? '').trim();
  const lat = data[side + 'Lat'];
  const lon = data[side + 'Lon'];
  const found = airportFor(code);
  if (!name && !lat && !lon && found) return found;
  if (!name || name.length > 120) invalid('Enter the ' + side + ' airport name.');
  return { code, name, lat: number(lat, side + ' latitude', -90, 90), lon: number(lon, side + ' longitude', -180, 180) };
}

function validate(data) {
  if (!data || typeof data !== 'object') invalid('Enter the flight details.');
  const date = String(data.landedAt ?? '');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(date)) invalid('Enter the landing date and time in UTC.');
  const time = new Date(date + 'Z');
  if (!Number.isFinite(time.getTime()) || time.toISOString().slice(0, 16) !== date || time.getTime() > Date.now()) {
    invalid('Enter a valid landing date and time in the past (UTC).');
  }
  const duration = /^(\d{1,3}):([0-5]\d)$/.exec(data.duration);
  const minutes = duration ? Number(duration[1]) * 60 + Number(duration[2]) : 0;
  if (!minutes) invalid('Enter a flight time greater than zero in HH:MM.');
  const currency = String(data.currency ?? '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) invalid('Enter a three-letter currency code.');
  if (!['L', 'US gal', 'kg', 'lb'].includes(data.priceUnit)) invalid('Choose a fuel pricing unit.');
  const passengers = number(data.passengers, 'passenger count', 0, 999);
  if (!Number.isInteger(passengers)) invalid('Enter a whole number of passengers.');
  return {
    landedAt: time.toISOString(), minutes, passengers, currency, priceUnit: data.priceUnit,
    departure: readAirport(data, 'departure'), destination: readAirport(data, 'destination'),
    fuel: number(data.fuel, 'fuel quantity', 0, 1000000),
    price: number(data.price, 'fuel price', 0, 1000000),
    oil1: number(data.oil1, 'engine 1 oil quantity', 0, 1000),
    oil2: number(data.oil2, 'engine 2 oil quantity', 0, 1000)
  };
}

async function handleApi(request, db, path) {
  const airport = /^\/api\/airports\/([A-Z0-9]{3,4})$/.exec(path);
  if (airport && request.method === 'GET') return json({ airport: airportFor(airport[1]) });
  if (path === '/api/flights' && request.method === 'GET') {
    const { results } = await db.prepare(
      'SELECT payload FROM flights ORDER BY landed_at DESC, created_at DESC, id DESC'
    ).all();
    return json({ flights: results.map(row => JSON.parse(row.payload)) });
  }
  const match = /^\/api\/flights\/([a-f0-9-]{36})$/.exec(path);
  const create = path === '/api/flights' && request.method === 'POST';
  if (!create && !(match && request.method === 'PUT')) return json({ error: 'Page not found.' }, 404);
  if (!request.headers.get('Content-Type')?.startsWith('application/json') ||
      (request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin)) {
    return json({ error: 'Invalid request.' }, 403);
  }

  let flight;
  try {
    flight = validate(await request.json());
  } catch (error) {
    return json({ error: error instanceof TypeError ? error.message : 'Invalid flight details.' }, 400);
  }
  if (create) {
    flight.id = crypto.randomUUID();
    flight.createdAt = new Date().toISOString();
    await db.prepare('INSERT INTO flights (id, landed_at, created_at, payload) VALUES (?, ?, ?, ?)')
      .bind(flight.id, flight.landedAt, flight.createdAt, JSON.stringify(flight)).run();
    return json({ flight }, 201);
  }
  flight.id = match[1];
  const existing = await db.prepare('SELECT created_at FROM flights WHERE id = ?').bind(flight.id).first();
  if (!existing) return json({ error: 'Flight record not found.' }, 404);
  flight.createdAt = existing.created_at;
  await db.prepare('UPDATE flights SET landed_at = ?, payload = ? WHERE id = ?')
    .bind(flight.landedAt, JSON.stringify(flight), flight.id).run();
  return json({ flight });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith('/api/')) return await handleApi(request, env.DB, path);
      const asset = Object.hasOwn(assets, path) && assets[path];
      if (!asset || request.method !== 'GET') return new Response('Page not found.', { status: 404 });
      return new Response(asset.body, { headers: { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) {
      console.error(error);
      return json({ error: 'Flight data is temporarily unavailable.' }, 503);
    }
  }
};
