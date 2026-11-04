// api/_complete.js — one Anthropic Messages call that never hands back a truncated, refused or late reply (Edge-safe: no node: imports).
//  - stop_reason "max_tokens" = cut off: retried ONCE with the next, higher limit in `limits`; if that is also cut off, or
//    there is not enough time left for another attempt, the result is { ok: false, truncated: true } and no partial text is returned.
//  - stop_reason "refusal" = the model declined: { ok: false, refusal: true } and the text (if any) is NEVER returned.
//  - opts.deadlineAt (epoch ms) is the request's hard budget: every fetch is aborted at the deadline, and a retry is only
//    started when opts.minRetryMs of budget remain. A timeout is { ok: false, timeout: true }.
export async function callComplete(apiKey, buildBody, limits, opts = {}) {
  const { deadlineAt = Infinity, minRetryMs = 0 } = opts;
  for (let i = 0; i < limits.length; i++) {
    const left = deadlineAt - Date.now();
    if (left <= 1000 || (i > 0 && left < minRetryMs)) return { ok: false, timeout: true, budget: true, err: 'Not enough time left for a model call', attempts: i };
    const body = buildBody(limits[i]);
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: Number.isFinite(left) ? AbortSignal.timeout(left) : undefined,
      });
    } catch (e) {
      return { ok: false, timeout: true, err: 'Model call timed out or failed: ' + (e && e.name), attempts: i + 1 };
    }
    if (!response.ok) return { ok: false, status: response.status, err: await response.text().catch(() => ''), attempts: i + 1 };
    let data;
    try { data = await response.json(); } catch (e) { return { ok: false, timeout: true, err: 'Model reply unreadable: ' + (e && e.name), attempts: i + 1 }; }
    const info = { stop: data.stop_reason, stopDetails: data.stop_details || null, usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : null };
    if (data.stop_reason === 'refusal') return { ok: false, refusal: true, err: 'Model declined the request (stop_reason: refusal)', attempts: i + 1, ...info };
    if (data.stop_reason === 'max_tokens') {
      if (i < limits.length - 1) continue;
      return { ok: false, truncated: true, err: 'Model reply was cut off at the token limit', attempts: i + 1, ...info };
    }
    // Extract the text block by type, not by position (adaptive thinking can put a "thinking" block first).
    const text = data.content?.find(b => b.type === 'text')?.text;
    if (!text) return { ok: false, err: `No text block in API response (stop_reason: ${data.stop_reason || 'unknown'})`, attempts: i + 1, ...info };
    return { ok: true, text, attempts: i + 1, ...info };
  }
  return { ok: false, err: 'no token limits given' };
}
