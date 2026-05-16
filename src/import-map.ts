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

const ANT_DESIGN_VUE_VERSION = '4.2.6'
const ANT_DESIGN_ICONS_VERSION = '7.0.1'
const ELEMENT_PLUS_VERSION = '2.14.0'
const ELEMENT_PLUS_ICONS_VERSION = '2.3.2'
const LODASH_VERSION = '4.17.21'

// The preview iframe imports these packages on every run. Prefer bundled CDN
// entries to avoid hundreds of tiny ESM/icon requests exhausting the browser.
export const builtinLibraryImports: Record<string, string> = {
  echarts: esmBundle('echarts@latest'),
  'echarts/': 'https://esm.sh/echarts@latest/',
  'ant-design-vue':
    `https://cdn.jsdelivr.net/npm/ant-design-vue@${ANT_DESIGN_VUE_VERSION}/dist/antd.esm.min.js`,
  'ant-design-vue/': `https://esm.sh/ant-design-vue@${ANT_DESIGN_VUE_VERSION}/`,
  '@ant-design/icons-vue': esmBundle(
    `@ant-design/icons-vue@${ANT_DESIGN_ICONS_VERSION}`,
    true,
  ),
  '@ant-design/icons-vue/': `https://esm.sh/@ant-design/icons-vue@${ANT_DESIGN_ICONS_VERSION}/`,
  'element-plus': `https://cdn.jsdelivr.net/npm/element-plus@${ELEMENT_PLUS_VERSION}/dist/index.full.min.mjs`,
  'element-plus/': `https://cdn.jsdelivr.net/npm/element-plus@${ELEMENT_PLUS_VERSION}/`,
  '@element-plus/icons-vue': esmBundle(
    `@element-plus/icons-vue@${ELEMENT_PLUS_ICONS_VERSION}`,
    true,
  ),
  '@element-plus/icons-vue/':
    `https://esm.sh/@element-plus/icons-vue@${ELEMENT_PLUS_ICONS_VERSION}/`,
  'lodash-es': esmBundle(`lodash-es@${LODASH_VERSION}`),
  'lodash-es/': `https://cdn.jsdelivr.net/npm/lodash-es@${LODASH_VERSION}/`,
  lodash: esmBundle(`lodash@${LODASH_VERSION}`),
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
