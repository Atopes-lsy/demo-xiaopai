# 小排 Coze 工作流提示词

> 配套：[PRD v0.1](../08-PRD/PRD-v0.1.md) · [Coze 与 WorkBuddy 落地步骤](Coze与WorkBuddy落地步骤.md) · [Coze 抽取测试数据 v1](../06-研究发现/coze测试数据/README.md) · [2 人 pilot 记录](../10-用户测试/pilot记录.md)
>
> 目标：只验证「消息/项目 → 结构化任务、日程、DDL」。自动排期、提醒、微信登录都不在这个工作流里。
>
> 口径与 `06-研究发现/coze测试数据/v1/coze_prompt.md` 保持一致：`event` 不排期、`deadline` 是硬截止、只有 `task` 估时；测试基准日按 `labels.csv` 的 `date` 列（当前 v1 为 2026-10-18）。
>
> 只想快速测 7 条：用 `v1/coze_prompt.md` 建单个 Bot；要搭完整工作流（意图分流 + 代码校验）：用本文。
>
> **版本提醒**：本文第 4.2 节已更新到 v3（2026-10-19），包含“08:00 前按下午处理”“信息日期只写 notes”“已知地点层级必须保留”“无依据 priority 必须为 null”等规则。[v2/coze_prompt_v2.md](../06-研究发现/coze测试数据/v2/coze_prompt_v2.md) 保留为 v2 合并版快照，仅用于对比；搭工作流时以本文 4.2 为准。

## 1. 工作流结构

```text
[开始]
  notification_text   原文，必填
  current_datetime    当前日期时间（含星期），必填
  timezone            默认 Asia/Shanghai
  source_type         可选：wechat / qq / project / todo
        ↓
[意图判断 LLM]  temperature 0
        ↓
[解析意图代码节点]
        ↓
[条件]
  has_recordable_event = false → [结束：无需记录]
  has_recordable_event = true  → [抽取 LLM]
        ↓
[抽取 LLM]  temperature 0–0.2
        ↓
[解析与校验代码节点]
        ↓
[结束]
  result_json
  needs_confirmation
  error
```

建议模型：你账号里可用的国内模型，优先选中文指令跟随稳定的（豆包 / 通义 / DeepSeek）。如果 Coze 支持 JSON 模式或结构化输出，打开；没有就靠提示词 + 代码节点兜底。

---

## 2. 开始节点入参

在开始节点加四个变量：

| 变量名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `notification_text` | String | 是 | 用户粘贴的微信/QQ 消息、项目说明或待办原文 |
| `current_datetime` | String | 是 | 例如 `2026-10-18 09:00 星期日`；测试时按 `labels.csv` 的 `date` 填，正式产品由后端传 |
| `timezone` | String | 否 | 默认 `Asia/Shanghai` |
| `source_type` | String | 否 | `wechat` / `qq` / `project` / `todo`，只用于提示词上下文 |

> `current_datetime` 必须带星期，否则模型解析「下周三」很容易错。不要只在 prompt 里写死日期；当前 v1 测试基准日是 2026-10-18，测试时用这一天。

---

## 3. 意图判断节点

### 3.1 节点设置

- 模型：轻量模型即可；
- temperature：`0`；
- 输出变量名：`intent_raw`；
- 然后接一个代码节点 `parse_intent`，把 JSON 字符串解析成布尔值，条件节点才能用。

### 3.2 意图判断 Prompt（复制）

```text
你是「小排」的输入分流器。判断用户输入是否包含至少一个需要记录、安排或提醒的事项。

你只做判断，不做抽取，不回答问题。

【输入原文】
{{notification_text}}

【判定为 true】
- 明确的待办、任务、作业、项目交付物；
- 有开始时间的会议、课程、考试、面试、活动；
- 有截止日期的提交、报名、缴费、申请；
- 出现“记得 / 需要 / 务必 / 前完成 / 开会 / 交 / 提交 / 截止 / 报名”等行动信号；
- 一段项目说明，包含可执行交付物或里程碑。

【判定为 false】
- 纯闲聊、感谢、问候、表情、接龙“收到”；
- 询问产品怎么用、让 AI 解释概念；
- 广告、转发文章、新闻，且没有要求用户做什么；
- 只有背景介绍，没有任何可执行事项。

【规则】
1. 不确定时倾向 true，避免漏记，交给抽取节点和用户确认兜底。
2. 不要因为出现“项目 / 会议 / 报告”等词就判 true，要看有没有需要用户处理的事项。
3. 只输出严格 JSON，不要 Markdown 代码块，不要解释。
4. confidence 表示你对判断的把握，不是事项的紧急程度。

输出格式：
{
  "has_recordable_event": true,
  "confidence": 0.0,
  "reason": "一句话理由，引用原文关键词"
}
```

### 3.3 意图判断示例

| 输入 | 结果 | reason 示例 |
|---|---|---|
| 收到，谢谢老师！ | false | 纯感谢，没有需要处理的事项 |
| 下周三前提交课程报告 | true | 有明确截止时间和提交动作 |
| 这个产品怎么用？ | false | 询问用法，不是安排 |
| 项目说明：10 月 30 日前完成迎新策划 | true | 有项目交付物和截止日期 |
| 哈哈哈哈 | false | 闲聊 |

### 3.4 解析意图的代码节点

节点名：`parse_intent`  
输入变量：`raw`（引用意图判断 LLM 的输出 `intent_raw`）。

