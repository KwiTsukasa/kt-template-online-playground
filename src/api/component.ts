import { post } from './request'

export type ComponentPayload = {
  id?: string
  name: string
  type: number
  componentType: number
  image: string
  template: string
}

export const saveComponent = (data: ComponentPayload) => {
  return post<string>('/component/save', data)
}

export const updateComponent = (data: ComponentPayload) => {
  return post<boolean>('/component/update', data)
}
