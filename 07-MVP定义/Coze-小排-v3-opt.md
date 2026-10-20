# 小排 Coze 抽取 Prompt v3-opt（T1 前置修复版）

> 状态：**E0.1 已闭环（用户反馈 2026-10-19）**。三项前置修复通过；deadline 召回补丁经探针验证后已并入主图配置：P8 1/3→3/3、P6 2/3→3/3，P1–P8 正例均 ≥2/3（P3 2/3，其余 3/3；P1 run1 JSON 损坏、raw 含正确事件），id 7 3/3（`2026-10-20 23:59`，P1）、id 8 3/3（`2026-08-11 23:59`，priority `null`，已过期），负例 0/12 误抽，7 条主回归 7/7、0 多抽、`error=None`，`test_run` 通过。探针暴露的独立 JSON 解析损坏已修复：`_util` 容错 + `_is_empty_events` 将解析失败纳入 recheck。36 次探针原始数据和延迟已归档；7 条主回归为 7×1 全流程，延迟 median 11040 ms（非抽取节点）；E0 的 21 次抽取节点同口径延迟仍待补。id 4 的周次歧义仍未写入 `ambiguity`。E1b-1 `max_tokens` 实验已执行但参数未生效（两组均有超过各自上限的输出，`finish_reason=stop`），未采用 1200；不要把它写成 max_tokens 优化结论，详见 [v3.3/README.md](../06-研究发现/coze测试数据/v3/v3.3/README.md)。
>
> 基线：v3（[Coze-小排工作流提示词.md](Coze-小排工作流提示词.md) 第 4.2 节）。本文件以三项前置修复为主体，另含 E0.1 deadline 补丁；不做 Prompt 瘦身、不换模型、不调参数，保证和 T0 基线可比。E0.1 的 deadline 补丁已验证并并入本文件第 3 节 Prompt 和主图配置。
>
> 背景：补充 21 次完整运行暴露 3 次输入未传入、2 次多抽、id 4 三次未写周次歧义。详见 [metrics_runs_full.md](../06-研究发现/coze测试数据/v3/metrics_runs_full.md) 与 [Coze-延迟优化工单.md](Coze-延迟优化工单.md) 的 T1 前置修复。

## 1. 本次改了什么

| 修复 | 类型 | 位置 | 验收 |
|---|---|---|---|
| 输入校验 | 代码节点 | 开始节点之后新增 `validate_input` | 空输入不进意图/抽取，返回输入错误 |
| 输入绑定 | 工作流接线 | 意图、抽取的 `notification_text` 改为引用 `validate_input.notification_text` | 每次运行保存输入，不再出现“未提供原文” |
| 隐含任务上限 | Prompt | 拆分规则 6–7、字段规则、自检 6 | 每条输入最多 1 条隐含/建议 task |
| 隐含 task 字段 | Prompt | 优先级规则、自检 2/6 | 无原文依据时 `priority`/`deadline` 均为 null，不继承主事项截止 |
| 周次歧义 | Prompt | 时间规则 2、自检 5 | `下周四` 必须同时写 10/22 与 10/29 |

> 这次没有做的事：没有改 JSON schema；没有删地点、优先级、时间硬规则；没有做 Prompt 瘦身、换模型、调参数。

### 1.1 E0.1 追加修复

| 修复 | 位置 | 说明 |
|---|---|---|
| deadline 召回补丁 | 抽取 Prompt 六.3、自检 3 | 公告型文本里的提交/报名/缴费/订购等用户截止必须抽 deadline；信息日期与用户截止分开处理；倒计时冲突以明确日期为准；过期截止仍记录、priority 为 null |
| JSON 解析容错 | `_util` | 模型输出 JSON 局部损坏时不再直接丢弃整个结果 |
| 空事件判定 | `_is_empty_events` | JSON 解析失败不再等同于“无可记录事项”，纳入 recheck |

