const byId = id => document.getElementById(id);
const form = byId('log-form');
const dialog = byId('entry');
const sides = ['departure', 'destination'];
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
});
const durationText = minutes => Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm';
const field = name => form.elements.namedItem(name);
const airportCache = new Map();
let flights = [];
let editingId = null;
let map;
let layer;
let latest;

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

function focusMap(animate = false) {
  if (!map || !latest) return;
  const from = latest.departure;
  const to = latest.destination;
  const longitude = from.lon + ((((to.lon - from.lon) + 540) % 360) - 180);
  const end = [to.lat, longitude];
  const start = [from.lat, from.lon];
  if (from.lat === to.lat && from.lon === to.lon) map.setView(end, 10, { animate });
  else map.fitBounds([start, end], { padding: [55, 55], maxZoom: 10, animate });
}

function renderMap() {
  const flight = flights[0];
  latest = flight;
  byId('position').textContent = flight ? flight.destination.code + ' · ' + flight.destination.name : 'Awaiting flight log';
  byId('landed').textContent = flight ? dateFormat.format(new Date(flight.landedAt)) + ' UTC' : '';
  byId('recenter').disabled = !map || !flight;
  showMessage(byId('map-message'), !map ? 'The map could not load.' : flight ? '' : 'Add a flight to place the aircraft on the map.');
  if (!map) return;
  layer.clearLayers();
  if (!flight) return;
  const { departure: from, destination: to } = flight;
  const end = [to.lat, from.lon + ((((to.lon - from.lon) + 540) % 360) - 180)];
  const start = [from.lat, from.lon];
  L.polyline([start, end], { color: '#0a705e', weight: 3, dashArray: '7 7', interactive: false }).addTo(layer);
  L.circleMarker(start, { color: '#135550', fillColor: '#fff', fillOpacity: 1, radius: 6 }).addTo(layer);
  const label = document.createElement('span');
  label.textContent = 'CL650 · ' + to.code + ' · ' + to.name;
  L.marker(end, { alt: 'CL650 last recorded location', icon: L.divIcon({
    className: 'plane-icon', html: '✈', iconSize: [36, 36], iconAnchor: [18, 18]
  }) }).bindPopup(label).addTo(layer);
  focusMap(true);
}

function render() {
  const totals = flights.reduce((sum, row) => ({
    minutes: sum.minutes + row.minutes,
    fuel: sum.fuel + row.fuel,
    passengers: sum.passengers + row.passengers
  }), { minutes: 0, fuel: 0, passengers: 0 });
  byId('count').textContent = format.format(flights.length);
  byId('time').textContent = durationText(totals.minutes);
  byId('fuel').textContent = format.format(totals.fuel) + ' lb';
  byId('passengers').textContent = format.format(totals.passengers);
  const rows = byId('rows');
  rows.replaceChildren();
  for (const flight of flights) {
    const row = rows.insertRow();
    const values = [
      dateFormat.format(new Date(flight.landedAt)),
      flight.departure.code + ' → ' + flight.destination.code,
      durationText(flight.minutes),
      format.format(flight.fuel) + ' lb',
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(flight.price) + ' ' + flight.currency + '/' + flight.priceUnit,
      format.format(flight.oil1) + ' / ' + format.format(flight.oil2) + ' qt',
      String(flight.passengers)
    ];
    values.forEach(value => { row.insertCell().textContent = value; });
    const edit = document.createElement('button');
    edit.className = 'secondary';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', 'Edit ' + values[1] + ' on ' + values[0]);
    edit.addEventListener('click', () => openForm(flight));
    row.insertCell().append(edit);
  }
  showMessage(byId('empty'), flights.length ? '' : 'No flights logged yet.');
  renderMap();
}

async function lookup(side) {
  const code = field(side + 'Code').value.trim().toUpperCase();
  const note = byId(side + '-note');
  if (!/^[A-Z0-9]{3,4}$/.test(code)) {
    note.textContent = '';
    return;
  }
  note.textContent = 'Looking up ' + code + '…';
  try {
    if (!airportCache.has(code)) {
      const result = await api('/api/airports/' + code);
      airportCache.set(code, result.airport);
    }
    if (code !== field(side + 'Code').value.trim().toUpperCase() || !dialog.open) return;
    const airport = airportCache.get(code);
    note.textContent = airport ? airport.name : 'Airport not found. Enter its details below.';
    if (!airport) byId(side + '-manual').open = true;
  } catch {
    if (code === field(side + 'Code').value.trim().toUpperCase()) {
      note.textContent = 'Airport lookup unavailable. You can enter its details below.';
      byId(side + '-manual').open = true;
    }
  }
}

function openForm(flight) {
  form.reset();
  editingId = flight?.id ?? null;
  byId('form-title').textContent = flight ? 'Edit flight' : 'Log flight';
  showMessage(byId('form-error'), '');
  field('landedAt').value = (flight?.landedAt ?? new Date().toISOString()).slice(0, 16);
  for (const side of sides) {
    byId(side + '-manual').open = false;
    byId(side + '-note').textContent = flight?.[side].name ?? '';
    if (!flight) continue;
    for (const key of ['code', 'name', 'lat', 'lon']) {
      field(side + key[0].toUpperCase() + key.slice(1)).value = flight[side][key];
    }
  }
  if (flight) {
    field('duration').value = Math.floor(flight.minutes / 60) + ':' + String(flight.minutes % 60).padStart(2, '0');
    for (const key of ['fuel', 'price', 'currency', 'priceUnit', 'oil1', 'oil2', 'passengers']) field(key).value = flight[key];
  }
  dialog.showModal();
}

byId('new-flight').addEventListener('click', () => openForm());
byId('recenter').addEventListener('click', () => focusMap(true));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('cancel', event => {
  if (form.querySelector('button[type="submit"]').disabled) event.preventDefault();
});
for (const side of sides) {
  const input = field(side + 'Code');
  let timer;
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase();
    for (const suffix of ['Name', 'Lat', 'Lon']) field(side + suffix).value = '';
    clearTimeout(timer);
    timer = setTimeout(() => lookup(side), 250);
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const closeButtons = form.querySelectorAll('[data-close]');
  const data = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  closeButtons.forEach(button => { button.disabled = true; });
  showMessage(byId('form-error'), '');
  try {
    const result = await api(editingId ? '/api/flights/' + editingId : '/api/flights', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    flights = flights.filter(flight => flight.id !== result.flight.id);
    flights.push(result.flight);
    flights.sort((a, b) => b.landedAt.localeCompare(a.landedAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    dialog.close();
    render();
    showMessage(byId('notice'), 'Flight saved.');
  } catch (error) {
    showMessage(byId('form-error'), error.message);
  } finally {
    submit.disabled = false;
    closeButtons.forEach(button => { button.disabled = false; });
  }
});

if (window.L) {
  map = L.map('map', { worldCopyJump: true }).setView([35, 8], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

async function loadFlights() {
  byId('new-flight').disabled = true;
  try {
    flights = (await api('/api/flights')).flights;
    render();
  } catch {
    showMessage(byId('empty'), 'Flight records could not be loaded. Reload to try again.');
    renderMap();
    return;
  }
  byId('new-flight').disabled = false;
}
loadFlights();
