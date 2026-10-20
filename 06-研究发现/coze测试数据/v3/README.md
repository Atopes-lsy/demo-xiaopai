# v3 复测结果

> **收口总结**：整个 Coze 阶段的结论见 [Coze 测试研究发现总结](../../Coze测试研究发现总结.md)。本页只保留 v3 的测试条件和证据链。

## 迭代目录

按迭代顺序，v3 下的文件分为四段；基线数据仍放在本目录根下，避免移动后破坏 CSV 证据链。

| 阶段 | 目录 | 内容 | 状态 |
|---|---|---|---|
| v3.0 基线 | `v3/` 根目录 | v3 Prompt 的初测、21 次延迟、补充 A/B、指标、测试条件 | 已完成 |
| v3.1 前置修复 | [v3.1/](v3.1/README.md) | `validate_input` 代码节点与测试；E0 记录入口 | E0 三项前置修复通过；E0.1 已闭环 |
| v3.2 deadline 召回 | [v3.2/](v3.2/README.md) | E0.1 诊断/探针/Prompt 补丁、`deadline_guard` 触发节点 | 已闭环（用户反馈）：补丁并入主图，P1–P8 均 ≥2/3（P3 2/3），负例 0/12，主回归 7/7；guard 本地 15/15 |
| v3.3 参数实验 | [v3.3/](v3.3/README.md) | E1b-1 `max_tokens 2000 vs 1200`（火山方舟直连、temp 0.1、7×3×2） | 已执行/未采用：`max_tokens` 未实际生效，操纵失败；维持 2000 |

> v3.1/v3.2 是**迭代阶段目录**，不是新 Prompt 版本号；v3-opt 的 Prompt 源文件仍在 [Coze-小排-v3-opt.md](../../../07-MVP定义/Coze-小排-v3-opt.md)。

## v3.0 基线文件

- `labels_result_old_single.csv`：v3 初测 7 条 × 1 轮（旧“单次”），已从 `Downloads/labels_result (2).csv` 恢复；延迟 12341/10816/8576/9202/10668/10860/9411 ms，均值 10268 ms。**没有 `model` 列**；2026-10-19 用户确认旧链路走 Coze 托管 `LLMClient`：抽取 `doubao-seed-2-0-pro-260215`、temperature `0.0`、thinking disabled，意图 `doubao-seed-2-0-lite-260215`。
- `labels_result_V3_supplementA.csv`：补充完整输出 A，已从 `Downloads/labels_result (5).csv` 恢复；7 条各取自 `doubao_latency.csv` 的一个 run（id 2 run2、id 3 run2、id 4 run3、id 5 run1、id 6 run2、id 7 run2、id 8 run3），延迟 19883/45193/22033/27202/32271/13236/30219 ms；`predicted_events` 与旧单次逐字一致；用于核对 `events_cnt=0`。
- `labels_result_V3.csv`：**当前文件是 `doubao_runs_full.csv` 的 7 行子集**（id 2 run2、id 3 run2、id 4 run1、id 5 run2、id 6 run3、id 7 run1、id 8 run2；延迟 49599/41870/27544/34189/41567/64058/36962 ms），不是补充 A，也不是旧单次；其预测与旧单次不同。
- `doubao_latency.csv`：用户提供的 21 次延迟原始记录（7 条 × 3 次），含 `events_cnt` 和 `ok`。
- `doubao_runs_full.csv`：2026-10-19 新收到的**另一组 21 次完整运行**（7 条 × 3 次，含完整 `predicted_events`）。其延迟与 `doubao_latency.csv` 对不上，不能合并；用于 3 轮质量复核。
- `labels_result.csv`：文档曾引用，但当前不在 `v3/`；主评分文件仍缺，恢复前不要用它跑 `score.py`。
- `doubao_runs_full_scored.csv`：上述 21 次运行的逐条评分（含 `input_present`、`status`、字段级 `_ok` 和复核备注）。
- `metrics_v3.md`：v3 指标汇总（质量单次评分 + 21 次延迟统计），含复核备注。
- `metrics_runs_full.md`：补充 21 次完整运行的指标、失败分类和下一轮要求。
- `测试条件记录.md`：模型/参数实际值、配置说明、两套 21 次数据的口径和填写说明。

