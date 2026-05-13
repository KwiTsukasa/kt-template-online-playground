import { post } from './request'

export type MinioUploadResult = {
  url: string
}

export const uploadFile = (data: FormData) => {
  return post<MinioUploadResult>('/minio/upload', data)
}
