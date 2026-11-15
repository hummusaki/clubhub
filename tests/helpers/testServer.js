import express from 'express';
import workspaceRouter from '../../server/routes/workspace.js';
import schedulerRouter from '../../server/routes/scheduler.js';
import {
  setPrivateDbPathForTesting,
  closePrivateDb,
  ensurePrivateSchema,
} from '../../server/privateDb.js';

// Force ephemeral in-memory private DB and disable external cloud overrides during automated tests
process.env.PRIVATE_DB_PATH = ':memory:';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function resetTestDb() {
  closePrivateDb();
  setPrivateDbPathForTesting(':memory:');
  await ensurePrivateSchema();
}

export async function startTestServer() {
  await resetTestDb();

  const app = express();
  app.use(express.json());
  app.use('/api/workspace', workspaceRouter);
  app.use('/api/scheduler', schedulerRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  });

  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    srv.on('error', reject);
  });

  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise(resolve => server.close(() => resolve()));
      closePrivateDb();
    },
  };
}

export async function apiRequest(baseUrl, path, { method = 'GET', token = '', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

export async function registerUser(baseUrl, { email, password = 'TestPassword123!', fullName }) {
  const res = await apiRequest(baseUrl, '/api/workspace/auth/session', {
    method: 'POST',
    body: {
      email,
      password,
      fullName,
      mode: 'signup',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to register test user ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return {
    token: res.data.token,
    user: res.data.user,
  };
}
