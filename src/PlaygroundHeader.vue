<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  saveComponent,
  updateComponent,
  type ComponentPayload,
} from './api/component'
import {
  getComponentDictByType,
  getDictByKey,
  type DictItem,
} from './api/dict'
import { uploadFile } from './api/minio'
import type { ReplStore } from './store'

type ComponentForm = {
  id: string
  name: string
  type: string
  componentType: string
}

const props = defineProps<{
  store: ReplStore
}>()

const form = reactive<ComponentForm>({
  id: '',
  name: '',
  type: '',
  componentType: '',
})
const typeList = ref<DictItem[]>([])
const componentTypeList = ref<DictItem[]>([])
const loading = ref(false)
const message = ref('')
const messageType = ref<'info' | 'success' | 'error'>('info')

const isEdit = computed(() => !!form.id)
const canSave = computed(
  () => !!form.name.trim() && !!form.type && !!form.componentType,
)

function readQuery() {
  const query = new URLSearchParams(location.search)
  form.id = query.get('id') || ''
  form.name = query.get('name') || ''
  form.type = query.get('type') || ''
  form.componentType = query.get('componentType') || ''
}

function setMessage(type: typeof messageType.value, text: string) {
  messageType.value = type
  message.value = text
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function getPreviewIframe() {
  return document.querySelector<HTMLIFrameElement>('.iframe-container iframe')
}

function collectStyleText(doc: Document) {
  return Array.from(doc.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join('\n')
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n')
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('截图生成失败'))
    image.src = src
  })
}

async function capturePreviewImage() {
  await nextFrame()

  const iframe = getPreviewIframe()
  const doc = iframe?.contentDocument

  if (!iframe || !doc?.body) {
    throw new Error('未找到预览区域，无法生成截图')
  }

  const width = Math.max(iframe.clientWidth, 1)
  const height = Math.max(iframe.clientHeight, 1)
  const cloned = doc.body.cloneNode(true) as HTMLElement
  const styleText = collectStyleText(doc)

  cloned.querySelectorAll('script').forEach((item) => item.remove())
  cloned.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  cloned.style.width = `${width}px`
  cloned.style.height = `${height}px`
  cloned.style.margin = '0'
  cloned.style.overflow = 'hidden'

  const serializer = new XMLSerializer()
  const xhtml = Array.from(cloned.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('')
  const safeStyleText = styleText.replace(/\]\]>/g, ']]]]><![CDATA[>')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#fff;">
          <style><![CDATA[${safeStyleText}]]></style>
          ${xhtml}
        </div>
      </foreignObject>
    </svg>
  `
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  )

  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('截图生成失败')),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function getScreenshotName() {
  const safeName = form.name.trim().replace(/[\\/:*?"<>|\s]+/g, '_')
  return `screenshots/${Date.now()}-${safeName || 'component'}.png`
}

async function uploadPreviewImage() {
  const imageBlob = await capturePreviewImage()
  const imageFile = new File([imageBlob], `${Date.now()}-preview.png`, {
    type: 'image/png',
  })
  const formData = new FormData()

  formData.append('file', imageFile)
  formData.append('objectName', getScreenshotName())

  const data = await uploadFile(formData)

  return data.url
}

async function getTypeList() {
  typeList.value = await getDictByKey('COMPONENT_TYPE')
  if (!form.type && typeList.value[0]) {
    form.type = String(typeList.value[0].value)
  }
}

async function getComponentTypeList() {
  if (!form.type) {
    componentTypeList.value = []
    form.componentType = ''
    return
  }

  componentTypeList.value = await getComponentDictByType(form.type)

  const exists = componentTypeList.value.some(
    (item) => String(item.value) === form.componentType,
  )

  if (!exists) {
    form.componentType = String(componentTypeList.value[0]?.value || '')
  }
}

async function handleTypeChange() {
  form.componentType = ''
  await getComponentTypeList()
}

function syncQuery(id = form.id) {
  const query = new URLSearchParams(location.search)
  if (id) query.set('id', id)
  query.set('name', form.name)
  query.set('type', form.type)
  query.set('componentType', form.componentType)
  history.replaceState(
    {},
    '',
    `${location.pathname}?${query.toString()}${props.store.serialize()}`,
  )
}

async function handleSave() {
  if (!canSave.value) {
    setMessage('error', '请补全名称和分类')
    return
  }

  loading.value = true
  setMessage('info', '截图上传中...')

  const template = props.store.serialize().replace(/^#/, '')

  try {
    const image = await uploadPreviewImage()
    setMessage('info', '保存中...')

    const body: ComponentPayload = {
      id: form.id || undefined,
      name: form.name.trim(),
      type: Number(form.type),
      componentType: Number(form.componentType),
      image,
      template,
    }
    const data = isEdit.value
      ? await updateComponent(body)
      : await saveComponent(body)

    if (!isEdit.value && typeof data === 'string') {
      form.id = data
    }
    syncQuery()
    setMessage('success', '保存成功')
  } catch (err) {
    setMessage('error', err instanceof Error ? err.message : '保存失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  readQuery()

  try {
    await getTypeList()
    await getComponentTypeList()
  } catch (err) {
    setMessage('error', err instanceof Error ? err.message : '字典加载失败')
  }
})
</script>

<template>
  <header class="playground-header">
    <div class="field name-field">
      <label for="component-name">名称</label>
      <input
        id="component-name"
        v-model="form.name"
        placeholder="请输入组件名称"
      />
    </div>

    <div class="field">
      <label for="component-type">类型</label>
      <select
        id="component-type"
        v-model="form.type"
        @change="handleTypeChange"
      >
        <option
          v-for="item in typeList"
          :key="item.value"
          :value="String(item.value)"
        >
          {{ item.label }}
        </option>
      </select>
    </div>

    <div class="field">
      <label for="component-category">分类</label>
      <select id="component-category" v-model="form.componentType">
        <option
          v-for="item in componentTypeList"
          :key="item.value"
          :value="String(item.value)"
        >
          {{ item.label }}
        </option>
      </select>
    </div>

    <div class="status" :class="messageType">{{ message }}</div>

    <button :disabled="loading || !canSave" @click="handleSave">
      {{ loading ? '保存中' : '保存' }}
    </button>
  </header>
</template>

<style scoped>
.playground-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border, #ddd);
  color: var(--text, #213547);
  background: var(--bg, #fff);
}

.field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 160px;
}

.name-field {
  min-width: 260px;
}

label {
  color: var(--text-light, #666);
  font-size: 13px;
  white-space: nowrap;
}

input,
select {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  box-sizing: border-box;
  border: 1px solid var(--border, #ddd);
  border-radius: 4px;
  color: inherit;
  background: var(--bg-soft, #f8f8f8);
  outline: none;
}

input:focus,
select:focus {
  border-color: var(--color-branding, #42b883);
}

.status {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-light, #888);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status.success {
  color: var(--color-branding, #42b883);
}

.status.error {
  color: #d03050;
}

button {
  height: 32px;
  min-width: 72px;
  padding: 0 16px;
  border-radius: 4px;
  color: #fff;
  background: var(--color-branding, #42b883);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 720px) {
  .playground-header {
    flex-wrap: wrap;
    height: auto;
    min-height: 56px;
    padding: 10px;
  }

  .field,
  .name-field {
    flex: 1 1 100%;
    min-width: 0;
  }
}
</style>
