import { computed, version as currentVersion, ref } from 'vue'

export function getVersions(version: string): number[] {
  return version.split('.').map((v) => parseInt(v, 10))
}

export function isVaporSupported(version: string): boolean{
  const [major, minor] = getVersions(version)
  // vapor mode is supported in v3.6+
  return major > 3 || (major === 3 && minor >= 6)
}

const esmBundle = (pkgName: string, externalVue = false) =>
  `https://esm.sh/${pkgName}?bundle${externalVue ? '&external=vue' : ''}`

// The preview iframe imports these packages on every run. Prefer bundled CDN
// entries to avoid hundreds of tiny ESM/icon requests exhausting the browser.
export const builtinLibraryImports: Record<string, string> = {
  echarts: esmBundle('echarts@latest'),
  'echarts/': 'https://esm.sh/echarts@latest/',
  'ant-design-vue':
    'https://cdn.jsdelivr.net/npm/ant-design-vue@4.2.6/dist/antd.esm.min.js',
  'ant-design-vue/': 'https://esm.sh/ant-design-vue@4.2.6/',
  '@ant-design/icons-vue': esmBundle('@ant-design/icons-vue@7.0.1', true),
  '@ant-design/icons-vue/': 'https://esm.sh/@ant-design/icons-vue@7.0.1/',
  'element-plus': esmBundle('element-plus@latest', true),
  'element-plus/': 'https://esm.sh/element-plus@latest/',
  '@element-plus/icons-vue': esmBundle('@element-plus/icons-vue@latest', true),
  '@element-plus/icons-vue/':
    'https://esm.sh/@element-plus/icons-vue@latest/',
}

export function useVueImportMap(
  defaults: {
    runtimeDev?: string | (() => string)
    runtimeProd?: string | (() => string)
    serverRenderer?: string | (() => string)
    vueVersion?: string | null
  } = {},
) {
  function normalizeDefaults(defaults?: string | (() => string)) {
    if (!defaults) return
    return typeof defaults === 'string' ? defaults : defaults()
  }

  const productionMode = ref(false)
  const vueVersion = ref<string | null>(defaults.vueVersion || null)

  function getVueURL() {
    const version = vueVersion.value || currentVersion
    return isVaporSupported(version)
      ? `https://cdn.jsdelivr.net/npm/vue@${version}/dist/vue.runtime-with-vapor.esm-browser${productionMode.value ? `.prod` : ``}.js`
      : `https://cdn.jsdelivr.net/npm/@vue/runtime-dom@${version}/dist/runtime-dom.esm-browser${productionMode.value ? `.prod` : ``}.js`
  }

  const importMap = computed<ImportMap>(() => {
    const vue =
      (!vueVersion.value &&
        normalizeDefaults(
          productionMode.value ? defaults.runtimeProd : defaults.runtimeDev,
        )) ||
      getVueURL()

    const serverRenderer =
      (!vueVersion.value && normalizeDefaults(defaults.serverRenderer)) ||
      `https://cdn.jsdelivr.net/npm/@vue/server-renderer@${
        vueVersion.value || currentVersion
      }/dist/server-renderer.esm-browser.js`
    return {
      imports: {
        vue,
        'vue/server-renderer': serverRenderer,
        ...builtinLibraryImports,
      },
    }
  })

  return {
    productionMode,
    importMap,
    vueVersion,
    defaultVersion: currentVersion,
  }
}

export interface ImportMap {
  imports?: Record<string, string | undefined>
  scopes?: Record<string, Record<string, string>>
}

export function mergeImportMap(a: ImportMap, b: ImportMap): ImportMap {
  return {
    imports: { ...a.imports, ...b.imports },
    scopes: { ...a.scopes, ...b.scopes },
  }
}
