import axios, { type AxiosRequestConfig } from 'axios'
import {
  clearPersistedAuth,
  getStoredAccessToken,
  redirectToAdminLogin,
  refreshPersistedAuth,
} from './auth'

export type ApiResponse<T = unknown> = {
  code: number
  message?: string
  msg: string
  data: T
}

type AuthRetryConfig = AxiosRequestConfig & {
  _authRetried?: boolean
}

type AuthHeaderMap = Record<string, unknown> & {
  get?: (name: string) => unknown
}

const request = axios.create({
  baseURL: import.meta.env.VITE_APP_API_BASE || '/api',
  timeout: 1000 * 30,
  withCredentials: true,
})

export function getApiUrl(url: string) {
  const baseURL = import.meta.env.VITE_APP_API_BASE || '/api'
  const normalizedBase = baseURL.replace(/\/+$/, '')
  const normalizedUrl = url.startsWith('/') ? url : `/${url}`

  return `${normalizedBase}${normalizedUrl}`
}

request.interceptors.request.use(async (config) => {
  let accessToken = getStoredAccessToken()

  if (!accessToken) {
    accessToken = await refreshPersistedAuth()
  }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

function getAuthErrorMessage(data?: Partial<ApiResponse>) {
  return data?.msg || data?.message || '登录已过期'
}

function getRequestAuthorization(config?: AuthRetryConfig) {
  const headers = config?.headers as AuthHeaderMap | undefined

  if (!headers) return null
  if (typeof headers.get === 'function') {
    return headers.get('Authorization') || headers.get('authorization')
  }

  return headers.Authorization || headers.authorization
}

async function retryRequestWithFreshToken(config?: AuthRetryConfig) {
  if (!config || config._authRetried) return null

  const hasOldAccessToken = Boolean(
    getStoredAccessToken() || getRequestAuthorization(config),
  )
  if (!hasOldAccessToken) return null

  config._authRetried = true
  clearPersistedAuth()
  const accessToken = await refreshPersistedAuth()

  if (!accessToken) return null

  config.headers = {
    ...(config.headers || {}),
    Authorization: `Bearer ${accessToken}`,
  }

  // 只有旧 accessToken 过期时才尝试刷新并重放一次，未登录 401 直接去 Admin。
  return request.request(config)
}

function redirectAfterAuthExpired() {
  clearPersistedAuth()
  redirectToAdminLogin()
}

request.interceptors.response.use(
  async (response) => {
    const data = response.data as ApiResponse<any>

    if (response.status === 401 || data.code === 401) {
      const retryResponse = await retryRequestWithFreshToken(
        response.config as AuthRetryConfig,
      )
      if (retryResponse) return retryResponse

      redirectAfterAuthExpired()
      return Promise.reject(new Error(getAuthErrorMessage(data)))
    }

    if (data.code !== 200) {
      return Promise.reject(new Error(data.msg || '请求失败'))
    }

    return data.data as any
  },
  async (error) => {
    if (axios.isAxiosError<ApiResponse>(error)) {
      if (error.response?.status === 401) {
        const retryResponse = await retryRequestWithFreshToken(
          error.config as AuthRetryConfig | undefined,
        )
        if (retryResponse) return retryResponse

        redirectAfterAuthExpired()
      }

      return Promise.reject(
        new Error(
          error.response?.data?.msg ||
            error.response?.data?.message ||
            error.message ||
            '请求失败',
        ),
      )
    }

    return Promise.reject(error)
  },
)

export const get = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
  return request.get<unknown, T>(url, config)
}

export const post = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
) => {
  return request.post<unknown, T>(url, data, config)
}

export default request