> **“单次”定义**：本文的“旧单次/原始单次”指 v3 初测 7 条 × 1 轮 = 7 次调用，**不是只跑 1 条消息**；v1/v2/v3 都是 7 条样本。区别在每条跑几轮：初测 7×1；`doubao_latency.csv` 7×3=21；`doubao_runs_full.csv` 另一组 7×3=21。
>
> **A 和当前 `labels_result_V3.csv` 都是 7 行子集**：A 从 21 次延迟里每条 id 选 1 个 run；当前 `labels_result_V3.csv` 从 B 的 21 次里每条 id 选 1 个 run。两者都不是独立的 7×1 初测，不能用来证明“3 轮稳定”。重复运行稳定性看 B：15/21 端到端、15/17 非空事件级。

## 测试条件

| 项目 | 值 |
|---|---|
| 测试集 | id 2–8，共 7 条脱敏微信通知 |
| 测试基准日 | 2026-10-18 09:00 星期日，Asia/Shanghai |
| Prompt | [Coze-小排工作流提示词.md](../../../07-MVP定义/Coze-小排工作流提示词.md) 第 4.2 节 v3（用户确认实际使用） |
| 模型 | `doubao-seed-2-0-pro-260215`（非推理，thinking disabled） |
| temperature | 21 次 `0.1`；旧单次 `0.0`（Coze 托管） |
| max_tokens | `2000` |
| JSON 模式 | 开启（`response_format: json_object`） |
| 每条运行次数 | `doubao_latency.csv`：21 个延迟；`doubao_runs_full.csv`：另一组 21 次完整运行 |
| 延迟主口径 | `doubao_latency.csv`：仅抽取阶段；火山方舟直连 SSE；`time.monotonic()` 包裹一次 `chat/completions` HTTP 调用 |
| 旧单次延迟口径 | 整个工作流 `main_graph.invoke()`：意图（lite）→抽取（pro，temp 0.0）→校验→归一化；Coze 托管 LLM |
| 补充完整输出 A | `labels_result_V3_supplementA.csv`（火山方舟直连口径，temp 0.1，7 条；与原始单次预测逐字一致；取自 21 次延迟的每条 1 个 run） |
| 补充完整输出 B | `doubao_runs_full.csv`（另一组 21 次；完整预测，但延迟与主口径不同） |
| 延迟统计（21 次主口径） | 平均 26385 ms、中位 27202 ms、p95 45193 ms、最大 45599 ms |
| 延迟统计（完整重跑，另一口径） | 平均 31846 ms、中位 31778 ms、p95 50837 ms、最大 64058 ms |

