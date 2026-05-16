# KT Template Online Playground

`kt-template-online-playground` 是 KT Template Online 的在线编辑器。项目基于 `@vue/repl` 改造，负责编辑 Vue SFC 模板、预览运行效果、读取前台传入的组件信息，并在保存时截图上传 MinIO 后写入后端组件数据。

## 技术栈

- Vue 3 + TypeScript
- Vite
- @vue/repl
- Monaco Editor / CodeMirror
- Axios
- MinIO 上传接口
- pnpm

## 功能概览

- 在线编辑 Vue 单文件组件。
- 实时编译并在 iframe 预览运行结果。
- 支持从 URL hash 恢复编辑器文件状态。
- 读取 URL query 初始化组件 `id`、`name`、`type`、`componentType`。
- 保存时自动截取预览区图片，上传到 MinIO，并把图片地址写入组件 `image` 字段。
- 根据是否存在 `id` 自动调用新增或编辑接口。

## 目录结构

```text
src
  api/                 # axios 封装和组件/字典/MinIO 接口
  editor/              # 文件列表、编辑器容器、编辑器适配
  output/              # 预览、沙箱、SSR 输出
  monaco/              # Monaco 语言服务和资源加载
  codemirror/          # CodeMirror 编辑器
  template/            # 默认模板
  PlaygroundHeader.vue # 组件表单、截图上传、保存入口
  Repl.vue             # 编辑器主体
  store.ts             # REPL 文件状态、序列化和反序列化
  index.ts             # 包导出入口
test/main.ts           # 本地 Playground 页面入口
```

## 环境变量

仓库只提交 `.env.example`，真实 `.env.development` 和 `.env.production` 保留在本地。

```env
VITE_APP_API_BASE=/api
VITE_APP_PROXY=http://localhost:48085/
```

关键变量：

| 变量 | 说明 |
| --- | --- |
| `VITE_APP_API_BASE` | 前端请求前缀，默认 `/api` |
| `VITE_APP_PROXY` | 后端服务地址，Vite dev server 会把 `/api` 代理到这里 |

## 启动

项目 `.node-version` 为 `lts/*`。Windows 下如别名不可用，先用 `nvm ls` 查看已安装 LTS，再切到具体版本。

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm dev          # 本地 Playground 页面，默认端口 48090
pnpm typecheck    # 类型检查
pnpm build        # 构建库产物
pnpm build-preview
pnpm lint
```

## URL 数据约定

Playground 同时使用 query 和 hash：

- `query` 保存组件业务信息：`id`、`name`、`type`、`componentType`。
- `hash` 保存 `store.serialize()` 生成的编辑器文件状态。
- 保存成功后会用 `history.replaceState` 同步 query 和最新 hash。

前台跳转示例：

```text
http://localhost:48090/?id=xxx&name=基础折线图&type=1&componentType=1#...
```

## 保存流程

`PlaygroundHeader.vue` 是保存入口：

1. 从 query 读取组件信息。
2. 请求 `/dict/getDictByKey` 和 `/dict/getComponentDictByType` 初始化类型下拉。
3. 通过当前 iframe 预览内容生成截图。
4. 调用 `/minio/upload` 上传截图，获取返回的 `url`。
5. 组装 `name`、`type`、`componentType`、`image`、`template`。
6. 有 `id` 时调用 `/component/update`，没有 `id` 时调用 `/component/save`。
7. 新增成功后把后端返回的 `id` 写回 query。

## 接口约定

接口集中在 `src/api`：

- `request.ts`：axios 实例，统一处理 `code !== 200` 的错误。
- `component.ts`：新增和编辑组件。
- `dict.ts`：组件类型字典。
- `minio.ts`：截图文件上传。

当前主要接口：

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| `GET` | `/dict/getDictByKey` | 查询一级类型 |
| `GET` | `/dict/getComponentDictByType` | 查询二级类型 |
| `POST` | `/minio/upload` | 上传预览截图 |
| `POST` | `/component/save` | 新增组件 |
| `POST` | `/component/update` | 编辑组件 |

## 开发约定

- 保持 query 和 hash 分工，不要让 `store.serialize()` 覆盖 `location.search`。
- 保存前必须先上传截图，`image` 字段使用 MinIO 返回的 URL。
- 业务请求新增时统一放到 `src/api`，组件里调用封装后的函数。
- 编辑器核心逻辑来自 `@vue/repl`，调整时优先保持原有 Store、Preview、Editor 分层。

## 轻量验证

常规改动优先执行：

```bash
pnpm typecheck
```

涉及保存或预览交互时再启动开发服务检查明显报错：

```bash
pnpm dev
```
