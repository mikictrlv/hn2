import { useState, useEffect, useCallback } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#05080F",
  sidebar: "#080C15",
  card: "#0C1120",
  cardHover: "#101828",
  border: "#1A2540",
  borderBright: "#2A3A5C",
  accent: "#7C6FF7",
  accentLight: "#A89FF9",
  accentGlow: "#7C6FF722",
  success: "#10D98A",
  successDim: "#10D98A22",
  warning: "#F4A23A",
  warningDim: "#F4A23A22",
  danger: "#F05252",
  dangerDim: "#F0525222",
  text: "#EEF2FF",
  muted: "#8896B3",
  dim: "#3F5070",
};

// ─── DEMO ACCOUNTS ───────────────────────────────────────────────────────────
const ACCOUNTS = [
  { email: "demo@hollownorth.com", password: "demo123", firm: "Hollow North Capital", role: "Senior Analyst" },
  { email: "partner@nordic.pe", password: "partner123", firm: "Nordic PE Partners", role: "Managing Partner" },
];

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(system, userMsg, webSearch = true) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system,
    messages: [{ role: "user", content: userMsg }],
  };
  if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// ─── AGENT DEFINITIONS ────────────────────────────────────────────────────────
const MARKET_SCOUT = {
  name: "Market Intelligence Scout", icon: "🔭",
  system: `You are a market intelligence scout for a private equity firm. Your ONLY job is to find REAL, SPECIFIC, RECENT (2022-2026) investments by major PE firms and corporations in the exact same niche/sector as the target company. Use web search extensively. For each deal found, report: the investor name, target company, deal size, date, outcome (success/fail/ongoing). If you can't find exact matches, broaden to adjacent sectors. Be factual — cite real deals. Format with clear bullet points.`,
};

const RESEARCH_AGENTS = [
  { key: "company", name: "Company Deep Diver", icon: "🏢",
    system: `You are a forensic company researcher for PE. Investigate the target company exhaustively. Cover: estimated revenue & EBITDA, ownership structure, years in operation, key personnel (and key-person risks), debt load, legal/regulatory issues, online reputation (reviews, press), physical assets, supplier relationships. Use web search. Distinguish facts from reasonable inferences and flag which is which. Be specific — vague answers are failures.` },
  { key: "industry", name: "Industry Analyst", icon: "📊",
    system: `You are a PE industry analyst. Research the specific sector: total addressable market size, CAGR, major players & their market share, recent M&A activity, consumer/B2B trends, technology disruption risks, barriers to entry. Use web search for current numbers. Conclude clearly: is this sector attractive for PE investment right now and why?` },
  { key: "economist", name: "Macro/Micro Economist", icon: "📉",
    system: `You are a PE economist. Analyze current economic conditions affecting this specific business and sector. Cover: inflation impact on input costs, interest rate environment (effect on valuations & borrowing), consumer discretionary spending trends, local employment & wage pressures, supply chain state, energy costs if relevant. Use current web data. Give a clear verdict: do macro/micro conditions favor investment now, in 6 months, or later?` },
  { key: "risk", name: "Risk Assessor", icon: "⚠️",
    system: `You are a PE risk specialist. Identify EVERY risk associated with this company and investment — nothing is too small. Categories: key-person risk, lease/contract expiry, supplier concentration, regulatory changes, competitive threats (local & big-chain), food safety/operational risks, market saturation, debt service risks, economic sensitivity. Rate each: CRITICAL / HIGH / MEDIUM / LOW. Be paranoid — missing a risk is a career-ending mistake in PE.` },
  { key: "comparator", name: "Investment Comparator", icon: "🔍",
    system: `You are a comparable deals analyst. Using the market intelligence provided at the start of this analysis, do a deep pattern analysis: what made similar sector investments succeed vs fail? What entry multiples were paid? What were the common value creation levers? What caused write-offs? Extract 5 specific lessons directly applicable to this investment decision. Be direct and analytical.` },
];

