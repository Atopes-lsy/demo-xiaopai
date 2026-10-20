# Coze 抽取测试数据

> **收口总结（2026-10-19）**：[Coze 测试研究发现总结](../Coze测试研究发现总结.md)。Coze 进阶版 3 万积分已用完，Coze 测试到此结束；后续评测转到本地/后端，不依赖 Coze 额度。

## 当前状态

- 原始文件：`../coze-抽取测试记录.csv`，含学校名、老师名、具体地点，已加入 `.gitignore`，不要提交或上传。
- 有效通知：7 条（id 2–8）。
- id 1 是示例行，已排除；id 9–30 是空行，未填。
- 当前评测集就是这 7 条（与 PRD 9.8 一致）；只能作为初步信号，不能下统计结论。扩样是后续增强，不是当前验证的前置条件。
- 脱敏输出：`v1/labels.csv`；标准答案来源：`v1/expected.csv`。
- `date` 列填的是测试基准日 `2026-10-18`，用来解析“明日”“下周四”等相对时间，不是事件日期。
- v2 为合并版，结果记录在 `v2/labels_result_v2.csv`，汇总在 `v2/metrics_result_v2.md`。
- v2 合并版复测（7 条）：事件级 7/7、时间 7/7、地点 6/7、优先级 6/7、幻觉 0/7，平均延迟 8836 ms；残留 id 4 地点、id 8 无依据 P3。
- v2 prompt 快照：`v2/coze_prompt_v2.md`（保留 v2 规则原文；最新 v3 规则见工作流文档 4.2）。
- v3 已复测：旧单次 7×1 已从 Downloads 恢复为 `v3/labels_result_old_single.csv`；汇总在 `v3/metrics_v3.md`，测试条件与复核提醒见 `v3/README.md`。文档提到的 `v3/labels_result.csv` 当前不在目录。
- v3 初测（7 条 × 1 轮）：质量评分来自原始单次；事件级 7/7、时间值 7/7、地点 7/7、优先级 7/7、幻觉 0/7；旧单次平均延迟 10268 ms、中位 10668 ms、最大 12341 ms。id 4 地点、id 8 优先级已修复；id 4 的周次歧义仍未说明。旧单次 CSV 无 `model` 列；用户确认（2026-10-19）旧链路为 Coze 托管，抽取 pro（temperature `0.0`）+ 意图 lite。
- v3 3 轮延迟（21 次，`doubao_latency.csv`）：平均 26385 ms、中位 27202 ms、p95 45193 ms、最大 45599 ms。
- v3 补充完整输出 A（`v3/labels_result_V3_supplementA.csv`，与 21 次同为**火山方舟直连**口径）：7 条预测与旧单次**逐字一致**；其中 id 2 的 19883 ms（run2）和 id 7 的 13236 ms（run2）实际都有事件，而 `doubao_latency.csv` 对应行记的是 `events_cnt=0`。因此 `events_cnt=0` 不能当空输出判据：2 次已被推翻，其余 4 次待核实。
- 当前 `v3/labels_result_V3.csv` 是 `doubao_runs_full.csv` 的 7 行子集（延迟 49599/41870/...），不是补充 A，也不是旧单次；其预测与旧单次不同。
- v3 补充完整输出 B（`v3/doubao_runs_full.csv`）：**另一组** 7 条 × 3 次完整运行，延迟与 `doubao_latency.csv` 对不上，不能合并，也不能替代原始 4 条未核实的 `events_cnt=0`。逐条评分见 `v3/doubao_runs_full_scored.csv`，汇总见 `v3/metrics_runs_full.md`：15/21 端到端通过、15/17 非空事件级通过；3 次输入未传入、2 次多抽、1 次空返回原因未确认；只有 id 3/4/5/8 达到 3/3。不能写“3 轮质量稳定 7/7”。
- v3 实际配置（2026-10-19 用户确认）：抽取用 `doubao-seed-2-0-pro-260215`，**非推理模型**（thinking disabled）；21 次 temperature `0.1`、max_tokens `2000`、JSON 模式开启（`response_format: json_object`），走火山方舟直连。旧单次同一抽取型号，但走 Coze 托管 `LLMClient`、temperature `0.0`，意图用 `doubao-seed-2-0-lite-260215`。21/21 个延迟已收齐，旧单次值见 `v3/labels_result_old_single.csv`。
- 渠道与口径（2026-10-19 用户确认）：旧单次与 21 次是**同一抽取型号**，不存在“换成 pro”的模型切换；差异是渠道（Coze 托管 vs 火山方舟直连）、temperature（`0.0` vs `0.1`）、链路（旧单次 pro+lite 全工作流 vs 21 次仅抽取）。26.4s/31.8s 是火山方舟直连口径的基线，不能写成“换模型带来的变化”，也不能归因于推理或 temperature 单一变量，也不能与旧单次 10.3s 横比。
- “单次”定义：旧单次 = v3 初测 7 条 × 1 轮 = 7 次调用，不是只跑 1 条消息；v1/v2/v3 都是 7 条样本。A 和当前 `labels_result_V3.csv` 都是 7 行子集，不是独立的 7×1 初测。
- 延迟口径（2026-10-19 用户确认）：21 次主口径**只计抽取节点**（火山方舟直连 SSE、temp 0.1、`time.monotonic()` 包裹一次 `chat/completions`）；旧单次是**整个工作流**（意图 lite → 抽取 pro temp 0.0 → 校验 → 归一化，Coze 托管）。26.4s 与 10.3s 计时对象、渠道、temperature、模型个数都不同，不能横比，26.4s 也不是端到端延迟。
- 最新 v3 规则已同步到 [Coze-小排工作流提示词.md](../../07-MVP定义/Coze-小排工作流提示词.md) 第 4.2 节：强化已知地点层级保留、P3 必须有原文依据，并增加输出前自检。
- 2026-10-19 用户确认，Coze 实际使用 v3；上传的 `# 小排 Coze 工作流提示词.txt` 是误传的 v1 导出，已作废。
- T1 前置修复（2026-10-19）：已产出 [Coze-小排-v3-opt.md](../../07-MVP定义/Coze-小排-v3-opt.md)，包含 `validate_input` 输入校验、多抽约束、周次歧义自检；代码节点本地测试 7/7。E0 已在 Coze 实跑（用户反馈）：三项前置修复通过；id 7 类 deadline 漏抽。
- E0.1 deadline 召回专项（2026-10-19 用户反馈）：**已闭环**。探针确认通用偶发漏抽（P8 1/3、P6 2/3）；Prompt 补丁后 P1–P8 正例均 ≥2/3（P3 2/3，其余 3/3；P1 run1 为 JSON 损坏、raw 含正确事件），负例 0/12 误抽；补丁并入主图配置，id 7/8 均 3/3，`test_run` 通过。探针暴露的 JSON 解析损坏由 `_util` 容错 + `_is_empty_events` 纳入 recheck 修复。7 条主回归 7/7、0 多抽、`error=None`；全流程延迟 median 11040 ms（7×1，非抽取节点）。id 4 的周次歧义仍未写入 `ambiguity`。36 次探针原始数据见 `v3/probe_e01_v3-opt-e01.csv`，完整记录见 `v3/v3.2/E0.1-deadline召回专项.md`。
- E1b-1 max_tokens 实验（2026-10-19）：**已执行，未采用；操纵失败**。火山方舟直连、temp 0.1、仅抽取调用；C 2000 / V1 1200 各 7×3。C 主事项 18/21、V1 20/21；全部运行 median 34947 / 36278 ms，非空 median 36198 / 36418.5 ms，无中位数收益。V1 19/21 次输出 >1200（最大 2909），C 也有 4/21 次 >2000（最大 3085），`finish_reason` 全为 `stop` → 参数没有实际约束生成，不能做 max_tokens 归因。维持 2000，E1b-2 不执行。详见 `v3/v3.3/README.md`。
- v3 复测模板不单独保留：需要时从 `v2/labels_result_v2.csv` 复制一份，清空 `predicted_events` 和评分列即可。

