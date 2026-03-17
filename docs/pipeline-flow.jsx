import { useState, useCallback } from "react";

const COLORS = {
  bg: "#0a0e17",
  panel: "#111827",
  border: "#1e293b",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  happy: "#10b981",
  happyBg: "#10b98118",
  retry: "#f59e0b",
  retryBg: "#f59e0b18",
  fail: "#ef4444",
  failBg: "#ef444418",
  timeout: "#8b5cf6",
  timeoutBg: "#8b5cf618",
  rateLimit: "#3b82f6",
  rateLimitBg: "#3b82f618",
  blocked: "#dc2626",
  blockedBg: "#dc262618",
  info: "#06b6d4",
  infoBg: "#06b6d418",
  gate: "#ec4899",
  gateBg: "#ec489918",
  decision: "#f97316",
};

// ─── Data Model ─────────────────────────────────────────────────────────────

const VIEWS = {
  overview: {
    title: "Pipeline-Übersicht",
    subtitle: "CLI → Pipeline-Loop → Module/Gates → Ergebnis",
  },
  module_forge_buster: {
    title: "Modul: Forge + Buster",
    subtitle: "Standard-Ablauf mit Build und Test (stages: ['forge', 'buster'])",
  },
  module_forge_only: {
    title: "Modul: Nur Forge",
    subtitle: "Nur Build, kein Test (stages: ['forge'])",
  },
  module_buster_only: {
    title: "Modul: Nur Buster",
    subtitle: "Nur Test, kein Build (stages: ['buster'])",
  },
  handle_fail: {
    title: "Fehlerbehandlung (handleFail)",
    subtitle: "Auto-Retry vs. Nova-Eskalation vs. BLOCKED",
  },
  buster_gate: {
    title: "Buster-Gate (mit Fix-Loop)",
    subtitle: "Test → Fail → Forge-Fix → Retest (on_fail: fix_and_retest)",
  },
  review_gate: {
    title: "Review-Gate",
    subtitle: "Lint-Report → Reviewer → GO/NO-GO → Fix-Zyklen",
  },
};

