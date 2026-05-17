import axios from 'axios'

type VbenResponse<T = unknown> = {
  code: number
  data: T
  message?: string
}

type PersistedAuth = {
  accessCodes?: string[]
  accessToken: string
  userInfo?: unknown
}

const ACCESS_TOKEN_KEY = 'kt-admin-access-token'
const ACCESS_CODES_KEY = 'kt-admin-access-codes'
const USER_INFO_KEY = 'kt-admin-user-info'
const LOGIN_REDIRECT_MARK_KEY = 'kt-admin-login-redirect-at'
const LOGIN_REDIRECT_COOLDOWN = 10 * 1000

let refreshPromise: Promise<string | null> | null = null
let redirectingToAdminLogin = false

function getApiBase() {
  return import.meta.env.VITE_APP_API_BASE || '/api'
}

function getAdminLogin() {
  return (
    import.meta.env.VITE_APP_ADMIN_LOGIN ||
    `${window.location.protocol}//${window.location.hostname}:5999/#/auth/login`
  )
}

const authClient = axios.create({
  baseURL: getApiBase(),
  timeout: 1000 * 30,
  withCredentials: true,
})

export function getStoredAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function clearPersistedAuth() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  window.localStorage.removeItem(ACCESS_CODES_KEY)
  window.localStorage.removeItem(USER_INFO_KEY)
}

export function clearAdminLoginRedirectMark() {
  window.sessionStorage.removeItem(LOGIN_REDIRECT_MARK_KEY)
}

export function shouldSkipRepeatedAdminLoginRedirect() {
  const redirectAt = Number(
    window.sessionStorage.getItem(LOGIN_REDIRECT_MARK_KEY),
  )

  return (
    Number.isFinite(redirectAt) &&
    Date.now() - redirectAt < LOGIN_REDIRECT_COOLDOWN
  )
}

export function persistAuthData({
  accessCodes,
  accessToken,
  userInfo,
}: PersistedAuth) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  if (accessCodes) {
    window.localStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(accessCodes))
  }
  if (userInfo) {
    window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo))
  }
}

function buildAdminLoginUrl(redirect: string) {
  const loginUrl = new URL(getAdminLogin())

  if (loginUrl.hash) {
    const [hashPath, hashSearch = ''] = loginUrl.hash.slice(1).split('?')
    const hashParams = new URLSearchParams(hashSearch)
    hashParams.set('redirect', redirect)
    // Admin 生产环境使用 hash 路由，redirect 必须放在 hash 内部才能被 Vue Router 读取。
    loginUrl.hash = `${hashPath}?${hashParams.toString()}`
    return loginUrl.toString()
  }

  loginUrl.searchParams.set('redirect', redirect)
  return loginUrl.toString()
}

export function redirectToAdminLogin() {
  if (redirectingToAdminLogin) return

  redirectingToAdminLogin = true
  window.sessionStorage.setItem(LOGIN_REDIRECT_MARK_KEY, String(Date.now()))
  window.location.href = buildAdminLoginUrl(window.location.href)
}

export async function refreshPersistedAuth() {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const refreshResponse = await authClient.post<string>('/auth/refresh', {})
      const accessToken = refreshResponse.data

      if (!accessToken) {
        clearPersistedAuth()
        return null
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
      }
      const [userInfoResult, accessCodesResult] = await Promise.allSettled([
        authClient.get<VbenResponse>('/user/info', { headers }),
        authClient.get<VbenResponse<string[]>>('/auth/codes', { headers }),
      ])

      persistAuthData({
        accessCodes:
          accessCodesResult.status === 'fulfilled'
            ? accessCodesResult.value.data.data
            : undefined,
        accessToken,
        userInfo:
          userInfoResult.status === 'fulfilled'
            ? userInfoResult.value.data.data
            : undefined,
      })

      return accessToken
    } catch {
      clearPersistedAuth()
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}