## 文件

| 文件 | 用途 |
|---|---|
| `anonymize.py` | 读取原始 CSV，按 mapping 和正则脱敏，合并 `expected.csv`，生成 `labels.csv` |
| `score.py` | 统计 `_ok` 列，生成 `metrics.md` |
| `run.bat` | Windows 下依次运行脱敏和评分 |
| [`../Coze测试研究发现总结.md`](../Coze测试研究发现总结.md) | 整个 Coze 阶段的收口总结：版本链、失败模式、产品启示和可写/不可写结论 |
| `mapping.example.csv` | 映射模板；复制为 `mapping.csv` 后填真实名称 |
| `v1/expected.csv` | 7 条通知的标准答案和标注备注 |
| `v1/coze_prompt.md` | 按 PRD v0.1 schema 写的抽取 prompt，可直接贴进 Coze Bot |
| `v1/labels.csv` | 当前测试集；`raw_text` 已脱敏，等待填 `predicted_events` |
| `v1/redaction_report.txt` | 每条替换了多少处 |
| `v1/labels_result.csv` | 已填入 7 条 Coze 预测和逐条评分 |
| `v1/metrics_result.md` | `labels_result.csv` 的评分汇总 |
| `v1/结果复核.md` | 7 条结果的逐条复核、严格扣分建议和错误模式 |
| `v2/README.md` | v2 合并版说明 |
| `v2/coze_prompt_v2.md` | v2 规则快照；最新 v3 规则见工作流文档 4.2 |
| `v2/labels_result_v2.csv` | v2 合并版的 7 条预测和评分 |
| `v2/metrics_result_v2.md` | v2 合并版的指标汇总 |
| `v3/README.md` | v3 复测条件、复核提醒和上传提示词核对 |
| `v3/doubao_latency.csv` | 21 次延迟原始记录（7 条 × 3 次），含 `events_cnt`、`ok` |
| `v3/labels_result_old_single.csv` | v3 初测 7×1（旧单次，已从 Downloads 恢复）；无 `model` 列 |
| `v3/labels_result_V3_supplementA.csv` | 火山方舟直连口径的完整输出 A（7 条，取自 21 次延迟的每条 1 个 run）；用于核对 `events_cnt=0`，预测与旧单次逐字一致 |
| `v3/labels_result_V3.csv` | 当前文件是 B 的 7 行子集（延迟 49599/41870/...）；不是补充 A，预测与旧单次不同 |
| `v3/doubao_runs_full.csv` | 另一组 21 次完整运行 B（7 条 × 3 次，含完整预测）；延迟与主口径对不上，不能合并 |
| `v3/doubao_runs_full_scored.csv` | 上述 21 次运行的逐条评分（输入是否存在、状态、字段级 `_ok`、复核备注） |
| `v3/metrics_runs_full.md` | 上述 21 次完整运行的指标、失败分类和下一轮要求 |
| `v3/测试条件记录.md` | 模型/参数实际值、两套 21 次数据的口径和延迟测量方法 |
| `v3/probe_e01_v3-opt-e01.csv` | E0.1 探针 36 次原始数据（P1–P8 正例 + N1–N4 负例 × 3 轮），含延迟和 raw 输出 |
| `v3/labels_result.csv` | 文档曾引用；当前不在 `v3/`（主评分文件仍缺） |
| `v3/metrics_v3.md` | v3 指标汇总（质量单次评分 + 21 次延迟统计） |
| `延迟优化记录.md` | T1–T5 实验记录；E0 前置修复通过；E0.1 已闭环（2026-10-19） |
| `v3/v3.1/validate_input.js` | Coze `validate_input` 代码节点的本地版本（v3.1 前置修复） |
| `v3/v3.1/validate_input.test.js` | 上述代码节点的本地测试（7/7 通过） |
| `v3/v3.2/E0.1-deadline召回专项.md` | deadline 召回诊断、探针、Prompt 补丁和 recover 触发条件；2026-10-19 已闭环 |
| `v3/v3.2/deadline_guard.js` | deadline 线索确定性触发节点（不解析日期） |
| `v3/v3.2/deadline_guard.test.js` | 上述触发节点的本地测试（15/15 通过） |
| `v3/v3.3/README.md` | E1b-1 条件、操纵检查、质量/延迟结果和偏差 |
| `v3/v3.3/e1b1_control_max2000.csv` | E1b-1 控制组 21 行（max_tokens 2000，直连 temp 0.1） |
| `v3/v3.3/e1b1_variant_max1200.csv` | E1b-1 变量组 21 行（max_tokens 1200，直连 temp 0.1） |

