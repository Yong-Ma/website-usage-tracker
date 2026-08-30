# Website Time Board 学习指南

这是一款基于 Chrome Extension Manifest V3 的网站使用时长统计扩展。它监听当前激活的标签页、窗口焦点、系统空闲状态和定时器，把网站使用时长按日期保存在浏览器本地，再由 Popup 页面聚合并展示排行榜。

## 一、先建立整体认识

项目没有 React、Vue、TypeScript、Webpack 等框架和构建工具，主要使用：

- 原生 JavaScript（ES Modules、`async/await`、Promise、Map、URL、DOM API）
- 原生 HTML/CSS
- Chrome Extensions API（Manifest V3）
- Chrome 本地存储：`chrome.storage.local` 和 `chrome.storage.session`
- Node.js 内置测试框架：`node:test`、`node:assert/strict`
- 浏览器扩展国际化目录：`_locales/`

因此，最适合的学习顺序是“JavaScript 基础 → 浏览器扩展模型 → 本项目的数据流 → 测试与调试”，不需要先学习某个前端框架。

## 二、需要具备的技能

### 1. JavaScript 基础：必须掌握

重点学习：

- `const`、`let`、解构、展开运算符、可选链 `?.`、空值合并 `??`
- 函数、闭包、模块导入导出：`import` / `export`
- 对象、数组、`Map`、`Set`、`Object.values`、`Object.fromEntries`
- 条件判断、循环、排序：`sort((a, b) => ...)`
- `Date`、时间戳、时区和日期格式化
- `URL` 解析与异常处理：`try/catch`
- Promise、`async/await`、错误处理和异步执行顺序

本项目中的典型例子：`src/shared/site-utils.js` 负责 URL 和日期处理，`src/shared/usage-aggregation.js` 使用 `Map` 汇总并排序网站，`src/background/service-worker.js` 大量使用异步 Chrome API。

### 2. 浏览器端 HTML/CSS/DOM：必须掌握

需要能够看懂：

- HTML 语义化结构、按钮、列表和无障碍属性
- `document.querySelector`、创建 DOM 节点、事件监听
- `textContent`、`classList.toggle`、`setAttribute`
- `hidden`、`aria-*` 属性以及键盘交互
- CSS 盒模型、Flex/Grid、伪元素、状态选择器

入口文件是 `src/popup/popup.html`，交互逻辑在 `src/popup/popup.js`，样式在 `src/popup/popup.css`。Popup 是一个短生命周期页面，打开扩展弹窗时加载，关闭后通常会被销毁，因此它不负责持续计时。

### 3. Chrome Extension Manifest V3：必须掌握

需要理解：

- `manifest.json` 是扩展的配置和权限声明
- `background.service_worker` 是后台入口，负责持续响应浏览器事件
- `action.default_popup` 指定工具栏弹窗页面
- `permissions` 决定可以调用哪些 API
- Service Worker 可能被浏览器挂起，不能把所有状态只放在内存变量里
- 扩展页面与后台之间通过 `chrome.runtime.sendMessage` 通信

本项目的权限含义：

| 权限 | 用途 |
| --- | --- |
| `tabs` | 查询当前激活标签页和 URL |
| `storage` | 保存统计数据、语言和暂停设置 |
| `idle` | 判断用户是否处于空闲状态 |
| `alarms` | 每分钟触发一次心跳，刷新计时 |

### 4. 异步并发与状态管理：本项目的核心难点

浏览器事件可能同时到达，例如用户快速切换标签页时，`tabs.onActivated`、`tabs.onUpdated` 和定时器都可能触发刷新。如果多个刷新操作并发执行，可能重复计算或覆盖数据。

项目用以下方式解决：

```js
let refreshQueue = Promise.resolve();

refreshQueue = refreshQueue
  .then(() => refreshActiveSession(updatedTab))
  .catch(handleError);
```

这相当于建立一个 Promise 队列，让刷新操作依次执行。阅读 `service-worker.js` 时，要特别关注：

- `queueRefresh`
- `queueClearUsage`
- `queueDeleteUsageForOrigin`
- `queueSetTrackingPaused`
- `flushActiveSession`

### 5. 数据建模与时间计算：必须掌握

项目使用“按日期分桶”的数据结构：

```text
usageByDate
└── YYYY-MM-DD
    └── origin
        ├── origin
        ├── seconds
        ├── faviconUrl
        └── lastVisitedAt
```

例如：

