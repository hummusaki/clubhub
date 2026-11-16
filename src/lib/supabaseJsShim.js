// ── Lightweight Native Fetch Supabase Client (`@supabase/supabase-js` compatible) ──
// Provides full GoTrue Auth, PostgREST (`from().select()/upsert()`), and Storage (`storage.from()`)
// compatibility over standard Fetch with zero external dependencies.

const SESSION_KEY = 'clubhub.supabase.auth.token'

export function createClient(supabaseUrl, supabaseKey, options = {}) {
  const baseUrl = String(supabaseUrl || '').replace(/\/+$/, '')
  const apiKey = String(supabaseKey || '').trim()
  const storage = options?.auth?.storage || null
  const extraHeaders = options?.global?.headers || {}
  const accessTokenFn = typeof options?.accessToken === 'function' ? options.accessToken : null

  function getStoredSession() {
    if (!storage) return null
    try {
      const raw = storage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  const authListeners = new Set()

  function notifyAuthChange(event, session) {
    for (const listener of authListeners) {
      try {
        listener(event, session)
      } catch (err) {
        console.error('[supabaseJsShim] auth listener error:', err)
      }
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

  async function buildHeaders(custom = {}) {
    let token = null
    if (!custom.Authorization && accessTokenFn) {
      try {
        token = (await accessTokenFn()) || null
      } catch {
        token = null
      }
    }
    if (!token) {
      const sess = getStoredSession()
      token = sess?.access_token || apiKey
    }
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

    onAuthStateChange(callback) {
      if (typeof callback === 'function') {
        authListeners.add(callback)
      }
      return {
        data: {
          subscription: {
            unsubscribe() {
              authListeners.delete(callback)
            },
          },
        },
      }
    },

    async signInWithPassword({ email, password }) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: await buildHeaders({ 'Content-Type': 'application/json' }),
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
        notifyAuthChange('SIGNED_IN', session)
        return { data: { user: data.user || null, session }, error: null }
      } catch (err) {
        return { data: { user: null, session: null }, error: { message: err.message } }
      }
    },

    async signUp({ email, password, options: signUpOpts = {} }) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/signup`, {
          method: 'POST',
          headers: await buildHeaders({ 'Content-Type': 'application/json' }),
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
        if (session) {
          setStoredSession(session)
          notifyAuthChange('SIGNED_IN', session)
        }
        return { data: { user, session }, error: null }
      } catch (err) {
        return { data: { user: null, session: null }, error: { message: err.message } }
      }
    },

    async signOut() {
      setStoredSession(null)
      notifyAuthChange('SIGNED_OUT', null)
      return { error: null }
    },

    async getUser(jwt) {
      try {
        const res = await fetch(`${baseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: await buildHeaders(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
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
            headers: await buildHeaders({ 'Content-Type': 'application/json' }),
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
            { headers: await buildHeaders() }
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
        const res = await fetch(`${baseUrl}/storage/v1/bucket`, { headers: await buildHeaders() })
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
          headers: await buildHeaders({ 'Content-Type': 'application/json' }),
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
              { headers: await buildHeaders() }
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
                headers: await buildHeaders({
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
      method: 'GET',
      selectCols: '*',
      hasSelect: false,
      filters: [],
      orders: [],
      limitVal: null,
      body: null,
      upsertOpts: null,
      singleMode: null, // 'single' | 'maybeSingle' | null
    }

    async function execute() {
      try {
        const params = []
        if (state.method === 'GET' || state.hasSelect) {
          params.push(`select=${encodeURIComponent(state.selectCols)}`)
        }
        params.push(...state.filters)
        if (state.orders.length > 0) {
          params.push(`order=${state.orders.join(',')}`)
        }
        if (state.limitVal != null) {
          params.push(`limit=${state.limitVal}`)
        } else if (state.singleMode === 'maybeSingle' && state.method === 'GET') {
          params.push('limit=1')
        }
        if (state.upsertOpts?.onConflict) {
          params.push(`on_conflict=${encodeURIComponent(state.upsertOpts.onConflict)}`)
        }

        const qs = params.length > 0 ? `?${params.join('&')}` : ''
        const headers = {}
        const prefers = []

        if (state.method !== 'GET') {
          headers['Content-Type'] = 'application/json'
          if (state.upsertOpts) {
            prefers.push(
              state.upsertOpts.ignoreDuplicates
                ? 'resolution=ignore-duplicates'
                : 'resolution=merge-duplicates'
            )
          }
          prefers.push(state.hasSelect ? 'return=representation' : 'return=minimal')
        }
        if (prefers.length > 0) {
          headers.Prefer = prefers.join(',')
        }

        const res = await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}${qs}`, {
          method: state.method,
          headers: await buildHeaders(headers),
          ...(state.body !== null ? { body: JSON.stringify(state.body) } : {}),
        })

        const text = await res.text().catch(() => '')
        let parsed = null
        if (text) {
          try {
            parsed = JSON.parse(text)
          } catch {
            parsed = null
          }
        }

        if (!res.ok) {
          const msg = parsed?.message || parsed?.error || parsed?.hint || `HTTP ${res.status}`
          return { data: null, error: { message: msg, code: parsed?.code, status: res.status } }
        }

        if (state.singleMode === 'single') {
          if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
              return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
            }
            return { data: parsed[0], error: null }
          }
          return { data: parsed, error: null }
        }

        if (state.singleMode === 'maybeSingle') {
          const row = Array.isArray(parsed) ? parsed[0] || null : parsed
          return { data: row, error: null }
        }

        return { data: parsed ?? (state.method === 'GET' ? [] : null), error: null }
      } catch (err) {
        return { data: null, error: { message: err.message, outcomeUnknown: state.method !== 'GET' } }
      }
    }

    const builder = {
      select(cols = '*') {
        state.selectCols = cols
        state.hasSelect = true
        return builder
      },
      insert(values) {
        state.method = 'POST'
        state.body = values
        return builder
      },
      update(values) {
        state.method = 'PATCH'
        state.body = values
        return builder
      },
      upsert(values, opts = {}) {
        state.method = 'POST'
        state.body = values
        state.upsertOpts = opts || {}
        return builder
      },
      delete() {
        state.method = 'DELETE'
        return builder
      },
      eq(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`)
        return builder
      },
      neq(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=neq.${encodeURIComponent(val)}`)
        return builder
      },
      in(col, values) {
        const list = Array.isArray(values) ? values : []
        const encoded = list.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',')
        state.filters.push(`${encodeURIComponent(col)}=in.(${encodeURIComponent(encoded)})`)
        return builder
      },
      is(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=is.${encodeURIComponent(val)}`)
        return builder
      },
      gt(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=gt.${encodeURIComponent(val)}`)
        return builder
      },
      gte(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=gte.${encodeURIComponent(val)}`)
        return builder
      },
      lt(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=lt.${encodeURIComponent(val)}`)
        return builder
      },
      lte(col, val) {
        state.filters.push(`${encodeURIComponent(col)}=lte.${encodeURIComponent(val)}`)
        return builder
      },
      order(col, opts = {}) {
        const dir = opts?.ascending === false ? 'desc' : 'asc'
        state.orders.push(`${encodeURIComponent(col)}.${dir}`)
        return builder
      },
      limit(n) {
        state.limitVal = Number(n)
        return builder
      },
      single() {
        state.singleMode = 'single'
        return execute()
      },
      maybeSingle() {
        state.singleMode = 'maybeSingle'
        return execute()
      },
      then(resolve, reject) {
        return execute().then(resolve, reject)
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
