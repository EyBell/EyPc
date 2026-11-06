/**
 * Magpie (Macpa) local quota gateway projection.
 *
 * EyPc reads the desktop gateway at 127.0.0.1:3425 when it is available and
 * projects only the four readings the collapsed water ball needs. Missing data
 * stays absent rather than being coerced into 0%.
 */
export const MAGPIE_QUOTA_ENDPOINT = 'http://127.0.0.1:3425/v1/magpie/quotas';
const EMPTY_GRID = {
    enabled: false,
    status: 'idle',
    updatedAt: 0,
    cells: [],
    ariaSuffix: ''
};
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function providerEntry(list, id) {
    if (!Array.isArray(list))
        return null;
    return list.find((entry) => entry?.provider === id) ?? null;
}
function windowRemaining(provider, windowName) {
    const windows = provider?.windows;
    if (!Array.isArray(windows))
        return null;
    const window = windows.find((entry) => entry?.name === windowName);
    const remaining = finiteNumber(window?.remaining);
    return remaining === null ? null : clampPercent(remaining);
}
/** Parses `68541.61 credits` into a display number while keeping the unit implicit in copy. */
export function parseMagpieTokenBalance(balance) {
    if (typeof balance !== 'string')
        return null;
    const match = balance.trim().match(/([\d,.]+)/);
    if (!match)
        return null;
    const normalized = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(normalized) ? normalized : null;
}
export function formatMagpieTokenBalance(balance) {
    const value = parseMagpieTokenBalance(balance);
    if (value === null)
        return '—';
    if (value >= 10_000) {
        const w = value / 10_000;
        return `${w >= 10 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')}W`;
    }
    if (value >= 1000) {
        const k = value / 1000;
        return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    return value % 1 === 0 ? String(value) : value.toFixed(1);
}
export function normalizeMagpieQuotaProviders(input) {
    if (Array.isArray(input))
        return input;
    if (input && typeof input === 'object' && Array.isArray(input.data)) {
        return input.data;
    }
    return [];
}
function missingCell(key, label, detail) {
    return { key, label, kind: 'missing', percent: null, text: '—', detail };
}
function percentCell(key, label, percent, detail) {
    return { key, label, kind: 'percent', percent, text: String(percent), detail };
}
/**
 * Resolves the 2×2 centre grid.
 *
 * The outer ring already shows Codex weekly remaining, so the top-left cell
 * never repeats that percentage: it shows a token balance only when the weekly
 * window is exhausted, otherwise a neutral placeholder.
 */
export function resolveCompactQuotaGridPresentation(providers, options = {}) {
    const enabled = options.enabled === true;
    if (!enabled)
        return EMPTY_GRID;
    const status = options.status || 'idle';
    const updatedAt = options.updatedAt || 0;
    const list = normalizeMagpieQuotaProviders(providers);
    const codex = providerEntry(list, 'codex');
    const grok = providerEntry(list, 'grok');
    const cursor = providerEntry(list, 'cursor');
    const codexWeekly = windowRemaining(codex, '7 days');
    const grokWeekly = windowRemaining(grok, '7 days');
    const cursorModels = windowRemaining(cursor, 'Cursor Models');
    const cursorOther = windowRemaining(cursor, 'Other Models');
    const tokenBalance = codex?.balance ?? null;
    const tokenText = formatMagpieTokenBalance(tokenBalance);
    const tokenValue = parseMagpieTokenBalance(tokenBalance);
    const tokenCell = codexWeekly === 0 && tokenValue !== null
        ? {
            key: 'token',
            label: 'Token',
            kind: 'token',
            percent: null,
            text: tokenText,
            detail: typeof tokenBalance === 'string' ? `Codex Token 余量 ${tokenBalance}` : `Codex Token 余量 ${tokenText}`
        }
        : codexWeekly === null
            ? missingCell('token', 'Token', 'Codex 周额度暂不可用')
            : {
                key: 'token',
                label: '额度',
                kind: 'placeholder',
                percent: null,
                text: '—',
                detail: 'Codex 周额度由外圈显示'
            };
    const grokCell = grokWeekly === null
        ? missingCell('grok', 'Grok', 'Grok 7 天额度暂不可用')
        : percentCell('grok', 'Grok', grokWeekly, `Grok 7 天剩余 ${grokWeekly}%`);
    const cursorModelsCell = cursorModels === null
        ? missingCell('cursor-models', 'C', 'Cursor Models 额度暂不可用')
        : percentCell('cursor-models', 'C', cursorModels, `Cursor Models 剩余 ${cursorModels}%`);
    const cursorOtherCell = cursorOther === null
        ? missingCell('cursor-other', 'O', 'Cursor Other Models 额度暂不可用')
        : percentCell('cursor-other', 'O', cursorOther, `Cursor Other Models 剩余 ${cursorOther}%`);
    const cells = [tokenCell, grokCell, cursorModelsCell, cursorOtherCell];
    const ariaParts = cells
        .filter((cell) => cell.kind !== 'placeholder')
        .map((cell) => cell.detail);
    return {
        enabled: true,
        status,
        updatedAt,
        ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
        cells,
        ariaSuffix: ariaParts.length ? `，${ariaParts.join('；')}` : ''
    };
}
export async function fetchMagpieQuotaProviders(endpoint = MAGPIE_QUOTA_ENDPOINT, fetchImpl = fetch) {
    const response = await fetchImpl(endpoint, { method: 'GET' });
    if (!response.ok)
        throw new Error(`magpie quota http ${response.status}`);
    const payload = await response.json();
    const providers = normalizeMagpieQuotaProviders(payload);
    if (!providers.length)
        throw new Error('magpie quota empty');
    return providers;
}
function parseMagpieResetAt(value) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}
function windowByName(provider, windowName) {
    if (!provider?.windows)
        return null;
    return provider.windows.find((entry) => entry?.name === windowName) ?? null;
}
/** Short countdown for expanded cards, aligned with float `formatReset` wording. */
export function magpieResetCountdownText(resetAt, now) {
    if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0)
        return '重置时间未提供';
    if (now >= resetAt)
        return '窗口已重置 · 等待新读数';
    const minutes = Math.max(0, Math.round((resetAt - now) / 60_000));
    if (minutes < 60)
        return `${minutes} 分钟后重置`;
    if (minutes < 1440)
        return `${Math.floor(minutes / 60)} 小时后重置`;
    return `${Math.floor(minutes / 1440)} 天后重置`;
}
function expandCard(key, label, valueText, percent, resetAt, detail) {
    return { key, label, valueText, percent, resetAt, detail };
}
/**
 * Expanded float-card quota tiles for each Magpie provider window.
 */