```js
{
  "2026-07-04": {
    "https://github.com": {
      origin: "https://github.com",
      seconds: 120,
      faviconUrl: "...",
      lastVisitedAt: 1780000000000
    }
  }
}
```

一次正在进行的访问不是直接持续写入总数据，而是先记录一个会话：

```js
{
  origin: "https://github.com",
  faviconUrl: "...",
  startedAt: 1780000000000
}
```

离开网站、切换标签页、窗口失焦、用户空闲、暂停统计或心跳刷新时，`flushActiveSession` 根据当前时间减去 `startedAt`，把经过的秒数累加到当天数据中。

要特别理解两个概念：

- `origin`：项目将 URL 归一化为协议 + 主机名，例如把 `https://github.com/a?b=1` 归为 `https://github.com`。
- 本地日期：`getLocalDateKey` 使用运行环境的本地时间，不是 UTC 日期，跨时区时要注意边界行为。

## 三、项目技术栈和代码职责

| 文件/目录 | 技术 | 主要职责 |
| --- | --- | --- |
| `manifest.json` | Manifest V3 JSON | 定义扩展入口、权限、图标和 Popup |
| `src/background/service-worker.js` | Chrome API + 异步 JS | 监听浏览器事件、创建/结束会话、处理消息 |
| `src/background/storage.js` | `chrome.storage.local` | 读写统计数据、清空和删除记录、暂停设置 |
| `src/background/session-store.js` | `chrome.storage.session` | 保存当前活动会话，降低 Service Worker 重启造成的丢失 |
| `src/shared/session.js` | 纯函数 JavaScript | 创建会话和计算经过秒数 |
| `src/shared/site-utils.js` | `URL`、`Date` | URL 归一化、日期范围、时长格式化 |
| `src/shared/usage-aggregation.js` | `Map`、排序 | 按今日/近 7 天/总计聚合排行榜 |
| `src/popup/popup.js` | DOM + Chrome API | 加载数据、渲染界面、处理清空/删除/暂停 |
| `src/popup/i18n.js` | 对象字典 | 中英文翻译和语言选择 |
| `src/popup/popup.html` | HTML | Popup 页面结构和无障碍语义 |
| `src/popup/popup.css` | CSS | Popup 布局、视觉样式和交互状态 |
| `tests/` | Node.js Test Runner | 验证纯逻辑、存储逻辑和国际化逻辑 |
| `_locales/` | Chrome 国际化资源 | 扩展名称和描述的多语言配置 |

## 四、核心运行流程

### 统计流程

```text
浏览器事件
  → queueRefresh()
  → flushActiveSession()
  → 查询当前焦点窗口和激活标签页
  → canonicalizeUrl()
  → createSession()
  → 保存 activeUsageSession
  → 下一次事件/心跳时累加 elapsed seconds
  → chrome.storage.local 保存 usageByDate
```

### 查看排行榜流程

```text
打开 Popup
  → popup.js 读取 chrome.storage.local
  → aggregateUsage(usageByDate, range)
  → 按 seconds 排序
  → 截取前 10 条
  → renderRows()
  → DOM 展示
```

### 清空或删除流程

```text
Popup 点击按钮
  → chrome.runtime.sendMessage()
  → Service Worker onMessage
  → 串行队列等待当前会话结算
  → 修改 storage.local
  → Popup 重新读取数据并 render()
```

## 五、推荐代码阅读顺序

### 第 1 步：先读项目说明和入口

阅读 `README.zh-CN.md`、`package.json`、`manifest.json`，回答三个问题：

1. 扩展由哪些页面或后台脚本组成？
2. 哪些 Chrome 权限被使用？
3. 测试如何运行？

### 第 2 步：读纯函数模块

按下面顺序阅读，先建立数据和算法基础：

1. `src/shared/session.js`
2. `src/shared/site-utils.js`
3. `src/shared/usage-aggregation.js`
4. `src/background/storage.js`
5. `src/background/session-store.js`

这些模块副作用较少，最容易通过测试理解。

### 第 3 步：读后台核心

重点追踪 `src/background/service-worker.js` 中这条主线：

`事件监听 → queueRefresh → refreshActiveSession → flushActiveSession → getCurrentActiveTab → getSessionFromTab`

然后再读清空、删除、暂停三个操作，理解它们为什么都要和当前活动会话同步。

### 第 4 步：读 Popup

阅读顺序建议是：

1. `popup.html`：页面有哪些控件
2. `popup.js`：状态如何加载、更新和渲染
3. `i18n.js`：翻译键如何查找和替换
4. `popup.css`：视觉和交互状态如何实现

