import './style.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="dashboard">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Weather dashboard home"><span class="brand-mark">☼</span> weather<span class="brand-light">/now</span></a>
      <form id="search-form" class="search-form" role="search">
        <label class="sr-only" for="city-input">Search for a city</label>
        <span aria-hidden="true">⌕</span>
        <input id="city-input" name="city" type="search" placeholder="Search a city…" autocomplete="off" required />
        <button type="submit">Search</button>
      </form>
      <button id="location-button" class="location-button" type="button" title="Use my location" aria-label="Use my location">◎</button>
    </header>

    <section class="intro">
      <div>
        <p class="eyebrow">YOUR LOCAL FORECAST</p>
        <h1>Weather, at a glance.</h1>
        <p class="intro-copy">Current conditions and the week ahead, wherever you are.</p>
      </div>
      <p class="updated" id="updated-label">Choose a city to get started</p>
    </section>

    <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
    <section id="weather-content" class="weather-content" aria-live="polite"></section>
    <footer>Forecast data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Free weather API, no API key required</footer>
  </main>
`;

const form = document.querySelector('#search-form');
const cityInput = document.querySelector('#city-input');
const locationButton = document.querySelector('#location-button');
const notice = document.querySelector('#notice');
const content = document.querySelector('#weather-content');
const updatedLabel = document.querySelector('#updated-label');

const weatherDescriptions = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Heavy freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Heavy freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '❄️'],
  80: ['Rain showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm with hail', '⛈️'],
  99: ['Heavy thunderstorm with hail', '⛈️'],
};

function describeWeather(code) {
  return weatherDescriptions[code] ?? ['Unknown conditions', '🌡️'];
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = !message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatDay(dateString, options) {
  // Treat API dates as calendar dates, avoiding shifts from the browser's timezone.
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateString}T12:00:00`));
}

function formatHour(timeString) {
  const time = timeString.slice(11, 16);
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}. Please try again.`);
  return response.json();
}

async function fetchForecast(place) {
  showNotice('Loading forecast…');
  content.innerHTML = '';

  try {
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
      forecast_days: '7',
      timezone: 'auto',
    });
    const forecast = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    renderForecast(place, forecast);
    showNotice('');
    updatedLabel.textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`;
  } catch (error) {
    showNotice(error.message || 'Could not load the forecast. Please try again.', true);
  }
}

async function searchCity(query) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return;

  showNotice('Finding your city…');
  content.innerHTML = '';
  try {
    const params = new URLSearchParams({ name: trimmedQuery, count: '1', language: 'en', format: 'json' });
    const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    const place = data.results?.[0];
    if (!place) {
      showNotice(`No city found for “${trimmedQuery}”. Try another search.`, true);
      return;
    }
    cityInput.value = place.name;
    await fetchForecast(place);
  } catch (error) {
    showNotice(error.message || 'Could not search for that city. Please try again.', true);
  }
}

function renderForecast(place, data) {
  const current = data.current;
  const daily = data.daily;
  const hourly = data.hourly;
  const [condition, icon] = describeWeather(current.weather_code);
  const locationName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');

  const nowIndex = Math.max(0, hourly.time.findIndex(time => time >= current.time));
  const hours = hourly.time.slice(nowIndex, nowIndex + 12);
  const hourIndices = hours.map(time => hourly.time.indexOf(time));

  const hourlyCards = hourIndices.map(index => {
    const [hourCondition, hourIcon] = describeWeather(hourly.weather_code[index]);
    return `<article class="hour-card">
      <span class="hour-time">${escapeHtml(formatHour(hourly.time[index]))}</span>
      <span class="hour-icon" title="${escapeHtml(hourCondition)}">${hourIcon}</span>
      <strong>${Math.round(hourly.temperature_2m[index])}°</strong>
      <span class="rain-chance">💧 ${hourly.precipitation_probability[index] ?? 0}%</span>
    </article>`;
  }).join('');

  const dailyCards = daily.time.map((date, index) => {
    const [dayCondition, dayIcon] = describeWeather(daily.weather_code[index]);
    const label = index === 0 ? 'Today' : formatDay(date, { weekday: 'short' });
    return `<article class="day-row">
      <span class="day-name">${label}</span>
      <span class="day-condition"><span>${dayIcon}</span><span>${escapeHtml(dayCondition)}</span></span>
      <span class="day-rain">💧 ${daily.precipitation_probability_max[index] ?? 0}%</span>
      <span class="day-temperatures"><strong>${Math.round(daily.temperature_2m_max[index])}°</strong><span>${Math.round(daily.temperature_2m_min[index])}°</span></span>
    </article>`;
  }).join('');

  content.innerHTML = `
    <section class="current-card">
      <div class="current-main">
        <div>
          <p class="eyebrow">CURRENT WEATHER</p>
          <h2>${escapeHtml(locationName)}</h2>
          <p class="condition">${escapeHtml(condition)}</p>
        </div>
        <div class="current-temperature"><span>${icon}</span><strong>${Math.round(current.temperature_2m)}°</strong></div>
      </div>
      <p class="feels-like">Feels like ${Math.round(current.apparent_temperature)}°</p>
      <div class="current-details">
        <div><span>💨</span><span>Wind</span><strong>${Math.round(current.wind_speed_10m)} km/h</strong></div>
        <div><span>💧</span><span>Humidity</span><strong>${current.relative_humidity_2m}%</strong></div>
        <div><span>🌧️</span><span>Precipitation</span><strong>${current.precipitation} mm</strong></div>
        <div><span>🌅</span><span>Sunrise</span><strong>${escapeHtml(formatHour(daily.sunrise[0]))}</strong></div>
      </div>
    </section>

    <section class="forecast-card">
      <div class="section-heading"><div><p class="eyebrow">THE NEXT 12 HOURS</p><h2>Hourly forecast</h2></div></div>
      <div class="hourly-list">${hourlyCards}</div>
    </section>

    <section class="forecast-card weekly-card">
      <div class="section-heading"><div><p class="eyebrow">PLAN AHEAD</p><h2>7-day forecast</h2></div></div>
      <div class="daily-list">${dailyCards}</div>
    </section>
  `;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  searchCity(cityInput.value);
});

locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showNotice('Location is not supported by this browser. Search for a city instead.', true);
    return;
  }

  showNotice('Getting your location…');
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      const params = new URLSearchParams({ latitude: coords.latitude, longitude: coords.longitude, language: 'en', format: 'json' });
      const data = await getJson(`https://geocoding-api.open-meteo.com/v1/reverse?${params}`);
      const place = data.results?.[0] ?? {
        name: 'Your location', latitude: coords.latitude, longitude: coords.longitude,
      };
      cityInput.value = place.name;
      await fetchForecast(place);
    } catch (error) {
      showNotice(error.message || 'Could not get weather for your location.', true);
    }
  }, error => {
    showNotice(error.code === error.PERMISSION_DENIED
      ? 'Location permission was denied. Search for a city instead.'
      : 'Could not determine your location. Search for a city instead.', true);
  }, { enableHighAccuracy: false, timeout: 10000 });
});

searchCity('London');
