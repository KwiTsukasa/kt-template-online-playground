import { getApiUrl, post } from './request'

export type MinioUploadResult = {
  url: string
}

export const uploadFile = (data: FormData) => {
  return post<MinioUploadResult>('/minio/upload', data)
}

export const getResourceProxyEndpoint = () => {
  return getApiUrl('/minio/resource-proxy')
}
