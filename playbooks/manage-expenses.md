# 随手记账务管理操作流程

本规程指导智能体在随手记中完成从分类与账户元数据发现、记账执行到流水确认的完整闭环。

## 阶段一：获取基础分类与账户元数据

在首次记账前，调用 `init-tally-info` 获取当前账本可用的分类、账户及成员信息：

```bash
ad run init-tally-info
```

从返回结果中确认：
- 支出与收入二级分类标识（`payoutCategories` 与 `incomeCategories` 中的 `subCat[].id`）
- 账户标识（`accounts[].id`）
- 成员标识（`members[].id`）

## 阶段二：执行记账操作

### 场景一：支出记账
```bash
ad run payout --input '{
  "account": "<账户ID>",
  "category": "<二级分类ID>",
  "price": 25.5,
  "memo": "午餐"
}'
```

### 场景二：收入记账
```bash
ad run income --input '{
  "account": "<账户ID>",
  "category": "<二级分类ID>",
  "price": 10000,
  "memo": "工资收入"
}'
```

### 场景三：账户间转账
```bash
ad run transfer --input '{
  "outAccount": "<转出账户ID>",
  "inAccount": "<转入账户ID>",
  "price": 500,
  "memo": "转账至零钱通"
}'
```

## 阶段三：查验流水明细

记账完成后，通过 `account-detail` 验证流水是否成功写入：

```bash
ad run account-detail --input '{
  "accountId": "<账户ID>",
  "beginDate": "2026.08.01",
  "endDate": "2026.08.31"
}'
```
