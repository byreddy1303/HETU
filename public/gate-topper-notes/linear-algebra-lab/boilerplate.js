/* ═══════════════════════════════════════════════════════════════
   LA MASTERY HUB — Shared Boilerplate
   Defines reusable React components in the global window scope.
   Each module HTML file loads this BEFORE its own content script.
   ═══════════════════════════════════════════════════════════════ */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ────────────────────────────────────────────────────────────────
   MODULE REGISTRY
   ──────────────────────────────────────────────────────────────── */
window.MODULES = [
  { num: 1,  title: "Foundations",        file: "module-01-foundations.html",      ready: true,  lab: "module-01-problem-lab.html" },
  { num: 2,  title: "Span & Subspaces",   file: "module-02-span-subspaces.html",   ready: true,  lab: "module-02-problem-lab.html" },
  { num: 3,  title: "Linear Systems",     file: "module-03-systems.html",          ready: true,  lab: "module-03-problem-lab.html" },
  { num: 4,  title: "Echelon & Rank",     file: "module-04-echelon-rank.html",     ready: true,  lab: "module-04-problem-lab.html" },
  { num: 5,  title: "Determinants",       file: "module-05-determinants.html",     ready: true,  lab: "module-05-problem-lab.html" },
  { num: 6,  title: "Eigenvalues",        file: "module-06-eigenvalues.html",      ready: true,  lab: "module-06-problem-lab.html" },
  { num: 7,  title: "Eigen Power Tools",  file: "module-07-eigen-power.html",      ready: true,  lab: "module-07-problem-lab.html" },
  { num: 8,  title: "Decompositions",     file: "module-08-decompositions.html",   ready: true,  lab: "module-08-problem-lab.html" },
  { num: 9,  title: "Cheat Sheet",        file: "module-09-cheatsheet.html",       ready: true  },
  { num: 10, title: "Mock Test",          file: "module-10-mocktest.html",         ready: true  },
  { num: 11, title: "Theorems Vault",     file: "module-11-theorems.html",         ready: true  },
];

/* ────────────────────────────────────────────────────────────────
   TEX RENDERING (LaTeX via KaTeX)
   ──────────────────────────────────────────────────────────────── */
function Tex({ src, block = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.katex) return;
    try {
      window.katex.render(src, ref.current, {
        displayMode: !!block,
        throwOnError: false,
        errorColor: "var(--danger)",
        strict: "ignore",
        trust: false,
      });
    } catch (e) {
      if (ref.current) ref.current.textContent = src;
    }
  }, [src, block]);
  const Tag = block ? "div" : "span";
  return <Tag ref={ref} className={(block ? "my-2" : "inline") + " " + className}/>;
}
const T  = ({ src, className }) => <Tex src={src} block={false} className={className} />;
const BT = ({ src, className }) => <Tex src={src} block={true}  className={className} />;
window.Tex = Tex; window.T = T; window.BT = BT;

/* ────────────────────────────────────────────────────────────────
   THEME TOGGLE
   ──────────────────────────────────────────────────────────────── */
function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  });
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.classList.remove("dark", "light");
    root.classList.add(next);
    try { localStorage.setItem("la-hub::theme", next); } catch {}
    setTheme(next);
    setTimeout(() => root.classList.remove("theme-switching"), 360);
  };
  return (
    <button onClick={toggle} className="theme-toggle" title={"Switch to " + (theme === "dark" ? "light" : "dark") + " theme"} aria-label="Toggle theme">
      <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
      <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
  );
}
window.ThemeToggle = ThemeToggle;

/* ────────────────────────────────────────────────────────────────
   SIDEBAR CONTEXT
   ──────────────────────────────────────────────────────────────── */
const SidebarCtx = React.createContext({ open: false, toggle: () => {}, currentModule: 0 });

