/**
 * Direct Google Gemini Multi-Key Router and Load Balancer for Lanki.
 *
 * Provides embedded native calling of the Google Gemini REST API (v1beta)
 * with multi-key health tracking, pluggable load balancing algorithms
 * (Round-Robin, Least-Busy, Rate-Limit Fallback), automatic 429 quota exhaustion
 * cooldown failover, and pool diagnostics.
 */

export const ROUTING_STRATEGIES = {
  ROUND_ROBIN: "round-robin",
  LEAST_BUSY: "least-busy",
  RATE_LIMIT_FALLBACK: "rate-limit-fallback"
};

export const DEFAULT_GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Recommended)", description: "Fast, intelligent, high free quota" },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Latest)", description: "Enhanced reasoning and speed" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Standard Flash" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Maximum quality and nuance" }
];

/**
 * Normalizes input (comma/newline separated string or array) into clean, deduplicated key strings.
 *
 * @param {string|string[]} input
 * @returns {string[]}
 */
export function parseGeminiKeys(input) {
  if (!input) return [];
  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === "string") {
    rawList = input.split(/[\r\n,;]+/);
  } else {
    return [];
  }
  const cleaned = rawList
    .map(k => (typeof k === "string" ? k.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

/**
 * Masks an API key for safe UI rendering and log output (e.g. AIzaSy...AbCd).
 *
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  if (!key || typeof key !== "string") return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    const head = trimmed.slice(0, Math.min(2, trimmed.length));
    const tail = trimmed.length > 2 ? trimmed.slice(-Math.min(2, trimmed.length - head.length)) : "";
    return `${head}****${tail}`;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

/**
 * Specialized error indicating all keys in the pool are exhausted or in cooldown.
 */
export class AllKeysExhaustedError extends Error {
  constructor(message, earliestCooldownMs = null) {
    super(message);
    this.name = "AllKeysExhaustedError";
    this.earliestCooldownMs = earliestCooldownMs;
    this.earliestRecoverySeconds = earliestCooldownMs ? Math.ceil(earliestCooldownMs / 1000) : null;
  }
}

/**
 * Core Direct Gemini Multi-Key Router
 */
export class GeminiRouter {
  /**
   * @param {Object} [config={}]
   * @param {string[]|string} [config.keys] - API keys (array or delimited string)
   * @param {string[]|string} [config.geminiApiKeys] - Alias for keys
   * @param {string[]|string} [config.geminiKeys] - Alias for keys
   * @param {string} [config.strategy="round-robin"] - "round-robin" | "least-busy" | "rate-limit-fallback"
   * @param {number} [config.cooldownSeconds=60] - Cooldown duration in seconds on 429
   * @param {number} [config.maxRetries=3] - Maximum retry attempts per request
   * @param {string} [config.model="gemini-2.5-flash"] - Default target Gemini model
   * @param {string} [config.baseUrl="https://generativelanguage.googleapis.com/v1beta"]
   * @param {Function} [config.fetchFn=globalThis.fetch] - Injectable fetch implementation
   */
  constructor(config = {}) {
    this.keys = [];
    this.rrIndex = 0;
    this.strategy = ROUTING_STRATEGIES.ROUND_ROBIN;
    this.cooldownSeconds = 60;
    this.maxRetries = 3;
    this.model = "gemini-2.5-flash";
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = typeof globalThis !== "undefined" && globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;

    this.updateConfig(config);
  }

  /**
   * Updates configuration settings and reconfigures the key pool while preserving
   * statistics for keys that remain in the pool.
   *
   * @param {Object} [config={}]
   */
  updateConfig(config = {}) {
    if (!config || typeof config !== "object") return;

    const resolvedStrategy = config.strategy || config.geminiStrategy || config.geminiRoutingStrategy;
    if (resolvedStrategy && Object.values(ROUTING_STRATEGIES).includes(resolvedStrategy)) {
      this.strategy = resolvedStrategy;
    }

    const resolvedCooldown = config.cooldownSeconds !== undefined ? config.cooldownSeconds : config.geminiCooldownSeconds;
    if (typeof resolvedCooldown === "number" && !isNaN(resolvedCooldown) && resolvedCooldown >= 0) {
      this.cooldownSeconds = resolvedCooldown;
    }

    const resolvedRetries = config.maxRetries !== undefined ? config.maxRetries : config.geminiMaxRetries;
    if (typeof resolvedRetries === "number" && !isNaN(resolvedRetries) && resolvedRetries >= 0) {
      this.maxRetries = resolvedRetries;
    }

    const resolvedModel = config.model || config.geminiModel;
    if (resolvedModel && typeof resolvedModel === "string" && resolvedModel.trim()) {
      this.model = resolvedModel.trim();
    }

    if (config.baseUrl && typeof config.baseUrl === "string" && config.baseUrl.trim()) {
      this.baseUrl = config.baseUrl.trim();
    }

    if (typeof config.fetchFn === "function") {
      this.fetchFn = config.fetchFn;
    }

    const rawKeys = config.keys !== undefined
      ? config.keys
      : (config.geminiApiKeys !== undefined ? config.geminiApiKeys : config.geminiKeys);

    if (rawKeys !== undefined) {
      this.setKeys(rawKeys);
    }
  }

  /**
   * Sets or updates configured API keys while preserving telemetry for existing keys.
   *
   * @param {string[]|string} keysInput
   */
  setKeys(keysInput) {
    const parsed = parseGeminiKeys(keysInput);
    const existingMap = new Map(this.keys.map(k => [k.key, k]));

    this.keys = parsed.map((key, index) => {
      const existing = existingMap.get(key);
      if (existing) {
        existing.index = index;
        existing.id = `key_${index}`;
        return existing;
      }
      return {
        key,
        id: `key_${index}`,
        index,
        masked: maskApiKey(key),
        status: "active", // "active" | "cooldown" | "disabled"
        cooldownUntil: null,
        inFlight: 0,
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        consecutiveErrors: 0,
        lastUsed: null,
        lastLatencyMs: null,
        lastError: null
      };
    });

    if (this.rrIndex >= this.keys.length) {
      this.rrIndex = 0;
    }
  }

  setStrategy(strategy) {
    if (Object.values(ROUTING_STRATEGIES).includes(strategy)) {
      this.strategy = strategy;
    }
  }

  setCooldownSeconds(seconds) {
    if (typeof seconds === "number" && seconds >= 0) {
      this.cooldownSeconds = seconds;
    }
  }

  setModel(model) {
    if (typeof model === "string" && model.trim()) {
      this.model = model.trim();
    }
  }

  /**
   * Refreshes cooldown states for all keys. Keys whose cooldown timestamp has passed
   * automatically transition back to "active".
   *
   * @param {number} [now=Date.now()]
   */
  refreshCooldowns(now = Date.now()) {
    for (const keyRecord of this.keys) {
      if (keyRecord.status === "cooldown" && keyRecord.cooldownUntil && now >= keyRecord.cooldownUntil) {
        keyRecord.status = "active";
        keyRecord.cooldownUntil = null;
        keyRecord.consecutiveErrors = 0;
      }
    }
  }

  /**
   * Returns health state records for all keys in the pool.
   *
   * @returns {Array<Object>}
   */
  getHealthStatus() {
    this.refreshCooldowns();
    const now = Date.now();
    return this.keys.map(k => ({
      id: k.id,
      index: k.index,
      masked: k.masked,
      status: k.status,
      inFlight: k.inFlight,
      totalRequests: k.totalRequests,
      successRequests: k.successRequests,
      failedRequests: k.failedRequests,
      consecutiveErrors: k.consecutiveErrors,
      cooldownUntil: k.cooldownUntil,
      cooldownRemainingMs: k.cooldownUntil ? Math.max(0, k.cooldownUntil - now) : 0,
      lastUsed: k.lastUsed,
      lastLatencyMs: k.lastLatencyMs,
      lastError: k.lastError
    }));
  }

  /**
   * Alias for getHealthStatus()
   */
  getKeysHealth() {
    return this.getHealthStatus();
  }

  /**
   * Returns a high-level summary of the pool's health.
   *
   * @returns {{ total: number, active: number, inCooldown: number, disabled: number, overallStatus: string }}
   */
  getPoolSummary() {
    const health = this.getHealthStatus();
    const total = health.length;
    const active = health.filter(k => k.status === "active").length;
    const inCooldown = health.filter(k => k.status === "cooldown").length;
    const disabled = health.filter(k => k.status === "disabled").length;

    let overallStatus = "healthy";
    if (total === 0 || active === 0) {
      overallStatus = "failed";
    } else if (inCooldown > 0 || disabled > 0) {
      overallStatus = "degraded";
    }

    return {
      total,
      active,
      inCooldown,
      disabled,
      overallStatus
    };
  }

  /**
   * Returns the earliest cooldown expiration timestamp in milliseconds, or null if no keys are in cooldown.
   *
   * @returns {number|null}
   */
  getEarliestCooldown() {
    this.refreshCooldowns();
    const cooldownKeys = this.keys.filter(k => k.status === "cooldown" && k.cooldownUntil);
    if (cooldownKeys.length === 0) return null;
    return Math.min(...cooldownKeys.map(k => k.cooldownUntil));
  }

  /**
   * Resets health metrics and active statuses for all keys.
   */
  resetHealth() {
    for (const k of this.keys) {
      k.status = "active";
      k.cooldownUntil = null;
      k.inFlight = 0;
      k.consecutiveErrors = 0;
      k.lastError = null;
    }
    this.rrIndex = 0;
  }

  /**
   * Alias for resetHealth()
   */
  resetAllCooldowns() {
    this.resetHealth();
  }

  /**
   * Selects the next healthy key according to the active routing algorithm.
   *
   * @param {Set<string>} [excludedKeys=new Set()] - Set of raw API keys to exclude from this selection
   * @returns {Object} Key record
   */
  selectKey(excludedKeys = new Set()) {
    this.refreshCooldowns();

    if (this.keys.length === 0) {
      throw new Error("No Google Gemini API keys configured. Please configure your API keys in Settings.");
    }

    const available = this.keys.filter(k => k.status === "active" && !excludedKeys.has(k.key));

    if (available.length === 0) {
      const cooldownKeys = this.keys.filter(k => k.status === "cooldown" && k.cooldownUntil);
      if (cooldownKeys.length > 0) {
        const earliestTimestamp = Math.min(...cooldownKeys.map(k => k.cooldownUntil));
        const remainingMs = Math.max(0, earliestTimestamp - Date.now());
        throw new AllKeysExhaustedError(
          `All Google Gemini API keys are currently in cooldown or exhausted. Earliest recovery in ${Math.ceil(remainingMs / 1000)}s.`,
          remainingMs
        );
      }

      const allDisabled = this.keys.every(k => k.status === "disabled");
      if (allDisabled) {
        throw new Error("All configured Google Gemini API keys are disabled due to invalid credentials. Please check your keys in Settings.");
      }

      throw new Error("No healthy Google Gemini API keys available.");
    }

    // 1. Round-Robin
    if (this.strategy === ROUTING_STRATEGIES.ROUND_ROBIN) {
      const total = this.keys.length;
      let chosen = null;

      for (let step = 0; step < total; step++) {
        const idx = (this.rrIndex + step) % total;
        const candidate = this.keys[idx];
        if (available.some(k => k.key === candidate.key)) {
          chosen = candidate;
          this.rrIndex = (idx + 1) % total;
          break;
        }
      }

      if (!chosen) {
        chosen = available[0];
        this.rrIndex = (chosen.index + 1) % total;
      }
      return chosen;
    }

    // 2. Least-Busy / Least-Used
    if (this.strategy === ROUTING_STRATEGIES.LEAST_BUSY) {
      const sorted = [...available].sort((a, b) => {
        // Criterion 1: Lowest in-flight concurrent load
        if (a.inFlight !== b.inFlight) {
          return a.inFlight - b.inFlight;
        }
        // Criterion 2: Lowest cumulative total requests
        if (a.totalRequests !== b.totalRequests) {
          return a.totalRequests - b.totalRequests;
        }
        // Criterion 3: Least recently used
        const lastUsedA = a.lastUsed || 0;
        const lastUsedB = b.lastUsed || 0;
        if (lastUsedA !== lastUsedB) {
          return lastUsedA - lastUsedB;
        }
        // Criterion 4: Pool order stability
        return a.index - b.index;
      });
      return sorted[0];
    }

    // 3. Rate-Limit Fallback
    // Prefers primary key (index 0). Only falls back if earlier keys are excluded or in cooldown.
    const sortedByPrimary = [...available].sort((a, b) => a.index - b.index);
    return sortedByPrimary[0];
  }

  /**
   * Executes a single direct HTTP POST request to the Google Gemini REST API v1beta.
   *
   * @param {Object} params
   * @param {string} params.apiKey
   * @param {string} [params.model]
   * @param {string} params.prompt
   * @param {Object} [params.generationConfig]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ text: string, usage: Object, modelVersion: string, raw: Object }>}
   */
  async callGeminiDirect({ apiKey, model, prompt, generationConfig, signal }) {
    if (!apiKey) {
      throw new Error("Missing Google Gemini API key.");
    }
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt must be a non-empty string.");
    }

    const cleanModel = (model || this.model || "gemini-2.5-flash").trim().replace(/^models\//, "");
    const cleanBase = (this.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const url = `${cleanBase}/models/${cleanModel}:generateContent`;

    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ];

    const payload = { contents };

    // Configure sampling parameters: Google Gemini 3+ deprecates temperature, top_p, and top_k.
    if (generationConfig && typeof generationConfig === "object") {
      payload.generationConfig = generationConfig;
    } else if (!/gemini-3/i.test(cleanModel)) {
      payload.generationConfig = { temperature: 0.3 };
    }

    const fetchFn = this.fetchFn || (typeof globalThis !== "undefined" ? globalThis.fetch : null);
    if (!fetchFn) {
      throw new Error("No fetch implementation available.");
    }

    let response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(payload),
        signal
      });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      const netErr = new Error(`Could not connect to Gemini API at ${url} (${err.message})`);
      netErr.originalError = err;
      throw netErr;
    }

    if (!response.ok) {
      let errJson = null;
      let errText = "";
      try {
        errJson = await response.json();
      } catch {
        try {
          errText = await response.text();
        } catch {
          errText = "";
        }
      }

      const apiStatus = errJson?.error?.status || "";
      const apiMessage = errJson?.error?.message || errText || response.statusText;
      const error = new Error(`Gemini API Error (${response.status} ${response.statusText}): ${apiMessage}`);
      error.status = response.status;
      error.statusCode = response.status;
      error.apiStatus = apiStatus;
      error.apiMessage = apiMessage;
      error.errorDetails = errJson?.error?.details || [];
      throw error;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      if (data?.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked prompt: ${data.promptFeedback.blockReason}`);
      }
      throw new Error("Gemini returned empty response content.");
    }

    return {
      text,
      usage: data?.usageMetadata || {},
      modelVersion: data?.modelVersion || cleanModel,
      raw: data
    };
  }

  /**
   * Dispatches a generation request across the key pool with automated failover,
   * rate-limit cooldown handling, and retry budget enforcement.
   *
   * @param {Object} params
   * @param {string} [params.model]
   * @param {string} params.prompt
   * @param {Object} [params.generationConfig]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ text: string, usage: Object, keyUsed: string, modelUsed: string }>}
   */
  async generateContent({ model, prompt, generationConfig, signal }) {
    const targetModel = (model || this.model || "gemini-2.5-flash").trim().replace(/^models\//, "");
    const maxRetries = typeof this.maxRetries === "number" ? Math.max(0, this.maxRetries) : 3;
    const excludedKeys = new Set();

    let attempts = 0;
    let lastError = null;

    while (attempts <= maxRetries) {
      if (signal?.aborted) {
        throw new DOMException("Generation cancelled by user", "AbortError");
      }

      let selected;
      try {
        selected = this.selectKey(excludedKeys);
      } catch (selectErr) {
        if (lastError && excludedKeys.size > 0) {
          const combined = new Error(`${selectErr.message} (Last error: ${lastError.message})`);
          combined.lastError = lastError;
          combined.earliestCooldownMs = selectErr.earliestCooldownMs;
          combined.earliestRecoverySeconds = selectErr.earliestRecoverySeconds;
          throw combined;
        }
        throw selectErr;
      }

      selected.inFlight++;
      const startTime = performance.now();

      try {
        const res = await this.callGeminiDirect({
          apiKey: selected.key,
          model: targetModel,
          prompt,
          generationConfig,
          signal
        });

        selected.inFlight = Math.max(0, selected.inFlight - 1);
        selected.totalRequests++;
        selected.successRequests++;
        selected.consecutiveErrors = 0;
        selected.lastUsed = Date.now();
        selected.lastLatencyMs = Math.round(performance.now() - startTime);
        selected.lastError = null;

        return {
          text: res.text,
          usage: res.usage,
          keyUsed: selected.masked,
          modelUsed: targetModel
        };
      } catch (err) {
        selected.inFlight = Math.max(0, selected.inFlight - 1);
        selected.totalRequests++;
        selected.failedRequests++;
        selected.consecutiveErrors++;
        selected.lastError = err.message;
        lastError = err;

        if (err.name === "AbortError") {
          throw err;
        }

        attempts++;

        const statusCode = err.status || err.statusCode;
        const statusString = `${err.apiStatus || ""} ${err.message || ""}`;

        const isRateLimit = statusCode === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(statusString);
        const isServerError = (statusCode >= 500 && statusCode < 600) || /UNAVAILABLE|overloaded/i.test(statusString);
        const isInvalidKey = statusCode === 401 || statusCode === 403 ||
          (statusCode === 400 && /INVALID_ARGUMENT|API_KEY|key not valid|PERMISSION_DENIED/i.test(statusString));

        if (isRateLimit || isServerError) {
          selected.status = "cooldown";
          selected.cooldownUntil = Date.now() + (this.cooldownSeconds * 1000);
          excludedKeys.add(selected.key);
        } else if (isInvalidKey) {
          selected.status = "disabled";
          excludedKeys.add(selected.key);
        } else {
          excludedKeys.add(selected.key);
        }

        if (attempts > maxRetries) {
          throw new Error(`Gemini request failed after ${maxRetries} retries: ${err.message}`);
        }
      }
    }

    throw lastError || new Error("Gemini generation failed: maximum retries reached.");
  }

  /**
   * Convenience execution method returning raw text response (matching callLlmChat string contract).
   *
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.model]
   * @param {Object} [params.generationConfig]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<string>}
   */
  async execute({ prompt, model, generationConfig, signal }) {
    const result = await this.generateContent({ prompt, model, generationConfig, signal });
    return result.text;
  }

  /**
   * Tests connectivity and latency for a single API key using a minimal ping prompt.
   *
   * @param {string} key
   * @param {string} [model]
   * @returns {Promise<{ healthy: boolean, latencyMs: number, model: string, error?: string, text?: string }>}
   */
  async testKey(key, model) {
    const targetModel = (model || this.model || "gemini-2.5-flash").trim().replace(/^models\//, "");
    const start = performance.now();
    try {
      const res = await this.callGeminiDirect({
        apiKey: key,
        model: targetModel,
        prompt: "Reply with the single word 'OK'."
      });
      const latencyMs = Math.round(performance.now() - start);
      return {
        healthy: true,
        latencyMs,
        model: targetModel,
        text: res.text
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        healthy: false,
        latencyMs,
        model: targetModel,
        error: err.message
      };
    }
  }

  /**
   * Tests connectivity for all keys configured in the pool and returns individual and overall results.
   *
   * @param {string} [model]
   * @returns {Promise<{ total: number, healthy: number, status: string, results: Array<{ id: string, keyMask: string, healthy: boolean, latencyMs: number, error?: string }> }>}
   */
  async testPool(model) {
    const targetModel = (model || this.model || "gemini-2.5-flash").trim().replace(/^models\//, "");
    if (!this.keys || this.keys.length === 0) {
      return {
        total: 0,
        healthy: 0,
        status: "failed",
        results: []
      };
    }

    const results = await Promise.all(
      this.keys.map(async (keyRecord) => {
        const res = await this.testKey(keyRecord.key, targetModel);
        if (res.healthy) {
          keyRecord.status = "active";
          keyRecord.lastLatencyMs = res.latencyMs;
          keyRecord.lastError = null;
        } else {
          keyRecord.lastError = res.error;
          if (/INVALID_ARGUMENT|API_KEY|key not valid|PERMISSION_DENIED/i.test(res.error)) {
            keyRecord.status = "disabled";
          }
        }
        return {
          id: keyRecord.id,
          keyMask: keyRecord.masked,
          healthy: res.healthy,
          latencyMs: res.latencyMs,
          error: res.error
        };
      })
    );

    const healthyCount = results.filter(r => r.healthy).length;
    let status = "healthy";
    if (healthyCount === 0) {
      status = "failed";
    } else if (healthyCount < results.length) {
      status = "degraded";
    }

    return {
      total: results.length,
      healthy: healthyCount,
      status,
      results
    };
  }
}