> **口径不可横比**：21 次主口径是**仅抽取节点的一次火山方舟 HTTP/SSE 调用**；旧单次 10268 ms 是**整个工作流**（两个模型、Coze 托管）。计时对象、渠道、模型个数都不同。`doubao_runs_full.csv` 的 31.8s 是另一组 21 次完整运行，也不与 26.4s 合并统计。
>
> **模型归属与渠道（2026-10-19 用户确认）**：旧单次与 21 次抽取是**同一型号** `doubao-seed-2-0-pro-260215`，且都是**非推理模型**（thinking disabled）。旧单次走 Coze 托管 `LLMClient`：抽取 pro、temperature `0.0`，意图 `doubao-seed-2-0-lite-260215`。21 次、补充 A、当前 `labels_result_V3.csv`（B 的 7 行子集）走火山方舟直连：同一抽取型号、temperature `0.1`、max_tokens `2000`、JSON 模式开启。旧单次 CSV 仍无 `model` 列，配置以用户确认为准。
>
> **不存在“换成 pro”的模型切换**：旧单次已经是 pro-260215。与 21 次的差异是渠道（Coze 托管 vs 火山方舟直连）、temperature（`0.0` vs `0.1`）和链路（旧单次含意图 lite + 校验 + 归一化，21 次仅抽取）。因此 26.4 s / 31.8 s 不能写成“换模型带来的变化”，不能归因于推理或 temperature 单一变量，也不能与旧单次 10.3 s 横比。
>
> **E1b-1（v3.3，2026-10-19）**：在火山方舟直连、temp `0.1`、仅抽取调用口径下比较 `max_tokens 2000`（C）与 `1200`（V1），各 7×3。C 18/21、V1 20/21 主事项命中；全部运行 median 34947 / 36278 ms，非空 median 36198 / 36418.5 ms。C 有 4/21 次输出 >2000、V1 有 19/21 次 >1200，`finish_reason` 全为 `stop`，说明 `max_tokens` 没有实际约束生成，**这是操纵失败，不能做参数归因**；生产维持 2000，E1b-2 不执行。详见 [v3.3/README.md](v3.3/README.md)。

> 3 轮延迟主口径已完成，但 **6/21 次记录为 `events_cnt=0`**（id 2 两次、id 7 三次、id 8 一次），`ok=1` 只表示请求成功。补充完整输出 A `labels_result_V3_supplementA.csv` 显示 id 2 的 run2（19883 ms）和 id 7 的 run2（13236 ms）实际都有事件，说明 `events_cnt=0` 不是可靠的空输出判据；其余 4 次仍待核实。不要再把“非空 15 次”当成功率口径。
>
> **口径已确认（2026-10-19）**：21 次主口径只计抽取节点的火山方舟 HTTP/SSE 调用，不含意图、校验、归一化，temperature `0.1`；旧单次计整个工作流，且有 pro + lite 两个模型，抽取 temperature `0.0`。26.4s 与 10.3s 不可横比，也不能归因于模型、推理、temperature 单一变量或 v3 规则；v2 的 8.8s 也未记录口径，不要把它和 26.4s 混成一个结论。
>
> **补充 21 次完整运行（另一次重跑）**：`doubao_runs_full.csv` 给出 7×3 完整预测；15/21 端到端通过（输入缺失算失败），15/17 非空事件级通过；3 次输入缺失（id 2 run1、id 6 run2、id 7 run3），2 次多抽（id 2 run2、id 7 run1），1 次空返回原因未确认（id 7 run2）。只有 id 3/4/5/8 达到 3/3 事件级通过。**不能写“3 轮质量稳定 7/7”**；详见 `metrics_runs_full.md`。
>
> **补充完整输出 A 的来源**：`labels_result_V3_supplementA.csv` 是火山方舟直连口径的输出（同一抽取型号 pro-260215、temp 0.1）；id 2 run2 / id 7 run2 的 `events_cnt=0` 已被它推翻。当前 `labels_result_V3.csv` 是 B 的 7 行子集，预测与旧单次不同，不能替代 A 来证明这两次。

## 结果