function SidebarProvider({ currentModule, children }) {
  const isDesktop = () => typeof window !== "undefined" && window.innerWidth >= 1280;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("la-hub::sidebar");
      return saved !== null ? saved === "open" : isDesktop();
    } catch { return false; }
  });

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    try { localStorage.setItem("la-hub::sidebar", open ? "open" : "closed"); } catch {}
    const root = document.getElementById("root");
    if (root) {
      const push = open && window.innerWidth >= 1280;
      root.style.transition = "margin-left 280ms cubic-bezier(.2,.7,.2,1)";
      root.style.marginLeft = push ? "256px" : "0";
    }
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      const root = document.getElementById("root");
      if (root) {
        const push = open && window.innerWidth >= 1280;
        root.style.marginLeft = push ? "256px" : "0";
      }
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  return (
    <SidebarCtx.Provider value={{ open, toggle, currentModule }}>
      {children}
    </SidebarCtx.Provider>
  );
}
window.SidebarProvider = SidebarProvider;

/* ────────────────────────────────────────────────────────────────
   SIDEBAR PANEL
   ──────────────────────────────────────────────────────────────── */
function Sidebar() {
  const { open, toggle, currentModule } = React.useContext(SidebarCtx);
  return (
    <>
      {/* Mobile dim backdrop */}
      <div
        onClick={toggle}
        style={{
          position: "fixed", inset: 0, zIndex: 44,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 280ms cubic-bezier(.2,.7,.2,1)",
        }}
        className="xl:hidden"
      />

      {/* Sidebar panel */}
      <aside style={{
        position: "fixed",
        top: 0, left: 0,
        width: 256,
        height: "100vh",
        zIndex: 45,
        background: "var(--bg-elev-1)",
        borderRight: "1px solid var(--border)",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 280ms cubic-bezier(.2,.7,.2,1)",
        display: "flex", flexDirection: "column",
        overflowY: "auto", overflowX: "hidden",
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: "14px 12px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <a href="index.html" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flex: 1, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--grad-hero)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>LA</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", lineHeight: 1.25 }}>Mastery Hub</div>
              <div style={{ fontSize: 10, color: "var(--text-faded)", lineHeight: 1.25 }}>Linear Algebra</div>
            </div>
          </a>
          <button onClick={toggle} title="Close sidebar" style={{
            width: 28, height: 28, borderRadius: 6,
            background: "var(--bg-elev-3)", border: "1px solid var(--border)",
            color: "var(--text-dim)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Module list */}
        <nav style={{ padding: "8px", flex: 1, overflowY: "auto" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--text-mute)", padding: "8px 8px 5px", fontWeight: 700 }}>MODULES</div>
          {window.MODULES.map(m => {
            const currentPath = typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "";
            const onLab = m.lab && currentPath === m.lab;
            const active = m.num === currentModule && !onLab;
            const labActive = m.num === currentModule && onLab;
            return (
              <React.Fragment key={m.num}>
                <a
                  href={m.ready ? m.file : "#"}
                  onClick={e => { if (!m.ready) e.preventDefault(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 10px",
                    borderRadius: 8,
                    marginBottom: 2,
                    textDecoration: "none",
                    opacity: m.ready ? 1 : 0.4,
                    cursor: m.ready ? "pointer" : "not-allowed",
                    background: active ? "var(--accent-soft)" : "transparent",
                    border: "1px solid " + (active ? "var(--accent-border)" : "transparent"),
                    color: active ? "var(--accent)" : (m.ready ? "var(--text-dim)" : "var(--text-mute)"),
                    transition: "background 140ms, color 140ms, border-color 140ms",
                  }}
                  onMouseEnter={e => { if (!active && m.ready) { e.currentTarget.style.background = "var(--bg-elev-2)"; e.currentTarget.style.color = "var(--text)"; } }}
                  onMouseLeave={e => { if (!active && m.ready) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-dim)"; } }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-2)", minWidth: 22, fontWeight: 600, letterSpacing: "0.04em" }}>M{m.num}</span>
                  <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, lineHeight: 1.3 }}>{m.title}</span>
                  {active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />}
                </a>
                {m.lab && (
                  <a
                    href={m.lab}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 10px 4px 36px",
                      borderRadius: 6,
                      marginBottom: 3,
                      textDecoration: "none",
                      background: labActive ? "var(--accent-2-soft)" : "transparent",
                      border: "1px solid " + (labActive ? "var(--accent-2-border)" : "transparent"),
                      color: labActive ? "var(--accent-2)" : "var(--text-faded)",
                      transition: "background 140ms, color 140ms, border-color 140ms",
                      fontSize: 11,
                    }}
                    onMouseEnter={e => { if (!labActive) { e.currentTarget.style.background = "var(--bg-elev-2)"; e.currentTarget.style.color = "var(--accent-2)"; } }}
                    onMouseLeave={e => { if (!labActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-faded)"; } }}
                  >
                    <span style={{ fontSize: 11, opacity: 0.85 }}>🎯</span>
                    <span style={{ fontWeight: labActive ? 600 : 500, letterSpacing: "0.02em" }}>Problem Lab</span>
                    {labActive && <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "var(--accent-2)", flexShrink: 0 }} />}
                  </a>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 9.5, color: "var(--text-faded)", textAlign: "center", letterSpacing: "0.05em" }}>GATE CS · GATE DA · IIITH PGEE</div>
        </div>
      </aside>
    </>
  );
}
window.Sidebar = Sidebar;

/* ────────────────────────────────────────────────────────────────
   TOP NAV
   ──────────────────────────────────────────────────────────────── */
function TopNav({ currentModule }) {
  const { toggle: toggleSidebar } = React.useContext(SidebarCtx);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      style={{
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: "var(--bg-overlay)",
        borderBottom: "1px solid " + (scrolled ? "var(--border)" : "transparent"),
        transition: "border-color var(--t-base) var(--ease-out)",
      }}
      className="sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-3">
        {/* Sidebar toggle — always visible */}
        <button onClick={toggleSidebar} className="theme-toggle" title="Toggle module sidebar" aria-label="Toggle sidebar" style={{ flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>

        <a href="index.html" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm" style={{background: "var(--grad-hero)", color: "#fff"}}>LA</div>
          <div className="hidden sm:block leading-tight">
            <div className="font-bold tracking-tight text-[15px]">Mastery Hub</div>
            <div className="text-[11px]" style={{color: "var(--text-faded)"}}>Linear Algebra</div>
          </div>
        </a>

        {/* Current module badge (compact, visible when sidebar closed) */}
        <div className="hidden sm:flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-dim)" }}>
          <span style={{ color: "var(--text-faded)" }}>·</span>
          {window.MODULES.find(m => m.num === currentModule) && (
            <span className="px-2.5 py-1 rounded-md"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent)", fontWeight: 600 }}>
              M{currentModule} · {(window.MODULES.find(m => m.num === currentModule) || {}).title}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
window.TopNav = TopNav;

/* ────────────────────────────────────────────────────────────────
   PROSE HELPERS
   ──────────────────────────────────────────────────────────────── */
const H2 = ({ children }) => <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" style={{color: "var(--text)"}}>{children}</h2>;
const H3 = ({ children }) => <h3 className="text-xl md:text-[22px] font-semibold tracking-tight mt-7 mb-2" style={{color: "var(--text)"}}>{children}</h3>;
const H4 = ({ children }) => <h4 className="text-base font-semibold mt-4 mb-1.5" style={{color: "var(--accent)"}}>{children}</h4>;
const P  = ({ children }) => <p className="text-[17px] leading-[1.8]" style={{color: "var(--text)"}}>{children}</p>;
const UL = ({ children }) => <ul className="list-disc list-outside ml-5 space-y-2 text-[17px] leading-relaxed" style={{color: "var(--text)"}}>{children}</ul>;
const OL = ({ children }) => <ol className="list-decimal list-outside ml-5 space-y-2 text-[17px] leading-relaxed" style={{color: "var(--text)"}}>{children}</ol>;
const Li = ({ children }) => <li className="marker:text-[var(--accent)]">{children}</li>;
const B  = ({ children }) => <strong className="font-semibold" style={{color: "var(--text)"}}>{children}</strong>;
const Em = ({ children }) => <em className="not-italic font-medium" style={{color: "var(--accent)"}}>{children}</em>;
const Code = ({ children }) => <code className="font-mono text-[13.5px] px-1.5 py-0.5 rounded" style={{background: "var(--bg-elev-3)", color: "var(--accent-2)", border: "1px solid var(--border)"}}>{children}</code>;
window.H2 = H2; window.H3 = H3; window.H4 = H4;
window.P = P; window.UL = UL; window.OL = OL; window.Li = Li;
window.B = B; window.Em = Em; window.Code = Code;

/* ────────────────────────────────────────────────────────────────
   CALLOUT
   ──────────────────────────────────────────────────────────────── */
function Callout({ kind = "info", title, children }) {
  const styles = {
    info:   { bg: "var(--accent-soft)",   bd: "var(--accent-border)",   fg: "var(--accent)",   icon: "🧭", label: "INSIGHT" },
    trap:   { bg: "var(--warn-soft)",     bd: "var(--warn-border)",     fg: "var(--warn)",     icon: "⚠",  label: "GATE TRAP" },
    proof:  { bg: "var(--accent-2-soft)", bd: "var(--accent-2-border)", fg: "var(--accent-2)", icon: "🔧", label: "PROOF" },
    ml:     { bg: "var(--accent-3-soft)", bd: "var(--accent-3-border)", fg: "var(--accent-3)", icon: "🧠", label: "ML / AI BRIDGE" },
    recall: { bg: "var(--pink-soft)",     bd: "var(--pink-border)",     fg: "var(--pink)",     icon: "📌", label: "RECALL" },
    danger: { bg: "var(--danger-soft)",   bd: "var(--danger-border)",   fg: "var(--danger)",   icon: "⛔", label: "WATCH OUT" },
  };
  const s = styles[kind] || styles.info;
  return (
    <div className="my-5 rounded-xl p-5" style={{background: s.bg, border: "1px solid " + s.bd}}>
      <div className="text-[11px] tracking-[0.18em] font-semibold mb-2 flex items-center gap-2" style={{color: s.fg}}>
        <span className="text-base">{s.icon}</span>
        {title ? (s.label + " · " + title) : s.label}
      </div>
      <div className="space-y-3 text-[16px] leading-relaxed" style={{color: "var(--text)"}}>{children}</div>
    </div>
  );
}
window.Callout = Callout;

/* ────────────────────────────────────────────────────────────────
   CONCEPT CARD
   ──────────────────────────────────────────────────────────────── */
function ConceptCard({ id, label, title, why, moduleLabel, children }) {
  return (
    <section id={id} className="max-w-5xl mx-auto px-5 py-8 fade-up">
      <div className="card p-6 md:p-9" style={{boxShadow: "var(--shadow-glow-accent)"}}>
        <div className="flex flex-wrap items-baseline gap-3 mb-3">
          <span className="text-xs tracking-[0.22em] font-semibold px-2.5 py-1 rounded-md"
            style={{color: "var(--accent)", border: "1px solid var(--accent-border)", background: "var(--accent-soft)"}}>
            CONCEPT {label}
          </span>
          <span className="text-sm" style={{color: "var(--text-faded)"}}>·</span>
          <span className="text-sm" style={{color: "var(--text-dim)"}}>{moduleLabel || "Module"}</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" style={{color: "var(--text)"}}>{title}</h2>
        {why && (
          <div className="text-[17px] leading-relaxed mb-6 border-l-2 pl-4 italic font-serif" style={{borderColor: "var(--accent-border)", color: "var(--text-dim)"}}>
            {why}
          </div>
        )}
        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}
window.ConceptCard = ConceptCard;

/* ────────────────────────────────────────────────────────────────
   INTERACTIVE FRAME
   ──────────────────────────────────────────────────────────────── */
function InteractiveFrame({ name, whatAmISeeing, tryThis, children }) {
  return (
    <div className="my-6 rounded-2xl overflow-hidden" style={{border: "1px solid var(--border-strong)", background: "var(--bg-elev-1)", boxShadow: "var(--shadow-glow-2)"}}>
      <div className="px-5 py-3 flex flex-wrap items-center gap-3"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(90deg, var(--accent-2-soft), var(--accent-soft))",
        }}>
        <div className="text-xs tracking-[0.2em] font-semibold flex items-center gap-1.5" style={{color: "var(--accent-2)"}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 14, height: 14}}>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          INTERACTIVE
        </div>
        <div className="font-semibold" style={{color: "var(--text)"}}>{name}</div>
      </div>
      <div className="p-5 md:p-6">{children}</div>
      <div className="grid md:grid-cols-2" style={{borderTop: "1px solid var(--border)"}}>
        <div className="p-4" style={{borderRight: "1px solid var(--border)"}}>
          <div className="text-[10px] tracking-[0.2em] font-semibold mb-1" style={{color: "var(--accent-2)"}}>WHAT AM I SEEING?</div>
          <div className="text-[15px] leading-relaxed" style={{color: "var(--text-dim)"}}>{whatAmISeeing}</div>
        </div>
        <div className="p-4">
          <div className="text-[10px] tracking-[0.2em] font-semibold mb-1" style={{color: "var(--accent)"}}>TRY THIS</div>
          <div className="text-[15px] leading-relaxed" style={{color: "var(--text-dim)"}}>{tryThis}</div>
        </div>
      </div>
    </div>
  );
}
window.InteractiveFrame = InteractiveFrame;

/* ────────────────────────────────────────────────────────────────
   PYQ
   ──────────────────────────────────────────────────────────────── */
function PYQ({ year, exam, marks, question, solution }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-5 rounded-xl p-5" style={{background: "var(--danger-soft)", border: "1px solid var(--danger-border)"}}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs px-2 py-1 rounded-md font-mono" style={{background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger-border)"}}>GATE {year}</span>
        {exam && <span className="text-xs px-2 py-1 rounded-md" style={{background: "var(--bg-elev-3)", color: "var(--text-dim)", border: "1px solid var(--border)"}}>{exam}</span>}
        {marks && <span className="text-xs px-2 py-1 rounded-md" style={{background: "var(--bg-elev-3)", color: "var(--text-dim)", border: "1px solid var(--border)"}}>{marks} marks</span>}
        <span className="text-[10px] tracking-[0.2em] font-semibold ml-auto" style={{color: "var(--danger)"}}>PYQ</span>
      </div>
      <div className="text-[17px] leading-relaxed" style={{color: "var(--text)"}}>{question}</div>
      <button onClick={() => setOpen(o => !o)}
        className="mt-4 text-sm px-3 py-1.5 rounded-md transition-colors"
        style={{background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger-border)"}}
        onMouseEnter={e => e.target.style.background = "var(--danger-border)"}
        onMouseLeave={e => e.target.style.background = "var(--danger-soft)"}>
        {open ? "Hide solution ▲" : "Reveal full solution ▼"}
      </button>
      {open && (
        <div className="mt-4 rounded-lg p-4 space-y-3 text-[16px] leading-relaxed fade-up"
          style={{background: "var(--bg-elev-1)", border: "1px solid var(--border)", color: "var(--text)"}}>
          {solution}
        </div>
      )}
    </div>
  );
}
window.PYQ = PYQ;

/* ────────────────────────────────────────────────────────────────
   PROGRESS PILL (localStorage)
   ──────────────────────────────────────────────────────────────── */
const PROGRESS_STATES = [
  { key: "not",    label: "Not Started",    color: "var(--text-mute)" },
  { key: "wip",    label: "In Progress",    color: "var(--warn)" },
  { key: "done",   label: "Done",           color: "var(--accent-2)" },
  { key: "revise", label: "Needs Revision", color: "var(--danger)" },
  { key: "master", label: "Mastered",       color: "var(--accent-3)" },
];
function ProgressPill({ conceptId }) {
  const key = "la-hub::progress::" + conceptId;
  const [state, setStateRaw] = useState("not");
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v) setStateRaw(v); } catch {}
  }, [key]);
  const set = (k) => {
    setStateRaw(k);
    try { localStorage.setItem(key, k); } catch {}
  };
  return (
    <div className="my-5 rounded-xl p-3 flex flex-wrap items-center gap-2"
      style={{border: "1px solid var(--border)", background: "var(--bg-elev-1)"}}>
      <div className="text-xs mr-2" style={{color: "var(--text-dim)"}}>Status:</div>
      {PROGRESS_STATES.map(s => (
        <button key={s.key} onClick={() => set(s.key)}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all"
          style={{
            border: "1px solid " + (state === s.key ? "var(--border-strong)" : "var(--border)"),
            background: state === s.key ? "var(--bg-elev-3)" : "transparent",
            color: state === s.key ? "var(--text)" : "var(--text-dim)",
          }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{background: s.color}}/>
          {s.label}
        </button>
      ))}
    </div>
  );
}
window.ProgressPill = ProgressPill;

