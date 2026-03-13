import { useState, useEffect, useRef } from "react";

const MODULES = [
  { id: "01", title: "Scaffold + Auth + DB", status: "PASS", attempts: 1, duration: "18m", model: "codex-5.3", cost: 1.2 },
  { id: "02", title: "K8s Connection Layer", status: "PASS", attempts: 1, duration: "14m", model: "codex-5.3", cost: 0.9 },
  { id: "03", title: "Pods", status: "PASS", attempts: 2, duration: "47m", model: "codex-5.3", cost: 3.1 },
  { id: "04", title: "Deployments", status: "PASS", attempts: 1, duration: "22m", model: "codex-5.3", cost: 1.4 },
  { id: "05", title: "Nodes", status: "PASS", attempts: 1, duration: "19m", model: "codex-5.3", cost: 1.1 },
  { id: "06", title: "WebSockets", status: "PASS", attempts: 3, duration: "1h 12m", model: "codex-5.3", cost: 4.8 },
  { id: "07", title: "Services + CronJobs", status: "PASS", attempts: 1, duration: "21m", model: "codex-5.3", cost: 1.3 },
  { id: "08", title: "Git + Build Pipeline", status: "PASS", attempts: 2, duration: "52m", model: "codex-5.3", cost: 3.4 },
  { id: "09", title: "Alerts System", status: "PASS", attempts: 1, duration: "26m", model: "sonnet-4-6", cost: 2.1 },
  { id: "MR", title: "Midpoint Review", status: "PASS", type: "gate", subtype: "review", verdict: "GO" },
  { id: "10", title: "Frontend Scaffold", status: "IN_PROGRESS", attempts: 1, duration: "—", model: "gemini-pro", cost: 0, phase: "forge" },
  { id: "11", title: "Dashboard + Pods", status: "PENDING", model: "gemini-pro" },
  { id: "12", title: "Resource Pages", status: "PENDING", model: "gemini-pro" },
  { id: "13", title: "Delivery", status: "PENDING", model: "gemini-flash" },
  { id: "FB", title: "Final Buster", status: "PENDING", type: "gate", subtype: "buster" },
  { id: "FR", title: "Final Review", status: "PENDING", type: "gate", subtype: "review" },
];

const EVENTS_DATA = [
  { ts: "14:32:08", type: "module_pass", msg: "Module 09 — Alerts System", detail: "PASS on attempt 1 · sonnet-4-6 · $2.10", icon: "✓" },
  { ts: "14:32:15", type: "gate_start", msg: "Gate: Midpoint Review spawning", detail: "3 reviewers: echo-codex, echo-sonnet, echo-pro", icon: "◆" },
  { ts: "14:38:42", type: "gate_verdict", msg: "Midpoint Review → GO", detail: "2 warnings, 0 blockers · merged in 6m 27s", icon: "◆" },
  { ts: "14:38:50", type: "agent_spawn", msg: "Forge spawned for Module 10", detail: "gemini-pro · Attempt 1/3 · Frontend Scaffold + Auth", icon: "▸" },
  { ts: "14:39:12", type: "info", msg: "Forge working on 10a: Vite + React + Tailwind", detail: "Sub-step 1/2 · timeout in 45m", icon: "⟳" },
  { ts: "14:44:30", type: "screenshot", msg: "Buster visual audit — Module 09", detail: "Alert dashboard with live Prometheus data", icon: "◻" },
  { ts: "14:51:03", type: "info", msg: "Forge progressing — 10a scaffold complete", detail: "Moving to 10b: Auth flow + Zustand store", icon: "⟳" },
];

const SCREENSHOTS = [
  { module: "06", label: "WebSocket Logs", gradient: "from-emerald-900/40 to-cyan-900/30", content: "Terminal-style log viewer with live pod output streaming" },
  { module: "09", label: "Alerts Dashboard", gradient: "from-amber-900/40 to-red-900/30", content: "Alert cards: 3 critical, 7 warning, 12 info — Prometheus integration" },
  { module: "10", label: "Frontend Scaffold (building...)", gradient: "from-violet-900/40 to-blue-900/30", content: "Login page with API key input — Vite + React + Tailwind", active: true },
];

