// ── Lightweight Native Fetch Supabase Client (`@supabase/supabase-js` compatible) ──
// Provides full GoTrue Auth, PostgREST (`from().select()/upsert()`), and Storage (`storage.from()`)
// compatibility over standard Fetch with zero external dependencies.

const SESSION_KEY = 'clubhub.supabase.auth.token'

export function createClient(supabaseUrl, supabaseKey, options = {}) {
  const baseUrl = String(supabaseUrl || '').replace(/\/+$/, '')
  const apiKey = String(supabaseKey || '').trim()
  const storage = options?.auth?.storage || null
  const extraHeaders = options?.global?.headers || {}

  function getStoredSession() {
    if (!storage) return null
    try {
      const raw = storage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function setStoredSession(session) {
    if (!storage) return
    try {
      if (session) storage.setItem(SESSION_KEY, JSON.stringify(session))
      else storage.removeItem(SESSION_KEY)
    } catch {
      // Ignore storage errors
    }
  }

  function buildHeaders(custom = {}) {
    const sess = getStoredSession()
    const token = sess?.access_token || apiKey
    return {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
      ...custom,
    }
  }

  const auth = {
    async getSession() {
      const session = getStoredSession()
      return { data: { session }, error: null }
    },

    async signInWithPassword({ email, password }) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: buildHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ email, password }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return {
            data: { user: null, session: null },
            error: { message: data.error_description || data.msg || data.message || 'Invalid login credentials' },
          }
        }
        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user || null,
        }
        setStoredSession(session)
        return { data: { user: data.user || null, session }, error: null }
      } catch (err) {
        return { data: { user: null, session: null }, error: { message: err.message } }
      }
    },

    async signUp({ email, password, options: signUpOpts = {} }) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/signup`, {
          method: 'POST',
          headers: buildHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            email,
            password,
            data: signUpOpts?.data || {},
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          return {
            data: { user: null, session: null },
            error: { message: data.error_description || data.msg || data.message || 'Sign up failed' },
          }
        }
        const user = data.user || (data.id ? data : null)
        const session = data.access_token
          ? { access_token: data.access_token, refresh_token: data.refresh_token, user }
          : null
        if (session) setStoredSession(session)
        return { data: { user, session }, error: null }
      } catch (err) {
        return { data: { user: null, session: null }, error: { message: err.message } }
      }
    },

    async signOut() {
      setStoredSession(null)
      return { error: null }
    },

    async getUser(jwt) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: buildHeaders(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.id) {
          return { data: { user: null }, error: { message: data?.msg || 'Unauthorized' } }
        }
        return { data: { user: data }, error: null }
      } catch (err) {
        return { data: { user: null }, error: { message: err.message } }
      }
    },

    admin: {
      async createUser(attrs = {}) {
        try {
          const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
            method: 'POST',
            headers: buildHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(attrs),
          })
          const data = await res.json().catch(() => null)
          if (!res.ok) return { data: { user: null }, error: { message: data?.msg || 'Failed' } }
          return { data: { user: data?.user || data }, error: null }
        } catch (err) {
          return { data: { user: null }, error: { message: err.message } }
        }
      },

      async listUsers({ page = 1, perPage = 200 } = {}) {
        try {
          const res = await fetch(
            `${baseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
            { headers: buildHeaders() }
          )
          const data = await res.json().catch(() => ({}))
          if (!res.ok) return { data: { users: [] }, error: { message: 'Failed' } }
          return { data: { users: Array.isArray(data?.users) ? data.users : [] }, error: null }
        } catch (err) {
          return { data: { users: [] }, error: { message: err.message } }
        }
      },
    },
  }

  const storageApi = {
    async listBuckets() {
      try {
        const res = await fetch(`${baseUrl}/storage/v1/bucket`, { headers: buildHeaders() })
        const data = await res.json().catch(() => [])
        if (!res.ok) return { data: null, error: { message: 'Failed to list buckets' } }
        return { data: Array.isArray(data) ? data : [], error: null }
      } catch (err) {
        return { data: null, error: { message: err.message } }
      }
    },

    async createBucket(id, opts = {}) {
      try {
        const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
          method: 'POST',
          headers: buildHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ id, name: id, public: Boolean(opts.public) }),
        })
        const data = await res.json().catch(() => null)
        return { data, error: res.ok ? null : { message: 'Failed to create bucket' } }
      } catch (err) {
        return { data: null, error: { message: err.message } }
      }
    },

    from(bucketId) {
      return {
        async download(objectPath) {
          try {
            const res = await fetch(
              `${baseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${objectPath}`,
              { headers: buildHeaders() }
            )
            if (!res.ok) return { data: null, error: { message: `HTTP ${res.status}` } }
            const blob = await res.blob()
            return { data: blob, error: null }
          } catch (err) {
            return { data: null, error: { message: err.message } }
          }
        },

        async upload(objectPath, body, opts = {}) {
          try {
            const res = await fetch(
              `${baseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${objectPath}`,
              {
                method: 'POST',
                headers: buildHeaders({
                  'Content-Type': opts.contentType || 'application/octet-stream',
                  'x-upsert': opts.upsert ? 'true' : 'false',
                }),
                body,
              }
            )
            const data = await res.json().catch(() => null)
            return { data, error: res.ok ? null : { message: `HTTP ${res.status}` } }
          } catch (err) {
            return { data: null, error: { message: err.message } }
          }
        },
      }
    },
  }

  function from(table) {
    const state = {
      selectCols: '*',
      filters: [],
      singleMode: false,
    }

    const builder = {
      select(cols = '*') {
        state.selectCols = cols
        return builder
      },
      eq(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`)
        return builder
      },
      async maybeSingle() {
        try {
          const qs = [`select=${encodeURIComponent(state.selectCols)}`, ...state.filters, 'limit=1'].join('&')
          const res = await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}?${qs}`, {
            headers: buildHeaders(),
          })
          const rows = await res.json().catch(() => [])
          if (!res.ok) return { data: null, error: { message: `HTTP ${res.status}` } }
          return { data: Array.isArray(rows) ? rows[0] || null : rows, error: null }
        } catch (err) {
          return { data: null, error: { message: err.message } }
        }
      },
      async upsert(values, opts = {}) {
        try {
          const qs = opts.onConflict ? `?on_conflict=${encodeURIComponent(opts.onConflict)}` : ''
          const prefer = opts.ignoreDuplicates
            ? 'resolution=ignore-duplicates,return=minimal'
            : 'resolution=merge-duplicates,return=minimal'
          const res = await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}${qs}`, {
            method: 'POST',
            headers: buildHeaders({
              'Content-Type': 'application/json',
              Prefer: prefer,
            }),
            body: JSON.stringify(values),
          })
          return { data: null, error: res.ok ? null : { message: `HTTP ${res.status}` } }
        } catch (err) {
          return { data: null, error: { message: err.message } }
        }
      },
      then(resolve, reject) {
        const qs = [`select=${encodeURIComponent(state.selectCols)}`, ...state.filters].join('&')
        return fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}?${qs}`, {
          headers: buildHeaders(),
        })
          .then(async res => {
            const data = await res.json().catch(() => [])
            return { data: res.ok ? data : null, error: res.ok ? null : { message: `HTTP ${res.status}` } }
          })
          .then(resolve, reject)
      },
    }

    return builder
  }

  return {
    auth,
    storage: storageApi,
    from,
  }
}

export default { createClient }
