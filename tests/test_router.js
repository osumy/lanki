/**
 * Automated Verification Suite for Direct Google Gemini Multi-Key Router
 * tests/test_router.js
 *
 * Covers 15 test scenarios:
 * 1. Key parsing (parseGeminiKeys) and masking (maskApiKey)
 * 2. Round-Robin key selection sequence (fair cyclic rotation)
 * 3. Round-Robin skipping keys in active cooldown
 * 4. Least-Busy concurrency load distribution under simulated concurrent calls
 * 5. Least-Busy tie-breaking on total requests
 * 6. Rate-Limit Fallback primary key preference
 * 7. HTTP 429 (RESOURCE_EXHAUSTED) error handling: cooldown trigger, failover, and strict maxRetries bounds
 * 8. Key recovery after cooldown expiration (simulating time advancement)
 * 9. Temporary 5xx / 503 error failover
 * 10. Permanent error 400/401/403 disabling of invalid keys
 * 11. All-keys-exhausted error with retry-after diagnostics
 * 12. AbortSignal cancellation mid-flight without inFlight leaks
 * 13. Connectivity testing (testKey and testPool) health diagnostics
 * 14. Dynamic updateConfig (adding/removing keys while preserving telemetry)
 * 15. Generator integration (callLlmWithSettings / generateAnkiDeck with Gemini mode)
 */

import assert from "node:assert";
import {
  GeminiRouter,
  ROUTING_STRATEGIES,
  DEFAULT_GEMINI_MODELS,
  parseGeminiKeys,
  maskApiKey,
  AllKeysExhaustedError
} from "../src/router.js";
import {
  callLlmWithSettings,
  createGeminiRouterFromSettings,
  generateAnkiDeck,
  testApiConnection
} from "../src/generator.js";
import { DEFAULT_SETTINGS } from "../src/defaults.js";

// --- Mock Response Helpers ---

function mockResponse(body, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

function geminiSuccessBody(text = "Mock response", usage = { promptTokenCount: 10, candidatesTokenCount: 20 }) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }]
        },
        finishReason: "STOP",
        index: 0
      }
    ],
    usageMetadata: usage,
    modelVersion: "gemini-2.5-flash"
  };
}

function geminiErrorBody(status, message, statusText = null) {
  let rpcStatus = statusText;
  if (!rpcStatus) {
    if (status === 429) rpcStatus = "RESOURCE_EXHAUSTED";
    else if (status === 400) rpcStatus = "INVALID_ARGUMENT";
    else if (status === 401) rpcStatus = "UNAUTHENTICATED";
    else if (status === 403) rpcStatus = "PERMISSION_DENIED";
    else if (status === 503) rpcStatus = "UNAVAILABLE";
    else rpcStatus = "ERROR";
  }
  return {
    error: {
      code: status,
      message,
      status: rpcStatus
    }
  };
}

// --- Test Harness ---

let totalPassed = 0;
let totalFailed = 0;

async function testScenario(scenarioNumber, scenarioName, testFn) {
  try {
    console.log(`\nScenario ${scenarioNumber}: ${scenarioName}`);
    await testFn();
    totalPassed++;
    console.log(`✓ Scenario ${scenarioNumber} PASSED: ${scenarioName}`);
  } catch (err) {
    totalFailed++;
    console.error(`✗ Scenario ${scenarioNumber} FAILED: ${scenarioName}`);
    console.error(err);
    throw err;
  }
}

console.log("==================================================================");
console.log("   LANKI DIRECT GEMINI MULTI-KEY ROUTER TEST SUITE               ");
console.log("==================================================================");