```js
async function main({ params }) {
  const raw = params.raw;

  function parseJson(text) {
    let s = String(text ?? '').trim();
    s = s.replace(/^[`]{3}(?:json)?\s*/i, '').replace(/\s*[`]{3}$/i, '').trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    return JSON.parse(s);
  }

  try {
    const data = parseJson(raw);
    return {
      has_recordable_event: data.has_recordable_event === true,
      confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
      reason: String(data.reason || ''),
      ok: true
    };
  } catch (e) {
    // 解析失败时不要直接丢弃，交给抽取节点和用户确认兜底
    return {
      has_recordable_event: true,
      confidence: 0.3,
      reason: '意图判断解析失败，进入抽取兜底',
      ok: false
    };
  }
}
```

条件节点：

```text
parse_intent.has_recordable_event == true  → 进入抽取
parse_intent.has_recordable_event == false → 结束
```

结束节点（false 分支）文案：

```text
这条消息里没有需要记录的安排。你可以直接粘贴群通知、项目说明或待办，例如：“下周三前交报告，预计 2 小时”。
```

---

## 4. 抽取节点

### 4.1 节点设置

- 模型：当前实测使用 `doubao-seed-2-0-pro-260215`（完整型号，**非推理模型**，thinking disabled）；旧单次与 21 次为同一抽取型号，差异在渠道和 temperature；换型号必须另做单变量对比，不能只写“默认模型”；
- temperature：21 次 `0.1`；旧单次 Coze 托管 `0.0`（用户确认，2026-10-19）；
- 最大输出 token：`2000`（当前 v3 实测，避免长 `notes` 或多事件截断）；E1b-1 发现当前直连链路没有实际执行该上限（V1 19/21 次 >1200，C 4/21 次 >2000），先修参数绑定，不要再直接试 `800–1200`；
- JSON 模式：开启（`response_format: json_object`，当前实测）；`normalize_extraction` 仍要兜底；
- 测试运行：同一 Prompt 每条跑 3 次，延迟记录中位数和 p95。v3 主口径的 21/21 个延迟**只计抽取节点**（火山方舟直连 SSE，一次 `chat/completions` 调用），平均 26385 ms、中位 27202 ms、p95 45193 ms；旧单次 10268 ms / 10668 ms 是**整个工作流**（意图 lite + 抽取 pro，Coze 托管），两者不可横比。另有一组 `doubao_runs_full.csv` 21 次完整重跑：15/21 端到端、15/17 非空事件级，3 次输入未传入、2 次多抽、1 次空返回；其延迟不与主口径合并；
- 输出变量名：`extraction_raw`；
- 输入变量：
  - `notification_text`：原文；
  - `current_datetime`：含星期的当前时间；
  - `timezone`：默认 `Asia/Shanghai`；
  - `source_type`：可选。

#### 4.1.1 Prompt 版本记录

| 日期 | 版本 | 更新内容 |
|---|---|---|
| 2026-10-18 | v1 | 初版工作流抽取 Prompt：类型、时间、地点、优先级、估时、依赖、隐含任务、脱敏 |
| 2026-10-19 | v2（合并版） | 按 7 条 Coze 结果修订：地点保留已知最细层级；`3:20` 在白天场景按 `15:20`；`下周四` 标注 10/22 与 10/29 歧义；隐含任务不写硬截止；信息日期不抽成事件；无依据优先级为 `null`；未写上午/下午且解析结果早于 `08:00` 的钟点统一按下午处理（`3:20→15:20`，`7:30→19:30`）；名单公布/结果公布等信息日期 `event` 和 `deadline` 都不抽，只写 `notes` |
| 2026-10-19 | v3 | 根据 v2 合并版复测残留问题：id 4 已知“某教学楼大教室”仍被置空；id 8 无依据给 P3。强化“已知地点层级必须保留、missing_fields 不强制 location 为 null、不确定的具体房间不编造”；优先级改为“显式词 → 未来截止时间 → null”的判断顺序，P3 必须由原文触发，过期不能推导优先级；增加输出前自检 |
| 2026-10-19 | v3 复测 | 初测 7×1：事件级 7/7、时间值 7/7、地点 7/7、优先级 7/7、幻觉 0/7；id 4 地点、id 8 优先级修复；id 4 周次歧义仍未说明。初测平均 10268 ms、中位 10668 ms、最大 12341 ms（整个工作流，用户确认意图 lite + 抽取 pro，Coze 托管，抽取 temp 0.0；旧 CSV 无 `model` 列）。另一组 21 次完整重跑：15/21 端到端、15/17 非空事件级；3 次输入未传入、2 次多抽、1 次空返回；只有 id 3/4/5/8 达到 3/3 |
| 2026-10-19 | v3-opt（前置修复，未覆盖 v3） | 新增 `validate_input` 输入校验代码节点与变量绑定步骤；隐含/建议 task 最多 1 条，`priority`/`deadline` 默认 null；`下周四` 等周次歧义必须同时写两个候选日期。文件：[Coze-小排-v3-opt.md](Coze-小排-v3-opt.md)。状态：E0 三项前置修复通过；E0.1 deadline 补丁已并入主图并闭环（P1–P8 均 ≥2/3，P3 2/3；负例 0/12；id 7/8 均 3/3；主回归 7/7、0 多抽；`test_run` 通过） |

> **版本口径**：v2 为合并版，已把上一轮的全部规则合并进同一版；数据上只能比较 v1 → v2 合并版，不要拆分归因。下一版为 v3（当前 4.2 节）。
>
> **v2 合并版复测结果（7 条）**：事件级 7/7、时间 7/7、地点 6/7、优先级 6/7、幻觉 0/7，平均延迟 8836 ms。残留问题：id 4 已知“某教学楼大教室”仍被置空；id 8 无依据给 P3。v3 针对这两点强化。
>
> **v3 复测结果（7 条，2026-10-19 收到）**：质量评分来自 v3 初测 7×1（完整工作流）；事件级 7/7、时间值 7/7、地点 7/7、优先级 7/7、幻觉 0/7；初测延迟平均 10268 ms、中位 10668 ms、最大 12341 ms。id 4 地点、id 8 优先级已修复；id 4 的 `ambiguity` 仍未写 10/22 与 10/29 的歧义，当前评分表没有 `ambiguity_ok` 列，面试时不要写成“歧义已完全修复”。“单次”指 7 条各跑 1 轮，不是只跑 1 条消息。
>
> **v3 运行配置与口径（2026-10-19 用户确认）**：抽取 `doubao-seed-2-0-pro-260215`，**非推理模型**（thinking disabled）；21 次走火山方舟直连，temperature `0.1`，max_tokens `2000`，JSON 模式开启（`response_format: json_object`）。旧单次走 Coze 托管 `LLMClient`，同一抽取型号，temperature `0.0`，意图 `doubao-seed-2-0-lite-260215`；两者不是“换模型”，而是渠道、temperature 和链路不同。21 次主口径延迟（`doubao_latency.csv`）**只计抽取节点**：火山方舟直连 SSE，`time.monotonic()` 包裹一次 `chat/completions`，平均 26385 ms、中位 27202 ms、p95 45193 ms；初测是**整个工作流**，两者不可横比，26.4s 不是端到端延迟，也不能把差值归因于模型、推理或 temperature 单一变量。初测 CSV `labels_result_old_single.csv` 无 `model` 列，配置以用户确认为准。
>
> **另一组 21 次完整重跑（`doubao_runs_full.csv`）**：7×3 完整预测，延迟与主口径对不上，不能合并。结果 15/21 端到端、15/17 非空事件级；3 次输入未传入（id 2 run1、id 6 run2、id 7 run3）、2 次多抽（id 2 run2、id 7 run1）、1 次空返回原因未确认（id 7 run2）；只有 id 3/4/5/8 达到 3/3。**不能写“3 轮质量稳定 7/7”**；详见 [v3/metrics_runs_full.md](../06-研究发现/coze测试数据/v3/metrics_runs_full.md)。输入未传入属于工作流输入校验问题，不是模型漏抽；多抽与周次歧义的修复建议已写入 [Coze-延迟优化工单.md](Coze-延迟优化工单.md) 的 T1 前置修复，未改动本文 v3 Prompt。
>
> **提示词核对**：2026-10-19 用户确认，Coze 实际使用的是本文 4.2 节的 v3；当天上传的 `# 小排 Coze 工作流提示词.txt` 是误传的 v1 导出，已作废，不作为测试条件或延迟优化基线。
>
> **v3-opt 与 E0.1（2026-10-19）**：T1 前置修复版见 [Coze-小排-v3-opt.md](Coze-小排-v3-opt.md)；本文件 4.2 节仍保留 v3 原文，未被覆盖。E0 三项前置修复通过（用户反馈：输入全量穿透、多抽收敛、id 4 歧义写出）；E0.1 deadline 补丁经探针验证后已并入主图配置：P1–P8 正例均 ≥2/3（P3 2/3，其余 3/3），id 7/8 均 3/3，负例 0/12 误抽，7 条主回归 7/7、0 多抽、`error=None`，`test_run` 通过。探针暴露的 JSON 解析损坏由 `_util` 容错 + `_is_empty_events` 纳入 recheck 修复。36 次探针原始数据已归档（含 P1 run1 JSON 损坏、P3 run1 空返回）；7 条主回归为 7×1 全流程，延迟 median 11040 ms（非抽取节点），不是 3 轮稳定性证据。id 4 的周次歧义仍未写入 `ambiguity`。完整记录见 [E0.1-deadline召回专项.md](../06-研究发现/coze测试数据/v3/v3.2/E0.1-deadline召回专项.md)。
>
> **E1b-1（2026-10-19）**：`max_tokens 2000 vs 1200` 两组各 7×3（火山方舟直连、temp 0.1）。V1 19/21 次输出 >1200、C 4/21 次 >2000，`finish_reason` 全为 `stop`，参数未实际约束生成，实验不能归因；未采用 1200，生产维持 2000。详见 [v3.3/README.md](../06-研究发现/coze测试数据/v3/v3.3/README.md)。

### 4.2 抽取 Prompt（复制）

```text
Prompt 版本：v3（2026-10-19）

你是「小排」的信息抽取器。用户会粘贴一条微信群通知、项目说明或待办原文。你的任务是把其中需要记录的事项拆成结构化数据，供日历和排期使用。

你只做信息抽取：不回答问题，不总结，不建议，不补全原文没有的信息。

【当前上下文】
当前日期时间（含星期）：{{current_datetime}}
时区：{{timezone}}
输入来源：{{source_type}}

【输入原文】
{{notification_text}}

【输出格式】
只输出一个严格 JSON 对象。不要 Markdown 代码块，不要前后解释，不要注释，不要输出 JSON 以外的任何字。

{
  "events": [
    {
      "title": "string 或 null",
      "type": "task 或 event 或 deadline 或 unknown",
      "start_time": "YYYY-MM-DD HH:mm 或 null",
      "end_time": "YYYY-MM-DD HH:mm 或 null",
      "deadline": "YYYY-MM-DD HH:mm 或 null",
      "location": "string 或 null",
      "priority": "P0 或 P1 或 P2 或 P3 或 null",
      "estimate_min": null,
      "dependencies": ["其他事项的 title"],
      "confidence": 0.0,
      "missing_fields": ["title", "type", "start_time", "end_time", "deadline", "location", "priority", "estimate_min", "dependencies"],
      "evidence": "原文短句",
      "ambiguity": "string 或 null"
    }
  ],
  "needs_confirmation": true,
  "notes": "string 或 null"
}

【一、拆分规则】
1. 一条输入可能包含多个事项，必须拆成多个 events。
2. 不要把同一件事拆成重复的两条；一个交付物只保留一条。
3. 不要把“记得带材料”“提前到场”这类活动附属提醒单独拆成任务，除非它本身需要提前投入时间完成。
4. 多个项目混在一起时，按项目分别拆；不要合并成一条。
5. 如果同一句话里既有固定活动又有独立的提交截止，拆成 event + deadline（或 event + task，按下面类型规则判断）。

【二、类型定义】
- event：有明确开始时间、需要到场参加的固定日程。例：开会、上课、讲座、考试、面试、答辩、活动、宿舍检查。event 必须有 start_time；priority 一律 null；不需要估时。
- deadline：有硬截止时间、必须在此之前完成的提交/报名/缴费/申请等事项。例：提交作品、报名、缴费、申请截止、订购教材。deadline 必须有 deadline；priority 可以给建议。
- task：需要投入一段时间完成、但没有固定开始时间的任务。例：写报告、做海报、改代码、采购物资、借教室、准备材料。task 可以有 deadline；只有 task 需要估时。
- unknown：信息不足，无法判断类型。尽量少用，不要硬猜。

注意：
- “下周三前提交课程报告”是 deadline；如果原文强调“写报告、预计要 3 小时”，优先用 task（可带 deadline），因为需要投入时间。
- “报名截止本周五”是 deadline；“写报名表”是 task。
- event 的 deadline 一般为 null；如果同一个活动还要求提前交材料，另拆一条 deadline 或 task。
- event 不需要排期，priority 填 null；不要给 event 编造优先级。

【三、时间解析规则】
1. 以【当前上下文】的当前日期时间为基准；当前测试基准日是 2026-10-18（星期日），测试时请把 {{current_datetime}} 设为这一天。“今天”就是当前日期，“明天”顺推一天。
2. “本周三”= 当前周周三；“下周三”= 下一周周三（按周一开始）。在本次测试基准日 2026-10-18（周日）上，“下周四”= 2026-10-22；如果原文存在 10/22 与 10/29 两种可能，必须在 ambiguity 说明，不能静默选一个。正式版按当天日期动态计算，不要把 10/22 写死。
3. “周三”没写本周/下周时，按最近的未来日期解析；如果无法确定是今天还是下周，写进 ambiguity。
4. “明天 / 后天 / 大后天”按当前日期顺推；“今晚 / 明晚”只能确定日期，不能确定具体时间，时间部分用 null 并写进 missing_fields。
5. “下午 3 点”= 15:00；“晚上 7 点”= 19:00；“中午 12 点”= 12:00；“上午”没有具体钟点时用 null，并写进 ambiguity。
6. 原文写“3:20 / 3 点 20 / 7:30”等具体钟点，但没有写上午/下午时：
   - 先按 24 小时制解析；只要解析结果早于 08:00，就一律加 12 小时按下午处理；
   - 例：3:20 → 15:20，7:30 → 19:30，00:30 → 12:30；
   - 并在 ambiguity 写“原文未写上午/下午，按下午处理”；
   - 原文明确写“凌晨 / 早上 / 上午”的，保留原文，不套用本条。
7. “月底”= 当月最后一天；“下个月 5 号”= 下个月 5 日；“年底”= 12 月 31 日。
8. 所有时间统一输出 "YYYY-MM-DD HH:mm"。原文只有日期、没有具体时间时，不要默认成 00:00。
   - 如果语义是“在某天结束前完成”（如截止、提交），可以输出该日 23:59，并在 ambiguity 写“原文未给具体时间”；
   - 否则把对应字段设为 null，并把 start_time 或 deadline 写进 missing_fields。
9. “截止到 10 月 20 日 24:00”按 2026-10-20 23:59 处理，并在 ambiguity 注明“原文为 24:00，按当天 23:59 处理”。
10. 原文写“尽快 / 有空 / 找时间 / 下班前”但没有具体时间时，时间字段用 null，并在 ambiguity 说明。
11. 原文没写年份时，按当前年份；如果算出的日期早于当前日期，不要自动改到下一年，保留并在 ambiguity 或 notes 里标注“已过期”。
12. 原文出现互相矛盾的相对时间时（例如“倒计时 3 天”与明确截止日期不一致），以明确日期为准，并在 ambiguity 里说明。
13. 不要把当前时间直接当成事项时间；不要因为“今天”就默认当前钟点。

【四、字段规则】
1. title：简短的动作或名称，尽量不超过 20 个汉字；不要包含时间、地点；不要编造。无法确定时用 null，type 设为 unknown，confidence 低于 0.5。
2. location：只填原文明确写出的地点；线上会议可以填“线上”或原文的“腾讯会议”。
   - 硬规则：只要原文出现可识别的地点名词（机构名、楼名、园区名、宿舍、大教室、房间号等），location 就必须填已知的最细层级；“具体教室待通知 / 地点另行通知”只表示更细层级未定，不表示 location 为空；
   - missing_fields 里的 “location” 表示“还需要补充更细层级”，不表示 location 必须为 null；按原文层级保留，不升格也不降格（原文写“某教学楼大教室”就填“某教学楼大教室”，只写“某教学楼”就填“某教学楼”）；
   - location = null 只在原文完全没有地点名词时使用；不要因为“信息不完整”就填 null；
   - 例（必须这样处理）：原文“下周四 3:20 在某教学楼大教室（下周通知具体教室）召开年级会” → location = “某教学楼大教室”，missing_fields 加 “location”，ambiguity 写“具体教室待通知”；不能填 null；
   - 例：“宿舍卫生安全检查” → location = “宿舍”；
   - 如果原文完全没有地点名词，location = null，missing_fields 加 “location”；
   - 不确定的具体房间、校区、楼栋不要写进 location，禁止根据学校常识补全；只保留原文已经写出的层级；
   - 多个地点候选时，填最可能的举办/活动地点，把另一个候选写进 ambiguity。
3. priority：
   - event 一律填 null，不参与优先级判断；
   - deadline/task 按以下顺序判断，命中即停：
     1) 原文有明确优先级词：P0“紧急 / 马上 / 今天必须 / 不可延期”；P1“重要 / 必须”；P2“普通 / 一般”；P3“不急 / 有空再说 / 可选 / 不强制”；
     2) 没有明确优先级词时，只有“未来截止时间”可以作为日期优先级依据：截止在 24 小时内且不可延期 → P0；截止在 7 天内（考试、面试、提交材料等）→ P1；截止在 30 天内且没有更强信号 → P2；
     3) 以上都没有 → null。
   - priority = null 是正常输出，不是“没判断”；没有依据时必须用 null；
   - P3 不是默认值，也不是“低优先级收件箱”：不能因为事项已过期、时间很远、类型普通、看起来不重要就填 P3；
   - 截止日期已过时，不能用日期距离推导任何优先级；没有明确优先级词就填 null；
   - priority 非 null 时，evidence 必须能支持这个判断：显式词优先级要能在 evidence 里找到触发词；日期优先级要能在 evidence 里找到未来的截止时间；找不到依据就改回 null；
   - 例：原文“8月4日至8月11日内完成预订”，没有“不急/可选”等词，且截止已过，priority = null，不能给 P3。
4. estimate_min：只给 task 估时，单位分钟；event 和 deadline 填 null。
   - “半小时”=30，“2 小时”=120，“90 分钟”=90；
   - “半天 / 一天”如果是明确的工作量，按 4 / 8 小时换算，并在 ambiguity 注明换算假设；
   - 不确定是工作量还是日历工期时填 null，不要猜；
   - 原文没给 task 时长时填 null，并把 estimate_min 写进 missing_fields。
5. dependencies：只在原文明确表达先后关系时填写，数组里放同一批 events 中其他事项的 title。
   - “先出方案，再审批” → 审批的 dependencies 包含“出方案”；
   - “完成后”“接着”“然后”可以视为显式依赖；
   - 不要根据日期先后或常识推断依赖；
   - 依赖目标没有被抽取时，不要编造，写进 ambiguity；
   - 没有明确依赖就用 []。
6. confidence：0 到 1。
   - 0.8–1.0：标题、时间/截止、地点等关键信息都明确；
   - 0.6–0.8：有缺失或歧义，需要确认；
   - 低于 0.6：信息不足，无法可靠记录。
7. missing_fields：填“关键字段缺失”或“原文提到但没解析出来”的字段名。
   - event：title、start_time；原文说“地点另行通知”时加 location；
   - deadline：title、deadline；
   - task：title、estimate_min；原文暗示有截止但没解析出来时加 deadline；
   - unknown：title、type；
   - 原文写“地点待定 / 另行通知”时填 location；
   - priority 不是必填，不要仅因为没写就填进 missing_fields。
8. evidence：必须是原文中的连续片段，用来核对时间、地点、截止日期；不能改写，不要引用输入外的内容；尽量不超过 60 个字。
9. ambiguity：写具体问题，不要写“有点不确定”。例：“只有日期没有具体时间”“下周四存在 10/22 与 10/29 两种可能”“地点另行通知”“倒计时与明确截止日期不一致”。没有歧义用 null。
10. needs_confirmation：只要有一个事项 confidence 低于 0.8、missing_fields 非空、ambiguity 非空，或存在多种解释，就必须为 true；全部清楚且高置信度才为 false。
11. notes：写整体问题，例如“原文包含多个项目，未提供截止时间”；没有就 null。

【五、不要抽取的内容】
1. 问候、感谢、表情、接龙“收到”、纯闲聊；
2. 广告、转发文章、新闻、链接、二维码，除非原文明确要求用户做什么；
3. 纯背景介绍、愿景、观点、团队介绍，没有可执行事项；
4. 手机号、身份证号、住址等个人敏感信息；
5. 纯提问，除非问题本身要求用户去完成一件事。

【六、显式事实、隐含任务与脱敏】
1. 时间、地点、截止日期、人物必须是原文显式写出的。
2. 原文中的背景规则（例如“保持宿舍清洁”“不要使用违规电器”）可以建议为 task，但 evidence 必须引用原文，并在 ambiguity 或 notes 里说明这是建议任务；不要给它编造新的硬截止。
3. 公告里的“名单公布”“结果公布”“活动开始”“晋级名单公布”等信息日期，既不是用户要参加的 event，也不是用户要完成的 deadline；不要放进 events，只写进 notes。即使它有明确日期，也不抽。
4. 原文中的“某大学”“某老师A”“某园区”“某教学楼”等是脱敏占位符，原样保留，不要猜测或还原真实名称。
5. 不要输出原文没有的人物、组织、地点、时间或事项；宁可 null + missing_fields，也不要补全。

【七、项目说明的特殊处理】
1. 项目说明里只抽具体的交付物、里程碑和行动项；忽略背景、愿景、团队介绍。
2. 有明确日期的阶段，按“提交/报名/缴费”用 deadline，按“写/做/准备”用 task + deadline；没有日期的阶段 deadline 用 null，并在 notes 说明“项目未提供阶段截止时间”。
3. 原文明确“先……再……最后……”时，用 dependencies 表达顺序。
4. 不要替项目编造开始时间、截止时间、负责人或工期。
5. 项目整体截止日期只加在对应的最终交付物上，不要给每个阶段都重复加同一个截止日期。

【八、输出前自检】
1. 地点自检：
   - 原文只要出现地点名词（教学楼、大教室、宿舍、园区、福利院、线上等），location 不能是 null；
   - “具体教室/地点另行通知”只把 location 加进 missing_fields，不能把已知层级删掉；
   - 如果 missing_fields 含 location，但原文已有地点名词，location 仍必须填已知层级；
   - 原文没有地点名词时才填 null；不确定的具体房间不要编造。
2. 优先级自检：
   - event 的 priority 必须是 null；
   - 日期优先级只能用于未来截止时间；已过期事项没有显式优先级词时一律 null；
   - P3 只能由“不急/有空再说/可选/不强制”触发；过期、时间远、普通都不能给 P3；
   - 如果 priority 是 P3，但 evidence 里没有上述触发词，直接改为 null；
   - 找不到依据就一律 null。
3. 信息日期自检：
   - “名单公布 / 结果公布 / 活动开始 / 晋级名单公布”等信息日期不放进 events，只写 notes；
   - 不要给这类日期编 event 或 deadline。
4. 时间自检：
   - 未写上午/下午且解析结果早于 08:00 的钟点，按下午 +12 小时处理；
   - 明确写“凌晨/早上/上午”的，按原文保留。

【九、输出纪律】
1. 输出必须是合法 JSON；不要用 Markdown 代码块包裹。
2. 不要输出解释、思考过程、前后缀。
3. 没有可记录事项时，输出 {"events": [], "needs_confirmation": false, "notes": "无可记录事项"}。
4. 所有字段都必须出现；没有值用 null，数组用 []。
```

### 4.3 可选 Few-shot（模型不稳定时追加）

> 只追加在抽取 Prompt 末尾。示例用于校准格式和粒度，不要让模型照抄内容。

```text
【示例 1】
当前时间：2026-10-18 09:00 星期日
输入：下周三前提交课程报告初稿；周四晚上7点社团例会在教学楼A301。
输出：
{
  "events": [
    {
      "title": "提交课程报告初稿",
      "type": "deadline",
      "start_time": null,
      "end_time": null,
      "deadline": "2026-10-28 23:59",
      "location": null,
      "priority": null,
      "estimate_min": null,
      "dependencies": [],
      "confidence": 0.9,
      "missing_fields": [],
      "evidence": "下周三前提交课程报告初稿",
      "ambiguity": "原文只给日期，按当天23:59处理"
    },
    {
      "title": "社团例会",
      "type": "event",
      "start_time": "2026-10-22 19:00",
      "end_time": null,
      "deadline": null,
      "location": "教学楼A301",
      "priority": null,
      "estimate_min": null,
      "dependencies": [],
      "confidence": 0.95,
      "missing_fields": [],
      "evidence": "周四晚上7点社团例会在教学楼A301",
      "ambiguity": null
    }
  ],
  "needs_confirmation": true,
  "notes": "第一个事项原文只给日期，已按当天结束处理"
}

【示例 2】
当前时间：2026-10-18 09:00 星期日
输入：老师：下周三开会，具体时间待定，地点另行通知。
输出：
{
  "events": [
    {
      "title": "开会",
      "type": "event",
      "start_time": null,
      "end_time": null,
      "deadline": null,
      "location": null,
      "priority": null,
      "estimate_min": null,
      "dependencies": [],
      "confidence": 0.6,
      "missing_fields": ["start_time", "location"],
      "evidence": "下周三开会，具体时间待定，地点另行通知",
      "ambiguity": "具体时间和地点待定；下周三按 2026-10-28 解析"
    }
  ],
  "needs_confirmation": true,
  "notes": "具体时间和地点需用户确认"
}
```

---

## 5. 抽取结果解析与校验代码节点

节点名：`normalize_extraction`  
输入变量：`raw`（引用抽取 LLM 的输出 `extraction_raw`）。

它做五件事：

1. 去掉 Markdown 代码块，提取 JSON；
2. JSON 解析失败时返回可读错误，不让工作流崩；
3. 补齐字段、校验类型、时间格式、优先级、估时；
4. 校验依赖是否指向本次抽取中的事项；
5. 重新计算 `needs_confirmation`。

```js
async function main({ params }) {
  const rawInput = params.raw;
  const allowedTypes = ['task', 'event', 'deadline', 'unknown'];
  const allowedPriorities = ['P0', 'P1', 'P2', 'P3'];
  const allowedMissing = new Set([
    'title', 'type', 'start_time', 'end_time', 'deadline',
    'location', 'priority', 'estimate_min', 'dependencies'
  ]);

  function parseRaw(raw) {
    if (raw && typeof raw === 'object') return raw;
    let text = String(raw ?? '').trim();
    text = text.replace(/^[`]{3}(?:json)?\s*/i, '').replace(/\s*[`]{3}$/i, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    return JSON.parse(text);
  }

  function asStringOrNull(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function isValidDateTime(value) {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value !== 'string') return false;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    if (hour > 23 || minute > 59) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  try {
    const parsed = parseRaw(rawInput);
    const rawEvents = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed.events) ? parsed.events : []);

    const events = rawEvents.map((input) => {
      const event = input && typeof input === 'object' ? input : {};
      const type = allowedTypes.includes(event.type) ? event.type : 'unknown';

      let priority = allowedPriorities.includes(event.priority) ? event.priority : null;
      if (type === 'event') priority = null;

      let missing = Array.isArray(event.missing_fields)
        ? event.missing_fields.filter((field) => typeof field === 'string' && allowedMissing.has(field))
        : [];
      missing = [...new Set(missing)];

      let ambiguity = asStringOrNull(event.ambiguity);
      let start_time = asStringOrNull(event.start_time);
      let end_time = asStringOrNull(event.end_time);
      let deadline = asStringOrNull(event.deadline);

      if (!isValidDateTime(start_time)) {
        start_time = null;
        missing.push('start_time');
        ambiguity = ambiguity ? `${ambiguity}；开始时间格式无效，已置空` : '开始时间格式无效，已置空';
      }
      if (!isValidDateTime(end_time)) {
        end_time = null;
        missing.push('end_time');
        ambiguity = ambiguity ? `${ambiguity}；结束时间格式无效，已置空` : '结束时间格式无效，已置空';
      }
      if (!isValidDateTime(deadline)) {
        deadline = null;
        missing.push('deadline');
        ambiguity = ambiguity ? `${ambiguity}；截止时间格式无效，已置空` : '截止时间格式无效，已置空';
      }

      if (type === 'event' && !start_time) {
        missing.push('start_time');
      }
      if (type === 'deadline' && !deadline) {
        missing.push('deadline');
      }

      let estimate_min = null;
      if (event.estimate_min !== null && event.estimate_min !== undefined && event.estimate_min !== '') {
        const value = Number(event.estimate_min);
        if (Number.isFinite(value) && value >= 0) estimate_min = Math.round(value);
      }
      if (type !== 'task') {
        estimate_min = null;
      } else if (estimate_min === null) {
        missing.push('estimate_min');
      }

      if (!asStringOrNull(event.title)) {
        missing.push('title');
      }

      if (start_time && end_time && start_time > end_time) {
        end_time = null;
        missing.push('end_time');
        const note = '结束时间早于开始时间，已置空';
        ambiguity = ambiguity ? `${ambiguity}；${note}` : note;
      }

      const confidence = Math.max(0, Math.min(1, Number(event.confidence) || 0));
      const dependencies = Array.isArray(event.dependencies)
        ? [...new Set(event.dependencies
            .filter((item) => typeof item === 'string' && item.trim())
            .map((item) => item.trim()))]
        : [];

      return {
        title: asStringOrNull(event.title),
        type,
        start_time,
        end_time,
        deadline,
        location: asStringOrNull(event.location),
        priority,
        estimate_min,
        dependencies,
        confidence,
        missing_fields: [...new Set(missing)],
        evidence: typeof event.evidence === 'string' ? event.evidence.trim() : '',
        ambiguity
      };
    });

    // 依赖必须指向本次抽取中的其他事项，不能自依赖或指向不存在的 title
    const titles = new Set(events.map((event) => event.title).filter(Boolean));
    for (const event of events) {
      const invalid = event.dependencies.filter((title) => !titles.has(title) || title === event.title);
      if (invalid.length > 0) {
        event.dependencies = event.dependencies.filter((title) => titles.has(title) && title !== event.title);
        const note = `依赖目标不在本次抽取中：${invalid.join('、')}`;
        event.ambiguity = event.ambiguity ? `${event.ambiguity}；${note}` : note;
      }
    }

    const needsConfirmation = events.length > 0 && events.some((event) =>
      event.confidence < 0.8 ||
      event.missing_fields.length > 0 ||
      Boolean(event.ambiguity)
    );

    const data = {
      events,
      needs_confirmation: needsConfirmation,
      notes: asStringOrNull(parsed.notes)
    };

    return {
      ok: true,
      result_json: JSON.stringify(data),
      data,
      needs_confirmation: needsConfirmation,
      error: null
    };
  } catch (error) {
    const fallback = {
      events: [],
      needs_confirmation: true,
      notes: '抽取结果解析失败，需要重试或人工确认'
    };
    return {
      ok: false,
      result_json: JSON.stringify(fallback),
      data: fallback,
      needs_confirmation: true,
      error: `invalid_json: ${String(error && error.message ? error.message : error)}`
    };
  }
}
```

> 如果你的 Coze 代码节点入口是 `args` 而不是 `{ params }`，把第一行改成 `async function main(args)`，并把 `params.raw` 改成 `args.raw`。不同版本以实际变量引用方式为准。

---

## 6. 结束节点

输出：

| 变量 | 类型 | 说明 |
|---|---|---|
| `result_json` | String | 标准化后的 JSON 字符串 |
| `needs_confirmation` | Boolean | 是否需要用户确认 |
| `error` | String / null | 解析失败原因 |

成功时 `error = null`。如果 `error` 非空，测试 Bot 应该回复“这次没解析成功，请再发一次或换一段文字”，不要把错误 JSON 直接给用户。

---

## 7. 测试 Bot 系统提示词（可选）

如果你要在 Coze 里建一个测试 Bot 给朋友用：

```text
你是「小排」的测试版整理助手。

1. 用户发来群消息、项目说明或待办后，必须调用 notice_extract 工作流；不要自己编造时间、地点、截止日期。
2. 如果工作流返回 needs_confirmation = true，用简短卡片列出事项，并明确问“这几项对吗？时间/地点需要补充吗？”
3. 如果工作流返回 events 为空，回复“这条消息里没有需要记录的安排”，不要硬抽。
4. 回复卡片格式：
   【类型】标题
   截止 / 时间：
   地点：
   优先级：
   预计时长：
   置信度：
   依据：“原文短句”
5. 不要承诺每日提醒；订阅消息额度有限。
6. 开头说明：这是测试版，内容只用于本次整理，测试结束可删除。
7. 不保存原文，不询问与整理无关的隐私信息。
8. 用户确认后回复“已记录（测试）”。
```

---

## 8. 冒烟测试

把 `current_datetime` 固定为 `2026-10-18 09:00 星期日`，先按当前 `labels.csv` 的 7 条通知跑：

| # | 输入摘要 | 期望 |
|---|---|---|
| 1 | 收到，谢谢老师！ | 意图 false，不进入抽取 |
| 2 | 10 月 20 日 23:59 前提交作品 | deadline；deadline `2026-10-20 23:59` |
| 3 | 10 月 19 日 17:00–19:10 基础进阶课 | event；start `2026-10-19 17:00`；end `2026-10-19 19:10` |
| 4 | 下周四 3:20 在某教学楼大教室开年级会，具体教室下周通知 | event；start `2026-10-22 15:20`；location `某教学楼大教室` + missing；ambiguity 说明 10/22 或 10/29、具体教室待通知 |
| 5 | 8 月 4 日至 8 月 11 日订购教材 | deadline；deadline `2026-08-11 23:59`；priority 必须为 null（不能因已过期给 P3）；notes 标“已过期” |
| 6 | 作品提交截止 10/20 23:59；11/7 公布名单 | 只抽 10/20 为 deadline；11/7 只写 notes，不抽 event/deadline |
| 7 | 宿舍卫生安全检查 10/17 14:00；保持宿舍清洁 | event `2026-10-17 14:00`；可选 task“保持宿舍清洁”，evidence 引用原文，不编新截止 |
| 8 | 这个产品怎么用？ | 意图 false，不进入抽取 |

再补 5 条边界：

| # | 输入 | 期望 |
|---|---|---|
| 9 | 10 月 20 日 24:00 前提交报名表 | deadline；`2026-10-20 23:59`；ambiguity 注明 24:00 处理 |
| 10 | 尽快把材料发我 | deadline 或 task；时间 null；ambiguity 说明“尽快没有截止时间” |
| 11 | 广告：扫码进群领资料 | 意图 false，或抽取为空；不生成任务 |
| 12 | 明天 7:30 开会 | event；start `2026-10-19 19:30`；ambiguity 写“原文未写上午/下午，按下午处理” |
| 13 | 11 月 7 日公布晋级名单 | events 为空；只在 notes 写“11/7 为名单公布，不是用户 event/deadline” |

通过标准（建议，不是统计结论）：

- 7 条 v1 通知 + 5 条边界都能返回合法 JSON；
- 闲聊/广告不生成事项；
- 相对时间按 2026-10-18 星期日解析正确；
- 未写上午/下午且早于 08:00 的钟点按下午处理，并在 ambiguity 说明；
- 名单公布/结果公布等信息日期不进入 events，只写 notes；
- 只有日期、没有具体时间的截止，按当天 23:59 处理并写进 ambiguity；
- event 的 priority 都是 null；
- task 没给估时时 `estimate_min = null`，并出现在 `missing_fields`；
- 已知地点层级必须保留（如“某教学楼大教室”），具体房间不编造；原文没有地点名词时才为 null；
- 无依据的 priority 必须为 null；P3 只能由“不急/可选/有空再说”等原文依据触发；
- 地点、截止时间没有原文依据时不出现；
- 低置信度、缺失字段、歧义事项都进入确认。

跑完把 `predicted_events` 填进 [labels.csv](../06-研究发现/coze测试数据/v1/labels.csv)，再运行：

```bash
cd "06-研究发现/coze测试数据"
python score.py --input "v1/labels.csv"
```

按 [测试数据 README](../06-研究发现/coze测试数据/README.md) 的口径看 `metrics.md`。7 条只能作为初步信号，不能下统计结论。

---

## 9. 常见问题

### 模型输出 Markdown 代码块

代码节点已经会去掉首尾的代码围栏；如果中间还有解释文字，会在解析时失败，返回 `invalid_json`。先降低 temperature，再加一句“不要输出 JSON 以外的任何字”。

### 条件节点拿不到 `has_recordable_event`

Coze 的 LLM 节点输出通常是字符串，不能直接当对象用。必须加 `parse_intent` 代码节点，再在条件节点引用 `parse_intent.has_recordable_event`。

### 「下周四」算错

当前 v1 测试基准日是 2026-10-18（星期日）。「下周四」按 2026-10-22 解析；如果原文没有上下文能排除 10/29，必须在 `ambiguity` 写清楚。检查 `current_datetime` 是否带星期，是否在每次测试时更新。

### 模型把「提交作品」抽成 task

这是类型定义不清。强调：提交/报名/缴费/申请截止 → `deadline`；需要投入时间写、做、准备 → `task`。如果原文同时强调“预计要 3 小时”，优先用 `task`（可带 deadline）。

### 模型给日期补了 00:00

在 Prompt 里保留“只有日期、没有时间时，按语义用 23:59 或 null”；代码节点只接受 `YYYY-MM-DD HH:mm`，日期-only 会被置空并进入 `missing_fields`。

### 模型把多个事项合并成一条

提高拆分规则的优先级，加入多事项示例；代码节点无法自动拆分，只能靠模型。

### 长项目说明被截断

先限制输入长度（MVP 建议 2000 字以内），超过就按段落分次粘贴；同时把 LLM 最大输出 token 调到 2000 或以上。

### 隐私

Coze 是验证工具，不是正式后端。测试时用 `labels.csv` 里的脱敏文本；不要把含手机号、身份证号、住址的原文直接贴进公开 Bot。正式产品需要隐私告知、最小必要、删除权和数据存储方案。

---

## 10. 这个工作流的边界

- 不负责自动排期：排期由小程序/后端规则引擎按截止、优先级、空闲时间计算；
- 不负责提醒：每日提醒是 V1，且受微信渠道限制；
- 不读取微信/QQ 聊天记录：只处理用户主动粘贴的文本；
- 不替代真机验证：长按转发、剪贴板读取、订阅消息都要在微信里单独验证；
- 不是正式后端：验证通过后，把同样的 Prompt 和 JSON schema 迁到自己的后端。

跑完当前 7 条测试后，把结果填进 [labels.csv](../06-研究发现/coze测试数据/v1/labels.csv)，再决定改 Prompt、换模型，还是回到 PRD 调整范围。