const STRATEGY_AGENTS = [
  { key: "entry", name: "Entry & Pricing Strategist", icon: "💰",
    system: `You are a PE entry and pricing expert. Based on ALL research provided, determine: (1) Fair value range of the business using 2-3 methods (revenue multiple, EBITDA multiple, DCF estimate), (2) Whether any stated asking price is fair/high/low, (3) Optimal % stake to acquire and why, (4) Recommended offer price, (5) CRITICAL — if the investment amount seems mismatched (e.g. €10M for a €500K bakery), proactively suggest better capital deployment: multiple acquisitions, full buyout, platform build, etc. Use real comparable multiples from the research. Show your math.` },
  { key: "gameplan", name: "Game Plan Agent", icon: "🗺️",
    system: `You are a PE value creation strategist. Based on ALL research, build a concrete investor game plan: (1) 100-day priorities (quick wins, stabilization), (2) Year 1-3 operational improvements — specific, not generic, (3) Fixable flaws: what the investor CAN change (management, ops, pricing, expansion, branding), (4) Unfixable flaws: structural issues that are permanent (location, sector headwinds, etc.), (5) Key KPIs to track. Make this a real playbook an investor could follow tomorrow.` },
  { key: "exit", name: "Exit Strategy Agent", icon: "🚪",
    system: `You are a PE exit specialist. Based on ALL research, plan the exit: (1) Realistic exit routes ranked by likelihood (strategic acquirer — name the most likely buyers, secondary PE sale, management buyout, IPO unlikely/likely), (2) Target exit timeline (3yr/5yr/7yr — which and why), (3) Projected MOIC and IRR under base/bull/bear cases, (4) Specific market signals and economic indicators that should TRIGGER a sale (e.g., rising sector M&A multiples, competitor acquisition activity, margin expansion milestones), (5) Worst-case exit scenario. Be specific — this is what the investor reads when deciding when to sell.` },
];

const CRITIC1_SYSTEM = `You are the most demanding senior PE analyst in the firm. You review research agent outputs and reject anything vague, superficial, or missing key data. Respond ONLY with raw valid JSON, no markdown, no backticks, no preamble: {"approved":boolean,"score":0-10,"feedback":"specific, harsh critique of what is wrong and weak","missing":["specific missing elements"]}. Score below 7 = automatic rejection. Common failure modes to catch: generic statements without numbers, missing web search evidence, no source citations, vague risk descriptions, missing sector-specific context.`;

const CRITIC2_SYSTEM = `You are the most exacting PE partner before investment committee. You review strategy outputs and tear apart weak logic, overoptimism, and unsupported projections. Respond ONLY with raw valid JSON, no markdown, no backticks, no preamble: {"approved":boolean,"score":0-10,"feedback":"specific critique of logical flaws and overoptimism","missing":["specific gaps in strategy"]}. Score below 7 = rejection. Look for: unrealistic multiples, missing exit comparable data, vague game plans with no specifics, pricing without methodology shown.`;

const MASTER_SYSTEM = `You are the CIO of a top PE firm writing the final investment committee memo. Synthesize ALL research and strategy outputs into a definitive report. Use EXACTLY these section headers with ## prefix:

## INVESTMENT SCORE
[number]/100 — [Strong Buy / Buy / Hold / Pass]
Scoring: 80-100=Strong Buy, 60-79=Buy, 40-59=Hold, 0-39=Pass
Include 2 sentences explaining the score.

## EXECUTIVE SUMMARY
3 sharp paragraphs. No fluff. What is this company, what is the opportunity, what is the verdict.

## RESEARCH FINDINGS
Synthesize what the research team found. Company, market, economy, risks — key facts only.

## INVESTMENT PREDICTION & REASONING
Where will this business be in 3-5 years? Why? What are the key variables? Be specific.

## WORST CASE SCENARIO
Paint the full downside. What goes wrong and how bad does it get? Numbers.

## FULL RISK PROFILE
All material risks with severity. Format: Risk Name | Severity | Mitigation Available.

## STRONGEST SUITS
What makes this business genuinely worth buying. Real competitive advantages.

## FIXABLE FLAWS
What the right investor can change. Specific operational, management, strategic improvements.

## UNFIXABLE FLAWS
Structural problems that cannot be fixed regardless of capital or management. Be honest.

## GAME PLAN SUMMARY
Entry price recommendation, % stake, 100-day plan headline, 3-year value creation thesis.

## EXIT CONDITIONS
Specific signals that mean it's time to sell. Target buyer profiles. MOIC/IRR projections.

## COMPARABLE DEALS
3-5 recent deals in this sector or adjacent — what happened to them, what we can learn.

## ACTION PLAN
(Include ONLY if score >= 60) Concrete next steps: due diligence checklist, negotiation approach, first 30 days.

Write like a senior banker — precise, data-anchored, honest about uncertainty. No generic advice.`;

// ─── AGENT RUNNER ─────────────────────────────────────────────────────────────
async function runAgentWithCritic(agent, criticSystem, context, onAgent) {
  onAgent(agent.name, "running", "");

  let result;
  try {
    result = await callClaude(agent.system, context, true);
  } catch (e) {
    onAgent(agent.name, "error", e.message);
    return `[${agent.name} failed: ${e.message}]`;
  }

  // Critic review
  onAgent(agent.name, "reviewing", "");
  let criticData = { approved: true, score: 8, feedback: "", missing: [] };
  try {
    const raw = await callClaude(criticSystem, `Agent: ${agent.name}\n\nOutput to review:\n${result}`, false);
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    criticData = parsed;
  } catch {
    criticData = { approved: true, score: 7, feedback: "", missing: [] };
  }

  // Revise if rejected
  if (!criticData.approved || criticData.score < 7) {
    onAgent(agent.name, "revising", criticData.feedback || "Output did not meet quality threshold");
    try {
      result = await callClaude(
        agent.system,
        `${context}\n\n━━━ CRITIC FEEDBACK — YOUR PREVIOUS RESPONSE WAS REJECTED (Score: ${criticData.score}/10) ━━━\n${criticData.feedback}\nCritically missing: ${(criticData.missing || []).join(", ")}\n\nRevise completely. Address every point of criticism. Be more specific, more data-driven, and more thorough.`,
        true
      );
    } catch {
      // keep original if revision fails
    }
  }

  onAgent(agent.name, "done", result);
  return result;
}

