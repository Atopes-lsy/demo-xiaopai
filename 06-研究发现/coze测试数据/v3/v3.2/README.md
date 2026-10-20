# v3.2：E0.1 deadline 召回专项

> 迭代顺序：v3.0 基线（`v3/` 根目录）→ [v3.1](../v3.1/README.md) → **v3.2（本目录）**。
>
> 状态：**已闭环（用户反馈 2026-10-19）**。探针确认 v3-opt 存在通用偶发漏抽（P8 1/3、P6 2/3）；Prompt 补丁后 P1–P8 正例均 ≥2/3（P3 2/3，其余 3/3；P1 run1 为 JSON 损坏、raw 含正确事件），负例 0/12 误抽；补丁已并入主图配置，id 7/id 8 均 3/3，`test_run` 通过。7 条主回归 7/7、0 多抽、`error=None`；全流程延迟 median 11040 ms（7×1，非抽取节点）。id 4 的周次歧义仍未写入 `ambiguity`。原始探针数据见 [probe_e01_v3-opt-e01.csv](../probe_e01_v3-opt-e01.csv)。

## 背景

E0 的三项前置修复通过，但 id 7 类“提交 / 订购截止”文本在 E0 中表现为判空。探针确认这是 v3-opt 的**通用偶发漏抽**（P8 1/3、P6 2/3），不是 id 7 个例；不是基础链路故障。

- “信息日期 / 名单公布不抽”规则在公告型 deadline 文本上被整段过度应用，是主要机制；
- 该规则在 v3 和 v3-opt 中逐字相同，不是 v3-opt 新增；
- 修复方式是第 3 节 Prompt 补丁，已验证后并入主图配置；结果见 [E0.1 文档 5.1](E0.1-deadline召回专项.md#51-闭环结果用户反馈-2026-10-19)。

## 本目录内容

| 文件 | 用途 |
|---|---|
| [E0.1-deadline召回专项.md](E0.1-deadline召回专项.md) | 诊断表、探针集、Prompt 补丁、guard/recover 接法、验收标准 |
| [deadline_guard.js](deadline_guard.js) | 确定性触发节点：动作 + 时间边界 + 日期；不解析日期、不生成事件 |
| [deadline_guard.test.js](deadline_guard.test.js) | 本地测试，15/15 通过（id 7/id 8 正例 + 信息日期负例） |

## 相关文件（不在本目录）

- v3-opt Prompt：[Coze-小排-v3-opt.md](../../../../07-MVP定义/Coze-小排-v3-opt.md)
- E0 实验记录：[延迟优化记录.md](../../延迟优化记录.md#实验-e0t1-前置修复验证)
- 上一阶段：[v3.1/README.md](../v3.1/README.md)

## 本地测试

```bash
cd "06-研究发现/coze测试数据/v3"
node --test v3.2/deadline_guard.test.js
```

## 边界

- 探针与 7 条主回归分开，不改 `raw_text` / `expected_events` / `notes`。
- 不把“加 recover 后 id 7 能出事件”直接写成“deadline 召回已解决”；还要看负例误抽、主回归和延迟。
- 信息日期负例（名单公布、结果公布、获奖公示）不能被抽成 deadline。
- recover 只在“抽取为空 + 截止线索命中”时触发；不要在每次空输出时无条件再调一次 LLM。
- v3.2 已闭环；E1b-1 已完成但 `max_tokens` 未生效，实验无效、未采用（见 [v3.3](../v3.3/README.md)）。36 次探针数据和 7 条主回归 7×1 已归档；E0 的 21 次抽取节点同口径延迟仍待补。
- E1b-1 的直连 temp 0.1 下 id 7 仅 3/6，但 id 4 ambiguity 6/6；温度/渠道假设未受控，不能据此改生产配置。
