<script setup lang="ts">
import html2canvas from 'html2canvas'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  saveComponent,
  updateComponent,
  type ComponentPayload,
} from './api/component'
import { getComponentDictByType, getDictByKey, type DictItem } from './api/dict'
import { getResourceProxyEndpoint, uploadFile } from './api/minio'
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
const screenshotPadding = 6

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

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('截图生成失败'))),
        'image/png',
      )
    } catch (err) {
      reject(err)
    }
  })
}

function isCanvasSecurityError(err: unknown) {
  return err instanceof DOMException && err.name === 'SecurityError'
}

type ScreenshotBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

type ScreenshotArea = {
  x: number
  y: number
  width: number
  height: number
  windowWidth: number
  windowHeight: number
}

function mergeBounds(
  bounds: ScreenshotBounds | undefined,
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>,
) {
  if (rect.width <= 0 || rect.height <= 0) {
    return bounds
  }

  if (!bounds) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }
  }

  return {
    left: Math.min(bounds.left, rect.left),
    top: Math.min(bounds.top, rect.top),
    right: Math.max(bounds.right, rect.right),
    bottom: Math.max(bounds.bottom, rect.bottom),
  }
}

function isTransparentColor(value: string) {
  return (
    !value ||
    value === 'transparent' ||
    value === 'rgba(0, 0, 0, 0)' ||
    value === 'rgb(0 0 0 / 0)'
  )
}

function hasPaintedBox(style: CSSStyleDeclaration) {
  const borderWidth =
    Number.parseFloat(style.borderTopWidth) +
    Number.parseFloat(style.borderRightWidth) +
    Number.parseFloat(style.borderBottomWidth) +
    Number.parseFloat(style.borderLeftWidth)

  return (
    style.backgroundImage !== 'none' ||
    !isTransparentColor(style.backgroundColor) ||
    borderWidth > 0 ||
    style.boxShadow !== 'none' ||
    style.outlineStyle !== 'none'
  )
}

function isVisibleElement(element: Element, win: Window) {
  const style = win.getComputedStyle(element)

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0
  )
}

function isRenderableElement(element: Element, win: Window) {
  const tagName = element.tagName.toLowerCase()

  return (
    [
      'button',
      'canvas',
      'img',
      'input',
      'select',
      'svg',
      'table',
      'textarea',
      'video',
    ].includes(tagName) || hasPaintedBox(win.getComputedStyle(element))
  )
}

function getContentBounds(root: HTMLElement, doc: Document) {
  const win = doc.defaultView || window
  let bounds: ScreenshotBounds | undefined

  root.querySelectorAll('*').forEach((element) => {
    if (!isVisibleElement(element, win) || !isRenderableElement(element, win)) {
      return
    }

    bounds = mergeBounds(bounds, element.getBoundingClientRect())
  })

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const text = node.textContent?.trim()

    if (text) {
      const range = doc.createRange()
      range.selectNodeContents(node)
      Array.from(range.getClientRects()).forEach((rect) => {
        bounds = mergeBounds(bounds, rect)
      })
      range.detach()
    }

    node = walker.nextNode()
  }

  return bounds || mergeBounds(undefined, root.getBoundingClientRect())
}

function getPreviewContentArea(doc: Document, iframe: HTMLIFrameElement) {
  const root = (doc.querySelector('#app') as HTMLElement | null) || doc.body
  const bounds = getContentBounds(root, doc)

  if (!bounds) {
    throw new Error('预览内容为空，无法生成截图')
  }

  const win = doc.defaultView
  const scrollX = win?.scrollX || 0
  const scrollY = win?.scrollY || 0
  const x = Math.max(0, Math.floor(bounds.left + scrollX - screenshotPadding))
  const y = Math.max(0, Math.floor(bounds.top + scrollY - screenshotPadding))
  const right = Math.ceil(bounds.right + scrollX + screenshotPadding)
  const bottom = Math.ceil(bounds.bottom + scrollY + screenshotPadding)
  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)

  return {
    x,
    y,
    width,
    height,
    windowWidth: Math.max(
      iframe.clientWidth,
      doc.documentElement.scrollWidth,
      right,
    ),
    windowHeight: Math.max(
      iframe.clientHeight,
      doc.documentElement.scrollHeight,
      bottom,
    ),
  } satisfies ScreenshotArea
}

async function capturePreviewImage() {
  await nextFrame()

  const iframe = getPreviewIframe()
  const doc = iframe?.contentDocument

  if (!iframe || !doc?.body) {
    throw new Error('未找到预览区域，无法生成截图')
  }

  const area = getPreviewContentArea(doc, iframe)
  const canvas = await html2canvas(doc.body, {
    allowTaint: false,
    backgroundColor: '#ffffff',
    height: area.height,
    imageTimeout: 15000,
    logging: false,
    proxy: getResourceProxyEndpoint(),
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: false,
    width: area.width,
    windowHeight: area.windowHeight,
    windowWidth: area.windowWidth,
    x: area.x,
    y: area.y,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc) => {
      const clonedBody = clonedDoc.body

      // 交给 html2canvas 处理资源加载，只清理脚本并固定背景，截图范围由真实内容边界裁剪。
      clonedBody.querySelectorAll('script').forEach((item) => item.remove())
      clonedBody.style.background = '#ffffff'
    },
  })

  try {
    return await canvasToBlob(canvas)
  } catch (err) {
    if (isCanvasSecurityError(err)) {
      throw new Error('截图失败：预览中仍有跨域资源污染画布')
    }

    throw err
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
