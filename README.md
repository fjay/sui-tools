# Sui Tools (随手记 Action Package)

[![ActionDock 2.x](https://img.shields.io/badge/ActionDock-2.x-blue.svg)](https://actiondock.dev)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.12.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

基于 [ActionDock 2.x](https://actiondock.dev) 的随手记（www.sui.com）记账自动化 Action Package。

为 AI 智能体、命令行及 MCP 客户端提供随手记账务的自动化操作能力，支持分类与账户初始化、支出/收入/转账记账、流水明细查询与删除、报表概览等完整闭环。

---

## 🌟 核心特性

- **完整的记账全生命周期**：涵盖元数据初始化、单笔记账（支出/收入/转账）、历史明细查验及流水删除。
- **自动会话持久化与恢复**：内置 `CookieJar` 与状态管理，自动维护与续期随手记 Web 端登录态，减少频繁重复登录。
- **内置标准 Agent 规程（Playbook）**：提供 `manage-expenses` 智能体规程，规范 AI 按照“查元数据 -> 执行记账 -> 查验流水”的标准流程作业。
- **多端与 MCP 协议无缝挂载**：支持通过 `ad run` 命令行执行，也可通过 `ad mcp` 快速接入 Claude Desktop、Cursor、Cline 等 AI 宿主。
- **完善的单元测试与沙箱模拟**：包含 100% 关键路径单元测试，支持在沙箱环境中验证 ActionDock 契约。

---

## 📋 运行要求

- **Node.js**：`>= 24.12.0`（需支持原生类型擦除）
- **ActionDock CLI**：全局或本地安装 `ad`（版本 2.x）

---

## 🚀 快速上手

### 1. 安装依赖

```bash
git clone https://github.com/fjay/sui-tools.git
cd sui-tools
npm install
```

将当前包注册挂载到本地 ActionDock 注册表：

```bash
ad link .
```

### 2. 配置随手记账号凭据

本项目需要随手记 Web 端的登录凭据（账号与密码）。通过 ActionDock CLI 设置持久化配置：

```bash
ad config set SUI_USER "your_email_or_phone"
ad config set SUI_PASSWORD "your_password"
```

> **注意**：凭据保存在本地 ActionDock 配置库中，标记为 `secret` 的字段不会泄露给远端或日志。

---

## 🛠️ Action 工具清单

| Action ID | 说明 | 主要入参 |
| :--- | :--- | :--- |
| `init-tally-info` | 初始化收支两级分类、账户列表与成员信息 | `bookId` (可选) |
| `payout` | 随手记支出记账 | `account`, `category`, `price`, `payTime`, `memo`, `member`, `store`, `project` |
| `income` | 随手记收入记账 | `account`, `category`, `price`, `payTime`, `memo`, `member`, `store`, `project` |
| `transfer` | 账户间转账记账 | `outAccount`, `inAccount`, `price`, `payTime`, `memo`, `member` |
| `account-detail` | 查询指定/全部账户在日期范围内的交易流水 | `beginDate`, `endDate`, `accountId`, `memberIds`, `bookId` |
| `delete-transaction` | 删除指定流水记录 | `transId`, `bookId` |
| `get-report-index` | 获取报表首页概览数据 | `bookId` (可选) |

---

## 💻 命令行使用示例

### 1. 初始化并获取分类与账户元数据

```bash
ad run init-tally-info
```

返回数据包含：
- `payoutCategories`：支出一级与二级分类列表（记账时使用 `subCat[].id`）
- `incomeCategories`：收入分类列表
- `accounts`：账户列表与 ID
- `members`：成员列表与 ID

### 2. 支出记账 (`payout`)

```bash
ad run payout --input '{
  "account": "1001",
  "category": "2065791290801",
  "price": 38.5,
  "memo": "午餐便当",
  "payTime": "2026-10-25 12:30"
}'
```

### 3. 收入记账 (`income`)

```bash
ad run income --input '{
  "account": "1001",
  "category": "1000000000001",
  "price": 10000,
  "memo": "10月工资"
}'
```

### 4. 账户间转账 (`transfer`)

```bash
ad run transfer --input '{
  "outAccount": "1001",
  "inAccount": "1002",
  "price": 500,
  "memo": "转账至零钱通"
}'
```

### 5. 查询流水明细 (`account-detail`)

```bash
# 查询 2026 年 10 月全账户流水
ad run account-detail --input '{
  "beginDate": "2026.10.01",
  "endDate": "2026.10.31"
}'

# 查询指定账户流水
ad run account-detail --input '{
  "accountId": "1001",
  "beginDate": "2026.10.01",
  "endDate": "2026.10.31"
}'
```

### 6. 删除单条流水 (`delete-transaction`)

```bash
ad run delete-transaction --input '{
  "transId": "12345678"
}'
```

---

## 📖 Playbook 智能体操作规程

本项目内置了 `manage-expenses` 规程：

```bash
# 查看标准作业规程说明
ad playbook show manage-expenses
```

**智能体作业标准时序**：
1. **元数据发现**：调用 `init-tally-info` 获取最新二级分类与账户映射；
2. **记账执行**：根据语义映射匹配分类与账户，调用 `payout` / `income` / `transfer` 提交；
3. **闭环核账**：记账后调用 `account-detail` 验证交易记录是否成功写入并核对金额。

---

## 🔌 接入 MCP (Model Context Protocol)

如需作为工具服务提供给 Claude Desktop、Cursor、Cline 等 AI 工具使用：

### 启动 MCP Stdio 模式

```bash
ad mcp
```

### 示例配置 (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "sui-tools": {
      "command": "ad",
      "args": ["mcp"],
      "cwd": "/path/to/sui-tools"
    }
  }
}
```

---

## 🧪 测试与校验

运行本地单元测试套件：

```bash
npm test
# 或
ad test
```

校验 Action 清单规范与引用完整性：

```bash
ad validate
ad playbook validate
```

---

## 📁 目录结构

```text
sui-tools/
├── actiondock.json          # ActionDock Package 清单规范（schemaVersion: 2）
├── actions/                 # 各 Action 的业务入口
│   ├── account-detail.ts    # 交易流水明细查询
│   ├── delete-transaction.ts# 流水删除
│   ├── get-report-index.ts  # 报表首页数据
│   ├── income.ts            # 收入记账
│   ├── init-tally-info.ts   # 账户与分类元数据初始化
│   ├── payout.ts            # 支出记账
│   └── transfer.ts          # 账户间转账
├── playbooks/               # Agent 业务规程
│   └── manage-expenses.md   # 记账操作流程规范
├── src/
│   └── sui-client.ts        # 随手记客户端封装（Cookie、登录、会话与抓取）
├── tests/
│   └── sui-tools.test.ts    # 单元测试与 ActionDockApp 集成测试
├── package.json
└── tsconfig.json
```

---

## ⚠️ 免责声明

本工具仅供个人学习、技术研究及自动化记账辅助使用。请妥善保管个人随手记账号凭据，请勿将含有真实账号密码的配置文件上传至公开仓库。