const statusColor = (s) => {
  const m = { PASS: "#22c55e", FAIL: "#ef4444", IN_PROGRESS: "#3b82f6", TESTING: "#f59e0b", REVIEWING: "#a78bfa", PENDING: "#334155", BLOCKED: "#dc2626" };
  return m[s] || "#334155";
};
const statusGlow = (s) => {
  const m = { PASS: "0 0 12px #22c55e40", IN_PROGRESS: "0 0 16px #3b82f680", TESTING: "0 0 16px #f59e0b60", REVIEWING: "0 0 16px #a78bfa60", FAIL: "0 0 12px #ef444440" };
  return m[s] || "none";
};
const eventColor = (t) => {
  const m = { module_pass: "#22c55e", module_fail: "#ef4444", gate_start: "#a78bfa", gate_verdict: "#a78bfa", agent_spawn: "#3b82f6", screenshot: "#f59e0b", info: "#64748b", retry: "#f97316" };
  return m[t] || "#64748b";
};

const Pulse = ({ color, size = 8 }) => (
  <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
    <span style={{
      position: "absolute", inset: -2, borderRadius: "50%", backgroundColor: color,
      opacity: 0.4, animation: "pulse-ring 2s ease-in-out infinite"
    }} />
    <span style={{ display: "block", width: size, height: size, borderRadius: "50%", backgroundColor: color }} />
  </span>
);

const ModuleNode = ({ mod, index, total }) => {
  const isGate = mod.type === "gate";
  const isActive = mod.status === "IN_PROGRESS" || mod.status === "TESTING" || mod.status === "REVIEWING";
  const size = isGate ? 36 : 42;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
      {index < total - 1 && (
        <div style={{
          position: "absolute", top: size / 2, left: "50%", width: 44, height: 2,
          marginLeft: size / 2 + 4,
          background: mod.status === "PASS" ? "linear-gradient(90deg, #22c55e60, #22c55e20)" : "#1e293b",
          zIndex: 0
        }} />
      )}
      <div style={{
        width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: isGate ? 6 : "50%", transform: isGate ? "rotate(45deg)" : "none",
        backgroundColor: isActive ? statusColor(mod.status) + "20" : statusColor(mod.status) + "18",
        border: `2px solid ${statusColor(mod.status)}${isActive ? "cc" : "55"}`,
        boxShadow: statusGlow(mod.status),
        animation: isActive ? "node-breathe 3s ease-in-out infinite" : "none",
        transition: "all 0.5s ease", position: "relative", zIndex: 1,
        cursor: "default"
      }}>
        <span style={{
          fontSize: isGate ? 10 : 12, fontWeight: 700, color: statusColor(mod.status),
          transform: isGate ? "rotate(-45deg)" : "none", fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.05em"
        }}>
          {mod.id}
        </span>
        {mod.attempts > 1 && mod.status === "PASS" && (
          <span style={{
            position: "absolute", top: -4, right: -4, fontSize: 8, backgroundColor: "#f59e0b",
            color: "#000", borderRadius: 10, padding: "1px 4px", fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace"
          }}>×{mod.attempts}</span>
        )}
        {isActive && (
          <span style={{
            position: "absolute", top: -4, right: -4
          }}><Pulse color={statusColor(mod.status)} size={8} /></span>
        )}
      </div>
      <span style={{
        fontSize: 9, color: isActive ? "#e2e8f0" : "#64748b", maxWidth: 68,
        textAlign: "center", lineHeight: 1.2, fontFamily: "'DM Sans', sans-serif",
        fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
      }}>
        {mod.title}
      </span>
    </div>
  );
};

