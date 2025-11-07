# Keycloak Integration Guide for MCP Services

## Quick Start Integration

### 1. Install Required Packages

```bash
# For Node.js applications
npm install openid-client express-session passport passport-openidconnect

# For Python applications
pip install python-keycloak flask-oidc
```

### 2. Express.js Integration Example

```javascript
const express = require('express');
const session = require('express-session');
const { Issuer, Strategy } = require('openid-client');
const passport = require('passport');

const app = express();

// Session configuration
app.use(session({
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true } // Set to true in production with HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// Keycloak configuration
async function configureKeycloak() {
  // Allow self-signed certificates (remove in production)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const keycloakIssuer = await Issuer.discover(
    'https://154.26.158.31:8443/realms/mcp-ecosystem'
  );

  const client = new keycloakIssuer.Client({
    client_id: 'mcp-orchestrator',
    client_secret: 'YOUR_CLIENT_SECRET_HERE',
    redirect_uris: ['http://localhost:3000/callback'],
    response_types: ['code'],
    id_token_signed_response_alg: 'RS256',
    token_endpoint_auth_method: 'client_secret_post'
  });

  passport.use('oidc', new Strategy(
    { client },
    (tokenSet, userinfo, done) => {
      return done(null, userinfo);
    }
  ));

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
}

// Routes
app.get('/login',
  passport.authenticate('oidc', { scope: 'openid profile email' })
);

app.get('/callback',
  passport.authenticate('oidc', {
    successRedirect: '/dashboard',
    failureRedirect: '/login'
  })
);

app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/logout');
  });
});

app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.json({
    message: 'Welcome to MCP Dashboard',
    user: req.user
  });
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Start server
configureKeycloak().then(() => {
  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
  });
});
```

### 3. Python Flask Integration Example

```python
from flask import Flask, redirect, url_for, session
from flask_oidc import OpenIDConnect
import json

app = Flask(__name__)
app.secret_key = 'your-secret-key'

app.config.update({
    'OIDC_CLIENT_SECRETS': 'client_secrets.json',
    'OIDC_ID_TOKEN_COOKIE_SECURE': False,  # Set to True in production
    'OIDC_REQUIRE_VERIFIED_EMAIL': False,
    'OIDC_USER_INFO_ENABLED': True,
    'OIDC_OPENID_REALM': 'mcp-ecosystem',
    'OIDC_SCOPES': ['openid', 'email', 'profile'],
    'OIDC_INTROSPECTION_AUTH_METHOD': 'client_secret_post'
})

oidc = OpenIDConnect(app)

# Create client_secrets.json
client_secrets = {
    "web": {
        "issuer": "https://154.26.158.31:8443/realms/mcp-ecosystem",
        "auth_uri": "https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/auth",
        "client_id": "mcp-orchestrator",
        "client_secret": "YOUR_CLIENT_SECRET_HERE",
        "redirect_uris": ["http://localhost:5000/oidc_callback"],
        "userinfo_uri": "https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/userinfo",
        "token_uri": "https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token",
        "token_introspection_uri": "https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token/introspect"
    }
}

with open('client_secrets.json', 'w') as f:
    json.dump(client_secrets, f)

@app.route('/')
def index():
    if oidc.user_loggedin:
        return f'Hello {oidc.user_getfield("email")}! <a href="/logout">Logout</a>'
    else:
        return 'Welcome! <a href="/login">Login</a>'

@app.route('/login')
@oidc.require_login
def login():
    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    oidc.logout()
    return redirect(url_for('index'))

@app.route('/api/private')
@oidc.require_login
def api_private():
    return json.dumps({
        'email': oidc.user_getfield('email'),
        'user_id': oidc.user_getfield('sub'),
        'name': oidc.user_getfield('name')
    })

if __name__ == '__main__':
    app.run(debug=True)
```

### 4. Service Account Authentication (Machine-to-Machine)

```javascript
// For backend services that need to authenticate without user interaction
const axios = require('axios');

async function getServiceAccountToken() {
  const tokenEndpoint = 'https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token';

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: 'mcp-orchestrator',
    client_secret: 'YOUR_CLIENT_SECRET_HERE'
  });

  try {
    const response = await axios.post(tokenEndpoint, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false // Remove in production
      })
    });

    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get token:', error);
    throw error;
  }
}

// Use the token to call other services
async function callProtectedAPI() {
  const token = await getServiceAccountToken();

  const response = await axios.get('https://api.example.com/protected', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return response.data;
}
```