// ============================================================================
// 1. Key parsing (parseGeminiKeys) and masking (maskApiKey)
// ============================================================================
await testScenario(1, "Key parsing (parseGeminiKeys) and masking (maskApiKey)", async () => {
  // Comma, semicolon, newline, whitespace, duplicate strings
  const parsed1 = parseGeminiKeys("key1, key2; key3\nkey1\r\n  key4  ; key2");
  assert.deepStrictEqual(parsed1, ["key1", "key2", "key3", "key4"], "Should deduplicate and trim tokens");

  // Array input with duplicate and whitespace keys
  const parsed2 = parseGeminiKeys(["  keyA ", "keyB", "keyA", "   ", "keyC"]);
  assert.deepStrictEqual(parsed2, ["keyA", "keyB", "keyC"], "Should clean and deduplicate array keys");

  // Falsy and invalid inputs
  assert.deepStrictEqual(parseGeminiKeys(""), []);
  assert.deepStrictEqual(parseGeminiKeys("   "), []);
  assert.deepStrictEqual(parseGeminiKeys(null), []);
  assert.deepStrictEqual(parseGeminiKeys(undefined), []);
  assert.deepStrictEqual(parseGeminiKeys(12345), []);

  // maskApiKey tests
  assert.strictEqual(maskApiKey("AIzaSyD1234567890AbCd"), "AIzaSy...AbCd");
  assert.strictEqual(maskApiKey("12345678"), "12****78");
  assert.strictEqual(maskApiKey("123456"), "12****56");
  assert.strictEqual(maskApiKey("12"), "12****");
  assert.strictEqual(maskApiKey(""), "");
  assert.strictEqual(maskApiKey(null), "");
  assert.strictEqual(maskApiKey(undefined), "");
});

// ============================================================================
// 2. Round-Robin key selection sequence (fair cyclic rotation)
// ============================================================================
await testScenario(2, "Round-Robin key selection sequence (fair cyclic rotation)", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2", "K3"],
    strategy: "round-robin"
  });

  const sequence = [];
  for (let i = 0; i < 9; i++) {
    sequence.push(router.selectKey().key);
  }
  assert.deepStrictEqual(
    sequence,
    ["K1", "K2", "K3", "K1", "K2", "K3", "K1", "K2", "K3"],
    "Should cycle evenly across all 3 keys across 3 complete cycles"
  );
});

// ============================================================================
// 3. Round-Robin skipping keys in active cooldown
// ============================================================================
await testScenario(3, "Round-Robin skipping keys in active cooldown", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2", "K3"],
    strategy: "round-robin"
  });

  // Mark K2 in active cooldown
  router.keys[1].status = "cooldown";
  router.keys[1].cooldownUntil = Date.now() + 60000;

  const sequence = [];
  for (let i = 0; i < 6; i++) {
    sequence.push(router.selectKey().key);
  }
  assert.deepStrictEqual(
    sequence,
    ["K1", "K3", "K1", "K3", "K1", "K3"],
    "Round-robin must skip K2 while it is in active cooldown"
  );

  // Now also mark K1 in active cooldown
  router.keys[0].status = "cooldown";
  router.keys[0].cooldownUntil = Date.now() + 60000;

  const seq2 = [];
  for (let i = 0; i < 3; i++) {
    seq2.push(router.selectKey().key);
  }
  assert.deepStrictEqual(seq2, ["K3", "K3", "K3"], "Only K3 should be selected when K1 and K2 are in cooldown");
});

// ============================================================================
// 4. Least-Busy concurrency load distribution under simulated concurrent calls
// ============================================================================
await testScenario(4, "Least-Busy concurrency load distribution under simulated concurrent calls", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2", "K3"],
    strategy: "least-busy"
  });

  // Test Criterion 1: inFlight count priority
  router.keys[0].inFlight = 2;
  router.keys[1].inFlight = 1;
  router.keys[2].inFlight = 0;
  assert.strictEqual(router.selectKey().key, "K3", "Should pick K3 which has 0 in-flight requests");

  router.keys[2].inFlight = 2;
  assert.strictEqual(router.selectKey().key, "K2", "Should pick K2 which has 1 in-flight request");

  // Reset inFlight and totalRequests
  router.keys.forEach(k => { k.inFlight = 0; k.totalRequests = 0; });

  // Test simulated concurrent live calls with mock fetch barrier
  let resolveCalls;
  const barrier = new Promise(resolve => { resolveCalls = resolve; });

  const concurrentFetch = async (url, options) => {
    await barrier;
    return mockResponse(geminiSuccessBody("ok"));
  };

  router.updateConfig({ fetchFn: concurrentFetch });

  // Launch 3 concurrent calls
  const p1 = router.generateContent({ prompt: "p1" });
  const p2 = router.generateContent({ prompt: "p2" });
  const p3 = router.generateContent({ prompt: "p3" });

  // Verify that during flight, each key was allocated 1 inFlight
  assert.strictEqual(router.keys[0].inFlight, 1, "K1 should have 1 inFlight");
  assert.strictEqual(router.keys[1].inFlight, 1, "K2 should have 1 inFlight");
  assert.strictEqual(router.keys[2].inFlight, 1, "K3 should have 1 inFlight");

  // Release the barrier
  resolveCalls();
  const results = await Promise.all([p1, p2, p3]);
  assert.strictEqual(results.length, 3);
  assert.strictEqual(router.keys[0].inFlight, 0, "K1 inFlight should return to 0");
  assert.strictEqual(router.keys[1].inFlight, 0, "K2 inFlight should return to 0");
  assert.strictEqual(router.keys[2].inFlight, 0, "K3 inFlight should return to 0");
});