/* ────────────────────────────────────────────────────────────────
   HERO (configurable per module)
   ──────────────────────────────────────────────────────────────── */
function Hero({ moduleNum, totalModules, eyebrow, title, tagline, intro, concepts, stats }) {
  return (
    <section className="relative overflow-hidden">
      <div className="grid-bg absolute inset-0" style={{opacity: 0.45}}/>
      <div className="absolute inset-0" style={{
        background: "radial-gradient(800px 400px at 20% 0%, var(--accent-soft), transparent 60%), radial-gradient(600px 400px at 80% 20%, var(--accent-2-soft), transparent 60%)",
      }}/>
      <div className="relative max-w-5xl mx-auto px-5 py-16 md:py-24">
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-6"
          style={{background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent)"}}>
          <span className="pulse-dot"/> {eyebrow || ("MODULE " + moduleNum + " OF " + (totalModules || 8))}
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5 leading-[1.04]" style={{color: "var(--text)"}}>
          {title}
          {tagline && <span className="block gradient-text mt-1">{tagline}</span>}
        </h1>
        <p className="text-lg md:text-xl max-w-3xl leading-relaxed" style={{color: "var(--text-dim)"}}>
          {intro}
        </p>

        {concepts && concepts.length > 0 && (
          <div className="mt-9 grid md:grid-cols-2 gap-3">
            {concepts.map(c => (
              <a key={c.id} href={"#" + c.id}
                className="group rounded-xl p-4 transition-colors"
                style={{border: "1px solid var(--border)", background: "var(--bg-elev-1)"}}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--accent-soft)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elev-1)"; }}>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-mono" style={{color: "var(--accent)"}}>{c.label}</div>
                  <div className="flex-1">
                    <div className="font-semibold" style={{color: "var(--text)"}}>{c.title}</div>
                    <div className="text-sm" style={{color: "var(--text-dim)"}}>{c.desc}</div>
                  </div>
                  <div style={{color: "var(--text-faded)"}}>→</div>
                </div>
              </a>
            ))}
          </div>
        )}

        {stats && (
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-2" style={{color: "var(--text-dim)"}}>
              <span className="pulse-dot"/> {stats}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
window.Hero = Hero;

/* ────────────────────────────────────────────────────────────────
   MODULE FOOTER (Next module link + checklist)
   ──────────────────────────────────────────────────────────────── */
function ModuleFooter({ moduleNum, nextModuleTitle, nextModuleFile, checklist }) {
  return (
    <section className="max-w-5xl mx-auto px-5 py-16">
      <div className="card p-6 md:p-9" style={{boxShadow: "var(--shadow-glow-2)"}}>
        <div className="text-xs tracking-[0.22em] font-semibold mb-3" style={{color: "var(--accent-2)"}}>END OF MODULE {moduleNum}</div>
        <h3 className="text-2xl md:text-3xl font-bold mb-3" style={{color: "var(--text)"}}>You now have the building blocks.</h3>
        <p className="leading-relaxed max-w-2xl mb-6" style={{color: "var(--text-dim)"}}>
          When the items below feel automatic, you're ready for the next module.
        </p>

        {checklist && (
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            {checklist.map((t, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-3" style={{border: "1px solid var(--border)", background: "var(--bg-elev-1)"}}>
                <span style={{color: "var(--accent-2)", marginTop: 1}}>✓</span>
                <span className="text-sm" style={{color: "var(--text)"}}>{t}</span>
              </div>
            ))}
          </div>
        )}

        {nextModuleFile && (
          <a href={nextModuleFile}
            className="inline-flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-opacity"
            style={{background: "var(--grad-hero)", color: "#fff"}}
            onMouseEnter={e => e.currentTarget.style.opacity = 0.9}
            onMouseLeave={e => e.currentTarget.style.opacity = 1}>
            → Next Module: {nextModuleTitle}
          </a>
        )}
      </div>
      <div className="text-center text-xs mt-10" style={{color: "var(--text-faded)"}}>
        Built for GATE CS · GATE DA · IIITH PGEE preparation
      </div>
    </section>
  );
}
window.ModuleFooter = ModuleFooter;

/* ────────────────────────────────────────────────────────────────
   VECTOR CANVAS HELPER (2D)
   ──────────────────────────────────────────────────────────────── */
function VectorCanvas({
  width = 460, height = 460, range = 6,
  vectors = [], extras = null, onDrag = null,
  draggable = [],
}) {
  const cx = width / 2, cy = height / 2;
  const scale = (width / 2) / range;
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  const toPx = (x, y) => [cx + x * scale, cy - y * scale];
  const fromPx = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = width / rect.width, sy = height / rect.height;
    const x = ((clientX - rect.left) * sx - cx) / scale;
    const y = -((clientY - rect.top) * sy - cy) / scale;
    const clamp = (v) => Math.max(-range + 0.1, Math.min(range - 0.1, v));
    return [clamp(x), clamp(y)];
  };

  const onMouseDown = (e) => {
    if (!onDrag || !draggable.length) return;
    const [x, y] = fromPx(e.clientX, e.clientY);
    let best = null, bestDist = Infinity;
    draggable.forEach(d => {
      const dist = Math.hypot(x - d.vec[0], y - d.vec[1]);
      if (dist < bestDist) { bestDist = dist; best = d; }
    });
    if (bestDist < 0.6 && best) setDragging(best.id);
  };
  const onMove = (e) => {
    if (!dragging || !onDrag) return;
    const t = e.touches ? e.touches[0] : e;
    const [x, y] = fromPx(t.clientX, t.clientY);
    onDrag(dragging, [+x.toFixed(2), +y.toFixed(2)]);
  };
  const onUp = () => setDragging(null);

  const colorPalette = ["var(--accent)", "var(--accent-2)", "var(--accent-3)", "var(--warn)", "var(--pink)", "var(--danger)", "var(--info)"];

  return (
    <svg ref={svgRef} viewBox={"0 0 " + width + " " + height}
      className="vector-svg touch-none select-none w-full"
      style={{maxWidth: width + "px"}}
      onMouseDown={onMouseDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!onDrag || !draggable.length) return;
        const [x, y] = fromPx(t.clientX, t.clientY);
        let best = null, bestDist = Infinity;
        draggable.forEach(d => {
          const dist = Math.hypot(x - d.vec[0], y - d.vec[1]);
          if (dist < bestDist) { bestDist = dist; best = d; }
        });
        if (bestDist < 0.8 && best) setDragging(best.id);
      }}
      onTouchMove={onMove}
      onTouchEnd={onUp}
    >
      <defs>
        {colorPalette.map((c, i) => (
          <marker key={i} id={"vc-arr-" + i} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c}/>
          </marker>
        ))}
      </defs>
      {/* Grid */}
      {Array.from({length: 2*range+1}, (_, i) => i - range).filter(i => i !== 0).map(i => {
        const [x1, y1] = toPx(i, -range), [x2, y2] = toPx(i, range);
        const [x3, y3] = toPx(-range, i), [x4, y4] = toPx(range, i);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--canvas-grid)"/>
            <line x1={x3} y1={y3} x2={x4} y2={y4} stroke="var(--canvas-grid)"/>
          </g>
        );
      })}
      {/* Axes */}
      <line x1={0} y1={cy} x2={width} y2={cy} stroke="var(--canvas-axis)" strokeWidth="1"/>
      <line x1={cx} y1={0} x2={cx} y2={height} stroke="var(--canvas-axis)" strokeWidth="1"/>
      <text x={width - 12} y={cy - 6} textAnchor="end" fontSize="11" fill="var(--canvas-text)">x</text>
      <text x={cx + 8} y={14} fontSize="11" fill="var(--canvas-text)">y</text>

      {/* Custom extras (lines, regions, points) */}
      {extras}

      {/* Vectors */}
      {vectors.map((v, i) => {
        const colorIdx = (v.colorIdx != null) ? v.colorIdx : (i % colorPalette.length);
        const color = v.color || colorPalette[colorIdx];
        const [px, py] = toPx(v.vec[0], v.vec[1]);
        return (
          <g key={"vec-" + i}>
            <line x1={cx} y1={cy} x2={px} y2={py}
              stroke={color}
              strokeWidth={v.thick || 2.5}
              strokeDasharray={v.dashed ? "5 4" : "none"}
              opacity={v.opacity != null ? v.opacity : 1}
              markerEnd={"url(#vc-arr-" + colorIdx + ")"} />
            {v.label && (
              <text x={px + 10 * Math.sign(v.vec[0] || 1)} y={py - 8 * Math.sign(v.vec[1] || 1)}
                fontSize="13" fontWeight="700" fill={color}>{v.label}</text>
            )}
            {v.dot !== false && <circle cx={px} cy={py} r="4.5" fill={color} stroke="var(--canvas-bg)" strokeWidth="2"/>}
          </g>
        );
      })}
    </svg>
  );
}
window.VectorCanvas = VectorCanvas;

