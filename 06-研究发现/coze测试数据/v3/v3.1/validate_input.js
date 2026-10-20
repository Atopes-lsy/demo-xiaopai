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

module.exports = { main };