// ============================================================================
// 5. Least-Busy tie-breaking on total requests
// ============================================================================
await testScenario(5, "Least-Busy tie-breaking on total requests", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2", "K3"],
    strategy: "least-busy"
  });

  router.keys[0].inFlight = 0;
  router.keys[0].totalRequests = 20;

  router.keys[1].inFlight = 0;
  router.keys[1].totalRequests = 5;

  router.keys[2].inFlight = 0;
  router.keys[2].totalRequests = 12;

  assert.strictEqual(router.selectKey().key, "K2", "Should pick K2 with lowest totalRequests");

  // Tie-breaker: K2 and K3 both have 12 totalRequests, but K3 has older lastUsed
  router.keys[1].totalRequests = 12;
  router.keys[1].lastUsed = Date.now() - 1000;
  router.keys[2].lastUsed = Date.now() - 5000; // K3 was used less recently
  assert.strictEqual(router.selectKey().key, "K3", "Should tie-break in favor of least recently used key");
});

// ============================================================================
// 6. Rate-Limit Fallback primary key preference
// ============================================================================
await testScenario(6, "Rate-Limit Fallback primary key preference", async () => {
  const router = new GeminiRouter({
    keys: ["K_PRIMARY", "K_BACKUP1", "K_BACKUP2"],
    strategy: "rate-limit-fallback"
  });

  // Always selects index 0 as long as healthy
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(router.selectKey().key, "K_PRIMARY", "Primary key must be selected repeatedly");
  }

  // Put primary in cooldown
  router.keys[0].status = "cooldown";
  router.keys[0].cooldownUntil = Date.now() + 60000;

  // Now consistently selects K_BACKUP1
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(router.selectKey().key, "K_BACKUP1", "Fallback to first healthy backup");
  }

  // Put backup1 in cooldown
  router.keys[1].status = "cooldown";
  router.keys[1].cooldownUntil = Date.now() + 60000;

  assert.strictEqual(router.selectKey().key, "K_BACKUP2", "Fallback to second healthy backup");
});

// ============================================================================
// 7. HTTP 429 (RESOURCE_EXHAUSTED) error handling: cooldown, failover, maxRetries
// ============================================================================
await testScenario(7, "HTTP 429 (RESOURCE_EXHAUSTED) error handling: cooldown trigger, failover, and strict maxRetries bounds", async () => {
  const callLog = [];
  const mockFetch429 = async (url, options) => {
    const key = options.headers["x-goog-api-key"];
    callLog.push(key);
    if (key === "K1") {
      return mockResponse(
        geminiErrorBody(429, "Quota exceeded for quota metric 'Queries per minute'", "RESOURCE_EXHAUSTED"),
        429,
        "Too Many Requests"
      );
    }
    return mockResponse(geminiSuccessBody("success from K2"));
  };

  const router = new GeminiRouter({
    keys: ["K1", "K2"],
    strategy: "rate-limit-fallback",
    cooldownSeconds: 45,
    maxRetries: 2,
    fetchFn: mockFetch429
  });

  const res = await router.generateContent({ prompt: "Hello 429" });
  assert.strictEqual(res.text, "success from K2");
  assert.deepStrictEqual(callLog, ["K1", "K2"]);
  assert.strictEqual(router.keys[0].status, "cooldown");
  assert(router.keys[0].cooldownUntil > Date.now());
  assert.strictEqual(router.keys[1].status, "active");
  assert.strictEqual(router.keys[1].successRequests, 1);

  // Subsequent call should go directly to K2 without re-trying K1
  const nextKey = router.selectKey();
  assert.strictEqual(nextKey.key, "K2");

  // Part B: Strict maxRetries bounds
  const attemptLog = [];
  const mockFetchAll429 = async (url, options) => {
    const key = options.headers["x-goog-api-key"];
    attemptLog.push(key);
    return mockResponse(geminiErrorBody(429, "Rate limited"), 429, "Too Many Requests");
  };

  const retryRouter = new GeminiRouter({
    keys: ["A", "B", "C", "D"],
    strategy: "round-robin",
    maxRetries: 1, // 1 retry means at most 2 attempts (initial + 1 retry)
    fetchFn: mockFetchAll429
  });

  await assert.rejects(
    async () => {
      await retryRouter.generateContent({ prompt: "exhaust retries" });
    },
    /failed after 1 retries/i,
    "Should reject when maxRetries exceeded"
  );

  assert.strictEqual(attemptLog.length, 2, "maxRetries=1 must strictly limit attempts to 2");
  assert.strictEqual(attemptLog[0], "A");
  assert.strictEqual(attemptLog[1], "B");
  assert.strictEqual(retryRouter.keys[2].status, "active", "Key C should not have been attempted");
  assert.strictEqual(retryRouter.keys[3].status, "active", "Key D should not have been attempted");
});