### 第 5 步：用测试反向验证理解

每读完一个模块，先看对应测试，再回到实现。测试覆盖了 URL 归一化、时间格式化、日期范围、排行榜排序、存储删除、会话持久化和语言选择等关键规则。

## 六、建议掌握的调试方法

### 加载扩展

1. 打开 Chrome 的 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”，选择项目根目录
4. 修改代码后点击扩展卡片的刷新按钮

### 调试后台 Service Worker

在扩展管理页点击 Service Worker 的“检查”，查看 Console。重点观察：

- 当前 `idleState` 和焦点窗口
- 当前激活标签页 URL
- `activeSession` 的 `startedAt`
- `flushActiveSession` 写入了多少秒
- `chrome.storage.local` 中的 `usageByDate`

### 调试 Popup

右键扩展图标或 Popup 页面选择“检查”，查看 DOM、事件和 Console。Popup 每次打开都会重新读取数据，因此要区分“Popup 状态”和“后台统计状态”。

### 运行自动化测试

```bash
npm test
```

当前测试套件共 6 个测试文件，适合在修改纯逻辑后快速回归。Chrome API 相关逻辑主要通过传入内存存储对象来测试，这是依赖注入和可测试性设计的例子。

## 七、快速学习实践路线

### 练习 1：读懂数据

手动构造一个 `usageByDate` 对象，调用 `aggregateUsage`，验证今日、7 天和总计的结果。

### 练习 2：增加一个显示规则

修改 `formatDuration`，例如让英文时长显示空格：`2h 3m`。然后补充测试。

### 练习 3：增加排行榜行为

把前 10 名改成可配置常量，或为并列网站增加新的排序规则，并更新 `usage-aggregation.test.js`。

### 练习 4：理解事件驱动统计

在 Service Worker 中临时加入日志，依次执行：切换标签页、刷新页面、窗口失焦、电脑空闲、恢复活动，观察会话何时被结算。

### 练习 5：增加一个小功能

推荐实现“导出本地统计 JSON”。这会练习 Popup 与 `chrome.storage.local` 的读取、数据转换和浏览器下载 API，同时不会改变核心计时模型。

## 八、容易踩坑的地方

- 不要把持续计时逻辑放到 Popup；Popup 关闭后不可靠。
- Service Worker 内存变量可能丢失，活动会话需要写入 `chrome.storage.session`。
- 标签页事件可能快速连续触发，不能简单地并发刷新；要理解 `refreshQueue`。
- 当前代码只统计 `http:` 和 `https:`，`chrome://`、`file://` 等页面会被忽略。
- 统计按 hostname 归并，路径、查询参数和端口不会区分。
- `today` 和 `week` 依赖本地日期，测试日期时要显式传入 `new Date(...)`。
- `aggregateUsage` 只返回前 10 行，但 `totalSeconds` 是所有有效记录的总和。
- Popup 的 `chrome.runtime.sendMessage` 是异步请求，返回 `true` 表示后台会异步调用 `sendResponse`。
- 清空或删除前必须先结算活动会话，否则刚刚使用的时长可能被遗漏或重新写回。

## 九、学完后的能力检查

如果你能独立回答下面的问题，就基本能读懂这个项目：

- 为什么项目需要同时使用 `storage.local` 和 `storage.session`？
- 用户从 A 网站切换到 B 网站时，A 的时间在哪里结算？
- 为什么每分钟需要 `alarms` 心跳？
- `refreshQueue` 如何避免多个浏览器事件造成竞态？
- 为什么 Popup 不直接修改统计数据，而是给 Service Worker 发消息？
- 7 天范围具体包含哪些日期？
- 同时使用多个网站时，项目统计的是标签页存在时间还是当前焦点标签页时间？
- 一个网站跨多天访问时，聚合函数如何合并 favicon 和时长？

## 十、最短学习路径

如果时间有限，按这个顺序学习即可：

1. JavaScript 的模块、Promise、`async/await`、Date、Map
2. Chrome Extension Manifest V3 的 Service Worker、Popup、权限和消息通信
3. 阅读 `session.js`、`site-utils.js`、`usage-aggregation.js`
4. 阅读 `service-worker.js` 的 `queueRefresh` 和 `flushActiveSession`
5. 阅读 `popup.js` 的 `initPopup`、`render` 和消息发送
6. 运行 `npm test`，修改一个小功能并补测试

达到这个程度后，你不仅能看懂当前项目，还具备继续学习 Chrome 扩展、浏览器事件驱动程序和本地数据应用的基础。