/* ────────────────────────────────────────────────────────────────
   ERROR BOUNDARY
   ──────────────────────────────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Render error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding: 32, margin: 24, borderRadius: 12, background: "var(--bg-elev-1)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontFamily: "var(--font-mono)"}}>
          <h2 style={{fontSize: 18, marginBottom: 12}}>Render error</h2>
          <pre style={{whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text)"}}>{String(this.state.error && this.state.error.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
window.ErrorBoundary = ErrorBoundary;

/* ────────────────────────────────────────────────────────────────
   LOADING HIDER (called when App mounts)
   ──────────────────────────────────────────────────────────────── */
window.hideLoading = function () {
  const l = document.getElementById("loading");
  if (l) { l.classList.add("hide"); setTimeout(() => l.remove(), 500); }
};

/* ────────────────────────────────────────────────────────────────
   NUMBER INPUT (themed)
   ──────────────────────────────────────────────────────────────── */
function NumInput({ value, onChange, step = 0.1, width = 64 }) {
  return (
    <input type="number" step={step} value={value}
      onChange={e => onChange(+e.target.value)}
      style={{width}}/>
  );
}
window.NumInput = NumInput;

/* ────────────────────────────────────────────────────────────────
   MOUNT HELPER
   ──────────────────────────────────────────────────────────────── */
window.mountApp = function (AppComponent, currentModule) {
  const start = () => {
    const RootComponent = () => (
      <SidebarProvider currentModule={currentModule || 0}>
        <Sidebar />
        <AppComponent />
      </SidebarProvider>
    );
    ReactDOM.createRoot(document.getElementById("root")).render(
      <ErrorBoundary><RootComponent /></ErrorBoundary>
    );
  };
  if (window.katex) start();
  else {
    const check = setInterval(() => {
      if (window.katex) { clearInterval(check); start(); }
    }, 80);
    setTimeout(() => { clearInterval(check); start(); }, 4000);
  }
};