// ============================================================================
// 8. Key recovery after cooldown expiration (simulating time advancement)
// ============================================================================
await testScenario(8, "Key recovery after cooldown expiration (simulating time advancement)", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2"],
    strategy: "rate-limit-fallback",
    cooldownSeconds: 60
  });

  // Part A: Simulated timestamp advancement via refreshCooldowns(now)
  const baseTime = 1000000;
  router.keys[0].status = "cooldown";
  router.keys[0].cooldownUntil = baseTime + 5000;

  // Check before expiry
  router.refreshCooldowns(baseTime + 4999);
  assert.strictEqual(router.keys[0].status, "cooldown", "Key must remain in cooldown before timestamp");

  // Check at and after expiry
  router.refreshCooldowns(baseTime + 5000);
  assert.strictEqual(router.keys[0].status, "active", "Key must transition to active upon reaching timestamp");
  assert.strictEqual(router.keys[0].cooldownUntil, null, "cooldownUntil must be cleared");

  // Part B: Elapsed real-time recovery
  const timedRouter = new GeminiRouter({
    keys: ["K1", "K2"],
    strategy: "rate-limit-fallback",
    cooldownSeconds: 0.04 // 40ms cooldown
  });
  timedRouter.keys[0].status = "cooldown";
  timedRouter.keys[0].cooldownUntil = Date.now() + 30;

  assert.strictEqual(timedRouter.selectKey().key, "K2", "Should select K2 while K1 is in cooldown");

  // Wait 45ms for K1 to recover
  await new Promise(r => setTimeout(r, 45));
  assert.strictEqual(timedRouter.selectKey().key, "K1", "Should select recovered K1 after expiration");
  assert.strictEqual(timedRouter.keys[0].status, "active");
});

// ============================================================================
// 9. Temporary 5xx / 503 error failover
// ============================================================================
await testScenario(9, "Temporary 5xx / 503 error failover", async () => {
  const mockFetch503 = async (url, options) => {
    const key = options.headers["x-goog-api-key"];
    if (key === "K1") {
      return mockResponse(
        geminiErrorBody(503, "The model is overloaded. Please try again later.", "UNAVAILABLE"),
        503,
        "Service Unavailable"
      );
    }
    return mockResponse(geminiSuccessBody("recovered from 503"));
  };

  const router = new GeminiRouter({
    keys: ["K1", "K2"],
    strategy: "round-robin",
    cooldownSeconds: 30,
    fetchFn: mockFetch503
  });

  const res = await router.generateContent({ prompt: "test 503" });
  assert.strictEqual(res.text, "recovered from 503");
  assert.strictEqual(router.keys[0].status, "cooldown", "503 must place failing key into cooldown");
  assert.strictEqual(router.keys[0].failedRequests, 1);
  assert.strictEqual(router.keys[1].successRequests, 1);
});