验收：探针 P6/P8 从 2/3、1/3 提升到 3/3，P1–P8 均 ≥2/3（P3 2/3），负例 0/12 误抽；id 7/id 8 均 3/3；`test_run` 通过。详见 [E0.1 闭环结果](../06-研究发现/coze测试数据/v3/v3.2/E0.1-deadline召回专项.md#51-闭环结果用户反馈-2026-10-19)。

## 2. 工作流接线

```text
开始
  → validate_input（新增代码节点）
      ├─ input_ok = false → 结束：输入为空（error = validate_input.error）
      └─ input_ok = true  → 意图判断 LLM
                              → parse_intent
                              → 条件 has_recordable_event
                                  ├─ false → 结束：无需记录
                                  └─ true  → 抽取 LLM
                                              → normalize_extraction
                                              → 结束
```

### 2.1 `validate_input` 代码节点

- 位置：开始节点之后、意图判断 LLM 之前。
- 输入变量：`notification_text`（引用开始节点）；如果测试脚本使用 `raw_text`，代码会兼容，但 Coze 工作流建议统一用 `notification_text`。
- 输出变量：`input_ok`（Boolean）、`notification_text`（String）、`error`（String/null）。

```js
async function main({ params }) {
  const raw = params && params.notification_text;
  const fallback = params && params.raw_text;
  const text = typeof raw === 'string' && raw.trim()
    ? raw.trim()
    : (typeof fallback === 'string' ? fallback.trim() : '');

  if (!text) {
    return {
      input_ok: false,
      notification_text: '',
      error: 'empty_input: notification_text 为空，已在抽取前拦截'
    };
  }

  return {
    input_ok: true,
    notification_text: text,
    error: null
  };
}
```

本地测试：`06-研究发现/coze测试数据/v3/v3.1/validate_input.test.js`，7/7 通过（空串、纯空白、缺失参数、非字符串、`raw_text` 兼容）。

### 2.2 条件与结束节点

- 条件：`validate_input.input_ok == false` → 新增“结束：输入为空”；`== true` → 意图判断。
- “输入为空”结束节点：
  - `result_json`: `{"events": [], "needs_confirmation": false, "notes": null}`
  - `needs_confirmation`: `false`
  - `error`: `{{validate_input.error}}`
  - 文案：`没有收到要整理的原文，请粘贴一段群消息、项目说明或待办。`
- 不要把这个分支接到“无需记录”文案；否则用户会误以为系统判断了内容。

### 2.3 变量绑定检查（关键）

- 意图判断 LLM 的 `{{notification_text}}` → `validate_input.notification_text`
- 抽取 LLM 的 `{{notification_text}}` → `validate_input.notification_text`
- 目的：让“校验过的文本”和“送进模型的文本”是同一个值，排除“开始节点有值、抽取节点为空”的绑定问题。
- 每次运行记录：`notification_text`、`current_datetime`、完整输出、延迟。只记 `events_cnt` 不够。

### 2.4 可选加固：`normalize_extraction` 输入回执检查

这一层用于捕获“输入非空、但模型仍声称没收到原文”的情况（对应 id 7 run2 的空返回疑点）。不改输出 schema。

1. 给 `normalize_extraction` 增加输入变量 `notification_text`，引用 `validate_input.notification_text`。
2. 在函数开头增加：

```js
const inputText = String(params.notification_text || '').trim();
```

3. 在 `const data = { ... }` 之后、`return { ok: true, ... }` 之前插入：

```js
// 输入回执检查：模型声称没收到原文，但输入非空 → 按错误处理，不能当“无可记录事项”
const notesText = data.notes || '';
const claimsNoInput = /未提供|没有收到|未传入|缺少原文|无原文/.test(notesText);
if (data.events.length === 0 && inputText && claimsNoInput) {
  const fallback = {
    events: [],
    needs_confirmation: true,
    notes: '模型未收到原文，已拦截为输入错误'
  };
  return {
    ok: false,
    result_json: JSON.stringify(fallback),
    data: fallback,
    needs_confirmation: true,
    error: 'input_not_received_by_llm: 模型声称没有收到原文，但输入非空'
  };
}
```

> 这是可选加固。如果暂时不改 `normalize_extraction`，至少要在每次运行日志里核对输入变量和完整输出。

## 3. v3-opt 抽取 Prompt（复制到抽取 LLM 节点）

```text
Prompt 版本：v3-opt（2026-10-19，T1 前置修复版）

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
6. 隐含/建议任务最多保留 1 条：原文里的“保持清洁”“查看要求”“打磨作品”等准备性或规则性提醒，最多合并成 1 条 task；不要把多个“不要……”的行为规范拆成多条 task，也不要每个提醒各拆一条。本条只限制原文没有明确要求用户执行的准备性提醒、行为规范；项目说明里原文明确写出的多个交付物、里程碑不在此限。
7. 隐含 task 的 priority 和 deadline 默认 null。除非原文对这条 task 本身明确写出优先级或截止时间，否则不得用同一输入里主事项的截止日期或优先级倒推。

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
2. “本周三”= 当前周周三；“下周三”= 下一周周三（按周一开始）。在本次测试基准日 2026-10-18（周日）上，“下周四”按周一起始 = 2026-10-22，按周日起始 = 2026-10-29；只要两种周起始口径会得到不同日期，必须在 ambiguity 同时写出两个候选日期，不能静默选一个，也不能只写时间或地点歧义。正式版按当天日期动态计算，不要把 10/22 写死。
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
   - 隐含/建议 task（原文只是提醒、建议，没有明确要求用户执行的事项）一律 null；不能用同一输入里其他事项的截止时间或优先级推导；
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
2. 原文中的背景规则（例如“保持宿舍清洁”“不要使用违规电器”）可以建议为 task，但整条输入最多保留 1 条隐含/建议 task；多条规则合并成 1 条或直接不抽。evidence 必须引用原文，并在 ambiguity 或 notes 里说明这是建议任务；不要给它编造新的硬截止，也不要把主事项的截止日期复制给它。
3. 公告里的“名单公布”“结果公布”“活动开始”“晋级名单公布”等信息日期，既不是用户要参加的 event，也不是用户要完成的 deadline；不要放进 events，只写进 notes。即使它有明确日期，也不抽。
4. 公告/通知里出现“提交 / 报名 / 缴费 / 订购 / 申请 / 注册”等用户动作，并给出“截止 / 前完成 / 窗口 / 之内”等时间边界时，必须抽成 deadline；即使整条文本看起来像通知、公告，或没有“请 / 需要 / 记得”等主语，也要抽。
5. 同一段同时出现信息日期和用户截止时，信息日期只写 notes，用户截止必须单独抽 deadline，不能因为整条像公告就判空。
6. 倒计时与明确截止日期不一致时，以明确日期为准，仍要抽 deadline，并在 ambiguity 说明；不得因为矛盾判空。
7. 截止日期已过期不等于不可记录：仍按原文输出 deadline，priority 用 null，并在 notes 或 ambiguity 标注“已过期”。
8. 原文中的“某大学”“某老师A”“某园区”“某教学楼”等是脱敏占位符，原样保留，不要猜测或还原真实名称。
9. 不要输出原文没有的人物、组织、地点、时间或事项；宁可 null + missing_fields，也不要补全。

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
   - 隐含/建议 task 的 priority 默认 null，除非原文对这条 task 明确给出优先级词；不能用主事项的截止时间推导；
   - 日期优先级只能用于未来截止时间；已过期事项没有显式优先级词时一律 null；
   - P3 只能由“不急/有空再说/可选/不强制”触发；过期、时间远、普通都不能给 P3；
   - 如果 priority 是 P3，但 evidence 里没有上述触发词，直接改为 null；
   - 找不到依据就一律 null。
3. 信息日期与 deadline 召回自检：
   - “名单公布 / 结果公布 / 活动开始 / 晋级名单公布”等信息日期不放进 events，只写 notes；
   - 公告型文本中，只要出现“提交 / 报名 / 缴费 / 订购 / 申请 / 注册”等动作和“截止 / 前完成 / 窗口 / 之内”等边界，即使像公告、没有主语，也必须抽出 deadline；
   - 信息日期和用户截止同时出现时，不能把整条判空；信息日期写 notes，用户截止单独抽 deadline；
   - 倒计时与明确日期矛盾时，保留明确日期的 deadline，并在 ambiguity 说明；
   - 已过期的 deadline 仍要输出，priority 为 null，并标注“已过期”。
4. 时间自检：
   - 未写上午/下午且解析结果早于 08:00 的钟点，按下午 +12 小时处理；
   - 明确写“凌晨/早上/上午”的，按原文保留。
5. 周次歧义自检：
   - 原文出现“本周X / 下周X / 周X”时，按“周一为一周开始”和“周日为一周开始”各算一次；
   - 两种口径结果不同时，ambiguity 必须同时写出两个候选日期，例如“下周四存在 2026-10-22 与 2026-10-29 两种可能，按 2026-10-22 解析”；
   - 只写“原文未写上午/下午”或“具体教室待通知”不算完成周次歧义检查。
6. 隐含任务自检：
   - 全条输出中，隐含/建议 task（不含原文明确写出的项目交付物/里程碑）最多 1 条；超过 1 条时只保留最具体、最可执行的一条，其余删除；
   - 隐含 task 的 priority 和 deadline 必须能在原文中找到直接依据；找不到就填 null；
   - 不得把主事项的截止日期复制给隐含 task。

【九、输出纪律】
1. 输出必须是合法 JSON；不要用 Markdown 代码块包裹。
2. 不要输出解释、思考过程、前后缀。
3. 没有可记录事项时，输出 {"events": [], "needs_confirmation": false, "notes": "无可记录事项"}。
4. 所有字段都必须出现；没有值用 null，数组用 []。
```

## 4. 运行与验收

### 4.1 运行前检查

- [ ] 模型/参数保持 T0：`doubao-seed-2-0-pro-260215` / temperature `0.1` / max_tokens `2000` / JSON 模式开启
- [ ] `validate_input` 已接入，空输入分支能返回输入错误
- [ ] 意图、抽取两处 `notification_text` 已改绑到 `validate_input.notification_text`
- [ ] 记录 v3-opt 的 Prompt 字符数（v3 为 7288 字符；本次只增不减）
- [ ] 每次运行保存输入变量和完整输出

### 4.2 跑 7 条 × 3 轮

- 测试集：`06-研究发现/coze测试数据/v2/labels_result_v2.csv` 的 id 2–8
- 测试基准日：`2026-10-18 09:00 星期日`，时区 `Asia/Shanghai`
- 同一 Prompt、同一模型、同一参数跑 3 轮，共 21 次

### 4.3 通过标准（运行后填写）

| 检查 | 目标 | 实测 |
|---|---|---|
| 输入缺失 | 21 次中 0 次 | 待测 |
| 多抽 | 21 次中 0 次 | 待测 |
| id 4 周次歧义 | 3/3 的 `ambiguity` 同时含 `2026-10-22` 与 `2026-10-29` | 待测 |
| 事件级 | 不低于 T0 基线 | 待测 |
| 时间 / 地点 / 优先级 / 幻觉 | 不比 T0 差超过 1 条 | 待测 |
| 延迟 median / p95 | 用同一脚本、同一口径记录并与 T0 对比 | 待测 |

> T0 有两套质量口径：原始单次 7/7；补充 21 次完整重跑 15/21 端到端、15/17 非空事件级。验收优先对比后者，不要只拿单次 7/7。
>
> 延迟主口径是 `v3/doubao_latency.csv`（仅抽取节点，median 27202 ms、p95 45193 ms）。v3-opt 的延迟必须用同一脚本、同一计时口径测，不能和旧单次 10.3 s 横比。

### 4.4 E0.1 结果（用户反馈 2026-10-19）

| 检查 | 结果 |
|---|---|
| P8 / P6 | `1/3 → 3/3` / `2/3 → 3/3` |
| P1–P8 正例 | 均 ≥2/3：P3 2/3，其余 3/3；P1 run1 JSON 损坏、raw 含正确事件 |
| 负例 N1–N4 | 0/12 误抽 |
| id 7 | 3/3：deadline `2026-10-20 23:59`，P1 |
| id 8 | 3/3：deadline `2026-08-11 23:59`，priority `null`，已过期 |
| JSON 解析 | `_util` 容错 + `_is_empty_events` 将解析失败纳入 recheck，`test_run` 通过 |
| 探针延迟（36 次） | 正例 median 33.3 s / p95 45.0 s；负例 median 16.8 s / p95 22.9 s；口径未注明，不与主口径横比 |
| 7 条主回归 | 7/7、0 多抽、`error=None`；全流程延迟 median 11040 ms（7×1，min 9914 / max 16820，非抽取节点） |
| 残留 | id 4 的 `ambiguity` 仍只写上午/下午与教室待定，不含 10/22 vs 10/29 |
| 尚缺 | E0 的 21 次抽取节点同口径延迟；3 轮稳定性 |

原始数据：[probe_e01_v3-opt-e01.csv](../06-研究发现/coze测试数据/v3/probe_e01_v3-opt-e01.csv)。完整记录见 [E0.1 闭环结果](../06-研究发现/coze测试数据/v3/v3.2/E0.1-deadline召回专项.md#51-闭环结果用户反馈-2026-10-19)。

### 4.5 结果记录

把结果追加到 [延迟优化记录.md](../06-研究发现/coze测试数据/延迟优化记录.md) 的 E0。没有实测就写“待测”，不要留空或写目标值。

E1b-1（2026-10-19）在火山方舟直连、temp 0.1 下比较 `max_tokens 2000`（C）与 `1200`（V1），各 7×3：C 18/21、V1 20/21 主事项命中；全部运行 median 34947 / 36278 ms，非空 median 36198 / 36418.5 ms。V1 19/21 次输出 >1200（最大 2909），C 4/21 次 >2000（最大 3085），`finish_reason` 全为 `stop`，说明参数未实际生效。**未采用 1200，维持 2000；这不是“max_tokens 无效”的干净结论。** 详见 [v3.3/README.md](../06-研究发现/coze测试数据/v3/v3.3/README.md)。