const flowData = {
  overview: [
    { id: "cli", label: "CLI Entrypoint", fn: "CLI Wrapper (Zeile 4831)", type: "entry", x: 400, y: 40 },
    { id: "init", label: "initTempDir()\nregisterShutdownHooks()", fn: "initTempDir, registerShutdownHooks", type: "process", x: 400, y: 110 },
    { id: "config", label: "loadConfig()", fn: "loadConfig → validateConfig", type: "process", x: 400, y: 180 },
    { id: "dispatch", label: "Was wurde angefragt?", fn: "CLI Argument Parsing", type: "decision", x: 400, y: 260 },
    { id: "blueprint", label: "--blueprint\nreleaseBlueprint()", fn: "releaseBlueprint", type: "info", x: 120, y: 340 },
    { id: "status", label: "--status\nprintStatus()", fn: "printStatus", type: "info", x: 260, y: 340 },
    { id: "dryrun", label: "--dry-run\ndryRun()", fn: "dryRun", type: "info", x: 540, y: 340 },
    { id: "help", label: "--help", fn: "process.exit(0)", type: "info", x: 680, y: 340 },
    { id: "pipeline", label: "runPipeline()", fn: "runPipeline", type: "process", x: 400, y: 420 },
    { id: "findnext", label: "findNextStep()", fn: "findNextStep", type: "decision", x: 400, y: 500 },
    { id: "done", label: "✅ PIPELINE COMPLETE\nEXIT_OK (0)", fn: "runPipeline → discord OK", type: "happy", x: 120, y: 600 },
    { id: "blocked_step", label: "🚫 BLOCKED\nEXIT_BLOCKED (20)", fn: "runPipeline", type: "blocked", x: 260, y: 600 },
    { id: "run_module", label: "runModule()", fn: "runModule → executeModuleAttempt", type: "process", x: 450, y: 600 },
    { id: "run_gate", label: "runGate()", fn: "runGate → Dispatcher", type: "gate", x: 620, y: 600 },
    { id: "module_ok", label: "EXIT_OK → Loop", fn: "findNextStep (nächster Step)", type: "happy", x: 400, y: 700 },
    { id: "module_fail", label: "EXIT ≠ OK\nPipeline hält", fn: "discord CRITICAL → output → exit", type: "fail", x: 620, y: 700 },
    { id: "gate_buster", label: "type: buster\nrunBusterGate()", fn: "runBusterGate", type: "gate", x: 560, y: 700 },
    { id: "gate_review", label: "type: review\nrunReviewGate()", fn: "runReviewGate", type: "gate", x: 700, y: 700 },
  ],
  overview_edges: [
    { from: "cli", to: "init", color: COLORS.happy },
    { from: "init", to: "config", color: COLORS.happy },
    { from: "config", to: "dispatch", color: COLORS.happy },
    { from: "dispatch", to: "blueprint", color: COLORS.info, label: "--blueprint" },
    { from: "dispatch", to: "status", color: COLORS.info, label: "--status" },
    { from: "dispatch", to: "dryrun", color: COLORS.info, label: "--dry-run" },
    { from: "dispatch", to: "help", color: COLORS.info, label: "--help" },
    { from: "dispatch", to: "pipeline", color: COLORS.happy, label: "default" },
    { from: "pipeline", to: "findnext", color: COLORS.happy },
    { from: "findnext", to: "done", color: COLORS.happy, label: "done" },
    { from: "findnext", to: "blocked_step", color: COLORS.blocked, label: "blocked" },
    { from: "findnext", to: "run_module", color: COLORS.happy, label: "module" },
    { from: "findnext", to: "run_gate", color: COLORS.gate, label: "gate" },
    { from: "run_module", to: "module_ok", color: COLORS.happy, label: "EXIT_OK" },
    { from: "run_module", to: "module_fail", color: COLORS.fail, label: "EXIT ≠ OK" },
    { from: "module_ok", to: "findnext", color: COLORS.happy, label: "loop", dashed: true },
    { from: "run_gate", to: "gate_buster", color: COLORS.gate, label: "buster" },
    { from: "run_gate", to: "gate_review", color: COLORS.gate, label: "review" },
  ],

  module_forge_buster: [
    { id: "entry", label: "executeModuleAttempt()", fn: "executeModuleAttempt", type: "entry", x: 400, y: 30 },
    { id: "load_status", label: "Status laden/prüfen", fn: "loadStatus → initStatus", type: "process", x: 400, y: 95 },
    { id: "already_pass", label: "✅ Bereits PASS", fn: "return EXIT_OK", type: "happy", x: 130, y: 95 },
    { id: "already_blocked", label: "🚫 Bereits BLOCKED", fn: "return EXIT_BLOCKED", type: "blocked", x: 130, y: 150 },
    { id: "corrupt", label: "❌ status.json korrupt", fn: "return EXIT_ERROR", type: "fail", x: 680, y: 95 },
    { id: "blueprint", label: "releaseBlueprint()\n(wenn PENDING)", fn: "releaseBlueprint → gitCommitAndPush", type: "process", x: 400, y: 160 },
    { id: "bp_fail", label: "Blueprint-Fehler\nEXIT_NEEDS_NOVA", fn: "releaseBlueprint catch", type: "fail", x: 680, y: 160 },
    { id: "forge_start", label: "⚒️ FORGE PHASE\nbuildForgePrompt()", fn: "buildForgePrompt (async)", type: "process", x: 400, y: 240 },
    { id: "forge_spawn", label: "spawnAgent('forge')\nvia Gateway API", fn: "spawnAcpAgent → gatewayInvoke", type: "process", x: 400, y: 310 },
    { id: "forge_verify", label: "verifyAgentAlive()", fn: "gatewayInvoke('session_status')", type: "decision", x: 400, y: 375 },
    { id: "forge_dead", label: "Zustandsprüfung\nfehlgeschlagen", fn: "handleFail('forge')", type: "retry", x: 680, y: 375 },
    { id: "forge_poll", label: "pollWithRateLimit\nRecovery()", fn: "pollStatus → pollGeneric", type: "process", x: 400, y: 440 },
    { id: "forge_kill", label: "killAgent('forge')\nGateway /stop", fn: "killAcpAgent → gatewayInvoke", type: "process", x: 400, y: 505 },
    { id: "forge_timeout", label: "⏰ TIMEOUT\nhandleFail(forge)", fn: "handleFail(isTimeout: true)", type: "timeout", x: 130, y: 505 },
    { id: "forge_ratelimit", label: "🔵 RATE LIMITED\nEXIT_RATE_LIMITED", fn: "return EXIT_RATE_LIMITED", type: "rateLimit", x: 130, y: 570 },
    { id: "forge_parse", label: "Parse-Korruption\nhandleFail(forge)", fn: "handleFail('forge')", type: "fail", x: 680, y: 440 },
    { id: "forge_fail_check", label: "Status = FAIL?", fn: "loadStatus nach poll", type: "decision", x: 400, y: 570 },
    { id: "forge_fail", label: "FAIL\nhandleFail(forge)", fn: "handleFail + extractAgentFailReason", type: "retry", x: 680, y: 570 },
    { id: "precheck", label: "🔍 PRE-CHECK\nrunPreCheck()", fn: "runPreCheck → generateLintReport", type: "decision", x: 400, y: 640 },
    { id: "precheck_fail", label: "Pre-Check FAIL\nhandleFail(pre_check)", fn: "handleFail('pre_check')", type: "retry", x: 680, y: 640 },
    { id: "precheck_skip", label: "Tool-Crash\n→ Skip, weiter", fn: "runPreCheck (graceful)", type: "info", x: 130, y: 640 },
    { id: "gitsync", label: "📤 GIT SYNC\ngitSyncBeforeBuster()", fn: "gitCommitAndPush(captureHash)", type: "process", x: 400, y: 710 },
    { id: "buster_start", label: "🔬 BUSTER PHASE\nbuildBusterModulePrompt()", fn: "buildBusterModulePrompt", type: "process", x: 400, y: 775 },
    { id: "buster_archive", label: "archiveModule\nCompletions()", fn: "getRedisModule → archiveCompletions", type: "process", x: 400, y: 835 },
    { id: "buster_spawn", label: "spawnAgent('buster')\nvia Redis", fn: "dispatchRedisTask(module_test)", type: "process", x: 400, y: 895 },
    { id: "buster_poll", label: "pollDualWithRate\nLimitRecovery()", fn: "pollDual (Redis+Git)", type: "process", x: 400, y: 955 },
    { id: "buster_kill", label: "killAgent('buster')\n(No-Op)", fn: "Redis = kein Kill", type: "process", x: 400, y: 1015 },
    { id: "buster_timeout", label: "⏰ TIMEOUT\nhandleFail(buster)", fn: "handleFail(isTimeout: true)", type: "timeout", x: 130, y: 1015 },
    { id: "buster_ratelimit", label: "🔵 RATE LIMITED", fn: "return EXIT_RATE_LIMITED", type: "rateLimit", x: 130, y: 1075 },
    { id: "buster_result", label: "Status = PASS?", fn: "loadStatus nach poll", type: "decision", x: 400, y: 1075 },
    { id: "buster_pass", label: "✅ MODUL PASS\nEXIT_OK (0)", fn: "feedbackMemory('pass')\nsaveStatus → discord OK", type: "happy", x: 400, y: 1145 },
    { id: "buster_fail", label: "FAIL\nhandleFail(buster)", fn: "handleFail + extractAgentFailReason", type: "retry", x: 680, y: 1075 },
    { id: "to_handlefail", label: "→ handleFail\n(siehe Detail)", fn: "handleFail Entscheidungsbaum", type: "decision", x: 680, y: 720 },
  ],
  module_forge_buster_edges: [
    { from: "entry", to: "load_status", color: COLORS.happy },
    { from: "load_status", to: "already_pass", color: COLORS.happy, label: "PASS" },
    { from: "load_status", to: "already_blocked", color: COLORS.blocked, label: "BLOCKED" },
    { from: "load_status", to: "corrupt", color: COLORS.fail, label: "korrupt" },
    { from: "load_status", to: "blueprint", color: COLORS.happy, label: "PENDING/neu" },
    { from: "blueprint", to: "bp_fail", color: COLORS.fail, label: "Fehler" },
    { from: "blueprint", to: "forge_start", color: COLORS.happy },
    { from: "forge_start", to: "forge_spawn", color: COLORS.happy },
    { from: "forge_spawn", to: "forge_verify", color: COLORS.happy },
    { from: "forge_verify", to: "forge_dead", color: COLORS.fail, label: "tot" },
    { from: "forge_verify", to: "forge_poll", color: COLORS.happy, label: "lebt" },
    { from: "forge_poll", to: "forge_kill", color: COLORS.happy, label: "ok=true" },
    { from: "forge_poll", to: "forge_timeout", color: COLORS.timeout, label: "timeout" },
    { from: "forge_poll", to: "forge_ratelimit", color: COLORS.rateLimit, label: "rate_limit" },
    { from: "forge_poll", to: "forge_parse", color: COLORS.fail, label: "parse_corrupted" },
    { from: "forge_kill", to: "forge_fail_check", color: COLORS.happy },
    { from: "forge_fail_check", to: "forge_fail", color: COLORS.fail, label: "FAIL" },
    { from: "forge_fail_check", to: "precheck", color: COLORS.happy, label: "READY_FOR_TESTING" },
    { from: "precheck", to: "precheck_fail", color: COLORS.fail, label: "Errors" },
    { from: "precheck", to: "precheck_skip", color: COLORS.info, label: "Tool-Crash" },
    { from: "precheck", to: "gitsync", color: COLORS.happy, label: "PASS" },
    { from: "precheck_skip", to: "gitsync", color: COLORS.info },
    { from: "gitsync", to: "buster_start", color: COLORS.happy },
    { from: "buster_start", to: "buster_archive", color: COLORS.happy },
    { from: "buster_archive", to: "buster_spawn", color: COLORS.happy },
    { from: "buster_spawn", to: "buster_poll", color: COLORS.happy },
    { from: "buster_poll", to: "buster_kill", color: COLORS.happy, label: "ok=true" },
    { from: "buster_poll", to: "buster_timeout", color: COLORS.timeout, label: "timeout" },
    { from: "buster_poll", to: "buster_ratelimit", color: COLORS.rateLimit, label: "rate_limit" },
    { from: "buster_kill", to: "buster_result", color: COLORS.happy },
    { from: "buster_result", to: "buster_pass", color: COLORS.happy, label: "PASS" },
    { from: "buster_result", to: "buster_fail", color: COLORS.fail, label: "FAIL" },
    { from: "forge_dead", to: "to_handlefail", color: COLORS.retry, dashed: true },
    { from: "forge_fail", to: "to_handlefail", color: COLORS.retry, dashed: true },
    { from: "precheck_fail", to: "to_handlefail", color: COLORS.retry, dashed: true },
    { from: "buster_fail", to: "to_handlefail", color: COLORS.retry, dashed: true },
  ],

  module_forge_only: [
    { id: "entry", label: "executeModuleAttempt()\nstages: ['forge']", fn: "executeModuleAttempt", type: "entry", x: 350, y: 40 },
    { id: "forge", label: "⚒️ FORGE PHASE\n(identisch zu Forge+Buster)", fn: "buildForgePrompt → spawn → poll → kill", type: "process", x: 350, y: 120 },
    { id: "forge_result", label: "READY_FOR_TESTING?", fn: "loadStatus nach poll", type: "decision", x: 350, y: 210 },
    { id: "forge_fail", label: "handleFail(forge)\n→ handleFail Detail", fn: "handleFail", type: "retry", x: 600, y: 210 },
    { id: "no_buster", label: "Kein Buster in stages\n→ Direkt PASS", fn: "!stages.includes('buster')", type: "info", x: 350, y: 290 },
    { id: "commit", label: "gitCommitAndPush()\n(softFail: true)", fn: "gitCommitAndPush", type: "process", x: 350, y: 365 },
    { id: "pass", label: "✅ FORGE-ONLY PASS\nEXIT_OK (0)", fn: "feedbackMemory('pass')\ndiscord OK (forge-only)", type: "happy", x: 350, y: 445 },
    { id: "note", label: "Kein Pre-Check\nKein Git-Sync\nKein Buster", fn: "—", type: "info", x: 100, y: 290 },
  ],
  module_forge_only_edges: [
    { from: "entry", to: "forge", color: COLORS.happy },
    { from: "forge", to: "forge_result", color: COLORS.happy },
    { from: "forge_result", to: "forge_fail", color: COLORS.fail, label: "FAIL/TIMEOUT" },
    { from: "forge_result", to: "no_buster", color: COLORS.happy, label: "READY" },
    { from: "no_buster", to: "commit", color: COLORS.happy },
    { from: "commit", to: "pass", color: COLORS.happy },
  ],

  module_buster_only: [
    { id: "entry", label: "executeModuleAttempt()\nstages: ['buster']", fn: "executeModuleAttempt", type: "entry", x: 350, y: 40 },
    { id: "promote", label: "Kein Forge → Promotion\nPENDING/FAIL → READY", fn: "status = READY_FOR_TESTING", type: "process", x: 350, y: 120 },
    { id: "no_precheck", label: "Kein Pre-Check\n(Forge nicht gelaufen)", fn: "needsForge = false", type: "info", x: 100, y: 200 },
    { id: "gitsync", label: "📤 GIT SYNC\ngitSyncBeforeBuster()", fn: "gitCommitAndPush", type: "process", x: 350, y: 200 },
    { id: "buster", label: "🔬 BUSTER PHASE\n(identisch zu Forge+Buster)", fn: "buildBusterModulePrompt → spawn → poll", type: "process", x: 350, y: 280 },
    { id: "result", label: "PASS / FAIL?", fn: "loadStatus", type: "decision", x: 350, y: 365 },
    { id: "pass", label: "✅ MODUL PASS\nEXIT_OK (0)", fn: "feedbackMemory('pass')", type: "happy", x: 350, y: 445 },
    { id: "fail", label: "handleFail(buster)\n→ handleFail Detail", fn: "handleFail", type: "retry", x: 600, y: 365 },
  ],
  module_buster_only_edges: [
    { from: "entry", to: "promote", color: COLORS.happy },
    { from: "promote", to: "gitsync", color: COLORS.happy },
    { from: "gitsync", to: "buster", color: COLORS.happy },
    { from: "buster", to: "result", color: COLORS.happy },
    { from: "result", to: "pass", color: COLORS.happy, label: "PASS" },
    { from: "result", to: "fail", color: COLORS.fail, label: "FAIL" },
  ],

  handle_fail: [
    { id: "entry", label: "handleFail()\naufgerufen", fn: "handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts)", type: "entry", x: 400, y: 30 },
    { id: "increment", label: "fail_count++\n(IMMER unconditional)", fn: "status.fail_count++ (Zeile 2574)", type: "process", x: 400, y: 110 },
    { id: "summary", label: "fail_summaries.push()\n{attempt, phase, summary,\nis_timeout, files_changed}", fn: "status.fail_summaries", type: "process", x: 400, y: 195 },
    { id: "decay", label: "decayRecalledMemories()\n(nur die IDs aus dem Prompt)", fn: "decayRecalledMemories", type: "process", x: 400, y: 280 },
    { id: "max_check", label: "fail_count ≥ maxFails?", fn: "maxFails = mod.max_fails ?? 3", type: "decision", x: 400, y: 360 },
    { id: "blocked", label: "🚫 BLOCKED\nfeedbackMemory('blocked')\nEXIT_BLOCKED (20)", fn: "Status: FAIL → BLOCKED\n(1 saveStatus, 1 Commit)", type: "blocked", x: 130, y: 440 },
    { id: "timeout_check", label: "Ist es ein Timeout?", fn: "opts.isTimeout", type: "decision", x: 500, y: 440 },
    { id: "timeout_exit", label: "⏰ EXIT_TIMEOUT (30)\nbuildNovaEscalation()", fn: "Timeout = immer Eskalation\n(kein Auto-Retry)", type: "timeout", x: 700, y: 440 },
    { id: "retry_check", label: "fail_count ≤\nauto_retry_threshold?", fn: "auto_retry_threshold ?? 2", type: "decision", x: 400, y: 530 },
    { id: "auto_retry", label: "🔄 AUTO-RETRY\n{ _retry: true }\nPipeline loop intern", fn: "Attempt 1-2:\nInterner Retry (kein Exit)", type: "retry", x: 200, y: 630 },
    { id: "nova", label: "🟠 EXIT_NEEDS_NOVA (10)\nbuildNovaEscalation()", fn: "Attempt 3+:\nNova muss --resume --prompt", type: "fail", x: 600, y: 630 },
    { id: "example", label: "Beispiel: maxFails=3\n1. Fail → Auto-Retry\n2. Fail → Auto-Retry\n3. Fail → BLOCKED", fn: "auto_retry_threshold=2", type: "info", x: 400, y: 730 },
  ],
  handle_fail_edges: [
    { from: "entry", to: "increment", color: COLORS.happy },
    { from: "increment", to: "summary", color: COLORS.happy },
    { from: "summary", to: "decay", color: COLORS.happy },
    { from: "decay", to: "max_check", color: COLORS.happy },
    { from: "max_check", to: "blocked", color: COLORS.blocked, label: "ja" },
    { from: "max_check", to: "timeout_check", color: COLORS.happy, label: "nein" },
    { from: "timeout_check", to: "timeout_exit", color: COLORS.timeout, label: "ja" },
    { from: "timeout_check", to: "retry_check", color: COLORS.happy, label: "nein" },
    { from: "retry_check", to: "auto_retry", color: COLORS.retry, label: "ja (1-2)" },
    { from: "retry_check", to: "nova", color: COLORS.fail, label: "nein (3+)" },
  ],

  buster_gate: [
    { id: "entry", label: "runBusterGate()", fn: "runBusterGate", type: "entry", x: 400, y: 30 },
    { id: "already", label: "Bereits abgeschlossen?", fn: "output_file + gate-status.json prüfen", type: "decision", x: 400, y: 100 },
    { id: "skip", label: "✅ Bereits PASS\nSkip", fn: "return EXIT_OK", type: "happy", x: 130, y: 100 },
    { id: "cleanup", label: "Veraltete Ausgaben\nbereinigen", fn: "unlink output_file + gate-status.json", type: "process", x: 400, y: 170 },
    { id: "attempt", label: "_runBusterGateOnce()\nAttempt {n}", fn: "buildBusterGatePrompt → spawn → poll → kill", type: "process", x: 400, y: 250 },
    { id: "result", label: "Ergebnis?", fn: "PollResult auswerten", type: "decision", x: 400, y: 330 },
    { id: "pass", label: "✅ GATE PASS\nEXIT_OK", fn: "discord OK", type: "happy", x: 130, y: 330 },
    { id: "spawn_fail", label: "❌ Spawn fehlgeschlagen\nEXIT_ERROR", fn: "return EXIT_ERROR", type: "fail", x: 130, y: 410 },
    { id: "timeout", label: "⏰ TIMEOUT\nEXIT_TIMEOUT", fn: "Nicht auto-fixbar", type: "timeout", x: 130, y: 475 },
    { id: "parse", label: "Parse korrupt\nEXIT_NEEDS_NOVA", fn: "return EXIT_NEEDS_NOVA", type: "fail", x: 680, y: 250 },
    { id: "rate_limit", label: "🔵 Rate-Limit\nInline Cooldown", fn: "sleep(cooldownHrs)\nattempt-- (zählt nicht)", type: "rateLimit", x: 680, y: 330 },
    { id: "gate_fail", label: "GATE FAIL\nextractGateIssues()", fn: "extractGateIssues", type: "decision", x: 400, y: 410 },
    { id: "no_fix", label: "Kein on_fail\nEXIT_NEEDS_NOVA", fn: "return EXIT_NEEDS_NOVA", type: "fail", x: 680, y: 410 },
    { id: "exhausted", label: "Fix-Versuche\nerschöpft\nEXIT_NEEDS_NOVA", fn: "attempt > maxFixCycles", type: "fail", x: 680, y: 475 },
    { id: "forge_fix", label: "⚒️ FORGE FIX\nbuildGateFixPrompt()\n+ fixHistory", fn: "spawnAgent('forge') → verifyAlive\n→ pollForSessionEnd", type: "retry", x: 400, y: 500 },
    { id: "changes", label: "Änderungen?", fn: "sessionResult.hasChanges", type: "decision", x: 400, y: 590 },
    { id: "no_changes", label: "Keine Änderungen\n(Crash?) → Skip", fn: "discord WARN → continue", type: "info", x: 680, y: 590 },
    { id: "sync_clean", label: "gitCommitAndPush()\nCleanup Output-Files", fn: "unlink output + gate-status", type: "process", x: 400, y: 660 },
    { id: "retest", label: "↩ Zurück zu\n_runBusterGateOnce()", fn: "Loop: nächster Attempt", type: "retry", x: 400, y: 730 },
  ],
  buster_gate_edges: [
    { from: "entry", to: "already", color: COLORS.happy },
    { from: "already", to: "skip", color: COLORS.happy, label: "PASS/OK" },
    { from: "already", to: "cleanup", color: COLORS.happy, label: "FAIL/neu" },
    { from: "cleanup", to: "attempt", color: COLORS.happy },
    { from: "attempt", to: "result", color: COLORS.happy },
    { from: "result", to: "pass", color: COLORS.happy, label: "PASS" },
    { from: "result", to: "spawn_fail", color: COLORS.fail, label: "spawn_failed" },
    { from: "result", to: "timeout", color: COLORS.timeout, label: "timeout" },
    { from: "result", to: "parse", color: COLORS.fail, label: "parse_corrupted" },
    { from: "result", to: "rate_limit", color: COLORS.rateLimit, label: "rate_limited" },
    { from: "result", to: "gate_fail", color: COLORS.fail, label: "gate_fail" },
    { from: "rate_limit", to: "attempt", color: COLORS.rateLimit, dashed: true, label: "retry" },
    { from: "gate_fail", to: "no_fix", color: COLORS.fail, label: "kein on_fail" },
    { from: "gate_fail", to: "exhausted", color: COLORS.fail, label: "erschöpft" },
    { from: "gate_fail", to: "forge_fix", color: COLORS.retry, label: "fix_and_retest" },
    { from: "forge_fix", to: "changes", color: COLORS.retry },
    { from: "changes", to: "no_changes", color: COLORS.info, label: "nein" },
    { from: "changes", to: "sync_clean", color: COLORS.happy, label: "ja" },
    { from: "no_changes", to: "attempt", color: COLORS.info, dashed: true, label: "nächster" },
    { from: "sync_clean", to: "retest", color: COLORS.happy },
    { from: "retest", to: "attempt", color: COLORS.retry, dashed: true },
  ],

  review_gate: [
    { id: "entry", label: "runReviewGate()", fn: "runReviewGate", type: "entry", x: 400, y: 30 },
    { id: "already", label: "Bereits GO?", fn: "output_file prüfen (inhaltsbasiert)", type: "decision", x: 400, y: 100 },
    { id: "skip", label: "✅ Bereits GO → Skip", fn: "return EXIT_OK", type: "happy", x: 130, y: 100 },
    { id: "review", label: "_runReviewOnce()", fn: "resolveReviewConfig → Lint → Reviewer", type: "process", x: 400, y: 180 },
    { id: "lint", label: "generateLintReport()\ntier: full", fn: "generateLintReport → formatLintReportForReviewer", type: "process", x: 400, y: 255 },
    { id: "lint_fail", label: "Lint fehlgeschlagen\n→ Reviewer ohne Lint", fn: "Warning im Prompt", type: "info", x: 130, y: 255 },
    { id: "spawn_rev", label: "spawnReviewerAgent()\n× 1 Reviewer", fn: "Gateway sessions_spawn", type: "process", x: 400, y: 330 },
    { id: "poll_file", label: "pollForFile()\nReviewer-Output", fn: "pollForFile → pollGeneric", type: "process", x: 400, y: 400 },
    { id: "kill_rev", label: "killReviewerAgent()", fn: "Gateway /stop", type: "process", x: 400, y: 465 },
    { id: "parse", label: "Review-JSON parsen\nGO / NO-GO?", fn: "JSON.parse → status check", type: "decision", x: 400, y: 535 },
    { id: "go", label: "✅ GO\nEXIT_OK", fn: "discord OK", type: "happy", x: 130, y: 535 },
    { id: "nogo", label: "NO-GO\nextractReviewIssues()", fn: "extractReviewIssues", type: "decision", x: 400, y: 620 },
    { id: "fix_continue", label: "on_nogo:\nfix_and_continue", fn: "Forge-Fix → GO schreiben\n(kein Re-Review)", type: "retry", x: 200, y: 720 },
    { id: "fix_rereview", label: "on_nogo:\nfix_and_rereview", fn: "Forge-Fix → cleanupReviewFiles\n→ _runReviewOnce (frisch)", type: "retry", x: 600, y: 720 },
    { id: "fc_forge", label: "⚒️ Forge-Fix\nbuildReviewFixPrompt()\n+ fixHistory", fn: "spawnAgent → pollForSessionEnd\n→ gitCommitAndPush", type: "process", x: 200, y: 820 },
    { id: "fc_done", label: "GO-Status schreiben\n✅ Pipeline fährt fort", fn: "writeFileSync(GO) → EXIT_OK", type: "happy", x: 200, y: 910 },
    { id: "fr_forge", label: "⚒️ Forge-Fix\nbuildReviewFixPrompt()\n+ fixHistory", fn: "spawnAgent → pollForSessionEnd\n→ gitCommitAndPush", type: "process", x: 600, y: 820 },
    { id: "fr_cleanup", label: "cleanupReviewFiles()\n→ _runReviewOnce()", fn: "Frischer Lint + Review", type: "process", x: 600, y: 910 },
    { id: "fr_result", label: "GO / NO-GO?", fn: "_runReviewOnce Ergebnis", type: "decision", x: 600, y: 985 },
    { id: "fr_go", label: "✅ GO nach Fix\nEXIT_OK", fn: "discord OK", type: "happy", x: 420, y: 985 },
    { id: "fr_exhausted", label: "Zyklen erschöpft\nEXIT_NEEDS_NOVA", fn: "discord CRITICAL", type: "fail", x: 600, y: 1060 },
    { id: "fr_loop", label: "↩ Nächster Fix-Zyklus", fn: "cycle++", type: "retry", x: 750, y: 985 },
  ],
  review_gate_edges: [
    { from: "entry", to: "already", color: COLORS.happy },
    { from: "already", to: "skip", color: COLORS.happy, label: "GO" },
    { from: "already", to: "review", color: COLORS.happy, label: "NO-GO/neu" },
    { from: "review", to: "lint", color: COLORS.happy },
    { from: "lint", to: "lint_fail", color: COLORS.info, label: "Fehler" },
    { from: "lint", to: "spawn_rev", color: COLORS.happy, label: "OK" },
    { from: "lint_fail", to: "spawn_rev", color: COLORS.info, label: "ohne Lint" },
    { from: "spawn_rev", to: "poll_file", color: COLORS.happy },
    { from: "poll_file", to: "kill_rev", color: COLORS.happy },
    { from: "kill_rev", to: "parse", color: COLORS.happy },
    { from: "parse", to: "go", color: COLORS.happy, label: "GO" },
    { from: "parse", to: "nogo", color: COLORS.fail, label: "NO-GO" },
    { from: "nogo", to: "fix_continue", color: COLORS.retry, label: "fix_and_continue" },
    { from: "nogo", to: "fix_rereview", color: COLORS.retry, label: "fix_and_rereview" },
    { from: "fix_continue", to: "fc_forge", color: COLORS.retry },
    { from: "fc_forge", to: "fc_done", color: COLORS.happy },
    { from: "fix_rereview", to: "fr_forge", color: COLORS.retry },
    { from: "fr_forge", to: "fr_cleanup", color: COLORS.retry },
    { from: "fr_cleanup", to: "fr_result", color: COLORS.happy },
    { from: "fr_result", to: "fr_go", color: COLORS.happy, label: "GO" },
    { from: "fr_result", to: "fr_loop", color: COLORS.retry, label: "NO-GO" },
    { from: "fr_result", to: "fr_exhausted", color: COLORS.fail, label: "erschöpft" },
    { from: "fr_loop", to: "fr_forge", color: COLORS.retry, dashed: true },
  ],
};