// ─── FULL PIPELINE ────────────────────────────────────────────────────────────
async function runFullAnalysis(userInput, onPhase, onAgent) {
  // Phase 1: Market Scout
  onPhase(0, "running");
  onAgent(MARKET_SCOUT.name, "running", "");
  let marketData = "";
  try {
    marketData = await callClaude(MARKET_SCOUT.system, `Deal target: ${userInput}`);
    onAgent(MARKET_SCOUT.name, "done", marketData);
  } catch (e) {
    marketData = "Market intelligence could not be retrieved.";
    onAgent(MARKET_SCOUT.name, "error", e.message);
  }
  onPhase(0, "done");

  // Phase 2+3: Research Agents + Critic 1 (parallel)
  onPhase(1, "running");
  const researchCtx = `DEAL CONTEXT:\n${userInput}\n\nMARKET INTELLIGENCE FROM SCOUT:\n${marketData}`;
  const researchResults = await Promise.all(
    RESEARCH_AGENTS.map((agent) => runAgentWithCritic(agent, CRITIC1_SYSTEM, researchCtx, onAgent))
  );
  const [companyRes, industryRes, economistRes, riskRes, comparatorRes] = researchResults;
  onPhase(1, "done");
  onPhase(2, "done"); // critic 1 is embedded

  // Phase 4+5: Strategy Agents + Critic 2 (parallel)
  onPhase(3, "running");
  const stratCtx = `DEAL CONTEXT:\n${userInput}

MARKET INTELLIGENCE:\n${marketData}
COMPANY RESEARCH:\n${companyRes}
INDUSTRY ANALYSIS:\n${industryRes}
ECONOMIC ANALYSIS:\n${economistRes}
RISK ASSESSMENT:\n${riskRes}
COMPARABLE DEAL ANALYSIS:\n${comparatorRes}`;

  const strategyResults = await Promise.all(
    STRATEGY_AGENTS.map((agent) => runAgentWithCritic(agent, CRITIC2_SYSTEM, stratCtx, onAgent))
  );
  const [entryRes, gamePlanRes, exitRes] = strategyResults;
  onPhase(3, "done");
  onPhase(4, "done"); // critic 2 embedded

  // Phase 6: Master Synthesis
  onPhase(5, "running");
  onAgent("Master Synthesis Agent", "running", "");
  const masterCtx = `${stratCtx}
ENTRY & PRICING STRATEGY:\n${entryRes}
GAME PLAN:\n${gamePlanRes}
EXIT STRATEGY:\n${exitRes}`;

  let finalReport = "";
  try {
    finalReport = await callClaude(MASTER_SYSTEM, masterCtx, false);
    onAgent("Master Synthesis Agent", "done", finalReport);
  } catch (e) {
    finalReport = `Report generation failed: ${e.message}`;
    onAgent("Master Synthesis Agent", "error", e.message);
  }
  onPhase(5, "done");

  return {
    input: userInput,
    date: new Date().toISOString(),
    marketData,
    agentResults: { companyRes, industryRes, economistRes, riskRes, comparatorRes, entryRes, gamePlanRes, exitRes },
    finalReport,
  };
}

// ─── PARSE FINAL REPORT ───────────────────────────────────────────────────────
function parseReport(text) {
  const sections = {};
  if (!text) return { sections, score: null, verdict: null };
  const regex = /## ([A-Z &\/]+)\n([\s\S]*?)(?=\n## |$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) sections[m[1].trim()] = m[2].trim();

  const scoreText = sections["INVESTMENT SCORE"] || "";
  const scoreM = scoreText.match(/(\d+)\/100/);
  const verdictM = scoreText.match(/Strong Buy|Buy|Hold|Pass/i);
  return {
    sections,
    score: scoreM ? parseInt(scoreM[1]) : null,
    verdict: verdictM ? verdictM[0] : null,
  };
}

