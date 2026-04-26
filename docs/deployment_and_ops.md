# Retail Ops Deployment And Ops

当前模块：部署｜运维

当前目标：先把 `local field testing` 跑稳，再把 `test` 和后续 `prod` 的最小可行骨架分开。

## 1. 当前环境分层

- `local`
  - 用于当前现场测试。
  - 默认入口：`./start_backend.sh`
  - 默认端口：`127.0.0.1:8000`
  - 默认状态文件：`backend/data/runtime_state.json`
- `test`
  - 用于功能验证和恢复演练。
  - 启动时显式指定：`RETAIL_OPS_ENV_FILE=ops/env/test.env ./start_backend.sh`
  - 默认端口：`127.0.0.1:18000`
  - 默认状态文件：`backend/data/test/runtime_state.json`
- `prod`
  - 这里只先提供环境文件模板、`systemd` 和 `nginx` 模板。
  - 不和 `test` 共用端口、状态文件或备份目录。

## 2. 当前启动方式

### 稳定启动

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
./start_backend.sh
```

说明：

- 默认读取 `ops/env/local.env`
- 默认不带 `--reload`
- 适合被 `launchd` 或 `systemd` 托管
- `/app/` 继续由 FastAPI 挂 `frontend_prototype`

### 开发态启动

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
./start_backend_dev.sh
```

说明：

- 仅在需要自动重载时使用
- 现场测试不要把它当保活方式

### 测试环境启动

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
RETAIL_OPS_ENV_FILE=ops/env/test.env ./start_backend.sh
```

## 3. 本地保活

### macOS launchd

模板文件：

- [com.retail-ops.backend.local.plist](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/launchd/com.retail-ops.backend.local.plist)

加载方式：

```bash
mkdir -p ~/Library/LaunchAgents
cp /Users/ericye/Desktop/AI自动化/retail_ops_system/ops/launchd/com.retail-ops.backend.local.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.retail-ops.backend.local.plist >/dev/null 2>&1 || true
launchctl load ~/Library/LaunchAgents/com.retail-ops.backend.local.plist
launchctl kickstart -k gui/$(id -u)/com.retail-ops.backend.local
```

日志文件：

- `output/backend.local.stdout.log`
- `output/backend.local.stderr.log`

## 4. 健康检查与日志排查

健康检查脚本：

- [ops/healthcheck.sh](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/healthcheck.sh)

执行：

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
./ops/healthcheck.sh
```

它会验证：

- `GET /api/v1/health`
- `/app/` 可访问

如果是 `launchd`：

```bash
tail -n 100 /Users/ericye/Desktop/AI自动化/retail_ops_system/output/backend.local.stderr.log
tail -n 100 /Users/ericye/Desktop/AI自动化/retail_ops_system/output/backend.local.stdout.log
```

## 5. 备份与恢复

备份脚本：

- [ops/backup_state.sh](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/backup_state.sh)

执行：

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
./ops/backup_state.sh
```

默认本地备份目录：

- `backups/runtime/local`

恢复脚本：

- [ops/restore_state.sh](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/restore_state.sh)

恢复前影响：

- 会覆盖当前环境的 `runtime_state.json`
- 因此脚本要求显式传 `--yes-overwrite`
- 如果检测到当前服务还活着，会拒绝恢复，避免运行中的进程把恢复结果重新覆盖
- 恢复前会自动备份一份当前状态到 `pre_restore_*.json`

执行示例：

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
./ops/restore_state.sh backups/runtime/local/runtime_state_20260421_140000.json --yes-overwrite
```

## 6. 打印机、PDA、扫码枪环境依赖

### 标签打印

固定规则：

- 保持 TSPL raw printing
- 不要退回 generic A4/Letter 打印队列
- 当前现场目标打印机：`Deli DL-720C`
- 当前这台机器实际检测到的 CUPS 队列名是 `Deli_DL_720C`
- 后端和运维检查脚本现在兼容 `Deli DL-720C` / `Deli_DL_720C` / `Deli-DL-720C` 这类常见名称差异

环境检查脚本：

- [ops/check_print_env.sh](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/check_print_env.sh)

执行：

```bash
cd /Users/ericye/Desktop/AI自动化/retail_ops_system
./ops/check_print_env.sh
```

它会检查：

- `/usr/bin/lpstat`
- `/usr/bin/lp`
- `/usr/bin/lpoptions`
- 系统中是否存在 `Deli DL-720C` 打印队列

### PDA

当前建议：

- 先用浏览器访问同网段地址上的 `/app/`
- 保持同一台后端稳定运行，不频繁切换端口
- 实机到位后再做 Android 浏览器和扫码交互回归

### 扫码枪

当前最小依赖：

- 优先走 HID keyboard wedge 模式
- 部署层不额外要求专有驱动
- 重点是输入焦点稳定和浏览器/PDA 页面可持续访问

## 7. 后续正式环境最小可行方案

先用单机方案，不上复杂集群：

1. Linux 主机
2. `systemd` 托管后端
3. `nginx` 反向代理
4. 独立 `prod.env`
5. 独立 `prod` 状态文件和备份目录
6. 先保证 `/app/`、`/api/v1/health` 和 TSPL 打印站运行稳定

模板文件：

- [ops/systemd/retail-ops-backend.service](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/systemd/retail-ops-backend.service)
- [ops/nginx/retail-ops-test.conf](/Users/ericye/Desktop/AI自动化/retail_ops_system/ops/nginx/retail-ops-test.conf)
