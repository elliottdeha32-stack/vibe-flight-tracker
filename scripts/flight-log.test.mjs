import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../dist/server/index.js';

test('validates, stores and orders CL650 flights by landing time', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0000_flights.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = db.prepare(sql);
      const execute = (...args) => ({
        all: () => ({ results: statement.all(...args) }),
        first: () => statement.get(...args),
        run: () => statement.run(...args)
      });
      return { ...execute(), bind: execute };
    }
  };
  const request = (path, method = 'GET', data) => worker.fetch(new Request('https://example.test' + path, {
    method,
    headers: data && { 'Content-Type': 'application/json' },
    body: data && JSON.stringify(data)
  }), { DB });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/app.js')).status, 200);
  const airport = await (await request('/api/airports/BQH')).json();
  assert.equal(airport.airport.code, 'EGKB');
  const flight = {
    landedAt: '2025-02-01T12:30', departureCode: 'LFPB', destinationCode: 'BQH',
    duration: '1:20', fuel: '2850.75', price: '1.4825', currency: 'EUR',
    priceUnit: 'L', oil1: '0.25', oil2: '0', passengers: '5'
  };
  assert.equal((await request('/api/flights', 'POST', { ...flight, passengers: '2.5' })).status, 400);
  assert.equal((await request('/api/flights', 'POST', { ...flight, landedAt: '2025-02-30T12:30' })).status, 400);
  const created = await request('/api/flights', 'POST', flight);
  assert.equal(created.status, 201);
  const { flight: saved } = await created.json();
  assert.equal(saved.destination.code, 'EGKB');
  assert.equal(saved.oil1, 0.25);
  assert.equal(saved.price, 1.4825);

  const older = await request('/api/flights', 'POST', {
    ...flight, landedAt: '2025-01-01T00:00', destinationCode: 'ZZZZ',
    destinationName: 'Manual airport', destinationLat: '0', destinationLon: '0'
  });
  assert.equal(older.status, 201);
  const { flights } = await (await request('/api/flights')).json();
  assert.equal(flights[0].id, saved.id);
  assert.equal(flights[1].destination.lat, 0);
  const edited = await request('/api/flights/' + saved.id, 'PUT', {
    ...flight, landedAt: '2024-12-30T12:30', oil2: '0.5'
  });
  assert.equal((await edited.json()).flight.oil2, 0.5);
  const updated = await (await request('/api/flights')).json();
  assert.equal(updated.flights[0].destination.code, 'ZZZZ');
  db.close();
});