### 5. Token Validation Middleware

```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: 'https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/certs',
  requestHeaders: {}, // Optional headers
  timeout: 30000, // Defaults to 30s
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

function validateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, getKey, {
    audience: 'mcp-orchestrator',
    issuer: 'https://154.26.158.31:8443/realms/mcp-ecosystem',
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
  });
}

// Use in Express routes
app.get('/api/protected', validateToken, (req, res) => {
  res.json({
    message: 'This is protected',
    user: req.user
  });
});
```

### 6. Role-Based Access Control (RBAC)

```javascript
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userRoles = req.user.realm_access?.roles || [];

    if (!userRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    next();
  };
}

// Protected routes with role requirements
app.get('/api/admin', validateToken, requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin only content' });
});

app.get('/api/operator', validateToken, requireRole('operator'), (req, res) => {
  res.json({ message: 'Operator content' });
});
```

### 7. Environment Configuration

Create a `.env` file for your service:

```env
# Keycloak Configuration
KEYCLOAK_REALM=mcp-ecosystem
KEYCLOAK_AUTH_SERVER_URL=https://154.26.158.31:8443
KEYCLOAK_SSL_REQUIRED=external
KEYCLOAK_RESOURCE=mcp-orchestrator
KEYCLOAK_CLIENT_ID=mcp-orchestrator
KEYCLOAK_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
KEYCLOAK_CONFIDENTIAL_PORT=0
KEYCLOAK_BEARER_ONLY=false
KEYCLOAK_ENABLE_CORS=true

# Session Configuration
SESSION_SECRET=generate-a-strong-random-secret
SESSION_MAX_AGE=86400000

# Application
APP_PORT=3000
APP_HOST=localhost
```

### 8. Docker Compose Integration

```yaml
version: '3.8'

services:
  mcp-orchestrator:
    build: .
    environment:
      - KEYCLOAK_REALM=${KEYCLOAK_REALM}
      - KEYCLOAK_AUTH_SERVER_URL=${KEYCLOAK_AUTH_SERVER_URL}
      - KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID}
      - KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
      - NODE_TLS_REJECT_UNAUTHORIZED=0  # Remove in production
    ports:
      - "3000:3000"
    networks:
      - mcp-network
    depends_on:
      - keycloak

networks:
  mcp-network:
    external: true
```

### 9. Testing Authentication Flow

```bash
# Get access token
TOKEN=$(curl -s -X POST \
  "https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=mcp-admin" \
  -d "password=YOUR_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=mcp-orchestrator" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  --insecure | jq -r '.access_token')

# Use token to access protected resource
curl -H "Authorization: Bearer $TOKEN" \
  https://your-service/api/protected

# Introspect token
curl -s -X POST \
  "https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token/introspect" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$TOKEN" \
  -d "client_id=mcp-orchestrator" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  --insecure | jq
```

### 10. Common Issues and Solutions

#### Self-Signed Certificate Issues
```javascript
// Development only - accept self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Or use a custom HTTPS agent
const https = require('https');
const agent = new https.Agent({
  rejectUnauthorized: false
});
```

#### CORS Configuration
```javascript
const cors = require('cors');

app.use(cors({
  origin: ['http://localhost:3000', 'https://154.26.158.31:8443'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

#### Token Refresh
```javascript
async function refreshToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: 'mcp-orchestrator',
    client_secret: 'YOUR_CLIENT_SECRET'
  });

  const response = await axios.post(
    'https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token',
    params
  );

  return response.data;
}
```

## Security Best Practices

1. **Always use HTTPS in production**
2. **Store secrets in environment variables or secret management systems**
3. **Implement token refresh logic**
4. **Set appropriate token lifetimes**
5. **Use PKCE for public clients**
6. **Implement proper CORS policies**
7. **Validate tokens on every request**
8. **Log authentication events**
9. **Implement rate limiting**
10. **Use secure session configuration**