# 02_CURRENT_SYSTEM_MAP.md

本文件用于回答一个核心问题：**现在到底有哪些系统面，哪些是可点击预览，哪些是真实业务链，哪些只是本地原型或线程产物。**

---

## 1. 当前系统不是单一前端

目前项目至少有三层：

```text
FW-ERP GitHub repo
├── frontend_react_admin   # 当前已上传到 FW-ERP main，并部署 GitHub Pages
├── local retail_ops_system/frontend_prototype  # 本地真实业务原型主工作面
└── local retail_ops_system/backend             # 本地 FastAPI + runtime_state.json 状态层
```

关键判断：

```text
GitHub Pages 上的 FW-ERP React 页面
≠ 本地 retail_ops_system 的完整业务系统
```

当前 GitHub Pages 适合老板、GPT、Codex 做**可点击前端壳验收**；但大量真实业务链路、后端接口、打印、状态写入，仍然散落在本地 `retail_ops_system`。

---

## 2. `frontend_react_admin`：当前 GitHub Pages 可点击管理壳

### 2.1 位置

```text
FW-ERP/
├── src/
├── public/
├── index.html
├── package.json
├── vite.config.ts
└── .github/workflows/deploy-pages.yml
```

### 2.2 当前用途

- React + TypeScript + Vite + Tailwind 管理后台前端。
- 已配置 GitHub Pages 部署。
- 当前可作为：
  - 流程可视化
  - 管理后台壳层
  - 非开发者点击验收页
  - GPT Thinking 产品审查入口

### 2.3 当前页面

目前已看到这些页面/路由：

```text
/                      AI 指挥台 / 当前首页
/bale-inbound          包裹入仓
/sorting-tasks         分拣任务
/sorting-station-preview 分拣工位样稿
/location-inventory    库位库存
/bale-sales/pricing    Bales 销售｜待售包裹
/bale-sales/outbound   Bales 销售｜真实出库
```

### 2.4 已知限制

- 首页仍偏 `AI 指挥台`，不是正式 `FW-ERP 运营主控台`。
- 这是前端管理壳，不代表所有业务后端已上线。
- `bale-sales` 页面有 API 调用语义，但 GitHub Pages 静态部署没有真实 backend。
- 它不等于本地 `/app/` 的完整业务原型。

---

## 3. `frontend_prototype`：本地真实业务原型主工作面

### 3.1 位置

```text
retail_ops_system/frontend_prototype/
├── index.html
├── app.js
├── styles.css
├── *-flow.js
├── tests/*.cjs
├── label-candidate-lab.html
├── hardware-label-lab.html
└── barcode-smoke*.html
```

### 3.2 当前用途

这是本地 Codex 多线程里最深的业务实现面。

它承载了：

- 仓库主分拣流
- 0.1 / 0.2 / 0.3 / 0.1.2 等原型页面
- 门店执行流
- 运营补货履约链
- 打印模板/标签机测试页
- Bales 销售 `/app` 入口
- 收银终端壳层
- 退仓/return candidates
- demo 数据生成工具

### 3.3 运行特点

- 不是 React/Vite。
- 大量逻辑集中在 `app.js` 和多个 `*-flow.js`。
- 很多页面接真实 `/api/v1`，不是纯 mock。
- 仍是原型前端，不是正式生产前端。

### 3.4 已知限制

- 代码体量大，多个线程反复修改，维护风险高。
- 部分按钮是真逻辑，部分按钮是原型入口，需要标注。
- 页面依赖本地 backend；backend 未启动时会报接口错误。
- 与 `frontend_react_admin` 有功能重复风险，尤其 Bales 销售、仓库页面。

---

## 4. `backend`：本地 FastAPI 状态与业务接口层

### 4.1 位置

```text
retail_ops_system/backend/
├── app/api/routes.py
├── app/core/state.py
├── app/core/config.py
├── app/core/seed_data.py
├── app/schemas/*.py
├── data/runtime_state.json
└── tests/*.py
```

### 4.2 当前用途

- 提供 `/api/v1` 接口。
- 管理本地 `runtime_state.json` 文件态。
- 承载分拣、打印、退仓、Bales 销售、门店履约等局部真实逻辑。
- 部署线程已补充启动、健康检查、备份、恢复、打印环境检查脚本。

### 4.3 已知限制

- 核心状态仍是 JSON 文件，不适合长期多门店并发。
- 权限硬校验未完整实现。
- 部分库存汇总仍由前端拼装，不是后端单一事实源。
- 打印依赖本机打印队列，云端部署不能直接控制仓库标签机。

---

## 5. `runtime_state.json`：当前本地状态核心

### 5.1 当前角色

`runtime_state.json` 目前承担了原型阶段的轻量数据库角色。

承载内容包括：

- 用户/角色 seed
- label templates
- raw bale / sorting / tokens
- store stock
- transfer / dispatch / receipt state
- sales / refund / return
- Bales sales candidates / orders
- demo 数据

### 5.2 风险

- 适合原型与现场测试，不适合正式多用户并发。
- 直接改文件进行测试态回退是临时方案，不是正式运维。
- 多线程修改数据结构时，容易造成旧字段、旧状态残留。

---

## 6. GitHub Pages 当前作用

### 6.1 已完成

- `FW-ERP` 已配置 GitHub Pages。
- `vite.config.ts` base 已对齐 `/FW-ERP/`。
- `BrowserRouter basename` 已对齐 `/FW-ERP`。
- 当前可通过浏览器打开 React 管理壳。

### 6.2 它适合做什么

- 老板/非开发者点击验收视觉和流程方向。
- GPT Thinking 审查页面信息架构。
- Codex 修改前端管理壳。
- 形成未来正式 React admin 的基础。

### 6.3 它不适合做什么

- 不适合验证本地 FastAPI 后端业务写入。
- 不适合验证 Deli 标签机真实打印。
- 不适合验证 `/app/` 原型里的所有历史业务按钮。
- 不适合直接宣称系统已正式上线。

---

## 7. 当前系统事实图

```text
老板 / GPT / 非开发者
        ↓
GitHub Pages: FW-ERP React admin preview
        ↓  只做可点击前端验收
------------------------------------------------
本地真实业务演练
        ↓
retail_ops_system/frontend_prototype (/app/)
        ↓
retail_ops_system/backend (/api/v1)
        ↓
runtime_state.json + local printer queue
```

---

## 8. 推荐短期定位

### 8.1 短期并存

```text
frontend_prototype = 真实业务链验证面
frontend_react_admin = 新管理后台与老板可点击预览面
backend = 原型后端与业务状态层
```

### 8.2 中期收敛方向

- 不要无限在 `frontend_prototype` 堆功能。
- 先在 `frontend_prototype` 确认业务链。
- 确认后的核心流程逐步迁移到 `frontend_react_admin`。
- 后端需要从 JSON 状态迁移到更正式的数据层。

---

## 9. 维护规则

1. 新功能先标注它落在哪一层：React admin、frontend prototype、backend、ops、docs。
2. 任何 PR 都要说明：是否影响 GitHub Pages、是否影响本地 `/app/`、是否影响 backend。
3. 不允许 Codex 同时跨三层大改，除非 GPT Thinking 明确拆分步骤。