// ============================================================================
// 10. Permanent error 400/401/403 disabling of invalid keys
// ============================================================================
await testScenario(10, "Permanent error 400/401/403 disabling of invalid keys", async () => {
  const mockFetchInvalid = async (url, options) => {
    const key = options.headers["x-goog-api-key"];
    if (key === "KEY_BAD_400") {
      return mockResponse(
        geminiErrorBody(400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT"),
        400,
        "Bad Request"
      );
    }
    if (key === "KEY_BAD_403") {
      return mockResponse(
        geminiErrorBody(403, "Method doesn't allow unregistered callers.", "PERMISSION_DENIED"),
        403,
        "Forbidden"
      );
    }
    return mockResponse(geminiSuccessBody("valid key output"));
  };

  const router = new GeminiRouter({
    keys: ["KEY_BAD_400", "KEY_BAD_403", "KEY_VALID"],
    strategy: "rate-limit-fallback",
    maxRetries: 3,
    fetchFn: mockFetchInvalid
  });

  const res = await router.generateContent({ prompt: "test invalid keys" });
  assert.strictEqual(res.text, "valid key output");

  assert.strictEqual(router.keys[0].status, "disabled", "400 INVALID_ARGUMENT must disable key");
  assert.strictEqual(router.keys[1].status, "disabled", "403 PERMISSION_DENIED must disable key");
  assert.strictEqual(router.keys[2].status, "active", "Valid key remains active");

  // Advance time drastically: disabled keys must NEVER recover
  router.refreshCooldowns(Date.now() + 1000000000);
  assert.strictEqual(router.keys[0].status, "disabled");
  assert.strictEqual(router.keys[1].status, "disabled");

  // selectKey only picks KEY_VALID
  assert.strictEqual(router.selectKey().key, "KEY_VALID");
});

// ============================================================================
// 11. All-keys-exhausted error with retry-after diagnostics
// ============================================================================
await testScenario(11, "All-keys-exhausted error with retry-after diagnostics", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2"],
    cooldownSeconds: 60
  });

  const now = Date.now();
  router.keys[0].status = "cooldown";
  router.keys[0].cooldownUntil = now + 12000; // 12 seconds
  router.keys[1].status = "cooldown";
  router.keys[1].cooldownUntil = now + 24000; // 24 seconds

  assert.throws(
    () => {
      router.selectKey();
    },
    (err) => {
      const isInstance = err instanceof AllKeysExhaustedError;
      const hasEarliest = err.earliestRecoverySeconds === 12;
      const hasMessage = /All Google Gemini API keys are currently in cooldown or exhausted/i.test(err.message) &&
                         /Earliest recovery in 12s/i.test(err.message);
      return isInstance && hasEarliest && hasMessage;
    },
    "Should throw AllKeysExhaustedError with recovery diagnostics"
  );

  // When all keys are disabled
  router.keys[0].status = "disabled";
  router.keys[1].status = "disabled";
  assert.throws(
    () => {
      router.selectKey();
    },
    /All configured Google Gemini API keys are disabled due to invalid credentials/i,
    "Should indicate all keys disabled"
  );
});

// ============================================================================
// 12. AbortSignal cancellation mid-flight without inFlight leaks
// ============================================================================
await testScenario(12, "AbortSignal cancellation mid-flight without inFlight leaks", async () => {
  const mockAbortFetch = (url, options) => {
    return new Promise((resolve, reject) => {
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          const abortErr = new Error("This operation was aborted");
          abortErr.name = "AbortError";
          reject(abortErr);
        });
      }
    });
  };

  const router = new GeminiRouter({
    keys: ["K1"],
    fetchFn: mockAbortFetch
  });

  const controller = new AbortController();
  const promise = router.generateContent({ prompt: "cancel me", signal: controller.signal });

  // Verify inFlight is 1 while request is pending
  assert.strictEqual(router.keys[0].inFlight, 1, "inFlight should be 1 during request");

  // Trigger abort
  controller.abort();

  await assert.rejects(
    promise,
    (err) => err.name === "AbortError",
    "Should reject with AbortError"
  );

  // CRITICAL CHECK: inFlight must be 0 after abort!
  assert.strictEqual(router.keys[0].inFlight, 0, "inFlight count must be decremented to 0 after abort");

  // Pre-aborted signal check
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    async () => {
      await router.generateContent({ prompt: "pre-aborted", signal: preAborted.signal });
    },
    (err) => err.name === "AbortError"
  );
  assert.strictEqual(router.keys[0].inFlight, 0, "inFlight count must remain 0 on pre-aborted call");
});

