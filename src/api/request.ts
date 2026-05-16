import axios, { type AxiosRequestConfig } from 'axios'

export type ApiResponse<T = unknown> = {
  code: number
  msg: string
  data: T
}

const request = axios.create({
  baseURL: import.meta.env.VITE_APP_API_BASE || '/api',
  timeout: 1000 * 30,
})

export function getApiUrl(url: string) {
  const baseURL = import.meta.env.VITE_APP_API_BASE || '/api'
  const normalizedBase = baseURL.replace(/\/+$/, '')
  const normalizedUrl = url.startsWith('/') ? url : `/${url}`

  return `${normalizedBase}${normalizedUrl}`
}

request.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse<any>

    if (data.code !== 200) {
      return Promise.reject(new Error(data.msg || '请求失败'))
    }

    return data.data as any
  },
  (error) => {
    if (axios.isAxiosError<ApiResponse>(error)) {
      return Promise.reject(
        new Error(error.response?.data?.msg || error.message || '请求失败'),
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
