# Staging 部署记录

更新日期：2026-05-14

## 一、Staging 环境信息

- 地址：https://staging.directlooperp.com/app/
- API：https://staging.directlooperp.com/api/v1
- VM：fw-erp-prod
- IP：34.35.52.250

## 二、Production 环境信息

- 地址：https://directlooperp.com/app/
- API：https://directlooperp.com/api/v1
- VM：fw-erp-production
- IP：34.35.179.34

## 三、部署红线

Staging 部署可以自动化。

Production 部署不允许自动化。

Agent 或 Codex 不允许：

- 自动部署 production
- 修改 production secret
- 删除 production 数据库
- 混用 staging 和 production 配置
- 把 staging 环境变量提交进仓库
- 把 production 环境变量提交进仓库

## 四、Staging 部署检查项

每次 staging 部署后必须检查：

- staging 页面是否能打开
- staging API 是否正常响应
- 当前 commit 是否为最新 main
- 前端是否更新
- 后端是否更新
- 数据库迁移是否执行
- 服务是否重启
- 对应 bug 是否可以复测
- 页面是否仍然连接 staging API，而不是 production API

## 五、部署记录格式

部署编号：  
部署时间：  
部署人 / 执行者：  
来源 PR：  
来源 commit：  
部署分支：  
部署结果：  
前端是否更新：  
后端是否更新：  
数据库是否迁移：  
服务是否重启：  
staging 页面是否可打开：  
API 是否正常：  
验证结果：  
备注：  

---

## 待记录

当前暂无部署记录。