| 指标 | v3 | 说明 |
|---|---:|---|
| 事件级 | 7/7 | id 7 的“名单公布”没有多抽 |
| 时间值 | 7/7 | id 4 的 `3:20→15:20` 正确 |
| 地点 | 7/7 | id 4 修复为“某教学楼大教室” |
| 优先级 | 7/7 | id 8 改为 `null`，不再无依据给 P3 |
| 类型 | 7/7 | 无变化 |
| 估时 | 7/7 | 空过为主，没有真正 task 估时样本 |
| 依赖 | 7/7 | 空过为主，没有显式依赖样本 |
| 幻觉 | 0/7 | 按上传评分 |
| 补充完整输出 A | 7/7 | `labels_result_V3_supplementA.csv`（火山方舟直连、temp 0.1）与旧单次（Coze 托管、temp 0.0）预测逐字一致，构成第二组完整预测（7 条来自不同 run，是 21 次延迟的子集） |
| 补充 21 次完整运行 B | 15/21 端到端；15/17 非空事件级 | 3 次输入缺失、2 次多抽、1 次空返回；只有 id 3/4/5/8 达到 3/3 |
| 平均延迟（21 次主口径） | 26385 ms | 仅抽取节点；火山方舟直连 SSE；不含意图/校验/归一化 |
| 中位延迟（21 次主口径） | 27202 ms | 同上；`events_cnt` 分组不可靠 |
| 最大延迟（21 次主口径） | 45599 ms | — |
| 完整重跑平均 / 中位（另一口径） | 31846 / 31778 ms | `doubao_runs_full.csv`，不与主口径合并 |
| 旧单次平均 / 中位 | 10268 / 10668 ms | v3 初测 7×1；整个工作流；Coze 托管；抽取 pro temp 0.0；不与 26.4s 横比；见 `labels_result_old_single.csv`（无 `model` 列） |

## 仍要说明的问题

1. **id 4 的周次歧义没有消除。** 模型输出 10/22 15:20，但 `ambiguity` 没写“也可能是 10/29”。当前评分表没有 `ambiguity_ok` 列，所以没有扣 `time_ok`；面试时不能把“歧义处理”说成已经完全修复。
2. **id 2 地点从“宿舍”扩写成“学生宿舍”。** 不是编造具体楼栋/房间，未按幻觉计，但说明地点字段仍有轻微扩写。
3. **两组延迟是完全不同的口径。** 旧单次平均/中位 10268/10668 ms 是**整个工作流**（意图 lite + 抽取 pro，Coze 托管）；21 次主口径平均/中位 26385/27202 ms **只是抽取节点的一次火山方舟 HTTP/SSE 调用**。计时对象、渠道、模型个数都不同，不能横比，也不能归因于 v3 规则更长。完整重跑 31846/31778 ms 是另一组 21 次，单独统计。
4. **估时/依赖仍是空过。** 7 条里没有真正的 task 主事项和显式依赖，不能写“估时/依赖准确率 100%”。
5. **id 2 的 `notes` 过长。** 273 个字符，复述了检查规则；不是事件级错误，但会增加输出 token。下一轮可加“`notes` 不超过 80 字，不复述原文”的约束。
6. **`events_cnt=0` 不等于空输出，且空输出至少有两类原因。** 原 21 次中 6 次记录为 0（id 2 的 run2/run3、id 7 的 run1/run2/run3、id 8 的 run2）；补充输出 A 已推翻其中 2 条，剩余 4 条待核实。新的 21 次完整重跑又出现 3 次明确“未提供原文”（id 2 run1、id 6 run2、id 7 run3，属输入未传入）和 1 次“无可记录事项”（id 7 run2，原因未确认）。`ok=1` 只说明请求成功，不能说明抽取成功。
7. **26.4s 只是抽取节点，不等于用户端到端延迟。** 21 次主口径仅计火山方舟一次抽取 HTTP/SSE 调用，不含意图、校验、归一化；旧单次 10.3s 是整个工作流；v2 的 8.8s 也未记录口径。26.4s 不能写成优化结果或产品端到端延迟，但它说明**抽取调用本身已经是主要耗时点**。完整重跑的 31.8s 是另一组数据，不能与 26.4s 合并。
8. **现在有第三组完整预测，但它是另一次重跑，不是原来的 21 次。** `doubao_runs_full.csv` 提供 7×3 完整输出，补上了“同一轮三次完整预测”的缺口；但其延迟与 `doubao_latency.csv` 对不上，不能用来补原来的 4 条 `events_cnt=0`，也不能合并延迟统计。质量结果为 15/21 端到端、15/17 非空事件级，不是 7/7；只有 id 3/4/5/8 达到 3/3。不要写“3 轮质量稳定”。

