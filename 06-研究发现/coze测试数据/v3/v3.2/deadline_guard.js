/**
 * deadline_guard：确定性触发节点。
 *
 * 只判断“原文里是否同时存在用户动作 + 时间边界 + 日期表达”，
 * 不解析日期、不生成事件，也不替代抽取 Prompt。
 *
 * 用途：
 * 1) 意图节点判 false 但这里 deadline_cue=true 时，强制进入抽取；
 * 2) 抽取结果为空且这里 deadline_cue=true 时，才允许走 recover 复核。
 */
async function main({ params }) {
  const raw = params && params.notification_text;
  const fallback = params && params.raw_text;
  const text = typeof raw === 'string' && raw.trim()
    ? raw.trim()
    : (typeof fallback === 'string' ? fallback.trim() : '');

  if (!text) {
    return {
      deadline_cue: false,
      info_date_only: false,
      force_extract: false,
      evidence: null,
      matched: { action: null, date: null, info: null },
      reason: 'empty_input'
    };
  }

  // 用户动作：只覆盖提交/报名/缴费/订购/申请等 deadline 型动作。
  // 不把“开始 / 公布 / 公示”当动作，避免把信息日期误判为 deadline。
  const actionPattern = /(提交|报送|上传|报名|缴费|付款|订购|预订|申请|注册|选课|填报|确认)/;

  // 动作 + 时间边界（同一句内，不跨句号/分号/换行）。
  const actionEdgePattern = new RegExp(
    '(?:提交|报送|上传|报名|缴费|付款|订购|预订|申请|注册|选课|填报|确认)' +
    '[^。！？!?；;\\n]{0,16}' +
    '(?:截止|截止时间|截止日期|前完成|前提交|前上传|前报名|前确认|窗口|之内|内完成)' +
    '|' +
    '(?:截止|deadline)[^。！？!?；;\\n]{0,16}' +
    '(?:提交|报送|上传|报名|缴费|付款|订购|预订|申请|注册|选课|填报|确认)' +
    '|' +
    '(?:内|前|截止)[^。！？!?；;\\n]{0,10}(?:完成)?[^。！？!?；;\\n]{0,8}' +
    '(?:提交|报送|上传|报名|缴费|付款|订购|预订|申请|注册|选课|填报|确认)',
    'i'
  );

  // 日期/时间表达：绝对日期、相对周次、倒计时都算；只有“截止”没有日期不触发。
  const datePattern = /(\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*[/-]\s*\d{1,2}|20\d{2}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}\s*日?|今天|明天|后天|大后天|本周[一二三四五六日天]?|下周[一二三四五六日天]?|周[一二三四五六日天]|月底|年底|倒计时\s*\d+\s*天)/;

  // 信息日期：单独出现时不触发；与用户动作同时出现时，不阻止 deadline 触发。
  const infoPattern = /(名单公布|结果公布|晋级名单|公示|获奖名单|录取名单|活动开始|开奖)/;

  const actionMatch = text.match(actionPattern);
  const edgeMatch = text.match(actionEdgePattern);
  const dateMatch = text.match(datePattern);
  const infoMatch = text.match(infoPattern);

  const hasAction = Boolean(actionMatch);
  const hasActionEdge = Boolean(edgeMatch);
  const hasDate = Boolean(dateMatch);
  const hasInfo = Boolean(infoMatch);

  // 触发条件：动作 + 时间边界 + 日期；信息日期单独出现不算。
  const deadlineCue = hasActionEdge && hasDate;
  const infoDateOnly = hasInfo && !hasActionEdge;

  let evidence = null;
  if (edgeMatch) {
    const idx = text.indexOf(edgeMatch[0]);
    const start = Math.max(0, idx - 16);
    const end = Math.min(text.length, idx + edgeMatch[0].length + 24);
    evidence = text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  let reason = 'no_cue';
  if (deadlineCue) reason = 'action_deadline_with_date';
  else if (infoDateOnly) reason = 'info_date_only';
  else if (hasActionEdge && !hasDate) reason = 'action_without_date';
  else if (hasDate && !hasActionEdge) reason = 'date_without_action';

  return {
    deadline_cue: deadlineCue,
    info_date_only: infoDateOnly,
    force_extract: deadlineCue,
    evidence,
    matched: {
      action: actionMatch ? actionMatch[0] : null,
      edge: edgeMatch ? edgeMatch[0] : null,
      date: dateMatch ? dateMatch[0] : null,
      info: infoMatch ? infoMatch[0] : null
    },
    reason
  };
}

module.exports = { main };