> 要搭完整 Coze 工作流（意图判断 + 抽取 + 两个代码节点），见 [Coze-小排工作流提示词.md](../../07-MVP定义/Coze-小排工作流提示词.md)。它和 `v1/coze_prompt.md` 使用同一套字段口径。

## 本轮标注

`expected_events` 使用 PRD v0.1 的英文类型：`event`（固定日程）、`deadline`（硬截止）、`task`（需要投入时间完成的事）。

| id | 标准答案 | 备注 |
|---|---|---|
| 2 | event：宿舍卫生安全检查，2026-10-17 14:00，地点宿舍 | 通知日期 10/17，测试时已过去 |
| 3 | event：重阳节手工工作坊，2026-10-13 14:30–16:00 | 机构名已脱敏；已过去。原文同时出现福利院和园区，模型输出其中一个且有原文依据即可 |
| 4 | event：年级会，2026-10-22 15:20 | “下周四”可能是 10/22 或 10/29；教室待定。模型输出 10/22 或 10/29 并在 `ambiguity` 说明都可接受；静默选一个不说明算 FALSE |
| 5 | event：年级会，2026-10-08 15:20 | 已过去；地点待定 |
| 6 | event：基础进阶课，2026-10-19 17:00–19:10 | 教师姓名已脱敏；课程时间变更 |
| 7 | deadline：常规通道作品提交，截止 2026-10-20 23:59 | “倒计时 3 天”与截止时间不一致，以明确截止时间为准；11/7 是名单公布，不是用户 DDL |
| 8 | deadline：教材订购，截止 2026-08-11 23:59 | 窗口 8/4–8/11；已过期 |

