# 网站使用时长统计 Chrome 插件设计

## 概述

构建一个可以运行在 Google Chrome 浏览器中的插件，用来记录用户在不同网站上的主动使用时长，并在插件弹窗中按使用时长倒序展示榜单。

插件按网站主站维度统计，不记录具体页面。比如 `https://www.youtube.com/watch?v=gFV2eAjHjiU` 会记录为 `https://www.youtube.com`。子域名会保留，所以 `https://mail.google.com` 和 `https://www.google.com` 会被视为两个不同网站。

## 目标

- 只统计当前激活的 Chrome 标签页，并且要求 Chrome 窗口处于前台、用户不是 idle 状态。
- 所有数据都只存储在本地 Chrome 插件存储中。
- 在插件弹窗中展示网站 icon、网站地址和使用时长。
- 支持三个时间范围：今日、7 天、总计。
- 榜单按使用时长倒序排列。
- 使用设计讨论中选择的 B 布局：顶部显示当前时间范围的总使用时长摘要，下方显示时间范围切换和榜单。

## 非目标

- 不记录具体页面路径、查询参数或 hash。
- 不把数据上传到服务器。
- 第一版不做完整统计页面。
- 第一版不提供清空数据按钮。
- 不把子域名合并到根域名或注册域名。

## 技术方案

使用原生 Chrome Manifest V3 插件，不引入构建步骤。仓库中直接保存 Chrome 可加载的静态 JavaScript、HTML、CSS 和图片资源。

插件由三部分组成：

- `manifest.json`：声明权限、弹窗入口、后台 service worker 和插件元数据。
- 后台 service worker：跟踪当前激活标签页状态，并把累计秒数写入 `chrome.storage.local`。
- 弹窗页面：读取本地存储数据，按当前选择的时间范围聚合，并渲染榜单。

这个方案让插件可以直接以开发者模式加载，便于安装、检查和测试，也避免为轻量插件引入打包工具。

## 权限

插件需要以下 Chrome 权限：

- `tabs`：读取当前激活标签页的 URL 和 favicon URL。
- `storage`：把使用时长数据持久化到本地。
- `idle`：当 Chrome 判断用户 idle 或锁屏时暂停统计。

不需要 host permissions，因为插件只读取 `tabs` 权限暴露的标签页元数据，不向网页注入脚本。

## 网站标识规则

规范化的网站 key 使用：

```text
url.protocol + "//" + url.hostname
```

示例：

- `https://www.youtube.com/watch?v=gFV2eAjHjiU` 记录为 `https://www.youtube.com`。
- `https://github.com/openai/codex` 记录为 `https://github.com`。
- `http://localhost:3000/path` 记录为 `http://localhost`。

以下 URL 会被忽略：

- `chrome://...`
- `chrome-extension://...`
- `edge://...`
- `about:...`
- `file://...`
- 无法被 `new URL(...)` 解析的 URL

## 数据模型

数据统一存储在 `chrome.storage.local` 的一个 key 下：

```json
{
  "usageByDate": {
    "2026-07-04": {
      "https://www.youtube.com": {
        "origin": "https://www.youtube.com",
        "seconds": 8040,
        "faviconUrl": "https://www.youtube.com/favicon.ico",
        "lastVisitedAt": 1783095000000
      }
    }
  }
}
```

日期使用用户本地时区的 `YYYY-MM-DD` 格式。时长用整数秒保存。

如果某个网站没有 favicon URL，弹窗会使用插件内置的占位 icon。如果后续访问时拿到了 favicon URL，存储中的 favicon URL 会被更新。

## 计时规则

service worker 在内存中维护一个当前活动会话，包含：

- `origin`
- `faviconUrl`
- `startedAt`

在切换或清空当前活动会话之前，service worker 会先把已过去的时长写入存储。已过去时长向下取整到整数秒，不足 1 秒的 flush 会被忽略。

只有当以下条件全部满足时才开始或继续计时：