function verdictColor(v) {
  if (!v) return T.muted;
  const l = v.toLowerCase();
  if (l.includes("strong buy")) return T.success;
  if (l.includes("buy")) return "#4ADE80";
  if (l.includes("hold")) return T.warning;
  return T.danger;
}
function scoreColor(s) {
  if (s === null) return T.muted;
  if (s >= 80) return T.success;
  if (s >= 60) return "#4ADE80";
  if (s >= 40) return T.warning;
  return T.danger;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => {
      const acc = ACCOUNTS.find((a) => a.email === email && a.password === password);
      if (acc) onLogin(acc);
      else { setError("Invalid credentials."); setLoading(false); }
    }, 600);
  };

  const inputStyle = {
    width: "100%", padding: "11px 14px", background: "#060A14",
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.text,
    fontSize: 14, boxSizing: "border-box", outline: "none",
    fontFamily: "Trebuchet MS, sans-serif", marginTop: 6,
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Trebuchet MS, sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Background grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${T.border} 1px, transparent 1px)`, backgroundSize: "40px 40px", opacity: 0.4 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, #0C1830 0%, #05080F 70%)" }} />

      <div style={{ position: "relative", width: 420, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "44px 40px", boxShadow: "0 40px 80px #00000060" }}>
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "0.08em" }}>HOLLOW NORTH</div>
          <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.3em", marginTop: 5 }}>INTELLIGENCE PLATFORM</div>
          <div style={{ width: 32, height: 1, background: T.accent, margin: "16px auto 0" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, color: T.muted, letterSpacing: "0.15em", textTransform: "uppercase" }}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="analyst@firm.com" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 10, color: T.muted, letterSpacing: "0.15em", textTransform: "uppercase" }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={inputStyle} />
        </div>

        {error && <div style={{ marginBottom: 16, padding: "10px 14px", background: T.dangerDim, border: `1px solid ${T.danger}44`, borderRadius: 7, fontSize: 12, color: T.danger }}>{error}</div>}

        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "13px", background: loading ? T.dim : T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer", letterSpacing: "0.05em", fontFamily: "Trebuchet MS, sans-serif", transition: "background 0.2s" }}>
          {loading ? "Authenticating…" : "Access Platform"}
        </button>

        <div style={{ marginTop: 22, padding: "12px 14px", background: "#060A14", borderRadius: 8, fontSize: 11, color: T.dim, lineHeight: 1.6 }}>
          <span style={{ color: T.muted }}>Demo access: </span>demo@hollownorth.com / demo123
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════
function Sidebar({ page, setPage, user, onLogout }) {
  const navItems = [
    { id: "welcome", label: "Home", icon: "◈" },
    { id: "pe_bot", label: "PE Evaluator", icon: "⬡" },
    { id: "history", label: "Deal History", icon: "◷" },
    { id: "divider" },
    { id: "trading", label: "Trading Bot", icon: "◉", soon: true },
    { id: "cofounder", label: "Co-Founder Eval", icon: "◎", soon: true },
    { id: "daytrading", label: "Day Trading", icon: "◐", soon: true },
  ];

  return (
    <div style={{ width: 210, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "0.1em" }}>HOLLOW NORTH</div>
        <div style={{ fontSize: 9, color: T.accent, letterSpacing: "0.25em", marginTop: 3 }}>INTELLIGENCE</div>
      </div>

      <nav style={{ flex: 1, padding: "12px 0" }}>
        {navItems.map((item, i) => {
          if (item.id === "divider") return <div key={i} style={{ margin: "8px 20px", height: 1, background: T.border }} />;
          const active = page === item.id;
          return (
            <div key={item.id} onClick={() => !item.soon && setPage(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", cursor: item.soon ? "default" : "pointer", background: active ? T.accentGlow : "transparent", borderLeft: `2px solid ${active ? T.accent : "transparent"}`, color: active ? T.accentLight : item.soon ? T.dim : T.muted, fontSize: 13, transition: "all 0.15s", userSelect: "none" }}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.soon && <span style={{ fontSize: 8, background: T.border, padding: "2px 5px", borderRadius: 3, color: T.dim, letterSpacing: "0.1em" }}>SOON</span>}
            </div>
          );
        })}
      </nav>

      <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{user.firm}</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{user.role}</div>
        <button onClick={onLogout} style={{ marginTop: 10, fontSize: 10, color: T.dim, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: "0.1em" }}>SIGN OUT →</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function WelcomePage({ setPage, user }) {
  const tools = [
    { id: "pe_bot", icon: "⬡", title: "PE Evaluator", desc: "8-agent pipeline with dual critics. Deep research, pricing, game plan, exit strategy.", active: true },
    { id: "trading", icon: "◉", title: "Trading Bot", desc: "Algorithmic strategy builder and backtester against live market data.", soon: true },
    { id: "cofounder", icon: "◎", title: "Co-Founder Evaluator", desc: "Assess potential co-founders on compatibility, risk profile, and alignment.", soon: true },
    { id: "daytrading", icon: "◐", title: "Day Trading Tester", desc: "Real-time strategy evaluation against intraday market conditions.", soon: true },
  ];

  return (
    <div style={{ padding: "64px 64px 40px", maxWidth: 820 }}>
      <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 20 }}>
        Welcome back, {user.role}
      </div>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: 44, fontWeight: 700, color: T.text, margin: 0, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
        Decisions backed<br />by intelligence.
      </h1>
      <p style={{ fontSize: 15, color: T.muted, marginTop: 18, lineHeight: 1.75, maxWidth: 500 }}>
        Multi-agent AI research infrastructure for private equity professionals. Every deal run through 8 specialist agents, challenged by two independent critics, synthesized into a single investment verdict.
      </p>

      <button onClick={() => setPage("pe_bot")}
        style={{ marginTop: 28, padding: "13px 26px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "0.05em", fontFamily: "Trebuchet MS, sans-serif" }}>
        Start PE Analysis →
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 56 }}>
        {tools.map((tool) => (
          <div key={tool.id} onClick={() => tool.active && setPage(tool.id)}
            style={{ padding: "22px", background: T.card, border: `1px solid ${tool.active ? T.border : T.border}`, borderRadius: 12, cursor: tool.active ? "pointer" : "default", opacity: tool.soon ? 0.45 : 1, transition: "all 0.2s" }}>
            <div style={{ fontSize: 20, color: T.accent, marginBottom: 10 }}>{tool.icon}</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: T.text }}>{tool.title}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 7, lineHeight: 1.6 }}>{tool.desc}</div>
            {tool.soon && <div style={{ marginTop: 12, fontSize: 9, color: T.dim, letterSpacing: "0.2em" }}>COMING SOON</div>}
          </div>
        ))}
      </div>

      {/* Pipeline overview */}
      <div style={{ marginTop: 48, padding: "24px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.2em", marginBottom: 14 }}>PE EVALUATOR PIPELINE</div>
        <div style={{ display: "flex", gap: 0, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
          {["🔭 Scout", "🏢 Company", "📊 Industry", "📉 Economy", "⚠️ Risk", "🔍 Comparator", "🎯 Critic 1", "💰 Pricing", "🗺️ Game Plan", "🚪 Exit", "🔬 Critic 2", "👑 Master"].map((step, i, arr) => (
            <div key={step} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: T.muted, padding: "4px 10px", background: "#060A14", borderRadius: 6, whiteSpace: "nowrap" }}>{step}</div>
              {i < arr.length - 1 && <div style={{ fontSize: 10, color: T.dim, margin: "0 3px" }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PE BOT PAGE — ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════
function PEBotPage({ user, onSaveDeal }) {
  const [view, setView] = useState("input");
  const [mainInput, setMainInput] = useState("");
  const [showAdv, setShowAdv] = useState(false);
  const [adv, setAdv] = useState({ sector: "", location: "", askingPrice: "", stake: "", budget: "", notes: "" });
  const [phases, setPhases] = useState({});
  const [agents, setAgents] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const onPhase = useCallback((idx, status) => setPhases((p) => ({ ...p, [idx]: status })), []);
  const onAgent = useCallback((name, status, content) => setAgents((p) => ({ ...p, [name]: { status, content } })), []);

  const startAnalysis = async () => {
    if (!mainInput.trim()) { setErr("Please describe the deal or company."); return; }
    setErr("");
    setView("analyzing");
    setPhases({});
    setAgents({});

    const fullInput = [
      mainInput,
      adv.sector && `Sector: ${adv.sector}`,
      adv.location && `Location: ${adv.location}`,
      adv.askingPrice && `Asking Price: ${adv.askingPrice}`,
      adv.stake && `Target Stake: ${adv.stake}`,
      adv.budget && `Available Investment Capital: ${adv.budget}`,
      adv.notes && `Additional Context: ${adv.notes}`,
    ].filter(Boolean).join("\n");

    try {
      const analysis = await runFullAnalysis(fullInput, onPhase, onAgent);
      setResult(analysis);
      onSaveDeal(analysis);
      setView("report");
    } catch (e) {
      setErr(`Analysis failed: ${e.message}`);
      setView("input");
    }
  };

  const reset = () => {
    setView("input");
    setMainInput("");
    setAdv({ sector: "", location: "", askingPrice: "", stake: "", budget: "", notes: "" });
    setShowAdv(false);
    setErr("");
  };

  if (view === "input") return <PEInput mainInput={mainInput} setMainInput={setMainInput} showAdv={showAdv} setShowAdv={setShowAdv} adv={adv} setAdv={setAdv} onStart={startAnalysis} err={err} />;
  if (view === "analyzing") return <PEAnalyzing phases={phases} agents={agents} />;
  if (view === "report") return <PEReport result={result} onNew={reset} />;
}

// ─── INPUT FORM ───────────────────────────────────────────────────────────────
function PEInput({ mainInput, setMainInput, showAdv, setShowAdv, adv, setAdv, onStart, err }) {
  const advFields = [
    ["Sector / Industry", "sector", "e.g. Artisan Bakery, F&B Retail"],
    ["Location", "location", "e.g. Vienna, Austria"],
    ["Asking Price", "askingPrice", "e.g. €4,000,000"],
    ["Target Stake %", "stake", "e.g. 30%"],
    ["Investment Budget", "budget", "e.g. €10,000,000"],
    ["Additional Notes", "notes", "Anything else relevant"],
  ];

  return (
    <div style={{ padding: "56px 64px", maxWidth: 760, fontFamily: "Trebuchet MS, sans-serif" }}>
      <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 14 }}>PE Deal Evaluator</div>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: 30, fontWeight: 700, color: T.text, margin: "0 0 8px", letterSpacing: "-0.02em" }}>Describe the deal</h2>
      <p style={{ fontSize: 13, color: T.muted, margin: "0 0 28px", lineHeight: 1.6 }}>Provide as little or as much as you know. Give us a name, or a full brief — our agents fill the gaps.</p>

      <textarea value={mainInput} onChange={(e) => setMainInput(e.target.value)}
        placeholder={"Examples:\n• \"Müller's Bakery, Vienna — considering 30% stake\"\n• \"Small artisan bakery chain, 3 locations, €2M revenue, owner wants €4M for full exit\"\n• \"We have €10M to invest in the Austrian food & beverage sector\""}
        style={{ width: "100%", minHeight: 140, padding: "16px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 14, fontFamily: "Trebuchet MS, sans-serif", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.65 }} />

      <button onClick={() => setShowAdv(!showAdv)} style={{ marginTop: 14, background: "none", border: "none", color: T.accentLight, fontSize: 12, cursor: "pointer", padding: 0, letterSpacing: "0.05em" }}>
        {showAdv ? "▾ Hide" : "▸ Add"} optional fields
      </button>

      {showAdv && (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {advFields.map(([label, key, placeholder]) => (
            <div key={key}>
              <label style={{ fontSize: 10, color: T.muted, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</label>
              <input value={adv[key]} onChange={(e) => setAdv((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
                style={{ width: "100%", marginTop: 6, padding: "9px 12px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 13, boxSizing: "border-box", outline: "none", fontFamily: "Trebuchet MS, sans-serif" }} />
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ marginTop: 16, padding: "10px 14px", background: T.dangerDim, border: `1px solid ${T.danger}44`, borderRadius: 8, fontSize: 12, color: T.danger }}>{err}</div>}

      <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 18 }}>
        <button onClick={onStart} style={{ padding: "13px 28px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Trebuchet MS, sans-serif", letterSpacing: "0.05em" }}>
          Run Full Analysis →
        </button>
        <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5 }}>~3–6 min · 8 agents · dual critic validation</div>
      </div>
    </div>
  );
}

// ─── ANALYSIS PROGRESS ────────────────────────────────────────────────────────
function PEAnalyzing({ phases, agents }) {
  const PHASES = [
    { label: "Market Scout", sub: "Finding comparable deals" },
    { label: "Research + Critic 1", sub: "5 agents + quality gate" },
    { label: "Critic 1 Review", sub: "Embedded in research phase" },
    { label: "Strategy + Critic 2", sub: "3 strategy agents + review" },
    { label: "Critic 2 Review", sub: "Embedded in strategy phase" },
    { label: "Master Synthesis", sub: "Final report generation" },
  ];

  const ALL_AGENTS = [
    { name: MARKET_SCOUT.name, icon: MARKET_SCOUT.icon },
    ...RESEARCH_AGENTS.map((a) => ({ name: a.name, icon: a.icon })),
    ...STRATEGY_AGENTS.map((a) => ({ name: a.name, icon: a.icon })),
    { name: "Master Synthesis Agent", icon: "👑" },
  ];

  const statusConfig = {
    running: { color: T.warning, label: "Researching…", dot: "●" },
    reviewing: { color: T.accent, label: "Critic reviewing…", dot: "◎" },
    revising: { color: T.danger, label: "Revising (critic rejected)", dot: "↺" },
    done: { color: T.success, label: "Complete", dot: "✓" },
    error: { color: T.danger, label: "Error", dot: "✗" },
  };

  return (
    <div style={{ padding: "48px 64px", maxWidth: 780, fontFamily: "Trebuchet MS, sans-serif" }}>
      <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 14 }}>Analysis Running</div>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>8-agent pipeline in progress</h2>
      <p style={{ fontSize: 12, color: T.muted, margin: "0 0 32px" }}>Results stream in as each agent completes. Critic gates ensure quality before proceeding.</p>

      {/* Phase indicators */}
      <div style={{ display: "flex", gap: 6, marginBottom: 36, flexWrap: "wrap" }}>
        {PHASES.map((ph, i) => {
          const s = phases[i];
          return (
            <div key={i} style={{ padding: "8px 12px", background: T.card, border: `1px solid ${s === "done" ? T.success + "66" : s === "running" ? T.accent + "66" : T.border}`, borderRadius: 8, minWidth: 90 }}>
              <div style={{ fontSize: 9, color: s === "done" ? T.success : s === "running" ? T.accent : T.dim, marginBottom: 3 }}>
                {s === "done" ? "✓ DONE" : s === "running" ? "● ACTIVE" : `${i + 1}`}
              </div>
              <div style={{ fontSize: 10, color: s ? T.muted : T.dim, lineHeight: 1.3 }}>{ph.label}</div>
            </div>
          );
        })}
      </div>

      {/* Agent list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {ALL_AGENTS.map((agent) => {
          const info = agents[agent.name];
          const s = info?.status;
          const cfg = statusConfig[s];
          return (
            <div key={agent.name} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px", background: T.card, border: `1px solid ${s === "done" ? T.success + "33" : s === "revising" ? T.danger + "33" : T.border}`, borderRadius: 9, transition: "all 0.3s" }}>
              <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>{agent.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: s ? T.text : T.dim }}>{agent.name}</span>
                  {cfg && <span style={{ fontSize: 10, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.dot} {cfg.label}</span>}
                </div>
                {s === "revising" && info?.content && (
                  <div style={{ marginTop: 6, fontSize: 10, color: T.warning, background: T.warningDim, padding: "5px 9px", borderRadius: 5, lineHeight: 1.5 }}>
                    Critic: {info.content.slice(0, 130)}{info.content.length > 130 ? "…" : ""}
                  </div>
                )}
                {s === "done" && info?.content && (
                  <div style={{ marginTop: 5, fontSize: 10, color: T.dim, lineHeight: 1.5, overflow: "hidden", maxHeight: 32 }}>
                    {info.content.replace(/#+/g, "").slice(0, 120).trim()}…
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── REPORT VIEW ──────────────────────────────────────────────────────────────
function PEReport({ result, onNew }) {
  const [tab, setTab] = useState("report");
  const parsed = parseReport(result.finalReport);
  const sc = parsed.score;
  const vc = verdictColor(parsed.verdict);

  const REPORT_SECTIONS = [
    { key: "EXECUTIVE SUMMARY", icon: "◈" },
    { key: "RESEARCH FINDINGS", icon: "🔭" },
    { key: "INVESTMENT PREDICTION & REASONING", icon: "📈" },
    { key: "WORST CASE SCENARIO", icon: "💀" },
    { key: "FULL RISK PROFILE", icon: "⚠️" },
    { key: "STRONGEST SUITS", icon: "💪" },
    { key: "FIXABLE FLAWS", icon: "🔧" },
    { key: "UNFIXABLE FLAWS", icon: "🔒" },
    { key: "GAME PLAN SUMMARY", icon: "🗺️" },
    { key: "EXIT CONDITIONS", icon: "🚪" },
    { key: "COMPARABLE DEALS", icon: "🔍" },
    { key: "ACTION PLAN", icon: "✅", highlight: true },
  ];

  const agentLabels = {
    companyRes: { name: "Company Deep Diver", icon: "🏢" },
    industryRes: { name: "Industry Analyst", icon: "📊" },
    economistRes: { name: "Macro/Micro Economist", icon: "📉" },
    riskRes: { name: "Risk Assessor", icon: "⚠️" },
    comparatorRes: { name: "Investment Comparator", icon: "🔍" },
    entryRes: { name: "Entry & Pricing Strategist", icon: "💰" },
    gamePlanRes: { name: "Game Plan Agent", icon: "🗺️" },
    exitRes: { name: "Exit Strategy Agent", icon: "🚪" },
  };

  return (
    <div style={{ fontFamily: "Trebuchet MS, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "36px 60px 24px", background: T.card, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 8 }}>Investment Analysis</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{result.input.slice(0, 100)}</div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>{new Date(result.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 52, fontWeight: 700, color: scoreColor(sc), lineHeight: 1 }}>{sc ?? "—"}</div>
            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>OUT OF 100</div>
            {parsed.verdict && (
              <div style={{ marginTop: 10, display: "inline-block", padding: "5px 14px", background: vc + "22", border: `1px solid ${vc}55`, borderRadius: 20, fontSize: 11, fontWeight: 700, color: vc, letterSpacing: "0.1em" }}>
                {parsed.verdict.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 24, alignItems: "center" }}>
          {["report", "agents", "raw"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "7px 14px", background: tab === t ? T.accent : "transparent", border: `1px solid ${tab === t ? T.accent : T.border}`, borderRadius: 6, color: tab === t ? "#fff" : T.muted, fontSize: 11, cursor: "pointer", fontFamily: "Trebuchet MS, sans-serif", letterSpacing: "0.05em" }}>
              {t === "report" ? "◈ Full Report" : t === "agents" ? "⬡ Agent Outputs" : "◷ Raw Data"}
            </button>
          ))}
          <button onClick={onNew} style={{ marginLeft: "auto", padding: "7px 14px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, color: T.muted, fontSize: 11, cursor: "pointer", fontFamily: "Trebuchet MS, sans-serif" }}>
            + New Analysis
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "28px 60px 60px" }}>
        {tab === "report" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
            {REPORT_SECTIONS.map(({ key, icon, highlight }) => {
              const content = parsed.sections[key];
              if (!content) return null;
              return (
                <div key={key} style={{ padding: "20px 24px", background: highlight ? T.successDim : T.card, border: `1px solid ${highlight ? T.success + "44" : T.border}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ fontSize: 10, color: highlight ? T.success : T.accent, letterSpacing: "0.2em", fontWeight: 700 }}>{key}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{content}</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "agents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
            {Object.entries(result.agentResults || {}).map(([key, content]) => {
              const meta = agentLabels[key] || { name: key, icon: "◈" };
              return (
                <div key={key} style={{ padding: "18px 22px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <span>{meta.icon}</span>
                    <span style={{ fontSize: 10, color: T.accent, letterSpacing: "0.15em", fontWeight: 700 }}>{meta.name.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 280, overflowY: "auto" }}>{content}</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "raw" && (
          <div style={{ padding: "20px 24px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, maxWidth: 820 }}>
            <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.2em", marginBottom: 14 }}>RAW MASTER REPORT</div>
            <pre style={{ fontSize: 12, color: T.muted, lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0, fontFamily: "Trebuchet MS, sans-serif" }}>{result.finalReport}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEAL HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
function HistoryPage({ deals }) {
  const [selected, setSelected] = useState(null);

  if (selected) return (
    <div>
      <div style={{ padding: "18px 60px", borderBottom: `1px solid ${T.border}` }}>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 12, fontFamily: "Trebuchet MS, sans-serif", letterSpacing: "0.05em" }}>← Back to history</button>
      </div>
      <PEReport result={selected} onNew={() => setSelected(null)} />
    </div>
  );

  return (
    <div style={{ padding: "56px 64px", maxWidth: 760, fontFamily: "Trebuchet MS, sans-serif" }}>
      <div style={{ fontSize: 10, color: T.accent, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 14 }}>Deal History</div>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 700, color: T.text, margin: "0 0 28px" }}>Past Analyses</h2>

      {deals.length === 0 ? (
        <div style={{ padding: "56px", textAlign: "center", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, color: T.dim, fontSize: 13 }}>
          No analyses yet. Run your first deal to see it here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {deals.map((deal, i) => {
            const p = parseReport(deal.finalReport || "");
            return (
              <div key={i} onClick={() => setSelected(deal)}
                style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 20px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 700, color: scoreColor(p.score), minWidth: 44, textAlign: "center" }}>{p.score ?? "?"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.input?.slice(0, 75)}</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>{new Date(deal.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
                {p.verdict && <div style={{ fontSize: 11, color: verdictColor(p.verdict), fontWeight: 700, letterSpacing: "0.08em" }}>{p.verdict.toUpperCase()}</div>}
                <div style={{ color: T.dim }}>→</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMING SOON
// ═══════════════════════════════════════════════════════════════════════════════
function ComingSoon({ page }) {
  const names = { trading: "Trading Bot", cofounder: "Co-Founder Evaluator", daytrading: "Day Trading Strategy Tester" };
  return (
    <div style={{ padding: "100px 64px", textAlign: "center", fontFamily: "Trebuchet MS, sans-serif" }}>
      <div style={{ fontSize: 36, marginBottom: 20 }}>◌</div>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, color: T.text }}>{names[page]}</h2>
      <p style={{ color: T.muted, marginTop: 10, fontSize: 13 }}>This module is currently in development.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("welcome");
  const [deals, setDeals] = useState([]);

  // Load deals from storage on login
  useEffect(() => {
    if (!user) return;
    window.storage.get(`deals:${user.email}`).then((r) => {
      if (r?.value) setDeals(JSON.parse(r.value));
    }).catch(() => {});
  }, [user]);

  const saveDeal = async (deal) => {
    const updated = [deal, ...deals];
    setDeals(updated);
    if (user) {
      await window.storage.set(`deals:${user.email}`, JSON.stringify(updated)).catch(() => {});
    }
  };

  if (!user) return <LoginScreen onLogin={(acc) => { setUser(acc); setPage("welcome"); }} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, color: T.text }}>
      <Sidebar page={page} setPage={setPage} user={user} onLogout={() => { setUser(null); setDeals([]); }} />
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {page === "welcome" && <WelcomePage setPage={setPage} user={user} />}
        {page === "pe_bot" && <PEBotPage user={user} onSaveDeal={saveDeal} />}
        {page === "history" && <HistoryPage deals={deals} />}
        {(page === "trading" || page === "cofounder" || page === "daytrading") && <ComingSoon page={page} />}
      </main>
    </div>
  );
}