这 7 条原文都没有显式给出优先级、预计时长和依赖关系。`priority_ok`、`estimate_ok`、`dependency_ok` 先留空：

- 期望值优先看“原文没有就不要编”：模型给 null / `[]`，可判正确；
- 如果模型给出建议值（例如把 10/20 截止的提交标成 P1），不是错误，但要在 `notes` 里说明是建议；
- id 7 的 `expected_events` 里写了“建议优先级:P1”，这是按测试日 10/18 距截止约 2 天推的，可以改。

## 怎么跑

### 已经生成好的 v1

`v1/labels.csv` 已经用临时映射生成。下一步只需要：

1. 把 `v1/labels.csv` 的 `raw_text` 逐条发给 Coze Bot 或 LLM；提示词见 `v1/coze_prompt.md`；
2. 把返回的 JSON 填进 `predicted_events`；
3. 对照 `expected_events` 和原文，填 `intent_ok`、`event_level_ok`、`time_ok`、`location_ok`、`type_ok`、`hallucination`、`latency_ms`；
4. 运行：
   ```bash
   python score.py --input "v1/labels.csv"
   ```
5. 看 `v1/metrics.md`，按 PRD v0.1 的通过线判断：事件/时间/地点/类型 ≥ 80%，幻觉 < 5%。

`predicted_events` 里是 JSON，含逗号和双引号。用 Excel 编辑时容易把引号吃掉，建议用文本编辑器填，或保存为 UTF-8 CSV 后再检查一遍。

### 补新通知时

1. 复制 `mapping.example.csv` 为 `mapping.csv`，填入需要替换的真实名称；
2. 把新通知填进原始 CSV 的空行，或新建版本目录（不要把同一轮合并规则拆成多个目录）；
3. 运行 `run.bat`，或手动：
   ```bash
   python anonymize.py --raw "..\coze-抽取测试记录.csv" --expected "v1\expected.csv" --out "v1\labels.csv" --date "2026-10-18" --mapping "mapping.csv"
   python score.py --input "v1\labels.csv"
   ```
4. `labels.csv` 已存在时，脚本默认不覆盖，避免冲掉已填的评分；确认要重做时加 `--force`，或换一个版本目录。

## 评分口径

- `intent_ok`：是否判断为“包含可记录事项”；闲聊应为 FALSE。
- `event_level_ok`：事项拆分和标题是否整体正确；多事项时，漏一个就算 FALSE。当前 7 条都是单事项，可以按通知级评；以后遇到多事项，建议复制成多行，并在 `notes` 里写 `event 1/3`，否则错误类型会被混在一起。
- 显式事实和隐含准备任务分开：原文明确写出的时间、地点、截止、人物是硬标准；像“保持宿舍清洁”“还在打磨作品”这种隐含准备任务，模型可以输出为 `task`，但要在 `evidence` 里引用原文，且不能编造新的硬截止。
- `time_ok`：开始/结束/截止时间是否正确；相对时间按 `date` 解析。
- `location_ok`：地点是否正确；原文没有地点时，模型给 null 才算对，编造算幻觉。
- `type_ok`：`event` / `task` / `deadline` 分类是否正确。
- `hallucination`：1 表示模型编了原文没有的时间、地点、事项或人物；0 表示没有。
- `latency_ms`：从发请求到拿到完整 JSON 的毫秒数。脚本同时输出平均、中位、p95、最大；同一条跑多次时，可把后两次填进 `latency_ms_run2`、`latency_ms_run3`，空值跳过。

## 隐私

- 原始 CSV、`mapping.csv`、`inbox/` 都在 `.gitignore` 里；只把 `v1/labels.csv` 的脱敏文本发给 Coze。
- 不要上传原始 CSV 或带真实校名/老师名的截图。
- 原始 CSV 属过程数据；评测结束后删除，或设定 30 天删除期限，不要长期留存。
- 脱敏是规则替换，不等于绝对匿名；发布或放进作品集前再人工读一遍。