// ============================================================================
// 13. Connectivity testing (testKey and testPool) health diagnostics
// ============================================================================
await testScenario(13, "Connectivity testing (testKey and testPool) health diagnostics", async () => {
  const mockDiagFetch = async (url, options) => {
    const key = options.headers["x-goog-api-key"];
    if (key === "HEALTHY_KEY") {
      return mockResponse(geminiSuccessBody("OK"));
    }
    if (key === "BAD_KEY") {
      return mockResponse(
        geminiErrorBody(400, "API key not valid", "INVALID_ARGUMENT"),
        400,
        "Bad Request"
      );
    }
    return mockResponse(
      geminiErrorBody(503, "Unavailable", "UNAVAILABLE"),
      503,
      "Service Unavailable"
    );
  };

  const router = new GeminiRouter({
    keys: ["HEALTHY_KEY", "BAD_KEY", "UNAVAILABLE_KEY"],
    fetchFn: mockDiagFetch
  });

  // Single key test
  const singleGood = await router.testKey("HEALTHY_KEY");
  assert.strictEqual(singleGood.healthy, true);
  assert(singleGood.latencyMs >= 0);
  assert.strictEqual(singleGood.text, "OK");

  const singleBad = await router.testKey("BAD_KEY");
  assert.strictEqual(singleBad.healthy, false);
  assert(/API key not valid/i.test(singleBad.error));

  // Pool test
  const pool = await router.testPool();
  assert.strictEqual(pool.total, 3);
  assert.strictEqual(pool.healthy, 1);
  assert.strictEqual(pool.status, "degraded");
  assert.strictEqual(pool.results[0].healthy, true);
  assert.strictEqual(pool.results[1].healthy, false);
  assert.strictEqual(pool.results[2].healthy, false);

  // Check that BAD_KEY was set to disabled
  assert.strictEqual(router.keys[1].status, "disabled");

  // All healthy pool
  const allGoodRouter = new GeminiRouter({
    keys: ["HEALTHY_KEY"],
    fetchFn: mockDiagFetch
  });
  const goodPool = await allGoodRouter.testPool();
  assert.strictEqual(goodPool.status, "healthy");

  // Empty pool
  const emptyRouter = new GeminiRouter({ keys: [] });
  const emptyPool = await emptyRouter.testPool();
  assert.strictEqual(emptyPool.status, "failed");
  assert.strictEqual(emptyPool.total, 0);
});

// ============================================================================
// 14. Dynamic updateConfig (adding/removing keys while preserving telemetry)
// ============================================================================
await testScenario(14, "Dynamic updateConfig (adding/removing keys while preserving telemetry)", async () => {
  const router = new GeminiRouter({
    keys: ["K1", "K2"],
    strategy: "round-robin",
    cooldownSeconds: 60
  });

  // Set telemetry on existing keys
  router.keys[0].totalRequests = 10;
  router.keys[0].successRequests = 9;
  router.keys[0].failedRequests = 1;

  router.keys[1].totalRequests = 5;
  router.keys[1].successRequests = 5;
  router.keys[1].failedRequests = 0;

  // Add K3
  router.updateConfig({ keys: ["K1", "K2", "K3"] });
  assert.strictEqual(router.keys.length, 3);
  assert.strictEqual(router.keys[0].totalRequests, 10, "K1 telemetry preserved");
  assert.strictEqual(router.keys[1].totalRequests, 5, "K2 telemetry preserved");
  assert.strictEqual(router.keys[2].totalRequests, 0, "K3 initialized fresh");
  assert.strictEqual(router.keys[2].key, "K3");

  // Remove K2 and K3, set rrIndex to out-of-bounds
  router.rrIndex = 2;
  router.updateConfig({ keys: ["K1"] });
  assert.strictEqual(router.keys.length, 1);
  assert.strictEqual(router.keys[0].key, "K1");
  assert.strictEqual(router.keys[0].totalRequests, 10);
  assert.strictEqual(router.rrIndex, 0, "rrIndex must reset to 0 if out of bounds");

  // Update strategy and parameters
  router.updateConfig({
    strategy: "rate-limit-fallback",
    cooldownSeconds: 30,
    maxRetries: 5,
    model: "gemini-3.8-flash"
  });
  assert.strictEqual(router.strategy, "rate-limit-fallback");
  assert.strictEqual(router.cooldownSeconds, 30);
  assert.strictEqual(router.maxRetries, 5);
  assert.strictEqual(router.model, "gemini-3.8-flash");

  // Edge cases: null, undefined, invalid types
  router.updateConfig(null);
  router.updateConfig(undefined);
  router.updateConfig("not an object");
  router.updateConfig({ strategy: "invalid-strategy" });
  router.updateConfig({ cooldownSeconds: -50 });
  router.updateConfig({ maxRetries: -1 });

  assert.strictEqual(router.strategy, "rate-limit-fallback", "Strategy unchanged by invalid input");
  assert.strictEqual(router.cooldownSeconds, 30, "cooldownSeconds unchanged by negative value");
  assert.strictEqual(router.maxRetries, 5, "maxRetries unchanged by negative value");
  assert.strictEqual(router.keys.length, 1, "Keys pool preserved");
});