## 上传的“Coze 优化提示词”核对

2026-10-19 上传的 `# 小排 Coze 工作流提示词.txt` 是 v1 文本；用户已确认 **Coze 实际使用的是项目 4.2 节的 v3**。因此该 txt 属于误传的旧导出，已作废：

- 不作为 v3 的 Prompt；
- 不作为延迟优化基线；
- 不写入测试条件记录。

实际测试条件以项目 4.2 节 v3 为准。延迟优化从 v3 开始，先做 [Coze-延迟优化工单.md](../../../07-MVP定义/Coze-延迟优化工单.md) 的 T0。

## 复现方式

1. 从 `../v2/labels_result_v2.csv` 复制一份，清空 `predicted_events`、评分列和 `latency_ms`；
2. 用工作流文档 4.2 的 v3 Prompt，`current_datetime` 固定为 `2026-10-18 09:00 星期日`；
3. 每条跑 3 次，记录每次延迟、`events_cnt`、输入变量和使用的模型；延迟主口径见 `doubao_latency.csv`。每次都要保存完整预测；当前有三组完整预测：原始单次（`labels_result_old_single.csv`）、补充 A（`labels_result_V3_supplementA.csv`，7 条来自不同 run）、B（`doubao_runs_full.csv`，另一组 7×3 完整运行）。当前 `labels_result_V3.csv` 只是 B 的 7 行子集，不算第四组。只有 B 能按同一轮的 3 次做字段级评分；
4. 运行：
   ```bash
   cd "06-研究发现/coze测试数据"
   python score.py --input "v3/labels_result.csv" --out "v3/metrics_v3.md"
   ```
5. 在 `metrics_v3.md` 里保留“模型/参数”和“复核提醒”，不要把目标值写成结果。

## 下一步

- 在 Coze / 火山方舟脚本里核对抽取节点实际配置与 [测试条件记录.md](测试条件记录.md) 是否一致；重点核对 `raw_text` 输入变量为什么在 3 次运行中为空；
- 核实其余 4 条 `events_cnt=0`（id 2 run3、id 7 run1/run3、id 8 run2）是否真的没有输出；已有 2 条被完整输出 A 推翻，不能再把该列直接当失败；
- 确认 `doubao_runs_full.csv` 是否要替换 `doubao_latency.csv` 成为 21 次延迟主口径；两套延迟不能合并。当前按“`doubao_latency.csv` 主口径、`doubao_runs_full.csv` 质量复核”分开记录；
- 前置修复产物与 E0 状态见 [v3.1/README.md](v3.1/README.md)；Prompt 在 [Coze-小排-v3-opt.md](../../../07-MVP定义/Coze-小排-v3-opt.md)（`validate_input` + 多抽约束 + 周次歧义）。E0 三项前置修复通过；E0.1 deadline 补丁已并入主图并闭环（P1–P8 均 ≥2/3，P3 2/3，负例 0/12，主回归 7/7、0 多抽，`test_run` 通过；全流程延迟 median 11040 ms，7×1，非抽取节点），详见 [v3.2/README.md](v3.2/README.md)。不要再把 7×1 主回归当成 3 轮稳定性；E0 的 21 次抽取节点同口径延迟仍待补；
- E1b-1 已完成但参数未生效：C/V1 均有超过各自 `max_tokens` 的输出且 `finish_reason=stop`，不能归因；维持 2000，E1b-2（800）不执行。若继续查 id 7 偶发漏抽，先做同渠道 temp `0.0` vs `0.1` 的受控实验，不与参数实验混做；详见 [v3.3/README.md](v3.3/README.md)；
- 按延迟优化工单 T1–T5 做单变量实验；26.4s 只代表抽取节点，不要当产品端到端延迟；下一项若要动参数，先验证参数真的绑定请求；
- 扩 5–10 条负样本和 3–5 条真实 task，避免 `intent/estimate/dependency` 继续空过。