export function buildMagpieQuotaExpandCards(providers) {
    const list = normalizeMagpieQuotaProviders(providers);
    if (!list.length)
        return [];
    const cards = [];
    const codex = providerEntry(list, 'codex');
    const codexWeekly = windowByName(codex, '7 days');
    const codexRemaining = finiteNumber(codexWeekly?.remaining);
    if (codexRemaining !== null) {
        const resetAt = parseMagpieResetAt(codexWeekly?.resetsAt);
        cards.push(expandCard('magpie-codex-weekly', 'Codex 周额度', codexRemaining === 0 && codex?.balance ? formatMagpieTokenBalance(codex.balance) : String(clampPercent(codexRemaining)), codexRemaining, resetAt, codexRemaining === 0 && codex?.balance
            ? `周额度已用尽，Token ${codex.balance}`
            : `Codex 7 天剩余 ${clampPercent(codexRemaining)}%`));
    }
    const grok = providerEntry(list, 'grok');
    const grokWeekly = windowByName(grok, '7 days');
    const grokRemaining = finiteNumber(grokWeekly?.remaining);
    if (grokRemaining !== null) {
        cards.push(expandCard('magpie-grok-weekly', 'Grok 7 天', String(clampPercent(grokRemaining)), clampPercent(grokRemaining), parseMagpieResetAt(grokWeekly?.resetsAt), `Grok 7 天剩余 ${clampPercent(grokRemaining)}%`));
    }
    const cursor = providerEntry(list, 'cursor');
    const cursorModels = windowByName(cursor, 'Cursor Models');
    const cursorOther = windowByName(cursor, 'Other Models');
    const modelsRemaining = finiteNumber(cursorModels?.remaining);
    if (modelsRemaining !== null) {
        cards.push(expandCard('magpie-cursor-models', 'Cursor · C', String(clampPercent(modelsRemaining)), clampPercent(modelsRemaining), parseMagpieResetAt(cursorModels?.resetsAt), `Cursor Models 剩余 ${clampPercent(modelsRemaining)}%`));
    }
    const otherRemaining = finiteNumber(cursorOther?.remaining);
    if (otherRemaining !== null) {
        cards.push(expandCard('magpie-cursor-other', 'Cursor · O', String(clampPercent(otherRemaining)), clampPercent(otherRemaining), parseMagpieResetAt(cursorOther?.resetsAt), `Cursor Other Models 剩余 ${clampPercent(otherRemaining)}%`));
    }
    const openrouter = list.find((entry) => entry.provider === 'openrouter') ?? null;
    if (openrouter?.balance) {
        cards.push(expandCard('magpie-openrouter-balance', 'OpenRouter', openrouter.balance, null, null, `OpenRouter 余额 ${openrouter.balance}`));
    }
    return cards;
}
/**
 * One reset countdown per supplier for the expanded float bar. Cursor C/O share
 * one line because Magpie reports the same reset window for both.
 */
export function buildMagpieQuotaResetLines(providers) {
    const list = normalizeMagpieQuotaProviders(providers);
    if (!list.length)
        return [];
    const lines = [];
    const codex = providerEntry(list, 'codex');
    const codexWeekly = windowByName(codex, '7 days');
    if (finiteNumber(codexWeekly?.remaining) !== null || parseMagpieResetAt(codexWeekly?.resetsAt)) {
        lines.push({
            key: 'magpie-codex',
            label: 'Codex',
            resetAt: parseMagpieResetAt(codexWeekly?.resetsAt)
        });
    }
    const grok = providerEntry(list, 'grok');
    const grokWeekly = windowByName(grok, '7 days');
    if (finiteNumber(grokWeekly?.remaining) !== null) {
        lines.push({
            key: 'magpie-grok',
            label: 'Grok',
            resetAt: parseMagpieResetAt(grokWeekly?.resetsAt)
        });
    }
    const cursor = providerEntry(list, 'cursor');
    const cursorModels = windowByName(cursor, 'Cursor Models');
    const cursorOther = windowByName(cursor, 'Other Models');
    const hasCursor = finiteNumber(cursorModels?.remaining) !== null || finiteNumber(cursorOther?.remaining) !== null;
    if (hasCursor) {
        const resetAt = parseMagpieResetAt(cursorModels?.resetsAt)
            ?? parseMagpieResetAt(cursorOther?.resetsAt);
        lines.push({ key: 'magpie-cursor', label: 'Cursor', resetAt });
    }
    return lines;
}
export function formatMagpieQuotaResetInline(lines, now) {
    if (!lines.length)
        return '';
    return lines
        .map((line) => `${line.label} ${magpieResetCountdownText(line.resetAt, now)}`)
        .join(' · ');
}