// ============================================================================
// 15. Generator integration (callLlmWithSettings / generateAnkiDeck with Gemini mode)
// ============================================================================
await testScenario(15, "Generator integration (callLlmWithSettings / generateAnkiDeck with Gemini mode)", async () => {
  const sampleTsv = `#separator:tab\n#html:true\n#columns:Word\tDefinition\napple\tA sweet red fruit\nbanana\tA long yellow fruit`;

  const mockGenFetch = async (url, options) => {
    return mockResponse(geminiSuccessBody(sampleTsv));
  };

  const customRouter = new GeminiRouter({
    keys: ["MOCK_GEMINI_KEY"],
    fetchFn: mockGenFetch
  });

  const geminiSettings = {
    ...DEFAULT_SETTINGS,
    llmProvider: "gemini",
    geminiApiKeys: ["MOCK_GEMINI_KEY"],
    geminiModel: "gemini-2.5-flash",
    promptTemplate: "Generate flashcards for:\n{LIST}",
    chunkSize: 10
  };

  // 15.1: Test createGeminiRouterFromSettings
  const createdRouter = createGeminiRouterFromSettings(geminiSettings);
  assert.strictEqual(createdRouter.keys.length, 1);
  assert.strictEqual(createdRouter.keys[0].key, "MOCK_GEMINI_KEY");
  assert.strictEqual(createdRouter.model, "gemini-2.5-flash");

  // 15.2: Test callLlmWithSettings
  const outputText = await callLlmWithSettings({
    prompt: "Generate words",
    settings: geminiSettings,
    routerInstance: customRouter
  });
  assert(outputText.includes("apple\tA sweet red fruit"), "Output must contain TSV rows");

  // 15.3: Test generateAnkiDeck with progress callbacks
  const progressEvents = [];
  const deck = await generateAnkiDeck({
    words: ["apple", "banana"],
    settings: geminiSettings,
    routerInstance: customRouter,
    onProgress: (ev) => progressEvents.push(ev.status)
  });

  assert.strictEqual(deck.rowCount, 2, "Deck should have 2 rows");
  assert.strictEqual(deck.errors.length, 0, "Deck generation should have 0 errors");
  assert(deck.tsvContent.includes("#separator:tab"), "Deck TSV must contain header");
  assert(deck.tsvContent.includes("banana\tA long yellow fruit"), "Deck TSV must contain banana");
  assert(progressEvents.includes("processing") && progressEvents.includes("chunk_finished"), "Progress events fired");

  // 15.4: Test testApiConnection with Gemini mode
  const testConnResult = await testApiConnection(geminiSettings, customRouter);
  assert(/OK \(1\/1 keys healthy\)/.test(testConnResult), "testApiConnection should report healthy pool");

  // 15.5: Test fallback when llmProvider is custom (OpenAI proxy format)
  const mockCustomProxyFetch = async (url, options) => {
    return mockResponse({
      choices: [{ message: { content: sampleTsv } }]
    });
  };

  // Temporarily stub global fetch for legacy callLlmChat test
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = mockCustomProxyFetch;
    const legacySettings = {
      ...DEFAULT_SETTINGS,
      llmProvider: "custom",
      apiBaseUrl: "http://localhost:4000/v1",
      apiKey: "sk-legacy-test",
      model: "gpt-4o-mini",
      promptTemplate: "Generate:\n{LIST}"
    };
    const legacyOutput = await callLlmWithSettings({
      prompt: "Legacy prompt",
      settings: legacySettings
    });
    assert(legacyOutput.includes("apple\tA sweet red fruit"), "Legacy custom mode should succeed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("\n=======================================================");
console.log(`Results: ${totalPassed} / 15 Scenarios Passed, ${totalFailed} Failed`);
console.log("=======================================================\n");

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log("All 15 Gemini Direct Router Test Scenarios Passed Successfully!");
  process.exit(0);
}
