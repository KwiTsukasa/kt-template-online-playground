import { get } from './request'

export type DictItem = {
  label: string
  value: number
}

export const getDictByKey = (dictKey: string) => {
  return get<DictItem[]>('/dict/getDictByKey', {
    params: { dictKey },
  })
}

export const getComponentDictByType = (type: string | number) => {
  return get<DictItem[]>('/dict/getComponentDictByType', {
    params: { type },
  })
}