// ─── Components ─────────────────────────────────────────────────────────────

const typeStyles = {
  entry:     { bg: "#1e293b", border: "#475569", icon: "▶" },
  process:   { bg: "#1e293b", border: "#334155", icon: "⚙" },
  decision:  { bg: "#1e1b2e", border: COLORS.decision, icon: "◆" },
  happy:     { bg: "#052e16", border: COLORS.happy, icon: "✅" },
  fail:      { bg: "#2d0a0a", border: COLORS.fail, icon: "❌" },
  retry:     { bg: "#2d1f04", border: COLORS.retry, icon: "🔄" },
  timeout:   { bg: "#1a0e2e", border: COLORS.timeout, icon: "⏰" },
  rateLimit: { bg: "#0a1628", border: COLORS.rateLimit, icon: "🔵" },
  blocked:   { bg: "#2d0a0a", border: COLORS.blocked, icon: "🚫" },
  info:      { bg: "#0a1e28", border: COLORS.info, icon: "ℹ" },
  gate:      { bg: "#1e0a1e", border: COLORS.gate, icon: "🚪" },
};

function Node({ node, selected, onClick }) {
  const style = typeStyles[node.type] || typeStyles.process;
  const isSelected = selected === node.id;
  return (
    <g
      onClick={() => onClick(node)}
      style={{ cursor: "pointer" }}
      transform={`translate(${node.x - 80}, ${node.y - 22})`}
    >
      <rect
        width={160}
        height={44 + (node.label.split("\n").length - 1) * 14}
        rx={6}
        fill={style.bg}
        stroke={isSelected ? "#fff" : style.border}
        strokeWidth={isSelected ? 2 : 1}
        opacity={0.95}
      />
      {node.label.split("\n").map((line, i) => (
        <text
          key={i}
          x={80}
          y={18 + i * 14}
          textAnchor="middle"
          fill={i === 0 ? COLORS.text : COLORS.textMuted}
          fontSize={i === 0 ? 11 : 10}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fontWeight={i === 0 ? 600 : 400}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function Edge({ from, to, color, label, dashed, nodes }) {
  const n1 = nodes.find((n) => n.id === from);
  const n2 = nodes.find((n) => n.id === to);
  if (!n1 || !n2) return null;

  const h1 = 44 + (n1.label.split("\n").length - 1) * 14;
  const h2 = 44 + (n2.label.split("\n").length - 1) * 14;

  let x1 = n1.x, y1 = n1.y + h1 / 2 - 22;
  let x2 = n2.x, y2 = n2.y - h2 / 2 + 22;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Decide exit/entry sides
  if (Math.abs(dx) > 120 && Math.abs(dy) < 60) {
    // horizontal
    x1 = dx > 0 ? n1.x + 80 : n1.x - 80;
    x2 = dx > 0 ? n2.x - 80 : n2.x + 80;
    y1 = n1.y;
    y2 = n2.y;
  } else {
    // vertical
    y1 = n1.y + h1 / 2 - 22;
    y2 = n2.y - h2 / 2 + 22;
  }

  const midY = (y1 + y2) / 2;
  const path = `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={color || "#475569"}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "6,4" : "none"}
        opacity={0.7}
        markerEnd="url(#arrow)"
      />
      {label && (
        <text
          x={(x1 + x2) / 2 + (Math.abs(dx) > 120 ? 0 : 12)}
          y={(y1 + y2) / 2 - 4}
          fill={color || "#64748b"}
          fontSize={9}
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
          opacity={0.9}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Legend() {
  const items = [
    { color: COLORS.happy, label: "Erfolgsfall (Happy Path)" },
    { color: COLORS.retry, label: "Auto-Retry (intern)" },
    { color: COLORS.fail, label: "Fehler / EXIT_NEEDS_NOVA" },
    { color: COLORS.timeout, label: "Timeout / EXIT_TIMEOUT" },
    { color: COLORS.rateLimit, label: "Rate-Limit / Cooldown" },
    { color: COLORS.blocked, label: "BLOCKED / EXIT_BLOCKED" },
    { color: COLORS.info, label: "Info / Graceful Skip" },
    { color: COLORS.gate, label: "Gate-Dispatch" },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 0" }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: item.color, opacity: 0.8 }} />
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function PipelineFlowGraph() {
  const [view, setView] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);

  const viewDef = VIEWS[view];
  const nodes = flowData[view] || [];
  const edges = flowData[`${view}_edges`] || [];

  const maxY = Math.max(...nodes.map((n) => n.y + 60), 400);
  const maxX = Math.max(...nodes.map((n) => n.x + 100), 800);

  const selectedNode = nodes.find((n) => n.id === selected);

  const handleNodeClick = useCallback((node) => {
    setSelected((prev) => (prev === node.id ? null : node.id));
  }, []);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
          KUBECLAW PIPELINE — ABLAUFGRAPH
        </div>
        <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
          pipeline.js v8 · 4921 Zeilen · Alle möglichen Pfade
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "10px 20px", borderBottom: `1px solid ${COLORS.border}` }}>
        {Object.entries(VIEWS).map(([key, v]) => (
          <button
            key={key}
            onClick={() => { setView(key); setSelected(null); setZoom(1); }}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              fontFamily: "inherit",
              background: view === key ? "#1e293b" : "transparent",
              color: view === key ? COLORS.text : COLORS.textDim,
              border: `1px solid ${view === key ? "#475569" : COLORS.border}`,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {v.title}
          </button>
        ))}
      </div>

      {/* Legend + Zoom */}
      <div style={{ padding: "8px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <Legend />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: COLORS.textDim }}>Zoom:</span>
          {[0.6, 0.8, 1, 1.2].map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              style={{
                padding: "3px 8px", fontSize: 10, fontFamily: "inherit",
                background: zoom === z ? "#1e293b" : "transparent",
                color: zoom === z ? COLORS.text : COLORS.textDim,
                border: `1px solid ${COLORS.border}`, borderRadius: 3, cursor: "pointer",
              }}
            >
              {Math.round(z * 100)}%
            </button>
          ))}
        </div>
      </div>

      {/* View Title */}
      <div style={{ padding: "12px 20px 4px" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{viewDef.title}</div>
        <div style={{ fontSize: 11, color: COLORS.textDim }}>{viewDef.subtitle}</div>
      </div>

      {/* Main Content */}
      <div style={{ display: "flex" }}>
        {/* Graph */}
        <div style={{ flex: 1, overflow: "auto", padding: "10px 20px" }}>
          <svg
            width={maxX * zoom + 40}
            height={(maxY + 40) * zoom}
            viewBox={`0 0 ${maxX + 40} ${maxY + 40}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>
            {edges.map((e, i) => (
              <Edge key={i} {...e} nodes={nodes} />
            ))}
            {nodes.map((n) => (
              <Node key={n.id} node={n} selected={selected} onClick={handleNodeClick} />
            ))}
          </svg>
        </div>

        {/* Info Panel */}
        {selectedNode && (
          <div style={{
            width: 280, padding: 16, borderLeft: `1px solid ${COLORS.border}`,
            background: COLORS.panel, flexShrink: 0, position: "sticky", top: 0,
            maxHeight: "calc(100vh - 180px)", overflowY: "auto",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>
              {typeStyles[selectedNode.type]?.icon} {selectedNode.label.split("\n")[0]}
            </div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              {selectedNode.label.split("\n").slice(1).join("\n")}
            </div>
            <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Zuständige Funktion(en)
            </div>
            <div style={{
              fontSize: 11, color: COLORS.info, background: "#0a1e2880",
              padding: 8, borderRadius: 4, lineHeight: 1.6, whiteSpace: "pre-wrap",
              border: `1px solid ${COLORS.info}30`,
            }}>
              {selectedNode.fn}
            </div>
            <div style={{ marginTop: 12, fontSize: 10, color: COLORS.textDim }}>
              Typ: <span style={{ color: typeStyles[selectedNode.type]?.border }}>{selectedNode.type}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: COLORS.textDim }}>
              ID: {selectedNode.id}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