- Chrome 当前有获得焦点的窗口。
- 获得焦点的窗口中存在激活标签页。
- 激活标签页 URL 可以映射为有效的网站 origin。
- `chrome.idle` 报告用户处于 active 状态。

以下任一情况发生时暂停计时：

- 用户切换标签页。
- 激活标签页 URL 变化为不同 origin 或被忽略的 URL。
- Chrome 窗口失去焦点。
- 用户进入 idle 或 locked 状态。
- service worker 收到需要 flush 当前状态的生命周期事件。

service worker 监听以下事件：

- `chrome.tabs.onActivated`
- `chrome.tabs.onUpdated`
- `chrome.windows.onFocusChanged`
- `chrome.idle.onStateChanged`
- `chrome.runtime.onStartup`
- `chrome.runtime.onInstalled`

在启动和安装事件中，service worker 会重新计算当前活动标签页状态，不假设之前的内存会话仍然有效。

## 弹窗 UI

弹窗使用 B 布局：

1. 标题：`网站时长榜`
2. 摘要面板：显示当前选择时间范围的总使用时长。
3. 分段切换控件：`今日`、`7 天`、`总计`。
4. 榜单行：按使用时长倒序排列。

每一行榜单必须显示：

- 网站 favicon 或占位 icon。
- 规范化后的网站地址，例如 `https://www.youtube.com`。
- 格式化后的使用时长，例如 `2h 14m`、`48m` 或 `35s`。

如果当前时间范围没有使用数据，弹窗显示空状态提示，而不是空列表。

弹窗每次打开时默认显示 `今日`。第一版不需要记住上一次选择的时间范围。

## 聚合规则

今日：

- 只包含当前本地日期。

7 天：

- 包含当前本地日期和之前 6 个本地日期。

总计：

- 包含 `usageByDate` 中保存的所有日期。

对每个时间范围，同一个 origin 在不同日期中的记录会被求和。显示元数据保留最新的非空 favicon URL 和最近的 `lastVisitedAt`。

排序规则：

1. 总秒数更高的排在前面。
2. 如果时长相同，`lastVisitedAt` 更新的排在前面。
3. 如果仍然相同，按 origin 字母顺序排列。

## 错误处理

无效或不支持的标签页 URL 会被忽略，不会写入存储。

如果 `chrome.storage.local` 返回缺失或格式异常的数据，插件会把它当作空数据集，并在下一次成功 flush 时写回有效数据结构。

如果弹窗中的 favicon 加载失败，图片会回退到插件内置占位 icon，不影响已记录的使用时长。

## 测试策略

把可测试逻辑放在小型纯 JavaScript 模块中，避免直接依赖 Chrome API：

- URL 到 origin 的规范化。
- 本地日期 key 生成。
- 使用时长格式化。
- 时间范围聚合和排序。
- 会话 elapsed time 计算。

测试使用 Node 内置 test runner 运行。Chrome API 集成层保持很薄，只负责调用已经测试过的纯函数。

Chrome 开发者模式中的手动验证覆盖：

- 加载未打包插件。
- 打开多个网站并切换激活标签页。
- 确认只有当前激活且 Chrome 窗口前台的标签页会累计时长。
- 打开弹窗，确认今日、7 天、总计排序正确。
- 确认每一行都显示 icon、地址和格式化时长。

## 成功标准

- 插件可以作为未打包扩展加载到 Google Chrome。
- 访问 `https://www.youtube.com/watch?v=gFV2eAjHjiU` 时，时间记录到 `https://www.youtube.com`。
- 后台标签页在非激活状态下不会累计时长。
- Chrome 窗口失去焦点时暂停计时。
- 用户 idle 或 locked 时暂停计时。
- 弹窗 B 布局显示摘要、时间范围切换和排序榜单。
- 每一行榜单都包含 icon、网站地址和使用时长。
- 纯逻辑模块的自动化测试全部通过。
