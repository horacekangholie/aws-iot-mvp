const config = window.APP_CONFIG;
const state = {
  accessToken: null,
  idToken: null,
  code: null,
};

const elements = {
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  sessionStatus: document.getElementById('sessionStatus'),
  userInfo: document.getElementById('userInfo'),
  deviceIdInput: document.getElementById('deviceIdInput'),
  telemetryGrid: document.getElementById('telemetryGrid'),
  temperatureValue: document.getElementById('temperatureValue'),
  humidityValue: document.getElementById('humidityValue'),
  batteryValue: document.getElementById('batteryValue'),
  statusValue: document.getElementById('statusValue'),
  rawJson: document.getElementById('rawJson'),
  lastUpdated: document.getElementById('lastUpdated'),
};

elements.deviceIdInput.value = config.defaultDeviceId;

function buildLoginUrl() {
  const params = new URLSearchParams({
    client_id: config.cognitoClientId,
    response_type: 'code',
    scope: config.oauthScopes,
    redirect_uri: config.redirectUri,
  });

  return `https://${config.cognitoDomain}.auth.${config.region}.amazoncognito.com/login?${params.toString()}`;
}

function buildLogoutUrl() {
  const params = new URLSearchParams({
    client_id: config.cognitoClientId,
    logout_uri: config.redirectUri,
  });

  return `https://${config.cognitoDomain}.auth.${config.region}.amazoncognito.com/logout?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.cognitoClientId,
    code,
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(`https://${config.cognitoDomain}.auth.${config.region}.amazoncognito.com/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}`);
  }

  return response.json();
}

function parseJwt(token) {
  const payload = token.split('.')[1];
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(normalized));
}

function storeTokens(tokens) {
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('id_token', tokens.id_token);
  if (tokens.refresh_token) {
    localStorage.setItem('refresh_token', tokens.refresh_token);
  }
}

function loadTokens() {
  state.accessToken = localStorage.getItem('access_token');
  state.idToken = localStorage.getItem('id_token');
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('id_token');
  localStorage.removeItem('refresh_token');
  state.accessToken = null;
  state.idToken = null;
}

function updateSessionUi() {
  if (!state.idToken) {
    elements.sessionStatus.textContent = 'Not signed in';
    elements.userInfo.textContent = 'Use Cognito Hosted UI to sign up or log in.';
    return;
  }

  const claims = parseJwt(state.idToken);
  elements.sessionStatus.textContent = 'Signed in';
  elements.userInfo.textContent = `${claims.email || claims.username || 'Unknown user'} | sub: ${claims.sub}`;
}

async function fetchLatestTelemetry() {
  if (!state.accessToken) {
    elements.rawJson.textContent = 'Login first. API access requires a Cognito JWT.';
    return;
  }

  const deviceId = elements.deviceIdInput.value.trim() || config.defaultDeviceId;
  const url = `${config.apiBaseUrl}devices/latest?device_id=${encodeURIComponent(deviceId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  renderTelemetry(data.latest);
  elements.rawJson.textContent = JSON.stringify(data, null, 2);
}

function renderTelemetry(latest) {
  if (!latest) {
    elements.telemetryGrid.classList.add('hidden');
    elements.lastUpdated.textContent = 'No telemetry found for this device.';
    return;
  }

  elements.telemetryGrid.classList.remove('hidden');
  elements.temperatureValue.textContent = `${latest.temperature} °C`;
  elements.humidityValue.textContent = `${latest.humidity} %`;
  elements.batteryValue.textContent = `${latest.battery} %`;
  elements.statusValue.textContent = latest.status;
  elements.lastUpdated.textContent = `Telemetry timestamp: ${new Date(latest.ts * 1000).toLocaleString()}`;
}

async function bootstrapSession() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');

  if (code) {
    try {
      const tokens = await exchangeCodeForToken(code);
      storeTokens(tokens);
      url.searchParams.delete('code');
      window.history.replaceState({}, document.title, url.pathname);
    } catch (error) {
      elements.rawJson.textContent = error.message;
    }
  }

  loadTokens();
  updateSessionUi();
}

elements.loginBtn.addEventListener('click', () => {
  window.location.href = buildLoginUrl();
});

elements.logoutBtn.addEventListener('click', () => {
  clearTokens();
  updateSessionUi();
  window.location.href = buildLogoutUrl();
});

elements.refreshBtn.addEventListener('click', async () => {
  try {
    await fetchLatestTelemetry();
  } catch (error) {
    elements.rawJson.textContent = error.message;
  }
});

bootstrapSession();