export default function MissionControl() {
  const [time, setTime] = useState(new Date());
  const [visibleEvents, setVisibleEvents] = useState(3);
  const [activeScreenshot, setActiveScreenshot] = useState(2);
  const feedRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (visibleEvents < EVENTS_DATA.length) {
      const t = setTimeout(() => setVisibleEvents(v => v + 1), 3500);
      return () => clearTimeout(t);
    }
  }, [visibleEvents]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [visibleEvents]);

  const passedModules = MODULES.filter(m => m.status === "PASS" && !m.type).length;
  const totalModules = MODULES.filter(m => !m.type).length;
  const totalCost = MODULES.reduce((s, m) => s + (m.cost || 0), 0);
  const elapsed = "5h 18m";
  const activeAgent = MODULES.find(m => m.status === "IN_PROGRESS");

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: "#0a0e17",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, #0f172a 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #0c1425 0%, transparent 50%)",
      color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", overflow: "hidden"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse-ring { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(2.2); opacity: 0; } }
        @keyframes node-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scan-line { 0% { transform: translateY(-100%); } 100% { transform: translateY(400%); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes progress-glow { 0%, 100% { box-shadow: 0 0 8px #3b82f640; } 50% { box-shadow: 0 0 20px #3b82f680; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #1e293b", position: "relative", overflow: "hidden"
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, #3b82f640, #a78bfa40, transparent)",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace"
          }}>KC</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>
              MISSION CONTROL
              <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8, fontWeight: 500, letterSpacing: "0.1em" }}>
                KUBECLAW
              </span>
            </div>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
              kubecommand v1.0.0 · run_7f3a2b
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Stat label="Progress" value={`${passedModules}/${totalModules}`} accent="#22c55e" />
          <Stat label="Elapsed" value={elapsed} accent="#64748b" />
          <Stat label="Est. Remaining" value="~2h 40m" accent="#f59e0b" />
          <Stat label="Cost" value={`$${totalCost.toFixed(2)}`} accent="#a78bfa" />
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#475569",
            letterSpacing: "0.05em"
          }}>
            {time.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Pipeline Map */}
      <div style={{ padding: "20px 28px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Pipeline Flow
          </span>
          <div style={{ flex: 1, height: 1, background: "#1e293b", marginLeft: 8 }} />
          <span style={{ fontSize: 9, color: "#334155", fontFamily: "'JetBrains Mono', monospace" }}>
            {MODULES.filter(m => m.type === "gate").length} gates · {totalModules} modules
          </span>
        </div>
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 28, overflowX: "auto",
          padding: "8px 4px 12px", position: "relative"
        }}>
          {MODULES.map((mod, i) => (
            <ModuleNode key={mod.id} mod={mod} index={i} total={MODULES.length} />
          ))}
        </div>
        {/* Progress bar */}
        <div style={{ height: 3, backgroundColor: "#0f172a", borderRadius: 2, marginTop: 8, overflow: "hidden", position: "relative" }}>
          <div style={{
            height: "100%", borderRadius: 2, width: `${(passedModules / totalModules) * 100}%`,
            background: "linear-gradient(90deg, #22c55e, #3b82f6)",
            animation: "progress-glow 3s ease-in-out infinite",
            transition: "width 1s ease"
          }} />
        </div>
      </div>

      {/* Main Content: Activity Feed + Active Agent + Media */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, padding: "8px 28px 28px", height: "calc(100vh - 240px)", minHeight: 360 }}>
        
        {/* Activity Feed */}
        <div style={{
          backgroundColor: "#0d1320", border: "1px solid #1e293b", borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden"
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #1e293b",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Activity
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Pulse color="#22c55e" size={5} />
              <span style={{ fontSize: 9, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>LIVE</span>
            </div>
          </div>
          <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {EVENTS_DATA.slice(0, visibleEvents).map((ev, i) => (
              <div key={i} style={{
                padding: "10px 16px", borderBottom: "1px solid #111827",
                animation: i >= visibleEvents - 1 ? "fade-in-up 0.5s ease" : "none"
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{
                    fontSize: 11, color: eventColor(ev.type), fontFamily: "'JetBrains Mono', monospace",
                    marginTop: 1, flexShrink: 0, width: 14, textAlign: "center"
                  }}>{ev.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#cbd5e1" }}>{ev.msg}</span>
                      <span style={{ fontSize: 9, color: "#334155", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{ev.ts}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>{ev.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Agent Panel */}
        <div style={{
          backgroundColor: "#0d1320", border: "1px solid #1e293b", borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden"
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #1e293b",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Active Agent
            </span>
            <span style={{
              fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
              color: "#3b82f6", backgroundColor: "#3b82f615", padding: "2px 8px", borderRadius: 4
            }}>FORGE</span>
          </div>
          <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Agent Identity */}
            <div style={{
              padding: 16, borderRadius: 8, border: "1px solid #1e293b",
              background: "linear-gradient(135deg, #3b82f608, #0d132000)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "linear-gradient(135deg, #3b82f640, #3b82f610)",
                  border: "1px solid #3b82f650",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16
                }}>⚒</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>forge-pro</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>gemini-pro · ACP Session</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <MiniStat label="Module" value="10 — Frontend Scaffold" />
                <MiniStat label="Sub-step" value="10b: Auth Flow" />
                <MiniStat label="Attempt" value="1 / 3" />
                <MiniStat label="Timeout" value="45 min" />
              </div>
            </div>

            {/* Time Progress */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Session Time</span>
                <span style={{ fontSize: 10, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>
                  12:13 / 45:00
                </span>
              </div>
              <div style={{ height: 6, backgroundColor: "#111827", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: "27%", borderRadius: 3,
                  background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                  transition: "width 1s ease"
                }} />
              </div>
              <div style={{ fontSize: 9, color: "#334155", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                Nudge at 75% · 33:45 remaining
              </div>
            </div>

            {/* Current Files */}
            <div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6 }}>Working on</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {["src/App.tsx", "src/stores/authStore.ts", "src/pages/Setup.tsx", "src/components/AuthGuard.tsx"].map(f => (
                  <div key={f} style={{
                    fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace",
                    padding: "3px 8px", backgroundColor: "#111827", borderRadius: 4,
                    borderLeft: "2px solid #3b82f640"
                  }}>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Memory Recall */}
            <div style={{ marginTop: "auto" }}>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6 }}>Qdrant Memory (3 recalled)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {[
                  { text: "Zustand store pattern: create(set => ({...}))", conf: 0.82 },
                  { text: "Vite proxy: /api → localhost:8000", conf: 0.71 },
                  { text: "Auth: Bearer token in localStorage", conf: 0.65 }
                ].map((m, i) => (
                  <div key={i} style={{
                    fontSize: 9, color: "#64748b", fontFamily: "'JetBrains Mono', monospace",
                    padding: "3px 8px", backgroundColor: "#0a0e17", borderRadius: 4,
                    display: "flex", justifyContent: "space-between", gap: 8
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
                    <span style={{ color: m.conf >= 0.75 ? "#22c55e" : m.conf >= 0.45 ? "#f59e0b" : "#ef4444", flexShrink: 0 }}>
                      {m.conf >= 0.75 ? "★★★" : m.conf >= 0.45 ? "★★☆" : "★☆☆"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Media Panel + Screenshots */}
        <div style={{
          backgroundColor: "#0d1320", border: "1px solid #1e293b", borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden"
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #1e293b",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Visual Audit
            </span>
            <span style={{ fontSize: 9, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
              {SCREENSHOTS.length} captures
            </span>
          </div>
          <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Main Screenshot */}
            <div style={{
              flex: 1, borderRadius: 8, overflow: "hidden", position: "relative",
              border: "1px solid #1e293b",
              background: `linear-gradient(135deg, ${SCREENSHOTS[activeScreenshot].gradient.includes("violet") ? "#1a0a2e" : SCREENSHOTS[activeScreenshot].gradient.includes("amber") ? "#1a1500" : "#0a1a1e"}, #0d1320)`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: 180
            }}>
              {SCREENSHOTS[activeScreenshot].active && (
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: "linear-gradient(90deg, transparent, #3b82f6, transparent)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 2s linear infinite"
                }} />
              )}
              {/* Simulated app preview */}
              <div style={{
                width: "85%", maxWidth: 280, backgroundColor: "#0f172a", borderRadius: 6,
                border: "1px solid #1e293b", overflow: "hidden", boxShadow: "0 8px 32px #00000040"
              }}>
                <div style={{
                  height: 24, backgroundColor: "#111827", borderBottom: "1px solid #1e293b",
                  display: "flex", alignItems: "center", gap: 4, padding: "0 8px"
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#ef4444" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f59e0b" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                  <span style={{ fontSize: 8, color: "#475569", marginLeft: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                    localhost:19000
                  </span>
                </div>
                <div style={{ padding: 16, minHeight: 130 }}>
                  {activeScreenshot === 0 && (
                    <>
                      <div style={{ fontSize: 9, color: "#64748b", marginBottom: 8 }}>ws://localhost:19000/ws/logs</div>
                      {["[kube-system] coredns-5dd5756b: Ready", "[default] nginx-7bf: Serving on :80", "[monitoring] prom-0: Scraping 42 targets"].map((l, i) => (
                        <div key={i} style={{ fontSize: 8, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", marginBottom: 2, opacity: 0.7 + i * 0.1 }}>{l}</div>
                      ))}
                    </>
                  )}
                  {activeScreenshot === 1 && (
                    <>
                      <div style={{ fontSize: 10, color: "#e2e8f0", fontWeight: 600, marginBottom: 8 }}>Alerts</div>
                      {[
                        { sev: "CRIT", color: "#ef4444", msg: "Pod OOMKilled" },
                        { sev: "WARN", color: "#f59e0b", msg: "High CPU node-2" },
                        { sev: "INFO", color: "#3b82f6", msg: "Deployment scaled" }
                      ].map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 7, color: a.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, width: 28 }}>{a.sev}</span>
                          <span style={{ fontSize: 8, color: "#94a3b8" }}>{a.msg}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {activeScreenshot === 2 && (
                    <>
                      <div style={{ textAlign: "center", marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>KubeCommand</div>
                        <div style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>Enter your API key to continue</div>
                      </div>
                      <div style={{
                        height: 22, backgroundColor: "#111827", borderRadius: 4, border: "1px solid #1e293b",
                        marginBottom: 8, display: "flex", alignItems: "center", padding: "0 8px"
                      }}>
                        <span style={{ fontSize: 8, color: "#334155" }}>sk-••••••••••••</span>
                      </div>
                      <div style={{
                        height: 22, backgroundColor: "#3b82f6", borderRadius: 4,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        <span style={{ fontSize: 8, color: "#fff", fontWeight: 600 }}>Connect</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {SCREENSHOTS[activeScreenshot].active && (
                <div style={{
                  position: "absolute", bottom: 8, right: 8, display: "flex", alignItems: "center", gap: 4,
                  fontSize: 9, color: "#3b82f6", fontFamily: "'JetBrains Mono', monospace",
                  backgroundColor: "#3b82f615", padding: "2px 8px", borderRadius: 4
                }}>
                  <Pulse color="#3b82f6" size={5} />
                  Building...
                </div>
              )}
            </div>

            {/* Thumbnail Strip */}
            <div style={{ display: "flex", gap: 8 }}>
              {SCREENSHOTS.map((s, i) => (
                <button key={i} onClick={() => setActiveScreenshot(i)} style={{
                  flex: 1, padding: "8px 10px", borderRadius: 6,
                  backgroundColor: i === activeScreenshot ? "#1e293b" : "#111827",
                  border: `1px solid ${i === activeScreenshot ? "#3b82f650" : "#1e293b"}`,
                  cursor: "pointer", transition: "all 0.2s ease",
                  textAlign: "left"
                }}>
                  <div style={{ fontSize: 9, color: i === activeScreenshot ? "#e2e8f0" : "#64748b", fontWeight: 500, marginBottom: 2 }}>
                    Module {s.module}
                  </div>
                  <div style={{ fontSize: 8, color: "#334155", fontFamily: "'JetBrains Mono', monospace" }}>
                    {s.label}
                  </div>
                </button>
              ))}
            </div>

            {/* Latest Buster Action */}
            <div style={{
              padding: 12, borderRadius: 8, backgroundColor: "#111827",
              border: "1px solid #1e293b"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>🛡</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b" }}>Buster — Last Run</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace" }}>12</div>
                  <div style={{ fontSize: 8, color: "#475569" }}>passed</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace" }}>0</div>
                  <div style={{ fontSize: 8, color: "#475569" }}>failed</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>26m</div>
                  <div style={{ fontSize: 8, color: "#475569" }}>duration</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.06em", marginTop: 1 }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#475569", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
