function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
(function () {
  /* ═══════════════════════════════════════════════════════════════
     LA MASTERY HUB — Shared Boilerplate
     Defines reusable React components in the global window scope.
     Each module HTML file loads this BEFORE its own content script.
     ═══════════════════════════════════════════════════════════════ */

  const {
    useState,
    useEffect,
    useMemo,
    useRef,
    useCallback
  } = React;

  /* ────────────────────────────────────────────────────────────────
     MODULE REGISTRY
     ──────────────────────────────────────────────────────────────── */
  window.MODULES = [{
    num: 1,
    title: "Foundations",
    file: "module-01-foundations.html",
    ready: true,
    lab: "module-01-problem-lab.html"
  }, {
    num: 2,
    title: "Span & Subspaces",
    file: "module-02-span-subspaces.html",
    ready: true,
    lab: "module-02-problem-lab.html"
  }, {
    num: 3,
    title: "Linear Systems",
    file: "module-03-systems.html",
    ready: true,
    lab: "module-03-problem-lab.html"
  }, {
    num: 4,
    title: "Echelon & Rank",
    file: "module-04-echelon-rank.html",
    ready: true,
    lab: "module-04-problem-lab.html"
  }, {
    num: 5,
    title: "Determinants",
    file: "module-05-determinants.html",
    ready: true,
    lab: "module-05-problem-lab.html"
  }, {
    num: 6,
    title: "Eigenvalues",
    file: "module-06-eigenvalues.html",
    ready: true,
    lab: "module-06-problem-lab.html"
  }, {
    num: 7,
    title: "Eigen Power Tools",
    file: "module-07-eigen-power.html",
    ready: true,
    lab: "module-07-problem-lab.html"
  }, {
    num: 8,
    title: "Decompositions",
    file: "module-08-decompositions.html",
    ready: true,
    lab: "module-08-problem-lab.html"
  }, {
    num: 9,
    title: "Cheat Sheet",
    file: "module-09-cheatsheet.html",
    ready: true
  }, {
    num: 10,
    title: "Mock Test",
    file: "module-10-mocktest.html",
    ready: true
  }];

  /* ────────────────────────────────────────────────────────────────
     TEX RENDERING (LaTeX via KaTeX)
     ──────────────────────────────────────────────────────────────── */
  function Tex({
    src,
    block = false,
    className = ""
  }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!ref.current || !window.katex) return;
      try {
        window.katex.render(src, ref.current, {
          displayMode: !!block,
          throwOnError: false,
          errorColor: "var(--danger)",
          strict: "ignore",
          trust: false
        });
      } catch (e) {
        if (ref.current) ref.current.textContent = src;
      }
    }, [src, block]);
    const Tag = block ? "div" : "span";
    return /*#__PURE__*/React.createElement(Tag, {
      ref: ref,
      className: (block ? "my-2" : "inline") + " " + className
    });
  }
  const T = ({
    src,
    className
  }) => /*#__PURE__*/React.createElement(Tex, {
    src: src,
    block: false,
    className: className
  });
  const BT = ({
    src,
    className
  }) => /*#__PURE__*/React.createElement(Tex, {
    src: src,
    block: true,
    className: className
  });
  window.Tex = Tex;
  window.T = T;
  window.BT = BT;

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
      try {
        localStorage.setItem("la-hub::theme", next);
      } catch {}
      setTheme(next);
      setTimeout(() => root.classList.remove("theme-switching"), 360);
    };
    return /*#__PURE__*/React.createElement("button", {
      onClick: toggle,
      className: "theme-toggle",
      title: "Switch to " + (theme === "dark" ? "light" : "dark") + " theme",
      "aria-label": "Toggle theme"
    }, /*#__PURE__*/React.createElement("svg", {
      className: "icon-sun",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
    })), /*#__PURE__*/React.createElement("svg", {
      className: "icon-moon",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
    })));
  }
  window.ThemeToggle = ThemeToggle;

  /* ────────────────────────────────────────────────────────────────
     SIDEBAR CONTEXT
     ──────────────────────────────────────────────────────────────── */
  const SidebarCtx = React.createContext({
    open: false,
    toggle: () => {},
    currentModule: 0
  });
  function SidebarProvider({
    currentModule,
    children
  }) {
    const isDesktop = () => typeof window !== "undefined" && window.innerWidth >= 1280;
    const [open, setOpen] = useState(() => {
      try {
        const saved = localStorage.getItem("la-hub::sidebar");
        return saved !== null ? saved === "open" : isDesktop();
      } catch {
        return false;
      }
    });
    const toggle = useCallback(() => setOpen(o => !o), []);
    useEffect(() => {
      try {
        localStorage.setItem("la-hub::sidebar", open ? "open" : "closed");
      } catch {}
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
      window.addEventListener("resize", onResize, {
        passive: true
      });
      return () => window.removeEventListener("resize", onResize);
    }, [open]);
    return /*#__PURE__*/React.createElement(SidebarCtx.Provider, {
      value: {
        open,
        toggle,
        currentModule
      }
    }, children);
  }
  window.SidebarProvider = SidebarProvider;

  /* ────────────────────────────────────────────────────────────────
     SIDEBAR PANEL
     ──────────────────────────────────────────────────────────────── */
  function Sidebar() {
    const {
      open,
      toggle,
      currentModule
    } = React.useContext(SidebarCtx);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      onClick: toggle,
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 44,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 280ms cubic-bezier(.2,.7,.2,1)"
      },
      className: "xl:hidden"
    }), /*#__PURE__*/React.createElement("aside", {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        width: 256,
        height: "100vh",
        zIndex: 45,
        background: "var(--bg-elev-1)",
        borderRight: "1px solid var(--border)",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 280ms cubic-bezier(.2,.7,.2,1)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        overflowX: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "14px 12px 12px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "index.html",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        textDecoration: "none",
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 30,
        height: 30,
        borderRadius: 8,
        background: "var(--grad-hero)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 11,
        flexShrink: 0
      }
    }, "LA"), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 13,
        color: "var(--text)",
        lineHeight: 1.25
      }
    }, "Mastery Hub"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "var(--text-faded)",
        lineHeight: 1.25
      }
    }, "Linear Algebra"))), /*#__PURE__*/React.createElement("button", {
      onClick: toggle,
      title: "Close sidebar",
      style: {
        width: 28,
        height: 28,
        borderRadius: 6,
        background: "var(--bg-elev-3)",
        border: "1px solid var(--border)",
        color: "var(--text-dim)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        width: 13,
        height: 13
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 6L6 18M6 6l12 12"
    })))), /*#__PURE__*/React.createElement("nav", {
      style: {
        padding: "8px",
        flex: 1,
        overflowY: "auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        letterSpacing: "0.16em",
        color: "var(--text-mute)",
        padding: "8px 8px 5px",
        fontWeight: 700
      }
    }, "MODULES"), window.MODULES.map(m => {
      const currentPath = typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "";
      const onLab = m.lab && currentPath === m.lab;
      const active = m.num === currentModule && !onLab;
      const labActive = m.num === currentModule && onLab;
      return /*#__PURE__*/React.createElement(React.Fragment, {
        key: m.num
      }, /*#__PURE__*/React.createElement("a", {
        href: m.ready ? m.file : "#",
        onClick: e => {
          if (!m.ready) e.preventDefault();
        },
        style: {
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "7px 10px",
          borderRadius: 8,
          marginBottom: 2,
          textDecoration: "none",
          opacity: m.ready ? 1 : 0.4,
          cursor: m.ready ? "pointer" : "not-allowed",
          background: active ? "var(--accent-soft)" : "transparent",
          border: "1px solid " + (active ? "var(--accent-border)" : "transparent"),
          color: active ? "var(--accent)" : m.ready ? "var(--text-dim)" : "var(--text-mute)",
          transition: "background 140ms, color 140ms, border-color 140ms"
        },
        onMouseEnter: e => {
          if (!active && m.ready) {
            e.currentTarget.style.background = "var(--bg-elev-2)";
            e.currentTarget.style.color = "var(--text)";
          }
        },
        onMouseLeave: e => {
          if (!active && m.ready) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-dim)";
          }
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--accent-2)",
          minWidth: 22,
          fontWeight: 600,
          letterSpacing: "0.04em"
        }
      }, "M", m.num), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12.5,
          fontWeight: active ? 600 : 400,
          lineHeight: 1.3
        }
      }, m.title), active && /*#__PURE__*/React.createElement("span", {
        style: {
          marginLeft: "auto",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--accent)",
          flexShrink: 0
        }
      })), m.lab && /*#__PURE__*/React.createElement("a", {
        href: m.lab,
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px 4px 36px",
          borderRadius: 6,
          marginBottom: 3,
          textDecoration: "none",
          background: labActive ? "var(--accent-2-soft)" : "transparent",
          border: "1px solid " + (labActive ? "var(--accent-2-border)" : "transparent"),
          color: labActive ? "var(--accent-2)" : "var(--text-faded)",
          transition: "background 140ms, color 140ms, border-color 140ms",
          fontSize: 11
        },
        onMouseEnter: e => {
          if (!labActive) {
            e.currentTarget.style.background = "var(--bg-elev-2)";
            e.currentTarget.style.color = "var(--accent-2)";
          }
        },
        onMouseLeave: e => {
          if (!labActive) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-faded)";
          }
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          opacity: 0.85
        }
      }, "\uD83C\uDFAF"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: labActive ? 600 : 500,
          letterSpacing: "0.02em"
        }
      }, "Problem Lab"), labActive && /*#__PURE__*/React.createElement("span", {
        style: {
          marginLeft: "auto",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "var(--accent-2)",
          flexShrink: 0
        }
      })));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "10px 12px",
        borderTop: "1px solid var(--border)",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9.5,
        color: "var(--text-faded)",
        textAlign: "center",
        letterSpacing: "0.05em"
      }
    }, "GATE CS \xB7 GATE DA \xB7 IIITH PGEE"))));
  }
  window.Sidebar = Sidebar;

  /* ────────────────────────────────────────────────────────────────
     TOP NAV
     ──────────────────────────────────────────────────────────────── */
  function TopNav({
    currentModule
  }) {
    const {
      toggle: toggleSidebar
    } = React.useContext(SidebarCtx);
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
      const onScroll = () => setScrolled(window.scrollY > 12);
      window.addEventListener("scroll", onScroll, {
        passive: true
      });
      return () => window.removeEventListener("scroll", onScroll);
    }, []);
    return /*#__PURE__*/React.createElement("nav", {
      style: {
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: "var(--bg-overlay)",
        borderBottom: "1px solid " + (scrolled ? "var(--border)" : "transparent"),
        transition: "border-color var(--t-base) var(--ease-out)"
      },
      className: "sticky top-0 z-50"
    }, /*#__PURE__*/React.createElement("div", {
      className: "max-w-7xl mx-auto px-5 py-3 flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: toggleSidebar,
      className: "theme-toggle",
      title: "Toggle module sidebar",
      "aria-label": "Toggle sidebar",
      style: {
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        width: 18,
        height: 18
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 12h18M3 6h18M3 18h18"
    }))), /*#__PURE__*/React.createElement("a", {
      href: "index.html",
      className: "flex items-center gap-2.5 group"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm",
      style: {
        background: "var(--grad-hero)",
        color: "#fff"
      }
    }, "LA"), /*#__PURE__*/React.createElement("div", {
      className: "hidden sm:block leading-tight"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-bold tracking-tight text-[15px]"
    }, "Mastery Hub"), /*#__PURE__*/React.createElement("div", {
      className: "text-[11px]",
      style: {
        color: "var(--text-faded)"
      }
    }, "Linear Algebra"))), /*#__PURE__*/React.createElement("div", {
      className: "hidden sm:flex items-center gap-1.5 text-[12px]",
      style: {
        color: "var(--text-dim)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), window.MODULES.find(m => m.num === currentModule) && /*#__PURE__*/React.createElement("span", {
      className: "px-2.5 py-1 rounded-md",
      style: {
        background: "var(--accent-soft)",
        border: "1px solid var(--accent-border)",
        color: "var(--accent)",
        fontWeight: 600
      }
    }, "M", currentModule, " \xB7 ", (window.MODULES.find(m => m.num === currentModule) || {}).title)), /*#__PURE__*/React.createElement("div", {
      className: "ml-auto flex items-center gap-2"
    }, /*#__PURE__*/React.createElement(ThemeToggle, null))));
  }
  window.TopNav = TopNav;

  /* ────────────────────────────────────────────────────────────────
     PROSE HELPERS
     ──────────────────────────────────────────────────────────────── */
  const H2 = ({
    children
  }) => /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl md:text-3xl font-bold tracking-tight mb-3",
    style: {
      color: "var(--text)"
    }
  }, children);
  const H3 = ({
    children
  }) => /*#__PURE__*/React.createElement("h3", {
    className: "text-xl md:text-[22px] font-semibold tracking-tight mt-7 mb-2",
    style: {
      color: "var(--text)"
    }
  }, children);
  const H4 = ({
    children
  }) => /*#__PURE__*/React.createElement("h4", {
    className: "text-base font-semibold mt-4 mb-1.5",
    style: {
      color: "var(--accent)"
    }
  }, children);
  const P = ({
    children
  }) => /*#__PURE__*/React.createElement("p", {
    className: "text-[17px] leading-[1.8]",
    style: {
      color: "var(--text)"
    }
  }, children);
  const UL = ({
    children
  }) => /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-outside ml-5 space-y-2 text-[17px] leading-relaxed",
    style: {
      color: "var(--text)"
    }
  }, children);
  const OL = ({
    children
  }) => /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal list-outside ml-5 space-y-2 text-[17px] leading-relaxed",
    style: {
      color: "var(--text)"
    }
  }, children);
  const Li = ({
    children
  }) => /*#__PURE__*/React.createElement("li", {
    className: "marker:text-[var(--accent)]"
  }, children);
  const B = ({
    children
  }) => /*#__PURE__*/React.createElement("strong", {
    className: "font-semibold",
    style: {
      color: "var(--text)"
    }
  }, children);
  const Em = ({
    children
  }) => /*#__PURE__*/React.createElement("em", {
    className: "not-italic font-medium",
    style: {
      color: "var(--accent)"
    }
  }, children);
  const Code = ({
    children
  }) => /*#__PURE__*/React.createElement("code", {
    className: "font-mono text-[13.5px] px-1.5 py-0.5 rounded",
    style: {
      background: "var(--bg-elev-3)",
      color: "var(--accent-2)",
      border: "1px solid var(--border)"
    }
  }, children);
  window.H2 = H2;
  window.H3 = H3;
  window.H4 = H4;
  window.P = P;
  window.UL = UL;
  window.OL = OL;
  window.Li = Li;
  window.B = B;
  window.Em = Em;
  window.Code = Code;

  /* ────────────────────────────────────────────────────────────────
     CALLOUT
     ──────────────────────────────────────────────────────────────── */
  function Callout({
    kind = "info",
    title,
    children
  }) {
    const styles = {
      info: {
        bg: "var(--accent-soft)",
        bd: "var(--accent-border)",
        fg: "var(--accent)",
        icon: "🧭",
        label: "INSIGHT"
      },
      trap: {
        bg: "var(--warn-soft)",
        bd: "var(--warn-border)",
        fg: "var(--warn)",
        icon: "⚠",
        label: "GATE TRAP"
      },
      proof: {
        bg: "var(--accent-2-soft)",
        bd: "var(--accent-2-border)",
        fg: "var(--accent-2)",
        icon: "🔧",
        label: "PROOF"
      },
      ml: {
        bg: "var(--accent-3-soft)",
        bd: "var(--accent-3-border)",
        fg: "var(--accent-3)",
        icon: "🧠",
        label: "ML / AI BRIDGE"
      },
      recall: {
        bg: "var(--pink-soft)",
        bd: "var(--pink-border)",
        fg: "var(--pink)",
        icon: "📌",
        label: "RECALL"
      },
      danger: {
        bg: "var(--danger-soft)",
        bd: "var(--danger-border)",
        fg: "var(--danger)",
        icon: "⛔",
        label: "WATCH OUT"
      }
    };
    const s = styles[kind] || styles.info;
    return /*#__PURE__*/React.createElement("div", {
      className: "my-5 rounded-xl p-5",
      style: {
        background: s.bg,
        border: "1px solid " + s.bd
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-2 flex items-center gap-2",
      style: {
        color: s.fg
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-base"
    }, s.icon), title ? s.label + " · " + title : s.label), /*#__PURE__*/React.createElement("div", {
      className: "space-y-3 text-[16px] leading-relaxed",
      style: {
        color: "var(--text)"
      }
    }, children));
  }
  window.Callout = Callout;

  /* ────────────────────────────────────────────────────────────────
     CONCEPT CARD
     ──────────────────────────────────────────────────────────────── */
  function ConceptCard({
    id,
    label,
    title,
    why,
    moduleLabel,
    children
  }) {
    return /*#__PURE__*/React.createElement("section", {
      id: id,
      className: "max-w-5xl mx-auto px-5 py-8 fade-up"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card p-6 md:p-9",
      style: {
        boxShadow: "var(--shadow-glow-accent)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-baseline gap-3 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs tracking-[0.22em] font-semibold px-2.5 py-1 rounded-md",
      style: {
        color: "var(--accent)",
        border: "1px solid var(--accent-border)",
        background: "var(--accent-soft)"
      }
    }, "CONCEPT ", label), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, moduleLabel || "Module")), /*#__PURE__*/React.createElement("h2", {
      className: "text-2xl md:text-3xl font-bold tracking-tight mb-3",
      style: {
        color: "var(--text)"
      }
    }, title), why && /*#__PURE__*/React.createElement("div", {
      className: "text-[17px] leading-relaxed mb-6 border-l-2 pl-4 italic font-serif",
      style: {
        borderColor: "var(--accent-border)",
        color: "var(--text-dim)"
      }
    }, why), /*#__PURE__*/React.createElement("div", {
      className: "space-y-5"
    }, children)));
  }
  window.ConceptCard = ConceptCard;

  /* ────────────────────────────────────────────────────────────────
     INTERACTIVE FRAME
     ──────────────────────────────────────────────────────────────── */
  function InteractiveFrame({
    name,
    whatAmISeeing,
    tryThis,
    children
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "my-6 rounded-2xl overflow-hidden",
      style: {
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elev-1)",
        boxShadow: "var(--shadow-glow-2)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "px-5 py-3 flex flex-wrap items-center gap-3",
      style: {
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(90deg, var(--accent-2-soft), var(--accent-soft))"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs tracking-[0.2em] font-semibold flex items-center gap-1.5",
      style: {
        color: "var(--accent-2)"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        width: 14,
        height: 14
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
    })), "INTERACTIVE"), /*#__PURE__*/React.createElement("div", {
      className: "font-semibold",
      style: {
        color: "var(--text)"
      }
    }, name)), /*#__PURE__*/React.createElement("div", {
      className: "p-5 md:p-6"
    }, children), /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-2",
      style: {
        borderTop: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "p-4",
      style: {
        borderRight: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.2em] font-semibold mb-1",
      style: {
        color: "var(--accent-2)"
      }
    }, "WHAT AM I SEEING?"), /*#__PURE__*/React.createElement("div", {
      className: "text-[15px] leading-relaxed",
      style: {
        color: "var(--text-dim)"
      }
    }, whatAmISeeing)), /*#__PURE__*/React.createElement("div", {
      className: "p-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.2em] font-semibold mb-1",
      style: {
        color: "var(--accent)"
      }
    }, "TRY THIS"), /*#__PURE__*/React.createElement("div", {
      className: "text-[15px] leading-relaxed",
      style: {
        color: "var(--text-dim)"
      }
    }, tryThis))));
  }
  window.InteractiveFrame = InteractiveFrame;

  /* ────────────────────────────────────────────────────────────────
     PYQ
     ──────────────────────────────────────────────────────────────── */
  function PYQ({
    year,
    exam,
    marks,
    question,
    solution
  }) {
    const [open, setOpen] = useState(false);
    return /*#__PURE__*/React.createElement("div", {
      className: "my-5 rounded-xl p-5",
      style: {
        background: "var(--danger-soft)",
        border: "1px solid var(--danger-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-1 rounded-md font-mono",
      style: {
        background: "var(--danger-soft)",
        color: "var(--danger)",
        border: "1px solid var(--danger-border)"
      }
    }, "GATE ", year), exam && /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-1 rounded-md",
      style: {
        background: "var(--bg-elev-3)",
        color: "var(--text-dim)",
        border: "1px solid var(--border)"
      }
    }, exam), marks && /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-1 rounded-md",
      style: {
        background: "var(--bg-elev-3)",
        color: "var(--text-dim)",
        border: "1px solid var(--border)"
      }
    }, marks, " marks"), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] tracking-[0.2em] font-semibold ml-auto",
      style: {
        color: "var(--danger)"
      }
    }, "PYQ")), /*#__PURE__*/React.createElement("div", {
      className: "text-[17px] leading-relaxed",
      style: {
        color: "var(--text)"
      }
    }, question), /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(o => !o),
      className: "mt-4 text-sm px-3 py-1.5 rounded-md transition-colors",
      style: {
        background: "var(--danger-soft)",
        color: "var(--danger)",
        border: "1px solid var(--danger-border)"
      },
      onMouseEnter: e => e.target.style.background = "var(--danger-border)",
      onMouseLeave: e => e.target.style.background = "var(--danger-soft)"
    }, open ? "Hide solution ▲" : "Reveal full solution ▼"), open && /*#__PURE__*/React.createElement("div", {
      className: "mt-4 rounded-lg p-4 space-y-3 text-[16px] leading-relaxed fade-up",
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)",
        color: "var(--text)"
      }
    }, solution));
  }
  window.PYQ = PYQ;

  /* ────────────────────────────────────────────────────────────────
     PROGRESS PILL (localStorage)
     ──────────────────────────────────────────────────────────────── */
  const PROGRESS_STATES = [{
    key: "not",
    label: "Not Started",
    color: "var(--text-mute)"
  }, {
    key: "wip",
    label: "In Progress",
    color: "var(--warn)"
  }, {
    key: "done",
    label: "Done",
    color: "var(--accent-2)"
  }, {
    key: "revise",
    label: "Needs Revision",
    color: "var(--danger)"
  }, {
    key: "master",
    label: "Mastered",
    color: "var(--accent-3)"
  }];
  function ProgressPill({
    conceptId
  }) {
    const key = "la-hub::progress::" + conceptId;
    const [state, setStateRaw] = useState("not");
    useEffect(() => {
      try {
        const v = localStorage.getItem(key);
        if (v) setStateRaw(v);
      } catch {}
    }, [key]);
    const set = k => {
      setStateRaw(k);
      try {
        localStorage.setItem(key, k);
      } catch {}
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "my-5 rounded-xl p-3 flex flex-wrap items-center gap-2",
      style: {
        border: "1px solid var(--border)",
        background: "var(--bg-elev-1)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs mr-2",
      style: {
        color: "var(--text-dim)"
      }
    }, "Status:"), PROGRESS_STATES.map(s => /*#__PURE__*/React.createElement("button", {
      key: s.key,
      onClick: () => set(s.key),
      className: "text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all",
      style: {
        border: "1px solid " + (state === s.key ? "var(--border-strong)" : "var(--border)"),
        background: state === s.key ? "var(--bg-elev-3)" : "transparent",
        color: state === s.key ? "var(--text)" : "var(--text-dim)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "w-1.5 h-1.5 rounded-full",
      style: {
        background: s.color
      }
    }), s.label)));
  }
  window.ProgressPill = ProgressPill;

  /* ────────────────────────────────────────────────────────────────
     HERO (configurable per module)
     ──────────────────────────────────────────────────────────────── */
  function Hero({
    moduleNum,
    totalModules,
    eyebrow,
    title,
    tagline,
    intro,
    concepts,
    stats
  }) {
    return /*#__PURE__*/React.createElement("section", {
      className: "relative overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "grid-bg absolute inset-0",
      style: {
        opacity: 0.45
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "absolute inset-0",
      style: {
        background: "radial-gradient(800px 400px at 20% 0%, var(--accent-soft), transparent 60%), radial-gradient(600px 400px at 80% 20%, var(--accent-2-soft), transparent 60%)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "relative max-w-5xl mx-auto px-5 py-16 md:py-24"
    }, /*#__PURE__*/React.createElement("div", {
      className: "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-6",
      style: {
        background: "var(--accent-soft)",
        border: "1px solid var(--accent-border)",
        color: "var(--accent)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pulse-dot"
    }), " ", eyebrow || "MODULE " + moduleNum + " OF " + (totalModules || 8)), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-6xl font-extrabold tracking-tight mb-5 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, title, tagline && /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, tagline)), /*#__PURE__*/React.createElement("p", {
      className: "text-lg md:text-xl max-w-3xl leading-relaxed",
      style: {
        color: "var(--text-dim)"
      }
    }, intro), concepts && concepts.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "mt-9 grid md:grid-cols-2 gap-3"
    }, concepts.map(c => /*#__PURE__*/React.createElement("a", {
      key: c.id,
      href: "#" + c.id,
      className: "group rounded-xl p-4 transition-colors",
      style: {
        border: "1px solid var(--border)",
        background: "var(--bg-elev-1)"
      },
      onMouseEnter: e => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
        e.currentTarget.style.background = "var(--accent-soft)";
      },
      onMouseLeave: e => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-elev-1)";
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-2xl font-mono",
      style: {
        color: "var(--accent)"
      }
    }, c.label), /*#__PURE__*/React.createElement("div", {
      className: "flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-semibold",
      style: {
        color: "var(--text)"
      }
    }, c.title), /*#__PURE__*/React.createElement("div", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, c.desc)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-faded)"
      }
    }, "\u2192"))))), stats && /*#__PURE__*/React.createElement("div", {
      className: "mt-8 flex flex-wrap gap-3 text-sm"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2",
      style: {
        color: "var(--text-dim)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pulse-dot"
    }), " ", stats))));
  }
  window.Hero = Hero;

  /* ────────────────────────────────────────────────────────────────
     MODULE FOOTER (Next module link + checklist)
     ──────────────────────────────────────────────────────────────── */
  function ModuleFooter({
    moduleNum,
    nextModuleTitle,
    nextModuleFile,
    checklist
  }) {
    return /*#__PURE__*/React.createElement("section", {
      className: "max-w-5xl mx-auto px-5 py-16"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card p-6 md:p-9",
      style: {
        boxShadow: "var(--shadow-glow-2)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs tracking-[0.22em] font-semibold mb-3",
      style: {
        color: "var(--accent-2)"
      }
    }, "END OF MODULE ", moduleNum), /*#__PURE__*/React.createElement("h3", {
      className: "text-2xl md:text-3xl font-bold mb-3",
      style: {
        color: "var(--text)"
      }
    }, "You now have the building blocks."), /*#__PURE__*/React.createElement("p", {
      className: "leading-relaxed max-w-2xl mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "When the items below feel automatic, you're ready for the next module."), checklist && /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-2 gap-3 mb-6"
    }, checklist.map((t, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "flex items-start gap-3 rounded-lg p-3",
      style: {
        border: "1px solid var(--border)",
        background: "var(--bg-elev-1)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--accent-2)",
        marginTop: 1
      }
    }, "\u2713"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text)"
      }
    }, t)))), nextModuleFile && /*#__PURE__*/React.createElement("a", {
      href: nextModuleFile,
      className: "inline-flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-opacity",
      style: {
        background: "var(--grad-hero)",
        color: "#fff"
      },
      onMouseEnter: e => e.currentTarget.style.opacity = 0.9,
      onMouseLeave: e => e.currentTarget.style.opacity = 1
    }, "\u2192 Next Module: ", nextModuleTitle)), /*#__PURE__*/React.createElement("div", {
      className: "text-center text-xs mt-10",
      style: {
        color: "var(--text-faded)"
      }
    }, "Built for GATE CS \xB7 GATE DA \xB7 IIITH PGEE preparation"));
  }
  window.ModuleFooter = ModuleFooter;

  /* ────────────────────────────────────────────────────────────────
     VECTOR CANVAS HELPER (2D)
     ──────────────────────────────────────────────────────────────── */
  function VectorCanvas({
    width = 460,
    height = 460,
    range = 6,
    vectors = [],
    extras = null,
    onDrag = null,
    draggable = []
  }) {
    const cx = width / 2,
      cy = height / 2;
    const scale = width / 2 / range;
    const svgRef = useRef(null);
    const [dragging, setDragging] = useState(null);
    const toPx = (x, y) => [cx + x * scale, cy - y * scale];
    const fromPx = (clientX, clientY) => {
      const rect = svgRef.current.getBoundingClientRect();
      const sx = width / rect.width,
        sy = height / rect.height;
      const x = ((clientX - rect.left) * sx - cx) / scale;
      const y = -((clientY - rect.top) * sy - cy) / scale;
      const clamp = v => Math.max(-range + 0.1, Math.min(range - 0.1, v));
      return [clamp(x), clamp(y)];
    };
    const onMouseDown = e => {
      if (!onDrag || !draggable.length) return;
      const [x, y] = fromPx(e.clientX, e.clientY);
      let best = null,
        bestDist = Infinity;
      draggable.forEach(d => {
        const dist = Math.hypot(x - d.vec[0], y - d.vec[1]);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      });
      if (bestDist < 0.6 && best) setDragging(best.id);
    };
    const onMove = e => {
      if (!dragging || !onDrag) return;
      const t = e.touches ? e.touches[0] : e;
      const [x, y] = fromPx(t.clientX, t.clientY);
      onDrag(dragging, [+x.toFixed(2), +y.toFixed(2)]);
    };
    const onUp = () => setDragging(null);
    const colorPalette = ["var(--accent)", "var(--accent-2)", "var(--accent-3)", "var(--warn)", "var(--pink)", "var(--danger)", "var(--info)"];
    return /*#__PURE__*/React.createElement("svg", {
      ref: svgRef,
      viewBox: "0 0 " + width + " " + height,
      className: "vector-svg touch-none select-none w-full",
      style: {
        maxWidth: width + "px"
      },
      onMouseDown: onMouseDown,
      onMouseMove: onMove,
      onMouseUp: onUp,
      onMouseLeave: onUp,
      onTouchStart: e => {
        const t = e.touches[0];
        if (!onDrag || !draggable.length) return;
        const [x, y] = fromPx(t.clientX, t.clientY);
        let best = null,
          bestDist = Infinity;
        draggable.forEach(d => {
          const dist = Math.hypot(x - d.vec[0], y - d.vec[1]);
          if (dist < bestDist) {
            bestDist = dist;
            best = d;
          }
        });
        if (bestDist < 0.8 && best) setDragging(best.id);
      },
      onTouchMove: onMove,
      onTouchEnd: onUp
    }, /*#__PURE__*/React.createElement("defs", null, colorPalette.map((c, i) => /*#__PURE__*/React.createElement("marker", {
      key: i,
      id: "vc-arr-" + i,
      viewBox: "0 0 10 10",
      refX: "8",
      refY: "5",
      markerWidth: "7",
      markerHeight: "7",
      orient: "auto-start-reverse"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M0,0 L10,5 L0,10 z",
      fill: c
    })))), Array.from({
      length: 2 * range + 1
    }, (_, i) => i - range).filter(i => i !== 0).map(i => {
      const [x1, y1] = toPx(i, -range),
        [x2, y2] = toPx(i, range);
      const [x3, y3] = toPx(-range, i),
        [x4, y4] = toPx(range, i);
      return /*#__PURE__*/React.createElement("g", {
        key: i
      }, /*#__PURE__*/React.createElement("line", {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        stroke: "var(--canvas-grid)"
      }), /*#__PURE__*/React.createElement("line", {
        x1: x3,
        y1: y3,
        x2: x4,
        y2: y4,
        stroke: "var(--canvas-grid)"
      }));
    }), /*#__PURE__*/React.createElement("line", {
      x1: 0,
      y1: cy,
      x2: width,
      y2: cy,
      stroke: "var(--canvas-axis)",
      strokeWidth: "1"
    }), /*#__PURE__*/React.createElement("line", {
      x1: cx,
      y1: 0,
      x2: cx,
      y2: height,
      stroke: "var(--canvas-axis)",
      strokeWidth: "1"
    }), /*#__PURE__*/React.createElement("text", {
      x: width - 12,
      y: cy - 6,
      textAnchor: "end",
      fontSize: "11",
      fill: "var(--canvas-text)"
    }, "x"), /*#__PURE__*/React.createElement("text", {
      x: cx + 8,
      y: 14,
      fontSize: "11",
      fill: "var(--canvas-text)"
    }, "y"), extras, vectors.map((v, i) => {
      const colorIdx = v.colorIdx != null ? v.colorIdx : i % colorPalette.length;
      const color = v.color || colorPalette[colorIdx];
      const [px, py] = toPx(v.vec[0], v.vec[1]);
      return /*#__PURE__*/React.createElement("g", {
        key: "vec-" + i
      }, /*#__PURE__*/React.createElement("line", {
        x1: cx,
        y1: cy,
        x2: px,
        y2: py,
        stroke: color,
        strokeWidth: v.thick || 2.5,
        strokeDasharray: v.dashed ? "5 4" : "none",
        opacity: v.opacity != null ? v.opacity : 1,
        markerEnd: "url(#vc-arr-" + colorIdx + ")"
      }), v.label && /*#__PURE__*/React.createElement("text", {
        x: px + 10 * Math.sign(v.vec[0] || 1),
        y: py - 8 * Math.sign(v.vec[1] || 1),
        fontSize: "13",
        fontWeight: "700",
        fill: color
      }, v.label), v.dot !== false && /*#__PURE__*/React.createElement("circle", {
        cx: px,
        cy: py,
        r: "4.5",
        fill: color,
        stroke: "var(--canvas-bg)",
        strokeWidth: "2"
      }));
    }));
  }
  window.VectorCanvas = VectorCanvas;

  /* ────────────────────────────────────────────────────────────────
     ERROR BOUNDARY
     ──────────────────────────────────────────────────────────────── */
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        error: null
      };
    }
    static getDerivedStateFromError(error) {
      return {
        error
      };
    }
    componentDidCatch(error, info) {
      console.error("Render error:", error, info);
    }
    render() {
      if (this.state.error) {
        return /*#__PURE__*/React.createElement("div", {
          style: {
            padding: 32,
            margin: 24,
            borderRadius: 12,
            background: "var(--bg-elev-1)",
            color: "var(--danger)",
            border: "1px solid var(--danger-border)",
            fontFamily: "var(--font-mono)"
          }
        }, /*#__PURE__*/React.createElement("h2", {
          style: {
            fontSize: 18,
            marginBottom: 12
          }
        }, "Render error"), /*#__PURE__*/React.createElement("pre", {
          style: {
            whiteSpace: "pre-wrap",
            fontSize: 12,
            color: "var(--text)"
          }
        }, String(this.state.error && this.state.error.stack || this.state.error)));
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
    if (l) {
      l.classList.add("hide");
      setTimeout(() => l.remove(), 500);
    }
  };

  /* ────────────────────────────────────────────────────────────────
     NUMBER INPUT (themed)
     ──────────────────────────────────────────────────────────────── */
  function NumInput({
    value,
    onChange,
    step = 0.1,
    width = 64
  }) {
    return /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: step,
      value: value,
      onChange: e => onChange(+e.target.value),
      style: {
        width
      }
    });
  }
  window.NumInput = NumInput;

  /* ────────────────────────────────────────────────────────────────
     MOUNT HELPER
     ──────────────────────────────────────────────────────────────── */
  window.mountApp = function (AppComponent, currentModule) {
    const start = () => {
      const RootComponent = () => /*#__PURE__*/React.createElement(SidebarProvider, {
        currentModule: currentModule || 0
      }, /*#__PURE__*/React.createElement(Sidebar, null), /*#__PURE__*/React.createElement(AppComponent, null));
      ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(ErrorBoundary, null, /*#__PURE__*/React.createElement(RootComponent, null)));
    };
    if (window.katex) start();else {
      const check = setInterval(() => {
        if (window.katex) {
          clearInterval(check);
          start();
        }
      }, 80);
      setTimeout(() => {
        clearInterval(check);
        start();
      }, 4000);
    }
  };
})();

/* ===== MODULE 3 CONTENT ===== */

(function () {
  const {
    useState,
    useEffect,
    useMemo,
    useRef,
    useCallback
  } = React;

  /* ════════════════════════════════════════════════════════════════
     PROBLEM LAB — SHARED COMPONENTS & STATE
     ════════════════════════════════════════════════════════════════ */

  const MODULE_NUM = 3;

  /* localStorage helpers ─────────────────────────────────────────── */
  const lsGet = (k, fallback) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  function useConceptProgress(conceptNum, totalProblems) {
    const aKey = "gate_la_m" + MODULE_NUM + "_c" + conceptNum + "_attempted";
    const cKey = "gate_la_m" + MODULE_NUM + "_c" + conceptNum + "_correct";
    const hKey = "gate_la_m" + MODULE_NUM + "_c" + conceptNum + "_hints";
    const [attempted, setAttempted] = useState(() => lsGet(aKey, []));
    const [correct, setCorrect] = useState(() => lsGet(cKey, []));
    const [hints, setHints] = useState(() => lsGet(hKey, {}));
    const markAttempt = (pid, didCorrect) => {
      setAttempted(prev => {
        if (prev.includes(pid)) return prev;
        const next = [...prev, pid];
        lsSet(aKey, next);
        return next;
      });
      if (didCorrect) {
        setCorrect(prev => {
          if (prev.includes(pid)) return prev;
          const next = [...prev, pid];
          lsSet(cKey, next);
          return next;
        });
      }
    };
    const useHint = pid => {
      setHints(prev => {
        const next = {
          ...prev,
          [pid]: (prev[pid] || 0) + 1
        };
        lsSet(hKey, next);
        return next;
      });
    };
    return {
      attempted,
      correct,
      hints,
      markAttempt,
      useHint,
      totalProblems
    };
  }

  /* ────────────────────────────────────────────────────────────────
     BADGES (Difficulty, Type, Time, Tags)
     ──────────────────────────────────────────────────────────────── */
  function DiffBadge({
    level
  }) {
    const labels = {
      easy: "EASY",
      medium: "MEDIUM",
      hard: "HARD",
      killer: "KILLER"
    };
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.15em] font-bold px-2 py-1 rounded-md pl-difficulty-" + level
    }, labels[level]);
  }
  function TypeBadge({
    type
  }) {
    if (type === "pyq") return /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.15em] font-bold px-2 py-1 rounded-md pl-type-pyq"
    }, "\u2605 GATE PYQ");
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.15em] font-bold px-2 py-1 rounded-md pl-type-" + type
    }, type === "mcq" ? "MCQ" : "NAT");
  }
  function MetaPill({
    children,
    mono = false
  }) {
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] px-2 py-1 rounded-md " + (mono ? "font-mono " : ""),
      style: {
        background: "var(--bg-elev-3)",
        color: "var(--text-dim)",
        border: "1px solid var(--border)"
      }
    }, children);
  }
  function ConceptTag({
    children
  }) {
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] px-2 py-1 rounded-md font-mono",
      style: {
        background: "var(--accent-soft)",
        color: "var(--accent)",
        border: "1px solid var(--accent-border)"
      }
    }, children);
  }

  /* ────────────────────────────────────────────────────────────────
     LAYER HEADER
     ──────────────────────────────────────────────────────────────── */
  function LayerHeader({
    num,
    title,
    subtitle
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-10 mb-5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pl-layer-header"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pl-layer-num"
    }, "L", num), /*#__PURE__*/React.createElement("div", {
      className: "pl-layer-title"
    }, title)), subtitle && /*#__PURE__*/React.createElement("div", {
      className: "text-[14px] ml-12",
      style: {
        color: "var(--text-dim)"
      }
    }, subtitle));
  }

  /* ────────────────────────────────────────────────────────────────
     PATTERN CARD (Layer 1)
     ──────────────────────────────────────────────────────────────── */
  function PatternCard({
    idx,
    pattern
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "rounded-xl p-5 mb-4 pl-prose",
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-baseline gap-3 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.18em] font-bold px-2 py-1 rounded-md",
      style: {
        background: "var(--accent-soft)",
        color: "var(--accent)",
        border: "1px solid var(--accent-border)"
      }
    }, "PATTERN ", idx), /*#__PURE__*/React.createElement("span", {
      className: "text-[17px] font-semibold",
      style: {
        color: "var(--text)"
      }
    }, pattern.name), /*#__PURE__*/React.createElement("span", {
      className: "ml-auto text-[11px] px-2 py-1 rounded-md font-mono",
      style: {
        background: "var(--bg-elev-3)",
        color: "var(--text-dim)",
        border: "1px solid var(--border)"
      }
    }, "\u23F1 ~", pattern.timeBudget, "s"), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] px-2 py-1 rounded-md",
      style: {
        background: pattern.frequency === "Very Frequent" ? "rgba(239,68,68,0.12)" : pattern.frequency === "Frequent" ? "rgba(249,115,22,0.12)" : pattern.frequency === "Occasional" ? "rgba(234,179,8,0.12)" : "rgba(148,163,184,0.12)",
        color: pattern.frequency === "Very Frequent" ? "#ef4444" : pattern.frequency === "Frequent" ? "#f97316" : pattern.frequency === "Occasional" ? "#eab308" : "#94a3b8",
        border: "1px solid currentColor"
      }
    }, pattern.frequency)), /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-2 gap-3 text-[13.5px] leading-relaxed"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-2)"
      }
    }, "SURFACE APPEARANCE"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text)"
      }
    }, pattern.surface)), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--pink)"
      }
    }, "WHAT IT'S ACTUALLY TESTING"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text)"
      }
    }, pattern.testing))), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-2",
      style: {
        color: "var(--warn)"
      }
    }, "SIGNAL WORDS"), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, pattern.signals.map((s, i) => /*#__PURE__*/React.createElement("code", {
      key: i,
      className: "font-mono text-[12px] px-2 py-1 rounded",
      style: {
        background: "var(--bg-elev-3)",
        color: "var(--warn)",
        border: "1px solid var(--warn-border)"
      }
    }, s)))), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "var(--accent-soft)",
        border: "1px solid var(--accent-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent)"
      }
    }, "FIRST MOVE (TOP-RANKER REFLEX)"), /*#__PURE__*/React.createElement("div", {
      className: "text-[14px]",
      style: {
        color: "var(--text)"
      }
    }, pattern.firstMove)));
  }

  /* ────────────────────────────────────────────────────────────────
     PROBLEM CARD (Layer 2)
     ──────────────────────────────────────────────────────────────── */
  function ProblemCard({
    p,
    idx,
    progress
  }) {
    const [selected, setSelected] = useState(null);
    const [natValue, setNatValue] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [hintsShown, setHintsShown] = useState(0);
    const [showFullSolution, setShowFullSolution] = useState(false);
    const [flashKey, setFlashKey] = useState(0);
    const isPYQ = p.type === "pyq";
    const checkAnswer = () => {
      let ok = false;
      if (p.kind === "mcq") {
        ok = selected === p.answer;
      } else {
        const userVal = parseFloat(natValue);
        if (!isNaN(userVal)) {
          const tol = p.tolerance != null ? p.tolerance : 0.01;
          ok = Math.abs(userVal - p.answer) <= tol;
        }
      }
      setIsCorrect(ok);
      setSubmitted(true);
      setAttempts(a => a + 1);
      setFlashKey(k => k + 1);
      progress.markAttempt(p.id, ok);
      if (!ok && attempts + 1 >= 2) setShowFullSolution(true);
    };
    const tryAgain = () => {
      setSubmitted(false);
      setIsCorrect(false);
      setSelected(null);
      setNatValue("");
    };
    const revealHint = () => {
      if (hintsShown < (p.hints?.length || 0)) {
        setHintsShown(hintsShown + 1);
        progress.useHint(p.id);
      }
    };
    const isCompleted = progress.correct.includes(p.id);
    return /*#__PURE__*/React.createElement("div", {
      key: flashKey,
      className: "rounded-xl p-5 mb-5 " + (submitted ? isCorrect ? "pl-correct" : "pl-wrong" : ""),
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid " + (isCompleted ? "rgba(34,197,94,0.4)" : "var(--border)")
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.18em] font-bold px-2 py-1 rounded-md font-mono",
      style: {
        background: "var(--bg-elev-3)",
        color: "var(--text-dim)",
        border: "1px solid var(--border)"
      }
    }, "Q", idx), /*#__PURE__*/React.createElement(DiffBadge, {
      level: p.difficulty
    }), /*#__PURE__*/React.createElement(TypeBadge, {
      type: isPYQ ? "pyq" : p.kind
    }), isPYQ && p.pyqYear && /*#__PURE__*/React.createElement(MetaPill, {
      mono: true
    }, "GATE CS ", p.pyqYear), /*#__PURE__*/React.createElement(MetaPill, null, p.marks, "-mark style"), /*#__PURE__*/React.createElement(MetaPill, {
      mono: true
    }, "\u23F1 ~", p.timeTarget, "s"), isCompleted && /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.18em] font-bold px-2 py-1 rounded-md ml-auto",
      style: {
        background: "rgba(34,197,94,0.15)",
        color: "#22c55e",
        border: "1px solid rgba(34,197,94,0.4)"
      }
    }, "\u2713 SOLVED")), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2 mb-3"
    }, p.tags.map((t, i) => /*#__PURE__*/React.createElement(ConceptTag, {
      key: i
    }, t))), p.kind === "mcq" && /*#__PURE__*/React.createElement("div", {
      className: "pl-neg-banner mb-3"
    }, "\u26A0 Negative marking: \u22121/3 mark for wrong answer"), p.skipSignal && /*#__PURE__*/React.createElement("div", {
      className: "mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: p.skipSignal.type === "attempt" ? "pl-skip-attempt" : "pl-skip-skip"
    }, p.skipSignal.type === "attempt" ? "✓ " : "💡 ", p.skipSignal.text)), /*#__PURE__*/React.createElement("div", {
      className: "text-[15px] leading-relaxed mb-4 p-4 rounded-lg pl-prose",
      style: {
        background: "var(--bg-elev-2)",
        color: "var(--text)",
        border: "1px solid var(--border)"
      }
    }, p.statement), p.kind === "mcq" ? /*#__PURE__*/React.createElement("div", {
      className: "space-y-2 mb-3"
    }, p.options.map((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      let cls = "pl-option-btn";
      if (!submitted && selected === letter) cls += " selected";
      if (submitted) {
        if (letter === p.answer) cls += " correct";else if (letter === selected) cls += " wrong-choice";
      }
      return /*#__PURE__*/React.createElement("button", {
        key: i,
        className: cls,
        disabled: submitted,
        onClick: () => setSelected(letter)
      }, /*#__PURE__*/React.createElement("span", {
        className: "pl-option-letter"
      }, letter), /*#__PURE__*/React.createElement("span", {
        className: "flex-1"
      }, opt), submitted && letter === p.answer && /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#22c55e"
        }
      }, "\u2713"), submitted && letter === selected && letter !== p.answer && /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#fb7185"
        }
      }, "\u2717"));
    })) : /*#__PURE__*/React.createElement("div", {
      className: "mb-3"
    }, /*#__PURE__*/React.createElement("label", {
      className: "text-[12px] mb-1 block",
      style: {
        color: "var(--text-dim)"
      }
    }, "Numerical Answer (NAT \u2014 no options)"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "any",
      className: "pl-nat-input",
      value: natValue,
      disabled: submitted,
      onChange: e => setNatValue(e.target.value),
      placeholder: "Enter your answer..."
    })), !submitted && /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("button", {
      className: "pl-submit-btn",
      disabled: p.kind === "mcq" ? !selected : natValue === "",
      onClick: checkAnswer
    }, "Submit Answer"), hintsShown > 0 && /*#__PURE__*/React.createElement("span", {
      className: "text-[11px]",
      style: {
        color: "var(--text-dim)"
      }
    }, "Hints used: ", hintsShown, "/", p.hints?.length || 0), p.hints && p.hints.length > 0 && hintsShown < p.hints.length && /*#__PURE__*/React.createElement("button", {
      className: "text-[13px] px-3 py-1.5 rounded-md transition-colors",
      style: {
        border: "1px solid var(--accent-2-border)",
        color: "var(--accent-2)",
        background: "var(--accent-2-soft)"
      },
      onClick: revealHint
    }, "Show Hint ", hintsShown + 1)), hintsShown > 0 && !submitted && /*#__PURE__*/React.createElement("div", {
      className: "mt-4 space-y-2"
    }, p.hints.slice(0, hintsShown).map((h, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "pl-hint-box pl-prose"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-2)"
      }
    }, "HINT ", i + 1, " \xB7 ", h.label), /*#__PURE__*/React.createElement("div", {
      className: "text-[14px]"
    }, h.text)))), submitted && /*#__PURE__*/React.createElement("div", {
      className: "mt-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-3 mb-3"
    }, isCorrect ? /*#__PURE__*/React.createElement("span", {
      className: "text-[12px] tracking-[0.15em] font-bold px-3 py-1.5 rounded-md",
      style: {
        background: "rgba(34,197,94,0.15)",
        color: "#22c55e",
        border: "1px solid rgba(34,197,94,0.4)"
      }
    }, "\u2713 CORRECT") : /*#__PURE__*/React.createElement("span", {
      className: "text-[12px] tracking-[0.15em] font-bold px-3 py-1.5 rounded-md",
      style: {
        background: "rgba(239,68,68,0.15)",
        color: "#fb7185",
        border: "1px solid rgba(239,68,68,0.4)"
      }
    }, "\u2717 INCORRECT"), !isCorrect && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "text-[13px] px-3 py-1.5 rounded-md",
      style: {
        border: "1px solid var(--accent-border)",
        color: "var(--accent)",
        background: "var(--accent-soft)"
      },
      onClick: tryAgain
    }, "Try Again"), p.hints && p.hints.length > 0 && hintsShown < p.hints.length && !showFullSolution && /*#__PURE__*/React.createElement("button", {
      className: "text-[13px] px-3 py-1.5 rounded-md",
      style: {
        border: "1px solid var(--accent-2-border)",
        color: "var(--accent-2)",
        background: "var(--accent-2-soft)"
      },
      onClick: () => {
        revealHint();
        setSubmitted(false);
      }
    }, "Show Hint"), !showFullSolution && attempts >= 2 && /*#__PURE__*/React.createElement("button", {
      className: "text-[13px] px-3 py-1.5 rounded-md",
      style: {
        border: "1px solid var(--danger-border)",
        color: "var(--danger)",
        background: "var(--danger-soft)"
      },
      onClick: () => setShowFullSolution(true)
    }, "Show Full Solution"), !showFullSolution && /*#__PURE__*/React.createElement("button", {
      className: "text-[13px] px-3 py-1.5 rounded-md",
      style: {
        border: "1px solid var(--border-strong)",
        color: "var(--text-dim)",
        background: "var(--bg-elev-2)"
      },
      onClick: () => setShowFullSolution(true)
    }, "Reveal Solution"))), (isCorrect || showFullSolution) && /*#__PURE__*/React.createElement(SolutionPanel, {
      p: p,
      wasCorrect: isCorrect
    })));
  }

  /* ────────────────────────────────────────────────────────────────
     SOLUTION PANEL
     ──────────────────────────────────────────────────────────────── */
  function SolutionPanel({
    p,
    wasCorrect
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "rounded-xl p-5 mt-3 pl-prose",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--accent-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10.5px] tracking-[0.2em] font-bold mb-3",
      style: {
        color: "var(--accent)"
      }
    }, "\uD83E\uDDE0 THINKING CHAIN \u2014 How a top ranker actually solves this"), /*#__PURE__*/React.createElement("div", {
      className: "space-y-3"
    }, p.solution.steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "flex gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold",
      style: {
        background: "var(--accent-soft)",
        color: "var(--accent)",
        border: "1px solid var(--accent-border)"
      }
    }, i + 1), /*#__PURE__*/React.createElement("div", {
      className: "flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11.5px] tracking-[0.18em] font-semibold mb-0.5",
      style: {
        color: "var(--accent-2)"
      }
    }, s.label), /*#__PURE__*/React.createElement("div", {
      className: "text-[14px] leading-relaxed",
      style: {
        color: "var(--text)",
        whiteSpace: "pre-line"
      }
    }, s.body))))), /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-2 gap-3 mt-5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--accent-3-soft)",
        border: "1px solid var(--accent-3-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-3)"
      }
    }, "\u2713 GATE CHECK"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, p.solution.gateCheck)), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--warn-soft)",
        border: "1px solid var(--warn-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--warn)"
      }
    }, "\u26A1 SPEED VERSION"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, p.solution.speed))), /*#__PURE__*/React.createElement("div", {
      className: "mt-4 rounded-lg p-3",
      style: {
        background: "var(--danger-soft)",
        border: "1px solid var(--danger-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--danger)"
      }
    }, "\u26A0 WHAT MADE THIS HARD"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, p.solution.whatMadeHard)), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "var(--pink-soft)",
        border: "1px solid var(--pink-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--pink)"
      }
    }, "\uD83D\uDD01 GENERALIZATION"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, p.solution.generalization)), p.solution.linkedConcept && /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "var(--info-soft)",
        border: "1px solid var(--info-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--info)"
      }
    }, "\uD83D\uDD17 LINKED CONCEPT"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, p.solution.linkedConcept)), p.kind === "mcq" && p.solution.negAdvisory && /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "rgba(69,26,3,0.4)",
        border: "1px solid rgba(251,191,36,0.3)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "#fbbf24"
      }
    }, "\uD83D\uDCCA NEGATIVE-MARKING ADVISORY"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, p.solution.negAdvisory)));
  }

  /* ────────────────────────────────────────────────────────────────
     TECHNIQUE CARD (Layer 3)
     ──────────────────────────────────────────────────────────────── */
  function TechniqueCard({
    tech
  }) {
    const typeColors = {
      "Speed Shortcut": {
        bg: "rgba(34,211,238,0.1)",
        fg: "#22d3ee",
        bd: "rgba(34,211,238,0.35)"
      },
      "Trap Avoidance": {
        bg: "rgba(251,191,36,0.1)",
        fg: "#fbbf24",
        bd: "rgba(251,191,36,0.35)"
      },
      "Structural Insight": {
        bg: "rgba(167,139,250,0.1)",
        fg: "#a78bfa",
        bd: "rgba(167,139,250,0.35)"
      },
      "Verification Method": {
        bg: "rgba(52,211,153,0.1)",
        fg: "#34d399",
        bd: "rgba(52,211,153,0.35)"
      }
    };
    const c = typeColors[tech.type] || typeColors["Speed Shortcut"];
    return /*#__PURE__*/React.createElement("div", {
      className: "pl-tech-card mb-4 pl-prose"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-baseline gap-3 mb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[17px] font-semibold",
      style: {
        color: "var(--text)"
      }
    }, tech.name), /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.15em] font-bold px-2 py-1 rounded-md",
      style: {
        background: c.bg,
        color: c.fg,
        border: "1px solid " + c.bd
      }
    }, tech.type.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      className: "ml-auto text-[11px] px-2 py-1 rounded-md",
      style: {
        background: tech.freq === "Very Frequent" ? "rgba(239,68,68,0.12)" : tech.freq === "Frequent" ? "rgba(249,115,22,0.12)" : tech.freq === "Occasional" ? "rgba(234,179,8,0.12)" : "rgba(148,163,184,0.12)",
        color: tech.freq === "Very Frequent" ? "#ef4444" : tech.freq === "Frequent" ? "#f97316" : tech.freq === "Occasional" ? "#eab308" : "#94a3b8",
        border: "1px solid currentColor"
      }
    }, tech.freq)), /*#__PURE__*/React.createElement("div", {
      className: "mb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent)"
      }
    }, "WHEN TO USE"), /*#__PURE__*/React.createElement("div", {
      className: "text-[14px]",
      style: {
        color: "var(--text)"
      }
    }, tech.when)), /*#__PURE__*/React.createElement("div", {
      className: "mb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-2)"
      }
    }, "HOW IT WORKS"), /*#__PURE__*/React.createElement("ol", {
      className: "list-decimal list-outside ml-5 space-y-1.5 text-[14px]",
      style: {
        color: "var(--text)"
      }
    }, tech.steps.map((s, i) => /*#__PURE__*/React.createElement("li", {
      key: i
    }, s)))), /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-2 gap-3 mb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--accent-3-soft)",
        border: "1px solid var(--accent-3-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-3)"
      }
    }, "\u26A1 SPEED CLAIM"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, tech.speed)), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-2)"
      }
    }, "\uD83D\uDD2C MICRO-EXAMPLE"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13px] font-mono whitespace-pre-line",
      style: {
        color: "var(--text)"
      }
    }, tech.example))), /*#__PURE__*/React.createElement("div", {
      className: "pl-danger-zone"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "#fb7185"
      }
    }, "\u26D4 DANGER ZONE \u2014 when this technique FAILS"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, tech.danger)));
  }

  /* ────────────────────────────────────────────────────────────────
     MISTAKE CARD (Layer 4) with Spot-the-Error mode
     ──────────────────────────────────────────────────────────────── */
  function MistakeCard({
    mistake,
    idx
  }) {
    const [mode, setMode] = useState("read"); // "read" | "spot"
    const [clickedLine, setClickedLine] = useState(null);
    const [showFull, setShowFull] = useState(false);
    return /*#__PURE__*/React.createElement("div", {
      className: "pl-mistake-card mb-4 pl-prose"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-baseline gap-3 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10.5px] tracking-[0.15em] font-bold px-2 py-1 rounded-md",
      style: {
        background: "var(--danger-soft)",
        color: "var(--danger)",
        border: "1px solid var(--danger-border)"
      }
    }, "MISTAKE ", idx), /*#__PURE__*/React.createElement("div", {
      className: "text-[17px] font-semibold",
      style: {
        color: "var(--text)"
      }
    }, mistake.name), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] px-2 py-1 rounded-md ml-auto",
      style: {
        background: mistake.frequency === "Very Common" ? "rgba(239,68,68,0.12)" : mistake.frequency === "Common" ? "rgba(249,115,22,0.12)" : "rgba(148,163,184,0.12)",
        color: mistake.frequency === "Very Common" ? "#ef4444" : mistake.frequency === "Common" ? "#f97316" : "#94a3b8",
        border: "1px solid currentColor"
      }
    }, mistake.frequency)), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2 mb-3"
    }, /*#__PURE__*/React.createElement("button", {
      className: "pl-tab-pill " + (mode === "read" ? "active" : ""),
      onClick: () => setMode("read")
    }, "\uD83D\uDCD6 Read"), /*#__PURE__*/React.createElement("button", {
      className: "pl-tab-pill " + (mode === "spot" ? "active" : ""),
      onClick: () => {
        setMode("spot");
        setClickedLine(null);
        setShowFull(false);
      }
    }, "\uD83C\uDFAF Spot the Error")), mode === "read" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "mb-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--danger)"
      }
    }, "WRONG SOLUTION (looks plausible)"), /*#__PURE__*/React.createElement("div", {
      className: "pl-wrong-solution"
    }, mistake.wrong.map((line, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: i === mistake.errorLine ? "error-found" : "",
      style: {
        padding: "2px 4px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-faded)",
        marginRight: 8
      }
    }, (i + 1).toString().padStart(2, " "), "."), line)))), /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-2 gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--danger-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--danger)"
      }
    }, "\uD83D\uDCCD ERROR LOCATION"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, "Line ", mistake.errorLine + 1, ": ", mistake.errorDescription)), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--warn-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--warn)"
      }
    }, "\uD83E\uDDE0 ROOT CAUSE"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, mistake.rootCause))), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "var(--accent-3-soft)",
        border: "1px solid var(--accent-3-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent-3)"
      }
    }, "\u2705 CORRECT REASONING"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--text)"
      }
    }, mistake.correct)), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: "var(--accent-soft)",
        border: "1px solid var(--accent-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent)"
      }
    }, "\uD83D\uDEE1 PREVENTION RULE (memorize this)"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px] italic",
      style: {
        color: "var(--text)"
      }
    }, mistake.prevention)), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 flex gap-2 text-[12px]",
      style: {
        color: "var(--text-dim)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "px-2 py-1 rounded-md",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, "\uD83D\uDCB8 GATE Cost: ", mistake.gateCost))), mode === "spot" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "mb-2 text-[13px]",
      style: {
        color: "var(--text-dim)"
      }
    }, "\uD83D\uDC49 Click the line where you think the reasoning breaks."), /*#__PURE__*/React.createElement("div", {
      className: "pl-wrong-solution"
    }, mistake.wrong.map((line, i) => {
      let cls = "pl-wrong-line";
      if (clickedLine === i) {
        if (i === mistake.errorLine) cls += " error-found";else cls += "";
      }
      if (showFull && i === mistake.errorLine) cls += " error-found";
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        className: cls,
        onClick: () => {
          if (clickedLine === null) {
            setClickedLine(i);
            setShowFull(true);
          }
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: "var(--text-faded)",
          marginRight: 8
        }
      }, (i + 1).toString().padStart(2, " "), "."), line, showFull && i === mistake.errorLine && /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#fb7185",
          marginLeft: 8,
          fontWeight: 600
        }
      }, "\u2190 ERROR HERE"));
    })), clickedLine !== null && /*#__PURE__*/React.createElement("div", {
      className: "mt-3 rounded-lg p-3",
      style: {
        background: clickedLine === mistake.errorLine ? "var(--accent-3-soft)" : "var(--danger-soft)",
        border: "1px solid " + (clickedLine === mistake.errorLine ? "var(--accent-3-border)" : "var(--danger-border)")
      }
    }, clickedLine === mistake.errorLine ? /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "#22c55e"
      }
    }, "\u2713 Correct! You spotted the error on line ", mistake.errorLine + 1, ": ", mistake.errorDescription) : /*#__PURE__*/React.createElement("div", {
      className: "text-[13.5px]",
      style: {
        color: "var(--danger)"
      }
    }, "\u2717 Not quite. The actual error is on line ", mistake.errorLine + 1, ": ", mistake.errorDescription))));
  }

  /* ────────────────────────────────────────────────────────────────
     DRILL MODE (Layer 5)
     ──────────────────────────────────────────────────────────────── */
  function DrillMode({
    conceptNum,
    conceptTitle,
    problems
  }) {
    const TARGETS = {
      easy: 40,
      medium: 75,
      hard: 120,
      killer: 150
    };
    const lsKey = "gate_la_m" + MODULE_NUM + "_c" + conceptNum + "_drill_best";
    const streakKey = "gate_la_m" + MODULE_NUM + "_c" + conceptNum + "_drill_streak";
    const [phase, setPhase] = useState("idle"); // idle | running | review
    const [drill, setDrill] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [results, setResults] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [questionStart, setQuestionStart] = useState(0);
    const [selected, setSelected] = useState(null);
    const [natVal, setNatVal] = useState("");
    const [feedback, setFeedback] = useState(null);
    const [paused, setPaused] = useState(false);
    const [bestRecord] = useState(() => lsGet(lsKey, null));
    const [streak] = useState(() => lsGet(streakKey, 0));
    const startDrill = () => {
      const shuffled = [...problems].sort(() => Math.random() - 0.5).slice(0, 5);
      setDrill(shuffled);
      setCurrentIdx(0);
      setResults([]);
      setSelected(null);
      setNatVal("");
      setFeedback(null);
      const first = shuffled[0];
      setTimeLeft(TARGETS[first.difficulty] || 60);
      setQuestionStart(Date.now());
      setPhase("running");
    };
    useEffect(() => {
      if (phase !== "running" || paused || feedback) return;
      if (timeLeft <= 0) {
        submitDrill(false, "timeout");
        return;
      }
      const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(t);
    }, [phase, timeLeft, paused, feedback]);
    const submitDrill = (didAnswer, mode) => {
      const p = drill[currentIdx];
      const elapsed = Math.round((Date.now() - questionStart) / 1000);
      let isCorrect = false;
      if (didAnswer) {
        if (p.kind === "mcq") isCorrect = selected === p.answer;else {
          const v = parseFloat(natVal);
          if (!isNaN(v)) {
            const tol = p.tolerance != null ? p.tolerance : 0.01;
            isCorrect = Math.abs(v - p.answer) <= tol;
          }
        }
      }
      setResults(r => [...r, {
        problem: p,
        correct: isCorrect,
        time: elapsed,
        target: TARGETS[p.difficulty] || 60,
        answer: p.kind === "mcq" ? selected : natVal,
        mode
      }]);
      setFeedback({
        correct: isCorrect,
        answer: p.answer
      });
    };
    const nextQuestion = () => {
      if (currentIdx + 1 >= drill.length) {
        finalize();
        return;
      }
      const nextI = currentIdx + 1;
      setCurrentIdx(nextI);
      setSelected(null);
      setNatVal("");
      setFeedback(null);
      setTimeLeft(TARGETS[drill[nextI].difficulty] || 60);
      setQuestionStart(Date.now());
    };
    const finalize = () => {
      setPhase("review");
      const correctCount = results.filter(r => r.correct).length;
      const total = results.length;
      const acc = total > 0 ? Math.round(correctCount / total * 100) : 0;
      const avgTime = total > 0 ? Math.round(results.reduce((s, r) => s + r.time, 0) / total) : 0;
      const nm = results.reduce((s, r) => {
        if (r.problem.kind !== "mcq") return s;
        if (r.correct) return s + (r.problem.marks === 2 ? 2 : 1);
        if (r.answer == null) return s;
        return s - (r.problem.marks === 2 ? 2 / 3 : 1 / 3);
      }, 0);
      if (!bestRecord || acc > bestRecord.accuracy || acc === bestRecord.accuracy && avgTime < bestRecord.avgTime) {
        lsSet(lsKey, {
          score: correctCount,
          accuracy: acc,
          avgTime,
          when: Date.now()
        });
      }
      const lastStreak = results.length > 0 ? results[results.length - 1].correct : false;
      const newStreak = lastStreak ? streak + correctCount : 0;
      lsSet(streakKey, Math.max(streak, newStreak));
    };
    const progressPct = phase === "running" && drill[currentIdx] ? timeLeft / (TARGETS[drill[currentIdx].difficulty] || 60) * 100 : 0;
    const progressClass = progressPct < 25 ? "danger" : progressPct < 50 ? "warning" : "";
    if (phase === "idle") {
      return /*#__PURE__*/React.createElement("div", {
        className: "rounded-xl p-6",
        style: {
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-center gap-3 mb-3"
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-[24px]"
      }, "\u23F1"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "text-[18px] font-semibold",
        style: {
          color: "var(--text)"
        }
      }, "Drill Mode \u2014 ", conceptTitle), /*#__PURE__*/React.createElement("div", {
        className: "text-[13px]",
        style: {
          color: "var(--text-dim)"
        }
      }, "5 rapid-fire questions \xB7 timed \xB7 instant feedback only"))), /*#__PURE__*/React.createElement("div", {
        className: "grid md:grid-cols-4 gap-3 my-4 text-[12px]"
      }, /*#__PURE__*/React.createElement("div", {
        className: "rounded-md p-3",
        style: {
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--text-dim)"
        }
      }, "Easy target"), /*#__PURE__*/React.createElement("div", {
        className: "font-mono font-semibold mt-1",
        style: {
          color: "#22c55e"
        }
      }, "40 sec")), /*#__PURE__*/React.createElement("div", {
        className: "rounded-md p-3",
        style: {
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--text-dim)"
        }
      }, "Medium target"), /*#__PURE__*/React.createElement("div", {
        className: "font-mono font-semibold mt-1",
        style: {
          color: "#eab308"
        }
      }, "75 sec")), /*#__PURE__*/React.createElement("div", {
        className: "rounded-md p-3",
        style: {
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--text-dim)"
        }
      }, "Hard target"), /*#__PURE__*/React.createElement("div", {
        className: "font-mono font-semibold mt-1",
        style: {
          color: "#f97316"
        }
      }, "120 sec")), /*#__PURE__*/React.createElement("div", {
        className: "rounded-md p-3",
        style: {
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--text-dim)"
        }
      }, "Killer target"), /*#__PURE__*/React.createElement("div", {
        className: "font-mono font-semibold mt-1",
        style: {
          color: "#ef4444"
        }
      }, "150 sec"))), bestRecord && /*#__PURE__*/React.createElement("div", {
        className: "rounded-lg p-3 mb-3",
        style: {
          background: "var(--accent-3-soft)",
          border: "1px solid var(--accent-3-border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-[11px] tracking-[0.18em] font-semibold mb-1",
        style: {
          color: "var(--accent-3)"
        }
      }, "\uD83C\uDFC6 PERSONAL BEST"), /*#__PURE__*/React.createElement("div", {
        className: "text-[13.5px]",
        style: {
          color: "var(--text)"
        }
      }, "Score: ", bestRecord.score, "/5 \xB7 Accuracy: ", bestRecord.accuracy, "% \xB7 Avg time: ", bestRecord.avgTime, "s")), streak > 0 && /*#__PURE__*/React.createElement("div", {
        className: "rounded-lg p-3 mb-3",
        style: {
          background: "var(--warn-soft)",
          border: "1px solid var(--warn-border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-[11px] tracking-[0.18em] font-semibold mb-1",
        style: {
          color: "var(--warn)"
        }
      }, "\uD83D\uDD25 STREAK"), /*#__PURE__*/React.createElement("div", {
        className: "text-[13.5px]",
        style: {
          color: "var(--text)"
        }
      }, "Best streak: ", streak, " consecutive correct under time")), /*#__PURE__*/React.createElement("button", {
        className: "pl-submit-btn",
        onClick: startDrill
      }, "\u25B6 Start Drill (5 questions)"));
    }
    if (phase === "running") {
      const p = drill[currentIdx];
      return /*#__PURE__*/React.createElement("div", {
        className: "rounded-xl p-6",
        style: {
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-center justify-between mb-3"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-center gap-3"
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-[12px] tracking-[0.15em] font-bold px-2 py-1 rounded-md",
        style: {
          background: "var(--bg-elev-3)",
          color: "var(--text-dim)",
          border: "1px solid var(--border)"
        }
      }, "Q ", currentIdx + 1, " / ", drill.length), /*#__PURE__*/React.createElement(DiffBadge, {
        level: p.difficulty
      })), /*#__PURE__*/React.createElement("div", {
        className: "text-[14px] font-mono font-bold",
        style: {
          color: timeLeft < 20 ? "#ef4444" : timeLeft < 40 ? "#eab308" : "#22c55e"
        }
      }, "\u23F1 ", timeLeft, "s")), /*#__PURE__*/React.createElement("div", {
        className: "pl-progress-bar mb-4"
      }, /*#__PURE__*/React.createElement("div", {
        className: "pl-progress-fill " + progressClass,
        style: {
          width: progressPct + "%"
        }
      })), /*#__PURE__*/React.createElement("div", {
        className: "text-[15px] leading-relaxed mb-4 p-4 rounded-lg",
        style: {
          background: "var(--bg-elev-2)",
          color: "var(--text)",
          border: "1px solid var(--border)"
        }
      }, p.statement), !feedback && p.kind === "mcq" && /*#__PURE__*/React.createElement("div", {
        className: "space-y-2 mb-3"
      }, p.options.map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        return /*#__PURE__*/React.createElement("button", {
          key: i,
          className: "pl-option-btn " + (selected === letter ? "selected" : ""),
          onClick: () => setSelected(letter)
        }, /*#__PURE__*/React.createElement("span", {
          className: "pl-option-letter"
        }, letter), /*#__PURE__*/React.createElement("span", {
          className: "flex-1"
        }, opt));
      })), !feedback && p.kind === "nat" && /*#__PURE__*/React.createElement("input", {
        type: "number",
        step: "any",
        className: "pl-nat-input mb-3",
        value: natVal,
        onChange: e => setNatVal(e.target.value),
        placeholder: "Enter your answer..."
      }), !feedback && /*#__PURE__*/React.createElement("div", {
        className: "flex gap-2"
      }, /*#__PURE__*/React.createElement("button", {
        className: "pl-submit-btn",
        disabled: p.kind === "mcq" ? !selected : natVal === "",
        onClick: () => submitDrill(true, "answered")
      }, "Submit"), /*#__PURE__*/React.createElement("button", {
        className: "text-[13px] px-3 py-1.5 rounded-md",
        style: {
          border: "1px solid var(--border-strong)",
          color: "var(--text-dim)",
          background: "var(--bg-elev-2)"
        },
        onClick: () => submitDrill(false, "skipped")
      }, "Skip")), feedback && /*#__PURE__*/React.createElement("div", {
        className: "rounded-lg p-3 mb-3",
        style: {
          background: feedback.correct ? "var(--accent-3-soft)" : "var(--danger-soft)",
          border: "1px solid " + (feedback.correct ? "var(--accent-3-border)" : "var(--danger-border)")
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-[13.5px] font-semibold mb-1",
        style: {
          color: feedback.correct ? "#22c55e" : "#fb7185"
        }
      }, feedback.correct ? "✓ Correct" : "✗ Incorrect", " \u2014 Answer: ", String(feedback.answer)), /*#__PURE__*/React.createElement("div", {
        className: "flex gap-2 mt-2"
      }, /*#__PURE__*/React.createElement("button", {
        className: "pl-submit-btn",
        onClick: nextQuestion
      }, currentIdx + 1 >= drill.length ? "Finish Drill →" : "Next Question →"))));
    }

    /* phase === "review" */
    const correctCount = results.filter(r => r.correct).length;
    const total = results.length;
    const acc = total > 0 ? Math.round(correctCount / total * 100) : 0;
    const accByDiff = {};
    ["easy", "medium", "hard", "killer"].forEach(d => {
      const dr = results.filter(r => r.problem.difficulty === d);
      if (dr.length > 0) {
        accByDiff[d] = Math.round(dr.filter(r => r.correct).length / dr.length * 100);
      }
    });
    const nm = results.reduce((s, r) => {
      if (r.problem.kind !== "mcq") return s + (r.correct ? r.problem.marks : 0);
      if (r.correct) return s + (r.problem.marks === 2 ? 2 : 1);
      if (r.answer == null || r.mode === "skipped" || r.mode === "timeout") return s;
      return s - (r.problem.marks === 2 ? 2 / 3 : 1 / 3);
    }, 0);
    const totalMarks = results.reduce((s, r) => s + (r.problem.marks || 1), 0);
    const reviseConcepts = [...new Set(results.filter(r => !r.correct).flatMap(r => r.problem.tags))];
    return /*#__PURE__*/React.createElement("div", {
      className: "rounded-xl p-6",
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[20px] font-bold mb-1",
      style: {
        color: "var(--text)"
      }
    }, "\uD83D\uDCCA Drill Report Card"), /*#__PURE__*/React.createElement("div", {
      className: "text-[13px] mb-4",
      style: {
        color: "var(--text-dim)"
      }
    }, "5-question drill \xB7 ", conceptTitle), /*#__PURE__*/React.createElement("div", {
      className: "grid md:grid-cols-3 gap-3 mb-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-4",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--text-dim)"
      }
    }, "SCORE"), /*#__PURE__*/React.createElement("div", {
      className: "text-[24px] font-bold",
      style: {
        color: "var(--accent)"
      }
    }, correctCount, "/", total)), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-4",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--text-dim)"
      }
    }, "ACCURACY"), /*#__PURE__*/React.createElement("div", {
      className: "text-[24px] font-bold",
      style: {
        color: acc >= 80 ? "#22c55e" : acc >= 60 ? "#eab308" : "#ef4444"
      }
    }, acc, "%")), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-4",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--text-dim)"
      }
    }, "NEG-MARKING SIM"), /*#__PURE__*/React.createElement("div", {
      className: "text-[24px] font-bold",
      style: {
        color: nm >= totalMarks * 0.7 ? "#22c55e" : nm >= 0 ? "#eab308" : "#ef4444"
      }
    }, nm.toFixed(2), " / ", totalMarks))), /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-4 mb-4",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-3",
      style: {
        color: "var(--accent-2)"
      }
    }, "\u23F1 TIME vs TARGET (per question)"), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, results.map((r, i) => {
      const pct = Math.min(100, r.time / r.target * 100);
      const cls = pct > 100 ? "danger" : pct > 75 ? "warning" : "";
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        className: "flex items-center gap-3 text-[12px]"
      }, /*#__PURE__*/React.createElement("div", {
        className: "w-16 font-mono",
        style: {
          color: "var(--text-dim)"
        }
      }, "Q", i + 1), /*#__PURE__*/React.createElement(DiffBadge, {
        level: r.problem.difficulty
      }), /*#__PURE__*/React.createElement("div", {
        className: "flex-1 pl-progress-bar"
      }, /*#__PURE__*/React.createElement("div", {
        className: "pl-progress-fill " + cls,
        style: {
          width: pct + "%"
        }
      })), /*#__PURE__*/React.createElement("div", {
        className: "font-mono w-20 text-right",
        style: {
          color: "var(--text)"
        }
      }, r.time, "s / ", r.target, "s"), /*#__PURE__*/React.createElement("div", {
        style: {
          color: r.correct ? "#22c55e" : "#fb7185"
        }
      }, r.correct ? "✓" : "✗"));
    }))), Object.keys(accByDiff).length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-4 mb-4",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-2",
      style: {
        color: "var(--accent)"
      }
    }, "ACCURACY BY DIFFICULTY"), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, Object.entries(accByDiff).map(([d, a]) => /*#__PURE__*/React.createElement("div", {
      key: d,
      className: "flex items-center gap-2 text-[12px] px-2 py-1 rounded-md",
      style: {
        background: "var(--bg-elev-3)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement(DiffBadge, {
      level: d
    }), /*#__PURE__*/React.createElement("span", {
      className: "font-mono",
      style: {
        color: a >= 80 ? "#22c55e" : a >= 60 ? "#eab308" : "#ef4444"
      }
    }, a, "%"))))), reviseConcepts.length > 0 && /*#__PURE__*/React.createElement("div", {
      className: "rounded-lg p-4 mb-4",
      style: {
        background: "var(--warn-soft)",
        border: "1px solid var(--warn-border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-2",
      style: {
        color: "var(--warn)"
      }
    }, "\uD83D\uDD01 CONCEPTS TO REVISIT"), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, reviseConcepts.map((c, i) => /*#__PURE__*/React.createElement(ConceptTag, {
      key: i
    }, c)))), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      className: "pl-submit-btn",
      onClick: startDrill
    }, "\u21BB Restart Drill"), /*#__PURE__*/React.createElement("button", {
      className: "text-[13px] px-3 py-1.5 rounded-md",
      style: {
        border: "1px solid var(--border-strong)",
        color: "var(--text-dim)",
        background: "var(--bg-elev-2)"
      },
      onClick: () => setPhase("idle")
    }, "\u2190 Back")));
  }

  /* ────────────────────────────────────────────────────────────────
     PYQ WALKTHROUGH (labeled GATE CS PYQ — explanation only)
     ──────────────────────────────────────────────────────────────── */
  function PYQWalkthrough({
    year,
    marks,
    statement,
    solution
  }) {
    const [open, setOpen] = useState(false);
    return /*#__PURE__*/React.createElement("div", {
      className: "rounded-xl p-5 mb-5 pl-prose",
      style: {
        background: "rgba(245,158,11,0.05)",
        border: "1px solid rgba(245,158,11,0.35)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pl-type-pyq text-[10.5px] tracking-[0.15em] font-bold px-2 py-1 rounded-md"
    }, "\u2605 GATE CS ", year, " \u2014 PYQ WALKTHROUGH"), /*#__PURE__*/React.createElement(MetaPill, null, marks, "-mark")), /*#__PURE__*/React.createElement("div", {
      className: "text-[15px] leading-relaxed mb-3 p-4 rounded-lg",
      style: {
        background: "var(--bg-elev-2)",
        color: "var(--text)",
        border: "1px solid var(--border)"
      }
    }, statement), /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(o => !o),
      className: "text-[13px] px-3 py-1.5 rounded-md",
      style: {
        border: "1px solid rgba(245,158,11,0.35)",
        color: "#f59e0b",
        background: "rgba(245,158,11,0.10)"
      }
    }, open ? "▲ Hide walkthrough" : "▼ Show full walkthrough"), open && /*#__PURE__*/React.createElement("div", {
      className: "mt-4 space-y-3"
    }, solution.map((s, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "rounded-lg p-3",
      style: {
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] tracking-[0.18em] font-semibold mb-1",
      style: {
        color: "var(--accent)"
      }
    }, s.label), /*#__PURE__*/React.createElement("div", {
      className: "text-[14px]",
      style: {
        color: "var(--text)",
        whiteSpace: "pre-line"
      }
    }, s.body)))));
  }

  /* ────────────────────────────────────────────────────────────────
     CONCEPT NAVIGATOR (Tabs to pick which concept lab)
     ──────────────────────────────────────────────────────────────── */
  function ConceptNavigator({
    concepts,
    active,
    setActive,
    progressMap
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "sticky top-[60px] z-40 py-3 px-4 mb-4 rounded-xl flex flex-wrap gap-2",
      style: {
        background: "var(--bg-overlay)",
        backdropFilter: "blur(14px)",
        border: "1px solid var(--border)"
      }
    }, concepts.map(c => {
      const p = progressMap[c.num];
      const done = p ? p.correct.length : 0;
      const total = p ? p.totalProblems : 0;
      return /*#__PURE__*/React.createElement("button", {
        key: c.num,
        className: "pl-tab-pill " + (active === c.num ? "active" : ""),
        onClick: () => {
          setActive(c.num);
          document.getElementById("concept-lab-" + c.num)?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600
        }
      }, "C3.", c.num), /*#__PURE__*/React.createElement("span", {
        className: "opacity-70 ml-2"
      }, c.shortName), /*#__PURE__*/React.createElement("span", {
        className: "ml-2 font-mono text-[11px] opacity-80"
      }, done, "/", total, " \u2713"));
    }));
  }

  /* ────────────────────────────────────────────────────────────────
     CONCEPT-LAB WRAPPER
     ──────────────────────────────────────────────────────────────── */
  function ConceptLab({
    num,
    title,
    why,
    patterns,
    problems,
    techniques,
    mistakes,
    pyqs,
    progress
  }) {
    return /*#__PURE__*/React.createElement("section", {
      id: "concept-lab-" + num,
      className: "max-w-5xl mx-auto px-5 py-8 fade-up"
    }, /*#__PURE__*/React.createElement("div", {
      className: "card p-6 md:p-9",
      style: {
        boxShadow: "var(--shadow-glow-accent)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-baseline gap-3 mb-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs tracking-[0.22em] font-semibold px-2.5 py-1 rounded-md",
      style: {
        color: "var(--accent)",
        border: "1px solid var(--accent-border)",
        background: "var(--accent-soft)"
      }
    }, "PROBLEM LAB \xB7 CONCEPT 3.", num), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, "Module 3 \xB7 Linear Systems"), /*#__PURE__*/React.createElement("span", {
      className: "ml-auto text-[11px] px-2 py-1 rounded-md font-mono",
      style: {
        background: "var(--bg-elev-2)",
        color: "var(--text-dim)",
        border: "1px solid var(--border)"
      }
    }, progress.correct.length, "/", progress.totalProblems, " solved")), /*#__PURE__*/React.createElement("h2", {
      className: "text-2xl md:text-3xl font-bold tracking-tight mb-3",
      style: {
        color: "var(--text)"
      }
    }, title), why && /*#__PURE__*/React.createElement("div", {
      className: "text-[15px] leading-relaxed mb-6 border-l-2 pl-4 italic font-serif",
      style: {
        borderColor: "var(--accent-border)",
        color: "var(--text-dim)"
      }
    }, why), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 1,
      title: "How GATE CS Tests This Concept",
      subtitle: "Top rankers classify the question first, then solve. Train the classifier."
    }), patterns.map((p, i) => /*#__PURE__*/React.createElement(PatternCard, {
      key: i,
      idx: i + 1,
      pattern: p
    })), pyqs && pyqs.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LayerHeader, {
      num: "1.5",
      title: "GATE CS PYQ Walkthroughs",
      subtitle: "Real GATE CS questions with full reasoning chains. Read, don't solve \u2014 these are examples."
    }), pyqs.map((p, i) => /*#__PURE__*/React.createElement(PYQWalkthrough, _extends({
      key: i
    }, p)))), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 2,
      title: "Progressive Problem Set",
      subtitle: "2 Easy \xB7 3 Medium \xB7 3 Hard \xB7 1 Killer. Attempt before reveal. Hints only on request."
    }), problems.map((p, i) => /*#__PURE__*/React.createElement(ProblemCard, {
      key: p.id,
      p: p,
      idx: i + 1,
      progress: progress
    })), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 3,
      title: "Technique Arsenal",
      subtitle: "How to think, not what to think. Each card is a named, reusable solving algorithm."
    }), techniques.map((t, i) => /*#__PURE__*/React.createElement(TechniqueCard, {
      key: i,
      tech: t
    })), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 4,
      title: "Mistake Autopsy Lab",
      subtitle: "Real wrong solutions written exactly as students write them. Each error has a one-line preventive rule."
    }), mistakes.map((m, i) => /*#__PURE__*/React.createElement(MistakeCard, {
      key: i,
      mistake: m,
      idx: i + 1
    })), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 5,
      title: "Timed Drill Mode",
      subtitle: "Knowing the answer \u2260 executing under 90-second pressure. Train exam temperament separately."
    }), /*#__PURE__*/React.createElement(DrillMode, {
      conceptNum: num,
      conceptTitle: title,
      problems: problems
    })));
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 3.1 — WHY SOLVE SYSTEMS?
     ════════════════════════════════════════════════════════════════ */

  const C31_PATTERNS = [{
    name: "Real-World Scenario → System Setup",
    surface: "A word problem describes a real situation (circuit, traffic, balancing equations, equilibrium) and asks to set up the system.",
    testing: "Whether you can translate constraints into a matrix equation Ax = b, identifying x, A, and b.",
    signals: ["\"set up the system\"", "\"how many equations / unknowns\"", "\"matrix form\""],
    firstMove: "List unknowns → list constraints → build A (row = constraint, column = unknown) and b (RHS).",
    timeBudget: 60,
    frequency: "Frequent"
  }, {
    name: "Counting Unknowns vs Equations",
    surface: "Asked about system dimensions: how many variables (n), how many equations (m), determined / underdetermined / overdetermined.",
    testing: "Whether you classify by m vs n: m < n underdetermined, m > n overdetermined, m = n square.",
    signals: ["\"underdetermined\"", "\"overdetermined\"", "\"square system\""],
    firstMove: "n = # unknowns (columns of A); m = # equations (rows of A). Classify by m vs n.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "Solution Existence Forecast",
    surface: "Given the structure of a real-world problem, predict whether a unique solution exists.",
    testing: "Whether you connect physical constraints (uniqueness of equilibrium, conservation laws) to rank conditions.",
    signals: ["\"unique solution\"", "\"is there a solution\"", "\"is the problem well-posed\""],
    firstMove: "Apply rank-consistency: well-posed = unique solution when rank = n = m.",
    timeBudget: 45,
    frequency: "Occasional"
  }, {
    name: "Application Recognition",
    surface: "Classify which problem-type (network flow, chemical balance, circuit) the system represents.",
    testing: "Whether you can map applications to mathematical structures.",
    signals: ["\"this represents\"", "\"a typical application of\""],
    firstMove: "Match keywords: 'flow' / 'balance' → network; 'reactions' → chemistry; 'voltage / current' → circuits; 'least squares' → data fitting.",
    timeBudget: 30,
    frequency: "Occasional"
  }];
  const C31_PROBLEMS = [{
    id: "c31-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["System Classification"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — pure classification"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A system Ax = b with A of size 3\xD75 is:"),
    options: ["Square — equal numbers of equations and unknowns.", "Overdetermined — more equations than unknowns.", "Underdetermined — more unknowns than equations.", "Cannot be classified without more info."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "m × n: m = 3 rows = equations, n = 5 columns = unknowns."
    }, {
      label: "Key step",
      text: "m < n → underdetermined."
    }, {
      label: "Near-complete",
      text: "Underdetermined."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "System dimensions — compare m (equations) and n (unknowns)."
      }, {
        label: "KEY STEP",
        body: "A is 3×5 → 3 equations, 5 unknowns. 3 < 5: underdetermined."
      }, {
        label: "COMPUTATION",
        body: "Answer (C)."
      }, {
        label: "VERIFICATION",
        body: "Underdetermined: typically infinitely many solutions (or none if inconsistent)."
      }],
      gateCheck: "m < n: underdetermined. m > n: overdetermined. m = n: square.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any m × n matrix.",
      linkedConcept: "M3 Solution Theory.",
      negAdvisory: "Attempt: count decides. (C) wins."
    }
  }, {
    id: "c31-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["Application Recognition"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — keyword match"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "An electrical circuit with 5 nodes and 7 resistors, where Kirchhoff's current/voltage laws give equations for unknown currents, reduces to:"),
    options: ["An eigenvalue problem.", "A linear system Ax = b.", "A nonlinear optimization.", "A graph traversal problem."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Kirchhoff's laws produce linear equations in unknowns (currents). Standard system Ax = b."
    }, {
      label: "Key step",
      text: "Linear equations → Ax = b."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Kirchhoff's laws → linear equations → Ax = b."
      }, {
        label: "KEY STEP",
        body: "Currents are unknowns (x), KCL/KVL give linear constraints (rows of A), RHS = voltage sources / zero."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Standard linear circuit analysis = solving Ax = b."
      }],
      gateCheck: "Kirchhoff = linear system.",
      speed: "Pattern: 5 seconds.",
      whatMadeHard: "Distractor (A) eigenvalues — wrong for steady-state DC circuits.",
      generalization: "All mesh / node analysis → Ax = b.",
      linkedConcept: "C1.1 Family classifier.",
      negAdvisory: "Attempt: pattern decides. (B) wins."
    }
  }, {
    id: "c31-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 65,
    tags: ["System Setup"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — setup translation"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A traffic network has 4 intersections with the constraint that incoming flow equals outgoing flow at each. The unknowns are 6 road flows. The system has:"),
    options: ["6 equations, 4 unknowns.", "4 equations, 6 unknowns.", "4 equations, 4 unknowns.", "6 equations, 6 unknowns."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Equations from constraints; unknowns from quantities to find."
    }, {
      label: "Key step",
      text: "4 intersections → 4 conservation equations. 6 roads → 6 flow unknowns."
    }, {
      label: "Near-complete",
      text: "4 eq, 6 unkn. (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Translate scenario: intersections give equations, roads give unknowns."
      }, {
        label: "KEY STEP",
        body: "Each intersection: in = out (one linear eqn). 4 intersections → 4 equations.\nEach road has 1 flow → 6 unknowns. A is 4×6."
      }, {
        label: "COMPUTATION",
        body: "4 equations, 6 unknowns. Answer (B). Underdetermined."
      }, {
        label: "VERIFICATION",
        body: "Typically 6 - 4 = 2 free directions (often interpreted as 'choose flows on 2 roads, rest determined')."
      }],
      gateCheck: "Equations = constraints; unknowns = quantities asked.",
      speed: "Count: 30 seconds.",
      whatMadeHard: "Confusion if 'intersections' are unknowns rather than equations.",
      generalization: "Same template: conservation/balance → equations; quantities → unknowns.",
      linkedConcept: "C3.2 Setting up Ax = b.",
      negAdvisory: "Attempt: count decides. (B) wins."
    }
  }, {
    id: "c31-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Application", "Linearity"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — linearity check"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Chemical equation balancing (e.g., aH\u2082 + bO\u2082 \u2192 cH\u2082O) reduces to:"),
    options: ["A nonlinear system (since chemistry is nonlinear).", "A homogeneous linear system Ax = 0 (balancing per element).", "An eigenvalue problem.", "Cannot be expressed in matrix form."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Atom counting: each element gives a balance equation (atoms LHS = atoms RHS). All linear in coefficients."
    }, {
      label: "Key step",
      text: "For 2 elements (H, O): 2 equations in coefficients (a, b, c). Linear, RHS = 0 (atom conservation)."
    }, {
      label: "Near-complete",
      text: "Homogeneous Ax = 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Atom balance: linear equations in molecule counts."
      }, {
        label: "KEY STEP",
        body: "For aH₂ + bO₂ → cH₂O: H balance: 2a = 2c. O balance: 2b = c. Rewrite: 2a - 2c = 0, 2b - c = 0. Linear, homogeneous (RHS = 0)."
      }, {
        label: "COMPUTATION",
        body: "Linear Ax = 0. Answer (B). Null space of A gives the balanced ratios (smallest positive integer solution)."
      }, {
        label: "VERIFICATION",
        body: "Solving: a = c, b = c/2. Smallest integers: c = 2, b = 1, a = 2. So 2H₂ + O₂ → 2H₂O."
      }],
      gateCheck: "Balancing = null space of A.",
      speed: "Pattern: 20 seconds.",
      whatMadeHard: "Distractor (A) confuses 'chemistry' with 'nonlinear math'.",
      generalization: "All conservation laws → homogeneous linear systems.",
      linkedConcept: "C2.2 Null space.",
      negAdvisory: "Attempt: pattern. (B) wins."
    }
  }, {
    id: "c31-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Counting"],
    statement: /*#__PURE__*/React.createElement("span", null, "For a system of 5 linear equations in 8 unknowns, the maximum possible number of linearly independent equations is ___."),
    answer: 5,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "rank(A) ≤ min(m, n)."
    }, {
      label: "Key step",
      text: "rank ≤ min(5, 8) = 5."
    }, {
      label: "Near-complete",
      text: "5."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Max number of independent equations = rank of A, bounded by min(m, n)."
      }, {
        label: "KEY STEP",
        body: "5 × 8 matrix. rank ≤ min(5, 8) = 5."
      }, {
        label: "COMPUTATION",
        body: "Max = 5."
      }, {
        label: "VERIFICATION",
        body: "All 5 rows could be independent if no row is a combination of others."
      }],
      gateCheck: "rank ≤ min(m, n).",
      speed: "5 seconds.",
      whatMadeHard: "Confusing 'max independent' with 'always 5'.",
      generalization: "Holds for any m × n.",
      linkedConcept: "M4 Rank bound."
    }
  }, {
    id: "c31-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Solution Existence"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — rank logic"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "An economist models supply-demand equilibrium as Ax = b, where A is 4\xD74 and represents market interactions. Under what condition does a UNIQUE equilibrium exist?"),
    options: ["rank(A) = 3.", "det(A) ≠ 0.", "b = 0.", "Always."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Square A: unique solution ⇔ A invertible ⇔ det(A) ≠ 0."
    }, {
      label: "Key step",
      text: "det(A) ≠ 0."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Unique solution to Ax = b for square A ⇔ A invertible."
      }, {
        label: "KEY STEP",
        body: "A is 4 × 4. Unique solution ⇔ rank(A) = 4 ⇔ det(A) ≠ 0 ⇔ A invertible."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (A) rank 3 gives non-unique (1D null space). (C) b = 0 doesn't ensure uniqueness if A singular. (D) wrong (not always)."
      }],
      gateCheck: "Square A: invertible ⇔ unique solution to Ax = b for ANY b.",
      speed: "Direct.",
      whatMadeHard: "Distractor (A) wrong rank.",
      generalization: "Same for any square system.",
      linkedConcept: "M5 Determinants.",
      negAdvisory: "Attempt: (B) by definition of invertibility."
    }
  }, {
    id: "c31-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["System Setup", "Counting"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — setup translation"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "You are fitting a polynomial of degree 3 (i.e., y = a\u2080 + a\u2081x + a\u2082x\xB2 + a\u2083x\xB3) through 7 data points. The least-squares system is:"),
    options: ["7 × 7.", "4 × 4.", "7 × 4 (overdetermined, solve normal equations 4 × 4).", "4 × 7 (underdetermined)."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "7 data points → 7 equations. 4 polynomial coefficients (a₀-a₃) → 4 unknowns."
    }, {
      label: "Key step",
      text: "Va = y where V is 7 × 4 Vandermonde. Overdetermined → normal equations."
    }, {
      label: "Near-complete",
      text: "Answer (C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Polynomial fit by least squares — count data points vs coefficients."
      }, {
        label: "KEY STEP",
        body: "7 data points (xᵢ, yᵢ) give 7 equations a₀ + a₁xᵢ + a₂xᵢ² + a₃xᵢ³ = yᵢ. 4 unknowns (a₀, a₁, a₂, a₃). System is 7 × 4 (overdetermined)."
      }, {
        label: "COMPUTATION",
        body: "Normal equations: VᵀV·a = Vᵀy, a 4 × 4 system. Answer (C)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (A) wrong (4 unknowns). (B) wrong (7 data points). (D) wrong (overdetermined, not under)."
      }],
      gateCheck: "Polynomial fit: data points = equations, coefficients = unknowns.",
      speed: "Direct.",
      whatMadeHard: "Distractor (D) confuses rows and columns.",
      generalization: "Polynomial fit of degree d with k data: k × (d+1) Vandermonde.",
      linkedConcept: "M2 Vandermonde, M4 Least Squares.",
      negAdvisory: "Attempt: count decides. (C) wins."
    }
  }, {
    id: "c31-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Application Counting"],
    statement: /*#__PURE__*/React.createElement("span", null, "An 8-node electrical network has the requirement that one node is grounded (reference). The number of INDEPENDENT KCL equations is ___."),
    answer: 7,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "KCL at each node gives one equation; but with all nodes, the sum is automatically zero (conservation)."
    }, {
      label: "Key step",
      text: "n nodes → n KCL equations, but only n - 1 are independent."
    }, {
      label: "Near-complete",
      text: "For n = 8: 8 - 1 = 7."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "KCL equations: one per node, but they sum to zero (currents balance globally), so one is redundant."
      }, {
        label: "KEY STEP",
        body: "n nodes, n KCL equations. Sum of all KCL = 0 (total current in = total out). So rank = n - 1."
      }, {
        label: "COMPUTATION",
        body: "For n = 8: independent equations = n - 1 = 7."
      }, {
        label: "VERIFICATION",
        body: "Grounding one node fixes the redundancy: take n - 1 = 7 independent KCL + 1 ground condition."
      }],
      gateCheck: "Conservation laws often have one redundant equation per closed system.",
      speed: "Conceptual: 30 seconds.",
      whatMadeHard: "Recognizing redundancy.",
      generalization: "Same in network flows, chemical balance: one redundancy per closed conservation.",
      linkedConcept: "M3 Rank in Applied Systems."
    }
  }, {
    id: "c31-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["Synthesis", "System Modeling"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " A weighted-graph traffic model has 10 intersections and 15 roads. Conservation (in = out) at each intersection produces 10 equations. Additionally, 3 roads have fixed flows (boundary conditions). The number of FREE flows after imposing all constraints is at most:"),
    options: ["15 - 13 = 2.", "15 - 10 = 5.", "15 - 3 = 12.", "15 - 9 - 3 = 3 (subtracting 1 redundant KCL)."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Free flows = unknowns - independent constraints."
    }, {
      label: "Key step",
      text: "10 KCL but 1 redundant → 9 independent. Plus 3 boundary fixes. Total constraints = 12. Free = 15 - 12 = 3."
    }, {
      label: "Near-complete",
      text: "Answer (D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free flows = (# unknowns) - (# independent constraints)."
      }, {
        label: "KEY STEP",
        body: "15 unknowns (road flows). 10 KCL constraints, but sum of all KCL = 0 ⇒ 1 redundant ⇒ 9 independent KCL. 3 boundary conditions = 3 more constraints (assuming independent of KCL). Total independent constraints: 9 + 3 = 12.\nFree = 15 - 12 = 3."
      }, {
        label: "COMPUTATION",
        body: "Answer (D)."
      }, {
        label: "VERIFICATION",
        body: "Distractors: (A) doesn't account for KCL redundancy. (B) ignores boundary. (C) ignores KCL. (D) correct accounting."
      }],
      gateCheck: "Independence: subtract redundancies.",
      speed: "Accounting: 60 seconds.",
      whatMadeHard: "Recognizing the KCL redundancy.",
      generalization: "Always check for redundant conservation laws.",
      linkedConcept: "M4 Rank-Nullity.",
      negAdvisory: "Attempt: (D) is the careful answer."
    }
  }];
  const C31_TECHNIQUES = [{
    name: "Word Problem → A, x, b Identification",
    type: "Structural Insight",
    when: "Setting up a system from a real-world scenario.",
    steps: ["Identify unknowns (quantities to find) = entries of x.", "Identify constraints (each equation) = rows of A.", "RHS (numbers in constraints) = b.", "Build matrix: row i = coefficients of unknowns in equation i; b_i = RHS."],
    speed: "Setup in 60 seconds.",
    example: "Currents I₁, I₂ in circuit; KCL: I₁ - I₂ = 0; KVL: 2I₁ + 3I₂ = 10. A = [[1, -1], [2, 3]], b = (0, 10).",
    danger: "Constants on wrong side; sign errors.",
    freq: "Frequent"
  }, {
    name: "Conservation Law → Homogeneous Ax = 0",
    type: "Structural Insight",
    when: "Recognizing applications where RHS = 0 due to conservation.",
    steps: ["Identify conservation: mass, charge, atoms.", "Each balance equation: LHS - RHS = 0.", "System: Ax = 0. Solution = null space."],
    speed: "Recognition: 5 seconds.",
    example: "Chemical balance, network flow.",
    danger: "Distinguish from inhomogeneous problems with boundary conditions.",
    freq: "Frequent"
  }, {
    name: "Conservation Redundancy",
    type: "Structural Insight",
    when: "n conservation equations may have 1 redundant.",
    steps: ["Sum all conservation equations: often = 0 identity.", "True rank = n - 1.", "Adjust counting accordingly."],
    speed: "Spot redundancy: 10 seconds.",
    example: "KCL at n nodes: only n - 1 independent.",
    danger: "Missing redundancy gives wrong free-variable count.",
    freq: "Occasional"
  }, {
    name: "Application Pattern Recognition",
    type: "Speed Shortcut",
    when: "Classify the problem type.",
    steps: ["Conservation + flow → network.", "Atom balance → chemistry.", "Voltage / current → circuits.", "Data + best fit → least squares.", "Equilibrium of competing forces / supplies → economics / mechanics."],
    speed: "Classify: 5 seconds.",
    example: "See above.",
    danger: "Don't fall for surface keywords; check for genuine linearity.",
    freq: "Occasional"
  }];
  const C31_MISTAKES = [{
    name: "Confusing m and n",
    wrong: ["Problem: A is 3 × 5. Is the system underdetermined or overdetermined?", "Solution: m = 5 > n = 3 → overdetermined."],
    errorLine: 0,
    errorDescription: "Swapped m and n. A is 3 × 5 means m = 3 (rows) and n = 5 (columns).",
    rootCause: "Inconsistent notation.",
    correct: "m = 3 equations, n = 5 unknowns. m < n → underdetermined.",
    prevention: "First number = rows = equations. Always.",
    gateCost: "1-mark mistake.",
    frequency: "Common"
  }, {
    name: "Ignoring Conservation Redundancy",
    wrong: ["Problem: 4 nodes, 4 KCL equations. Independent?", "Solution: 4 nodes give 4 equations; all 4 are independent."],
    errorLine: 0,
    errorDescription: "KCL at all nodes is redundant: sum = 0 always.",
    rootCause: "Treating each equation as independent without checking.",
    correct: "Only 3 KCL independent. Ground one node.",
    prevention: "Always check: sum of conservation equations = 0?",
    gateCost: "2-mark error in flow problems.",
    frequency: "Common"
  }, {
    name: "Polynomial Fit Confusion",
    wrong: ["Problem: Fit y = a₀ + a₁x through 5 data points. System size?", "Solution: 2 unknowns + 5 points = 7 × 7."],
    errorLine: 0,
    errorDescription: "Linear system: 5 equations (one per point), 2 unknowns. Size is 5 × 2.",
    rootCause: "Adding unknowns and equations together.",
    correct: "5 × 2 system, overdetermined.",
    prevention: "Each data point = 1 equation. Each coefficient = 1 unknown.",
    gateCost: "Major setup error.",
    frequency: "Common"
  }];
  const C31_PYQS = [];
  function ConceptLab31({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 1,
      title: "Why Solve Systems? \u2014 From Scenarios to Ax = b",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Real-world problems reduce to Ax = b. The fastest path: identify unknowns (x), constraints (A's rows), and RHS (b). This concept calibrates the translation reflex you'll use in every later module."),
      patterns: C31_PATTERNS,
      problems: C31_PROBLEMS,
      techniques: C31_TECHNIQUES,
      mistakes: C31_MISTAKES,
      pyqs: C31_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 3.2 — WRITING A SYSTEM AS Ax = b
     ════════════════════════════════════════════════════════════════ */

  const C32_PATTERNS = [{
    name: "Equation List → Matrix Form",
    surface: "List of n linear equations is given. Asked to write in matrix form Ax = b.",
    testing: "Mechanical extraction: coefficients → A, unknowns → x, RHS → b.",
    signals: ["\"write in matrix form\"", "\"Ax = b\""],
    firstMove: "Order unknowns once consistently. For each equation: collect coefficients into a row, RHS into b.",
    timeBudget: 45,
    frequency: "Very Frequent"
  }, {
    name: "Augmented Matrix Construction",
    surface: "Given Ax = b, build the augmented [A | b].",
    testing: "Whether you correctly append b as the rightmost column.",
    signals: ["\"augmented matrix\"", "\"[A | b]\""],
    firstMove: "Write A. Add a vertical bar. Append b as the last column. New matrix is m × (n + 1).",
    timeBudget: 25,
    frequency: "Very Frequent"
  }, {
    name: "Coefficient Identification",
    surface: "Asked specific entry of A (or b) from a verbal description.",
    testing: "Whether you can identify Aᵢⱼ (= coeff of xⱼ in equation i).",
    signals: ["\"the (i, j) entry of A\"", "\"the coefficient of x₃ in equation 2\""],
    firstMove: "Aᵢⱼ = coefficient of xⱼ in i-th equation.",
    timeBudget: 25,
    frequency: "Frequent"
  }, {
    name: "Missing Coefficient Trap",
    surface: "Equation has implicit zero coefficients (e.g., variable not present).",
    testing: "Whether you correctly identify the 0 entry.",
    signals: ["\"x₁ + x₃ = 5\" (no x₂)"],
    firstMove: "Missing variable → coefficient is 0. Write A with explicit 0s.",
    timeBudget: 30,
    frequency: "Frequent"
  }];
  const C32_PROBLEMS = [{
    id: "c32-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 30,
    tags: ["Matrix Form"],
    statement: /*#__PURE__*/React.createElement("span", null, "For the system ", /*#__PURE__*/React.createElement(T, {
      src: "2x + 3y = 5, x - y = 1"
    }), ", the (1, 1) entry of A is ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "(1, 1) entry of A = coefficient of x in first equation."
    }, {
      label: "Key step",
      text: "2."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Read A directly from coefficients."
      }, {
        label: "KEY STEP",
        body: "Equation 1: 2x + 3y = 5. A row 1 = [2, 3]."
      }, {
        label: "COMPUTATION",
        body: "(1, 1) entry = 2."
      }, {
        label: "VERIFICATION",
        body: "Full A = [[2, 3], [1, -1]]. b = (5, 1)."
      }],
      gateCheck: "Aᵢⱼ = coefficient of xⱼ in equation i.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any system.",
      linkedConcept: "C2.3 Matrix elements."
    }
  }, {
    id: "c32-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["Augmented Matrix"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — direct"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 \\ 3 & 4 \\end{pmatrix}"
    }), " and ", /*#__PURE__*/React.createElement(T, {
      src: "\\mathbf{b} = (5, 6)^T"
    }), ", the augmented matrix [A | b] is:"),
    options: ["[[1, 2, 5], [3, 4, 6]] — appended as third column.", "[[1, 2], [3, 4], [5, 6]] — appended as third row.", "[[5, 6], [1, 2], [3, 4]] — prepended as first row.", "[[1, 5], [2, 6], [3, 4]] — interleaved."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Augmented = append b as a COLUMN to A."
    }, {
      label: "Key step",
      text: "[[1, 2, 5], [3, 4, 6]]."
    }, {
      label: "Near-complete",
      text: "Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Augmented = A with b appended as rightmost column."
      }, {
        label: "KEY STEP",
        body: "[A | b] = [[1, 2, 5], [3, 4, 6]] (2 × 3 matrix)."
      }, {
        label: "COMPUTATION",
        body: "Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Distractors: (B) row not column. (C) wrong position. (D) wrong interleaving."
      }],
      gateCheck: "Always: b becomes the last COLUMN of [A | b].",
      speed: "Direct.",
      whatMadeHard: "Nothing — definition.",
      generalization: "[A | b] is m × (n + 1).",
      linkedConcept: "M3 Row Reduction.",
      negAdvisory: "Attempt: definition. (A) wins."
    }
  }, {
    id: "c32-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Coefficient Identification", "Missing Term"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — careful read"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For the system ", /*#__PURE__*/React.createElement(T, {
      src: "x_1 + x_3 = 4, x_2 - x_3 = 2, x_1 + x_2 + x_3 = 6"
    }), ", the matrix A is:"),
    options: ["[[1, 0, 1], [0, 1, -1], [1, 1, 1]]", "[[1, 1, 0], [0, 1, -1], [1, 1, 1]]", "[[1, 1, 1], [1, 1, -1], [1, 1, 1]]", "[[1, 0, 1], [0, 1, 1], [1, 1, 1]]"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Missing variable → coefficient 0. Sign matters."
    }, {
      label: "Key step",
      text: "Eq 1: 1·x₁ + 0·x₂ + 1·x₃. Eq 2: 0·x₁ + 1·x₂ - 1·x₃. Eq 3: 1·x₁ + 1·x₂ + 1·x₃."
    }, {
      label: "Near-complete",
      text: "A = [[1, 0, 1], [0, 1, -1], [1, 1, 1]]. Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Read coefficients carefully; missing variable = 0."
      }, {
        label: "KEY STEP",
        body: "Eq 1: x₁ + x₃ = 4 → row (1, 0, 1). Eq 2: x₂ - x₃ = 2 → row (0, 1, -1). Eq 3: x₁ + x₂ + x₃ = 6 → row (1, 1, 1)."
      }, {
        label: "COMPUTATION",
        body: "A = [[1, 0, 1], [0, 1, -1], [1, 1, 1]]. Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Distractors trap: (B) has wrong 0/1 in (1, 2). (C) wrong signs. (D) wrong sign in (2, 3)."
      }],
      gateCheck: "Missing variable → 0. Sign tracking essential.",
      speed: "Careful read: 30 seconds.",
      whatMadeHard: "Easy to miss 0s.",
      generalization: "Same for any system with sparse equations.",
      linkedConcept: "C3.2 Augmented Matrix.",
      negAdvisory: "Attempt: careful read decides. (A) wins."
    }
  }, {
    id: "c32-m2",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 55,
    tags: ["Augmented Construction"],
    statement: /*#__PURE__*/React.createElement("span", null, "The augmented matrix for ", /*#__PURE__*/React.createElement(T, {
      src: "2x_1 + 3x_2 = 5, x_1 + 4x_2 = 6"
    }), " has the (2, 3) entry = ___."),
    answer: 6,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "[A | b] = [[2, 3, 5], [1, 4, 6]]. (2, 3) entry = b₂."
    }, {
      label: "Key step",
      text: "b₂ = 6."
    }, {
      label: "Near-complete",
      text: "6."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Augmented matrix entry: 2nd equation's RHS."
      }, {
        label: "KEY STEP",
        body: "[A | b] = [[2, 3 | 5], [1, 4 | 6]]. (2, 3) = b₂ = 6."
      }, {
        label: "COMPUTATION",
        body: "6."
      }, {
        label: "VERIFICATION",
        body: "(1, 3) = b₁ = 5. Both in the rightmost column."
      }],
      gateCheck: "Last column = b.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any system.",
      linkedConcept: "M3 Augmented Matrix."
    }
  }, {
    id: "c32-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 65,
    tags: ["Rewriting Systems"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — algebra"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The system ", /*#__PURE__*/React.createElement(T, {
      src: "x - 2y = 1, 3x + y = 8 - x"
    }), " in matrix form Ax = b has:"),
    options: ["A = [[1, -2], [3, 1]], b = (1, 8).", "A = [[1, -2], [4, 1]], b = (1, 8).", "A = [[1, -2], [3, 2]], b = (1, 8).", "A = [[1, -2], [-1, 1]], b = (1, 8)."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Bring all x, y terms to LHS."
    }, {
      label: "Key step",
      text: "3x + y + x = 8 → 4x + y = 8."
    }, {
      label: "Near-complete",
      text: "Coefficients (4, 1). Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rewrite each equation in standard form a₁x + a₂y = b."
      }, {
        label: "KEY STEP",
        body: "Eq 2: 3x + y = 8 - x. Bring -x to LHS: 4x + y = 8. New coefficient of x = 4."
      }, {
        label: "COMPUTATION",
        body: "A row 2 = (4, 1). Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Verify: 4x + y = 8. Substitute x = 1, y = 4: 4 + 4 = 8 ✓."
      }],
      gateCheck: "Always standardize: all unknowns on LHS, constants on RHS.",
      speed: "Algebra: 30 seconds.",
      whatMadeHard: "Trap: not bringing -x to LHS.",
      generalization: "Same for any equation needing rearrangement.",
      linkedConcept: "C3.2 Equation Rewriting.",
      negAdvisory: "Attempt: algebra step decides. (B) wins."
    }
  }, {
    id: "c32-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["System with Parameters"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — careful identification"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The system ", /*#__PURE__*/React.createElement(T, {
      src: "kx + y = 2, x + ky = 1"
    }), " in matrix form has A = ___ and b = ___."),
    options: ["A = [[k, 1], [1, k]], b = (2, 1).", "A = [[k, k], [1, 1]], b = (2, 1).", "A = [[k, 1], [k, 1]], b = (2, 1).", "A = [[1, k], [k, 1]], b = (2, 1)."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Each row: coefficient of x, coefficient of y."
    }, {
      label: "Key step",
      text: "Eq 1: (k, 1). Eq 2: (1, k)."
    }, {
      label: "Near-complete",
      text: "A = [[k, 1], [1, k]]. Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Read coefficients per equation, in order of unknowns."
      }, {
        label: "KEY STEP",
        body: "Eq 1: kx + y = 2 → row (k, 1). Eq 2: x + ky = 1 → row (1, k)."
      }, {
        label: "COMPUTATION",
        body: "A = [[k, 1], [1, k]]. b = (2, 1). Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Symmetric matrix in k."
      }],
      gateCheck: "Order: x first, then y, in EVERY row.",
      speed: "Direct.",
      whatMadeHard: "Distractors test if students swap order.",
      generalization: "Same for any parametric system.",
      linkedConcept: "M5 Determinant of A in terms of k.",
      negAdvisory: "Attempt: direct read. (A) wins."
    }
  }, {
    id: "c32-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Block Construction"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60% — multi-step"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A circuit gives the 3-equation system: 2I\u2081 - I\u2082 = 12 (KVL loop 1), -I\u2081 + 3I\u2082 - I\u2083 = 0 (loop 2), -I\u2082 + 2I\u2083 = 0 (loop 3). The augmented matrix is:"),
    options: ["[[2, -1, 0 | 12], [-1, 3, -1 | 0], [0, -1, 2 | 0]]", "[[2, 1, 0 | 12], [-1, 3, -1 | 0], [0, -1, 2 | 0]]", "[[2, -1, 0 | 12], [-1, 3, -1 | 0], [0, 1, 2 | 0]]", "[[2, -1, -1 | 12], [-1, 3, 0 | 0], [0, -1, 2 | 0]]"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Track signs carefully — minus signs matter."
    }, {
      label: "Key step",
      text: "Row 1: (2, -1, 0 | 12). Row 2: (-1, 3, -1 | 0). Row 3: (0, -1, 2 | 0)."
    }, {
      label: "Near-complete",
      text: "Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Carefully transcribe each equation row-by-row, watching signs."
      }, {
        label: "KEY STEP",
        body: "Eq 1: 2I₁ - I₂ + 0·I₃ = 12 → row (2, -1, 0 | 12). Eq 2: -I₁ + 3I₂ - I₃ = 0 → row (-1, 3, -1 | 0). Eq 3: 0·I₁ - I₂ + 2I₃ = 0 → row (0, -1, 2 | 0)."
      }, {
        label: "COMPUTATION",
        body: "[A | b] = [[2, -1, 0 | 12], [-1, 3, -1 | 0], [0, -1, 2 | 0]]. Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Distractors trap on sign flips and missing zeros."
      }],
      gateCheck: "Track every sign and every zero coefficient.",
      speed: "Careful transcription: 60 seconds.",
      whatMadeHard: "Sign tracking under time pressure.",
      generalization: "Same template for any circuit / network system.",
      linkedConcept: "M3 Augmented matrices.",
      negAdvisory: "Attempt: careful read. (A) wins."
    }
  }, {
    id: "c32-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 75,
    tags: ["Matrix Form"],
    statement: /*#__PURE__*/React.createElement("span", null, "For the system ", /*#__PURE__*/React.createElement(T, {
      src: "x_1 + 2x_2 + 3x_3 = 6, 4x_1 + 5x_2 + 6x_3 = 15, 7x_1 + 8x_2 + 9x_3 = 24"
    }), ", the (3, 2) entry of A is ___."),
    answer: 8,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "(3, 2) = coefficient of x₂ in eq 3."
    }, {
      label: "Key step",
      text: "Eq 3: 7x₁ + 8x₂ + 9x₃ = 24. (3, 2) = 8."
    }, {
      label: "Near-complete",
      text: "8."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Direct read: (3, 2) entry is coefficient of x₂ in equation 3."
      }, {
        label: "KEY STEP",
        body: "Equation 3: 7x₁ + 8x₂ + 9x₃. Coefficient of x₂ = 8."
      }, {
        label: "COMPUTATION",
        body: "8."
      }, {
        label: "VERIFICATION",
        body: "A = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]. Confirmed (3, 2) = 8."
      }],
      gateCheck: "Aᵢⱼ = coefficient of xⱼ in equation i.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing — direct.",
      generalization: "Same for any system.",
      linkedConcept: "M3 Matrix entries."
    }
  }, {
    id: "c32-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["Synthesis", "Implicit Form"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " Express the constraint ", /*#__PURE__*/React.createElement(T, {
      src: "x_1 = 2x_2 - 3x_3 + 4"
    }), " in standard matrix form. The resulting row of A and entry of b are:"),
    options: ["Row: (1, 2, -3); b: 4.", "Row: (1, -2, 3); b: 4.", "Row: (-1, 2, -3); b: -4.", "Row: (1, 2, 3); b: 4."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Rewrite: bring x's to LHS, constants to RHS."
    }, {
      label: "Key step",
      text: "x₁ - 2x₂ + 3x₃ = 4. Row (1, -2, 3), b = 4."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Standard form: a·x = b."
      }, {
        label: "KEY STEP",
        body: "x₁ = 2x₂ - 3x₃ + 4 ⇒ x₁ - 2x₂ + 3x₃ = 4. Coefficients (1, -2, 3) for (x₁, x₂, x₃), b = 4."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Plug x₁ = 1, x₂ = 0, x₃ = 1: 1·1 - 2·0 + 3·1 = 4 ✓ (matches original x₁ = 0 + 3 + 1? Let me check: original: x₁ = 2·0 - 3·(-1) + 4 = 7 if x₃ = -1. So a specific example may give 7 not 4 — but the STRUCTURE of the matrix form is correct: row (1, -2, 3), b = 4)."
      }],
      gateCheck: "Move all unknowns to LHS, constants to RHS. Sign flip when crossing equals sign.",
      speed: "Algebra: 30 seconds.",
      whatMadeHard: "Sign-flip discipline.",
      generalization: "Same for any implicit equation.",
      linkedConcept: "C3.2 Standardization.",
      negAdvisory: "Attempt: algebra step. (B) wins."
    }
  }];
  const C32_TECHNIQUES = [{
    name: "Coefficient-Extraction Method",
    type: "Speed Shortcut",
    when: "Converting equation list to matrix form.",
    steps: ["Fix order of unknowns (e.g., x₁, x₂, ..., xₙ).", "For each equation, write coefficients in fixed order. Missing variable = 0.", "RHS goes to b."],
    speed: "Per-equation: 5 seconds.",
    example: "2x₁ - 3x₃ = 5 → row (2, 0, -3), b entry = 5.",
    danger: "Sign and zero tracking.",
    freq: "Very Frequent"
  }, {
    name: "Standardization Before Matrix",
    type: "Trap Avoidance",
    when: "Equation has unknowns on both sides or implicit form.",
    steps: ["Move all unknowns to LHS.", "Move constants to RHS.", "Then extract coefficients."],
    speed: "Algebra: 15 seconds.",
    example: "x = 2y + 3 ⇒ x - 2y = 3. Row (1, -2), b = 3.",
    danger: "Sign flips during rearrangement.",
    freq: "Frequent"
  }, {
    name: "Augmented Matrix Builder",
    type: "Speed Shortcut",
    when: "Need [A | b] for row reduction.",
    steps: ["Write A.", "Append b as rightmost column.", "Result is m × (n + 1)."],
    speed: "Mechanical: 10 seconds.",
    example: "A = [[1, 2], [3, 4]], b = (5, 6). [A|b] = [[1, 2, 5], [3, 4, 6]].",
    danger: "Don't confuse with row appendage.",
    freq: "Very Frequent"
  }];
  const C32_MISTAKES = [{
    name: "Sign Errors in Equation Rewriting",
    wrong: ["Problem: Rewrite x = 2y + 1 in standard form.", "Solution: Just move y: x + 2y = 1."],
    errorLine: 0,
    errorDescription: "Moving 2y across equals sign should flip its sign: x - 2y = 1.",
    rootCause: "Forgetting sign flip.",
    correct: "x - 2y = 1.",
    prevention: "When moving a term across = sign, flip its sign.",
    gateCost: "Whole matrix becomes wrong.",
    frequency: "Very Common"
  }, {
    name: "Skipping Zero Coefficients",
    wrong: ["Problem: System x₁ + x₃ = 5, x₂ - x₃ = 1.", "Solution: A = [[1, 1], [1, -1]] (only 2 columns since 2 visible variables per equation)."],
    errorLine: 0,
    errorDescription: "Three variables overall (x₁, x₂, x₃). Each equation needs a 3-column row with explicit 0s for absent variables.",
    rootCause: "Treating each equation independently without considering global unknown list.",
    correct: "A = [[1, 0, 1], [0, 1, -1]] (2 × 3).",
    prevention: "First enumerate ALL unknowns. Then write each row with all coefficients.",
    gateCost: "Wrong matrix dimensions → cascading errors.",
    frequency: "Very Common"
  }, {
    name: "Swapping Rows and Columns",
    wrong: ["Problem: 2 equations, 3 unknowns. Size of A?", "Solution: 3 × 2 (3 unknowns × 2 equations)."],
    errorLine: 0,
    errorDescription: "Convention: A is m × n where m = equations, n = unknowns. So 2 × 3.",
    rootCause: "Conventional ordering.",
    correct: "A is 2 × 3 (m × n).",
    prevention: "Rows = equations, columns = unknowns.",
    gateCost: "Dimensional confusion.",
    frequency: "Common"
  }];
  const C32_PYQS = [];
  function ConceptLab32({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 2,
      title: "Writing a System as Ax = b \u2014 Equations to Matrix Form",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Every system gets mechanically translated to Ax = b. Track signs, identify missing zeros, and append b correctly for the augmented matrix. This is the loading bay for every row-reduction problem."),
      patterns: C32_PATTERNS,
      problems: C32_PROBLEMS,
      techniques: C32_TECHNIQUES,
      mistakes: C32_MISTAKES,
      pyqs: C32_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 3.3 — GEOMETRIC INTERPRETATION (3 PLANES — 7 CONFIGURATIONS)
     ════════════════════════════════════════════════════════════════ */

  const C33_PATTERNS = [{
    name: "Geometric Configuration → Algebraic Type",
    surface: "Geometric description given ('three planes meet at a single point' / 'two coincide and third parallel'), asked solution type / rank conditions.",
    testing: "Whether you can map all 7 configurations of 3 planes in ℝ³ to (rank A, rank [A|b]) pairs.",
    signals: ["\"three planes\"", "\"meet at\"", "\"parallel\"", "\"coincident\""],
    firstMove: "Match configuration → rank-pair. Unique pt: r(A)=r([A|b])=3. Line: r=2 consistent. Plane: r=1 consistent. No sol: r(A) < r([A|b]).",
    timeBudget: 60,
    frequency: "Very Frequent"
  }, {
    name: "Algebraic Type → Geometric Configuration",
    surface: "Rank conditions given, asked geometric configuration of 3 planes.",
    testing: "Reverse direction of the same mapping.",
    signals: ["\"rank(A) = 2 and rank([A|b]) = 2\"", "\"infinitely many solutions\""],
    firstMove: "Map rank-pair → geometric configuration via the 7-config table.",
    timeBudget: 50,
    frequency: "Frequent"
  }, {
    name: "Parallel / Coincident Detection",
    surface: "Asked if two specific planes are parallel, coincident, or intersecting.",
    testing: "Detect parallel via scalar-multiple rows; coincident requires b-matching too.",
    signals: ["\"are these two planes parallel\"", "\"do they coincide\""],
    firstMove: "Compare coefficient rows: scalar multiples ⇒ parallel. Then compare b: same ratio ⇒ coincident, else parallel distinct.",
    timeBudget: 40,
    frequency: "Frequent"
  }, {
    name: "ℝ² Lines Configuration",
    surface: "2 or 3 lines in ℝ², asked geometric configuration.",
    testing: "Whether you can apply the same rank logic in 2D.",
    signals: ["\"lines in the plane\"", "\"point of intersection\""],
    firstMove: "Lines: rank logic still applies. Distinct intersecting: 1 pt. Parallel: no sol. Coincident: 1D line.",
    timeBudget: 30,
    frequency: "Occasional"
  }, {
    name: "Hyperplane Generalization",
    surface: "n planes in ℝⁿ asked geometrically.",
    testing: "Whether you understand intersection dim = n - rank (for consistent).",
    signals: ["\"n hyperplanes\""],
    firstMove: "dim(intersection) = n - rank(A) when consistent.",
    timeBudget: 40,
    frequency: "Occasional"
  }];
  const C33_PROBLEMS = [{
    id: "c33-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["3-Plane Configuration"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — geometric"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Three planes intersect at a single point. The corresponding system has:"),
    options: ["No solution.", "Exactly one solution.", "Infinitely many solutions.", "Cannot be determined."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Single point = unique solution."
    }, {
      label: "Key step",
      text: "Unique."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Geometric single point = one solution."
      }, {
        label: "KEY STEP",
        body: "Three planes meeting at one point ⇔ unique solution ⇔ rank(A) = rank([A|b]) = 3 (square system, n = 3)."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Single common point = (x, y, z) — one solution."
      }],
      gateCheck: "Configuration ↔ solution count mapping. Memorize.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "k-dim intersection = (k+1)-parameter family of solutions; point = 0-dim = unique.",
      linkedConcept: "C2.4 Row picture.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c33-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["3-Plane Configuration"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — visualization"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Three planes are mutually parallel and distinct. The system has:"),
    options: ["No solution.", "Exactly one solution.", "Infinitely many solutions.", "A finite, non-unique number of solutions."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Parallel and distinct ⇒ no common intersection ⇒ no solution."
    }, {
      label: "Key step",
      text: "Answer (A)."
    }, {
      label: "Near-complete",
      text: "No solution."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Parallel + distinct = no intersection."
      }, {
        label: "KEY STEP",
        body: "Three parallel distinct planes never share a point. rank(A) = 1 (all rows scalar multiples), rank([A|b]) = 3 (each b's value is different)."
      }, {
        label: "COMPUTATION",
        body: "rank gap → inconsistent → no solution. Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Example: x + y + z = 1, x + y + z = 2, x + y + z = 3. Incompatible RHS."
      }],
      gateCheck: "Parallel distinct = no solution.",
      speed: "5 seconds.",
      whatMadeHard: "Distractor (D) — finite > 1 solutions never occur in linear systems.",
      generalization: "k-parameter family or empty: no finite-non-unique case for linear systems.",
      linkedConcept: "C2.4 Row picture.",
      negAdvisory: "Attempt: pattern. (A) wins."
    }
  }, {
    id: "c33-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 75,
    tags: ["3-Plane Configuration", "Line of Intersection"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — rank reasoning"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Three planes meet in a line. The rank-pair (rank(A), rank([A|b])) is:"),
    options: ["(3, 3)", "(2, 2)", "(2, 3)", "(1, 1)"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Line = 1D solution set. nullity = 1 ⇒ rank = 3 - 1 = 2. Consistent ⇒ same rank for [A|b]."
    }, {
      label: "Key step",
      text: "(2, 2)."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Solution = line (1D) ⇔ nullity = 1 ⇔ rank = 2. Consistent ⇒ rank(A) = rank([A|b])."
      }, {
        label: "KEY STEP",
        body: "rank(A) = 2, consistent. rank([A|b]) = 2."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "(A) point. (C) inconsistent. (D) plane (rank 1)."
      }],
      gateCheck: "Solution set dim = n - rank.",
      speed: "Direct.",
      whatMadeHard: "Distractor (C) rank gap.",
      generalization: "Same for any line of intersection of hyperplanes.",
      linkedConcept: "C2.4, C3.4.",
      negAdvisory: "Attempt: rank arithmetic decides. (B) wins."
    }
  }, {
    id: "c33-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["7-Configuration Mapping"],
    skipSignal: {
      type: "skip",
      text: "Skip if <65% — case analysis"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Three planes coincide (all three are the same plane). The rank-pair is:"),
    options: ["(3, 3)", "(1, 1)", "(2, 2)", "(1, 3)"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "All identical → A has 1 independent row."
    }, {
      label: "Key step",
      text: "rank(A) = 1. Consistent (same RHS) → rank([A|b]) = 1."
    }, {
      label: "Near-complete",
      text: "(1, 1). Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "All planes coincident = 1 independent equation."
      }, {
        label: "KEY STEP",
        body: "Three identical equations. rank(A) = 1. Same b on all → rank([A|b]) = 1."
      }, {
        label: "COMPUTATION",
        body: "Answer (B). 2D family of solutions (the plane itself)."
      }, {
        label: "VERIFICATION",
        body: "Solution = the common plane = 2D family."
      }],
      gateCheck: "Coincident planes give rank 1, consistent system.",
      speed: "20 seconds.",
      whatMadeHard: "Confusion with parallel-distinct.",
      generalization: "k coincident hyperplanes → rank 1.",
      linkedConcept: "C2.1 Span.",
      negAdvisory: "Attempt: visualization decides. (B) wins."
    }
  }, {
    id: "c33-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["7-Configuration", "Prism"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60% — subtle config"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Three planes pairwise intersect in 3 distinct parallel lines (forming a 'prism' configuration, no common point). The rank-pair is:"),
    options: ["(2, 3) — system is inconsistent.", "(3, 3) — unique solution.", "(2, 2) — line solution.", "(1, 1) — plane solution."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Pairwise intersect = each pair meets in a line. No common point = inconsistent."
    }, {
      label: "Key step",
      text: "rank(A) = 2 (3 planes but only 2 independent normal directions). rank([A|b]) = 3 (inconsistent RHS)."
    }, {
      label: "Near-complete",
      text: "Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Prism = no common point but pairwise intersections exist."
      }, {
        label: "KEY STEP",
        body: "Three planes with linearly dependent normals (rank 2) but their RHS don't align for a common solution. So rank(A) = 2, rank([A|b]) = 3, inconsistent."
      }, {
        label: "COMPUTATION",
        body: "Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Geometrically: the 3 pairwise lines are parallel, forming a triangular prism shape."
      }],
      gateCheck: "Prism = inconsistent system with rank(A) = 2, rank([A|b]) = 3.",
      speed: "Visualization + rank: 50 seconds.",
      whatMadeHard: "Distinguishing prism from line-intersection.",
      generalization: "Whenever pairwise intersections exist but no common one: inconsistency.",
      linkedConcept: "C2.4 Row picture, C3.4 Consistency.",
      negAdvisory: "Attempt: (A) correct."
    }
  }, {
    id: "c33-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["All 7 Configurations"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60% — all 7 to recall"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which of the following 3-plane configurations corresponds to rank(A) = 2, rank([A|b]) = 2?"),
    options: ["Three planes meeting at one line.", "Three planes meeting at one point.", "Three planes mutually parallel and distinct.", "Three planes all coincident."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "(2, 2) means rank 2 consistent. Solution dim = 3 - 2 = 1 (line)."
    }, {
      label: "Key step",
      text: "Line solution = planes meeting at a line."
    }, {
      label: "Near-complete",
      text: "Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank pair (2, 2): consistent, 1D solution = line."
      }, {
        label: "KEY STEP",
        body: "Three planes meet in a line. Could be: (i) two distinct planes meeting in a line + third plane contains that line; or (ii) three planes pairwise meeting (with common line)."
      }, {
        label: "COMPUTATION",
        body: "Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "(B) is rank 3. (C) is rank 1, inconsistent. (D) is rank 1, consistent (plane sol)."
      }],
      gateCheck: "Rank-pair → solution dim → geometric config.",
      speed: "30 seconds with table memorized.",
      whatMadeHard: "Memorizing all 7 configurations.",
      generalization: "Same in any n hyperplanes in ℝⁿ.",
      linkedConcept: "C2.4, C3.4.",
      negAdvisory: "Attempt: rank-config table. (A) wins."
    }
  }, {
    id: "c33-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["Geometric to Rank"],
    skipSignal: {
      type: "skip",
      text: "Skip if <65% — case analysis"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Two planes are parallel and distinct; the third plane intersects each in a distinct parallel line. The system is:"),
    options: ["Consistent, unique solution.", "Inconsistent (no solution).", "Consistent, line solution.", "Consistent, plane solution."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "If two planes are parallel and distinct, NO common point exists for them — so no common point of all three."
    }, {
      label: "Key step",
      text: "Inconsistent."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "If two of three planes don't share any point, neither do all three."
      }, {
        label: "KEY STEP",
        body: "Two parallel distinct planes have empty intersection. Adding a third plane doesn't help — common intersection is still empty."
      }, {
        label: "COMPUTATION",
        body: "Answer (B). rank(A) = 2 (third plane has independent normal), rank([A|b]) = 3."
      }, {
        label: "VERIFICATION",
        body: "Pairwise: parallel pair gives empty intersection; the others give lines but no common point."
      }],
      gateCheck: "Empty pairwise = empty common.",
      speed: "Visualization: 40 seconds.",
      whatMadeHard: "Recognizing parallel-distinct kills entire system.",
      generalization: "Any subset of inconsistent equations makes the whole system inconsistent.",
      linkedConcept: "C2.4, C3.4.",
      negAdvisory: "Attempt: structural reasoning. (B) wins."
    }
  }, {
    id: "c33-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 95,
    tags: ["Geometric Counting"],
    statement: /*#__PURE__*/React.createElement("span", null, "The number of distinct configurations (up to renaming planes) for 3 planes in \u211D\xB3 is ___."),
    answer: 7,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Enumerate based on solution type and degeneracy."
    }, {
      label: "Key step",
      text: "(1) Unique point, (2) Line intersection (all 3 share), (3) All coincident, (4) Two coincident + 3rd intersecting, (5) Two coincident + 3rd parallel, (6) All three parallel distinct, (7) Pairwise intersections forming prism."
    }, {
      label: "Near-complete",
      text: "Total: 7. Some texts list 8 (separating subcases). Standard GATE answer: 7 main cases."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Standard enumeration of 3-plane configurations."
      }, {
        label: "KEY STEP",
        body: "The 7 main cases:\n1. Three planes meet at a single point (rank 3, unique sol).\n2. Three planes meet at a line (rank 2, consistent — line sol).\n3. All three planes coincide (rank 1, consistent — plane sol).\n4. Two coincide, third intersects them in a line (rank 2, consistent).\n5. Two coincide, third parallel distinct (rank 1, inconsistent).\n6. All three parallel and distinct (rank 1, inconsistent).\n7. Pairwise intersecting in parallel lines forming a triangular prism (rank 2, inconsistent).\nTotal = 7."
      }, {
        label: "COMPUTATION",
        body: "7."
      }, {
        label: "VERIFICATION",
        body: "Some references separate (4) into subcases — leading to 8 — but the standard GATE-style count is 7."
      }],
      gateCheck: "Memorize the 7-case table.",
      speed: "Recall: 30 seconds.",
      whatMadeHard: "Subtle subcases.",
      generalization: "n hyperplanes in ℝⁿ: many more cases by rank-RHS combinations.",
      linkedConcept: "C3.3 Configurations."
    }
  }, {
    id: "c33-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["Synthesis", "Rank Mapping"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " A 3-plane system has rank(A) = 1 and rank([A|b]) = 2. What geometric configuration does this correspond to?"),
    options: ["All three planes coincide.", "All three planes are mutually parallel and distinct.", "Two planes coincide; the third is parallel and distinct.", "Three planes meet at a line."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "rank(A) = 1: all rows scalar multiples. rank([A|b]) = 2: two distinct b values."
    }, {
      label: "Key step",
      text: "Two coincident (same equation) + one with different b but same direction → two coincide, third parallel distinct."
    }, {
      label: "Near-complete",
      text: "Answer (C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank(A) = 1 means all planes have parallel normals. Rank([A|b]) = 2 means RHS has 2 distinct values among the 3 rows."
      }, {
        label: "KEY STEP",
        body: "Among 3 planes with parallel normals: 2 distinct b-values means 2 of the 3 planes coincide (same b), and the third is parallel but distinct (different b)."
      }, {
        label: "COMPUTATION",
        body: "Answer (C). Inconsistent system."
      }, {
        label: "VERIFICATION",
        body: "(A) is rank 1, rank 1 (all same b). (B) is rank 1, rank 3 (3 distinct b). (D) is rank 2."
      }],
      gateCheck: "Memorize rank pairs ↔ configurations.",
      speed: "60 seconds with table.",
      whatMadeHard: "Distinguishing (B) from (C): rank([A|b]) = 2 vs 3.",
      generalization: "Same logic for n planes.",
      linkedConcept: "C3.3 7-config table.",
      negAdvisory: "Attempt: rank dissection. (C) wins."
    }
  }];
  const C33_TECHNIQUES = [{
    name: "7-Configuration Lookup Table",
    type: "Speed Shortcut",
    when: "Mapping geometric configuration to solution count (or vice versa).",
    steps: ["Memorize:\n• rank 3, [A|b] 3: unique point (1 sol).\n• rank 2, [A|b] 2: line of intersection (∞ sols).\n• rank 1, [A|b] 1: coincident planes (∞ sols, 2D).\n• rank 2, [A|b] 3: pairwise intersect, no common pt (prism, inconsistent).\n• rank 1, [A|b] 2: two coincident + parallel third (inconsistent).\n• rank 1, [A|b] 3: three parallel distinct (inconsistent).", "Look up the matching geometry / rank pair."],
    speed: "Direct map: 5 seconds.",
    example: "rank(A) = 2, rank([A|b]) = 2 → line of intersection.",
    danger: "Confusing rank pairs.",
    freq: "Very Frequent"
  }, {
    name: "Pairwise Parallel Test",
    type: "Verification Method",
    when: "Determining if two planes are parallel.",
    steps: ["Compare normal vectors (= coefficient rows).", "Scalar multiples ⇒ parallel.", "Then check b: same scaling ⇒ coincident; else parallel distinct."],
    speed: "Per-pair: 20 seconds.",
    example: "x + y + z = 1 and 2x + 2y + 2z = 5: parallel distinct (rows scaled by 2 but RHS not).",
    danger: "Don't conflate parallel distinct with intersecting.",
    freq: "Frequent"
  }, {
    name: "Rank-to-Geometry Translator",
    type: "Structural Insight",
    when: "Given numeric system, identify geometric configuration.",
    steps: ["Form A and [A|b]. Row reduce.", "Read off ranks.", "Match to 7-config table."],
    speed: "60-90 seconds.",
    example: "See techniques above.",
    danger: "Sign / arithmetic errors in row reduction.",
    freq: "Frequent"
  }];
  const C33_MISTAKES = [{
    name: "Confusing Coincident with Parallel Distinct",
    wrong: ["Problem: Are x + y = 1 and 2x + 2y = 2 parallel distinct planes (in ℝ³ extending to z)?", "Solution: Coefficients are scaled by 2 → parallel. So they are parallel distinct."],
    errorLine: 0,
    errorDescription: "Both equations describe the SAME plane (2nd is 2× the 1st). They are COINCIDENT, not parallel distinct.",
    rootCause: "Forgetting to check b scaling.",
    correct: "Rows scaled by 2 AND RHS scaled by 2 → coincident.",
    prevention: "Both coefficients AND b must scale by the same factor for coincidence.",
    gateCost: "Wrong configuration identified.",
    frequency: "Very Common"
  }, {
    name: "Skipping the Prism Configuration",
    wrong: ["Problem: 3 planes with rank(A) = 2 and rank([A|b]) = 3. What configuration?", "Solution: Two intersect in a line, third contains that line."],
    errorLine: 0,
    errorDescription: "rank gap means inconsistent. Description matches consistent line config. The actual config is a prism.",
    rootCause: "Forgetting the prism case.",
    correct: "Prism: pairwise intersect in parallel lines, no common point.",
    prevention: "Memorize all 7 cases including the prism.",
    gateCost: "2-mark error.",
    frequency: "Common"
  }, {
    name: "Counting Geometric Configurations as 3",
    wrong: ["Problem: How many distinct configurations of 3 planes in ℝ³ are there?", "Solution: Three: unique solution, no solution, infinite solutions."],
    errorLine: 0,
    errorDescription: "Solution-count gives 3 categories, but geometric configurations are richer (parallel vs coincident, prism vs no-common-pt, etc.).",
    rootCause: "Conflating solution-type with geometric-type.",
    correct: "7 distinct geometric configurations.",
    prevention: "Solution count ≠ configuration count.",
    gateCost: "Conceptual misunderstanding.",
    frequency: "Common"
  }];
  const C33_PYQS = [];
  function ConceptLab33({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 3,
      title: "Geometric Interpretation \u2014 All 7 Configurations of 3 Planes",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "GATE tests both directions: 'given the geometry, find the rank' and 'given the rank, find the geometry'. The 7-configuration table is mandatory memorization. This lab drills both directions until automatic."),
      patterns: C33_PATTERNS,
      problems: C33_PROBLEMS,
      techniques: C33_TECHNIQUES,
      mistakes: C33_MISTAKES,
      pyqs: C33_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 3.4 — INTUITION DEEP DIVE: x = xₚ + xₙ
     (Includes the mandated KILLER: characterize col(A) for 4×3 system)
     ════════════════════════════════════════════════════════════════ */

  const C34_PATTERNS = [{
    name: "Particular + Null Decomposition",
    surface: "Find general solution to Ax = b. Write as x = xₚ + (null space basis combination).",
    testing: "Whether you know: any solution = particular + null space element.",
    signals: ["\"general solution\"", "\"x = xₚ + xₙ\""],
    firstMove: "Find any particular solution xₚ via row reduction. Find null space basis. General sol = xₚ + Σ tᵢ·(null basis vᵢ).",
    timeBudget: 90,
    frequency: "Very Frequent"
  }, {
    name: "Existence vs Uniqueness Decoupling",
    surface: "Asked about existence (does a solution exist?) separately from uniqueness (is it unique?).",
    testing: "Existence: rank(A) = rank([A|b]). Uniqueness: rank(A) = n.",
    signals: ["\"existence\"", "\"uniqueness\"", "\"determines\""],
    firstMove: "Two separate checks: existence + uniqueness. Both must hold for unique solution.",
    timeBudget: 40,
    frequency: "Frequent"
  }, {
    name: "Characterize All b for Consistency",
    surface: "Given A (often tall), find conditions on b such that Ax = b is solvable.",
    testing: "Whether you can determine col(A) as a subspace and write its defining equations.",
    signals: ["\"for which b\"", "\"all b such that\"", "\"conditions on b\""],
    firstMove: "Form [A | b] with symbolic b. Row reduce. Constraints arise from rows where 0 = (linear combination of b's components).",
    timeBudget: 100,
    frequency: "Frequent"
  }, {
    name: "Solution Set Dimension",
    surface: "Asked the dimension of the solution set when infinitely many solutions exist.",
    testing: "Dim = nullity = n - rank.",
    signals: ["\"dimension of the solution set\"", "\"how many free variables\""],
    firstMove: "Dim = n - rank(A) (for consistent system).",
    timeBudget: 35,
    frequency: "Frequent"
  }, {
    name: "Homogeneous Always Has Trivial Solution",
    surface: "Ax = 0 always has x = 0. Asked about non-trivial solutions.",
    testing: "Whether you know Ax = 0 has non-trivial solutions ⇔ rank(A) < n.",
    signals: ["\"Ax = 0\"", "\"non-trivial\"", "\"homogeneous\""],
    firstMove: "Homogeneous: always consistent. Non-trivial sol ⇔ nullity > 0 ⇔ rank < n.",
    timeBudget: 30,
    frequency: "Frequent"
  }];
  const C34_PROBLEMS = [{
    id: "c34-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Homogeneous"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — definition"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The homogeneous system Ax = 0 always has:"),
    options: ["No solution.", "Exactly one solution (the zero vector).", "At least the trivial solution x = 0.", "Always infinitely many solutions."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "x = 0 always satisfies Ax = 0. May or may not be unique."
    }, {
      label: "Key step",
      text: "At least trivial sol always exists."
    }, {
      label: "Near-complete",
      text: "Answer (C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Homogeneous: A·0 = 0 trivially."
      }, {
        label: "KEY STEP",
        body: "x = 0 is always a solution. Non-trivial solutions exist iff rank(A) < n."
      }, {
        label: "COMPUTATION",
        body: "Answer (C)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (B): only one sol if rank = n. (D): not always — only if rank < n."
      }],
      gateCheck: "Homogeneous: always at least one sol (the zero vector).",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any homogeneous system.",
      linkedConcept: "C2.3 Null space.",
      negAdvisory: "Attempt: definition. (C) wins."
    }
  }, {
    id: "c34-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 30,
    tags: ["Solution Set Dimension"],
    statement: /*#__PURE__*/React.createElement("span", null, "Ax = b is consistent with A being 3 \xD7 5, rank 2. The dimension of the solution set is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Dim = nullity = n - rank."
    }, {
      label: "Key step",
      text: "5 - 2 = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Solution set dim = nullity."
      }, {
        label: "KEY STEP",
        body: "nullity = n - rank = 5 - 2 = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "3 free variables → 3D solution family."
      }],
      gateCheck: "Dim = n - rank.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same template.",
      linkedConcept: "M4 Rank-Nullity."
    }
  }, {
    id: "c34-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["x = xp + xn"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — definition"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If ", /*#__PURE__*/React.createElement(T, {
      src: "\\mathbf{x}_p"
    }), " is a particular solution to ", /*#__PURE__*/React.createElement(T, {
      src: "A\\mathbf{x} = \\mathbf{b}"
    }), " and ", /*#__PURE__*/React.createElement(T, {
      src: "\\mathbf{x}_n"
    }), " is in N(A), then ", /*#__PURE__*/React.createElement(T, {
      src: "\\mathbf{x}_p + \\mathbf{x}_n"
    }), ":"),
    options: ["Is also a solution to Ax = b.", "Is a solution to Ax = 0.", "Is generally not a solution.", "Equals xₚ only."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "A(xₚ + xₙ) = Axₚ + Axₙ = b + 0 = b."
    }, {
      label: "Key step",
      text: "Both xₚ + xₙ and xₚ solve Ax = b."
    }, {
      label: "Near-complete",
      text: "Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Linearity: A(xₚ + xₙ) = Axₚ + Axₙ."
      }, {
        label: "KEY STEP",
        body: "Axₚ = b (particular). Axₙ = 0 (null space). Sum: A(xₚ + xₙ) = b + 0 = b. So xₚ + xₙ is a solution."
      }, {
        label: "COMPUTATION",
        body: "Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (B) wrong (sum solves the inhomogeneous, not homogeneous)."
      }],
      gateCheck: "Solution = xₚ + (null space). All sols of the same form.",
      speed: "Definition: 15 seconds.",
      whatMadeHard: "Distractor (B) easy to misread.",
      generalization: "Same template.",
      linkedConcept: "C3.4 Decomposition.",
      negAdvisory: "Attempt: arithmetic. (A) wins."
    }
  }, {
    id: "c34-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 75,
    tags: ["Existence vs Uniqueness"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — both conditions"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For Ax = b with A of size m \xD7 n to have a UNIQUE solution, the necessary and sufficient conditions are:"),
    options: ["rank(A) = m only.", "rank(A) = n only.", "rank(A) = rank([A|b]) = n.", "rank(A) = rank([A|b]) = m."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Unique = existence + uniqueness. Existence: rank match. Uniqueness: nullity = 0 ⇔ rank = n."
    }, {
      label: "Key step",
      text: "Both: rank(A) = rank([A|b]) = n."
    }, {
      label: "Near-complete",
      text: "Answer (C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Unique solution = existence + uniqueness."
      }, {
        label: "KEY STEP",
        body: "Existence: rank(A) = rank([A|b]). Uniqueness: rank(A) = n (no free variables)."
      }, {
        label: "COMPUTATION",
        body: "Combined: rank(A) = rank([A|b]) = n. Answer (C)."
      }, {
        label: "VERIFICATION",
        body: "Distractors: (A) only existence. (B) missing existence check. (D) rank = m doesn't ensure uniqueness."
      }],
      gateCheck: "Unique sol: BOTH rank conditions.",
      speed: "Recall: 30 seconds.",
      whatMadeHard: "Distractor (D) confuses 'onto' with 'unique'.",
      generalization: "Same for any system.",
      linkedConcept: "M4 Rank Conditions.",
      negAdvisory: "Attempt: definition. (C) wins."
    }
  }, {
    id: "c34-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Solution Counting"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — count"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Ax = 0 with A of size 4 \xD7 6, rank 4. The general solution has how many free parameters?"),
    options: ["0", "2", "4", "6"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Free parameters = nullity = n - rank = 6 - 4 = 2."
    }, {
      label: "Key step",
      text: "2."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free parameters = nullity in Ax = 0."
      }, {
        label: "KEY STEP",
        body: "nullity = n - rank = 6 - 4 = 2."
      }, {
        label: "COMPUTATION",
        body: "Answer (B). General sol = t₁·v₁ + t₂·v₂ where v₁, v₂ form null basis."
      }, {
        label: "VERIFICATION",
        body: "2D null space."
      }],
      gateCheck: "Free parameters = nullity.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same template.",
      linkedConcept: "M4 Rank-Nullity.",
      negAdvisory: "Attempt: arithmetic. (B) wins."
    }
  }, {
    id: "c34-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["Particular Solution"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60% — verification"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Suppose x\u209A = (1, 2, 0) is a particular solution to Ax = b, and the null space of A is span", (1, -1, 1), ". The general solution is:"),
    options: ["x = (1, 2, 0).", "x = (1, 2, 0) + t·(1, -1, 1) for t ∈ ℝ.", "x = t·(1, -1, 1) for t ∈ ℝ.", "x = (1, 2, 0) + (1, -1, 1)."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "General sol = xₚ + (any null space element)."
    }, {
      label: "Key step",
      text: "xₚ + t·(null basis)."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "General sol = particular + null space combination."
      }, {
        label: "KEY STEP",
        body: "Null space basis: {(1, -1, 1)}. General null element: t·(1, -1, 1) for t ∈ ℝ."
      }, {
        label: "COMPUTATION",
        body: "General sol: x = (1, 2, 0) + t·(1, -1, 1). Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Test t = 0: x = (1, 2, 0) = xₚ. Test t = 1: x = (2, 1, 1). Plug into Ax: A·xₚ + A·t·null = b + 0 = b. ✓"
      }],
      gateCheck: "Always: xₚ + (parametric null space).",
      speed: "Direct.",
      whatMadeHard: "Distractor (D) drops the parameter.",
      generalization: "Same form for any sol set.",
      linkedConcept: "C3.4 Decomposition.",
      negAdvisory: "Attempt: structure decides. (B) wins."
    }
  }, {
    id: "c34-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Existence Conditions"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — verify pattern"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For an m \xD7 n matrix A with m > n (tall) and rank n, Ax = b is consistent:"),
    options: ["For all b ∈ ℝᵐ.", "Only when b ∈ col(A), which is a proper subspace of ℝᵐ.", "Only when b = 0.", "Never (since over-determined)."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Tall matrix full column rank: col(A) has dim n < m. Not all of ℝᵐ."
    }, {
      label: "Key step",
      text: "Consistent ⇔ b ∈ col(A), a proper n-dim subspace."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Tall matrix full column rank: col(A) ⊊ ℝᵐ."
      }, {
        label: "KEY STEP",
        body: "col(A) has dim = rank = n. Since n < m, col(A) is a proper n-dim subspace of ℝᵐ. Ax = b consistent ⇔ b ∈ col(A)."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "(A) wrong (not onto). (C) wrong (more cases work). (D) wrong (some b work)."
      }],
      gateCheck: "Tall + full col rank: consistent for b in proper subspace.",
      speed: "Pattern: 40 seconds.",
      whatMadeHard: "Easily confuse with onto case (rank = m).",
      generalization: "Tall: col(A) ⊊ ℝᵐ. Square full rank: col(A) = ℝᵐ.",
      linkedConcept: "C2.3 Column Picture, Onto.",
      negAdvisory: "Attempt: structure. (B) wins."
    }
  }, {
    id: "c34-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 95,
    tags: ["Particular + Null", "Dimension Calc"],
    statement: /*#__PURE__*/React.createElement("span", null, "Ax = b has 4 different solutions x\u2081, x\u2082, x\u2083, x\u2084. The dimension of the solution set is at least ___."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Different solutions → solution set has > 1 point → dim ≥ 1."
    }, {
      label: "Key step",
      text: "Multiple solutions → infinite solutions → dim ≥ 1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Linear systems: solution set is either empty, 1 point, or infinite (k-dim affine space)."
      }, {
        label: "KEY STEP",
        body: "4 different solutions → infinite solution set → dim ≥ 1."
      }, {
        label: "COMPUTATION",
        body: "At least 1."
      }, {
        label: "VERIFICATION",
        body: "Could be 1, 2, ..., n depending on nullity. Minimum is 1."
      }],
      gateCheck: "Linear sol set has 0, 1, or ∞ points.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any linear system.",
      linkedConcept: "C3.4 Sol Set Dim."
    }
  }, {
    id: "c34-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 180,
    tags: ["KILLER", "Characterize col(A)", "Synthesis"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 0 & 1 \\ 0 & 1 & 1 \\ 1 & 1 & 2 \\ 1 & -1 & 0 \\end{pmatrix}"
    }), ", find ALL b = (b\u2081, b\u2082, b\u2083, b\u2084) such that Ax = b is consistent. The condition is:"),
    options: ["b₃ = b₁ + b₂ AND b₄ = b₁ − b₂.", "b₃ = b₁ + b₂.", "b₄ = b₁ − b₂.", "Any b ∈ ℝ⁴."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Form [A | b]. Row reduce. Read off constraints on b from rows that become 0 = f(b)."
    }, {
      label: "Key step",
      text: "Augmented: rows are (1, 0, 1 | b₁), (0, 1, 1 | b₂), (1, 1, 2 | b₃), (1, -1, 0 | b₄). R₃ → R₃ - R₁ - R₂: (0, 0, 0 | b₃ - b₁ - b₂). R₄ → R₄ - R₁ + R₂: (0, 0, 0 | b₄ - b₁ + b₂)."
    }, {
      label: "Near-complete",
      text: "Constraints: b₃ - b₁ - b₂ = 0 AND b₄ - b₁ + b₂ = 0, i.e., b₃ = b₁ + b₂ AND b₄ = b₁ - b₂. Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "GATE-mandated KILLER: characterize col(A). Form augmented matrix with symbolic b, row reduce, identify constraints from zero rows."
      }, {
        label: "KEY STEP",
        body: "[A | b] = \n[1  0  1 | b₁]\n[0  1  1 | b₂]\n[1  1  2 | b₃]\n[1 -1  0 | b₄]\n\nR₃ → R₃ - R₁: (0, 1, 1 | b₃ - b₁). R₃ → R₃ - R₂: (0, 0, 0 | b₃ - b₁ - b₂).\nR₄ → R₄ - R₁: (0, -1, -1 | b₄ - b₁). R₄ → R₄ + R₂: (0, 0, 0 | b₄ - b₁ + b₂)."
      }, {
        label: "COMPUTATION",
        body: "After reduction:\n[1 0 1 | b₁]\n[0 1 1 | b₂]\n[0 0 0 | b₃ - b₁ - b₂]\n[0 0 0 | b₄ - b₁ + b₂]\n\nFor consistency, both zero rows must have zero augmented entry:\nb₃ - b₁ - b₂ = 0 ⇒ b₃ = b₁ + b₂.\nb₄ - b₁ + b₂ = 0 ⇒ b₄ = b₁ - b₂.\nBoth conditions required. Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Test b = (1, 2, 3, -1): b₃ = 3 = 1 + 2 ✓, b₄ = -1 = 1 - 2 ✓. Plug into Ax: x = (1, 2, 0) gives Ax = (1, 2, 3, -1). ✓\nCol(A) = {b ∈ ℝ⁴ : b₃ = b₁ + b₂, b₄ = b₁ - b₂} = 2D subspace (rank 2)."
      }],
      gateCheck: "Always: form augmented with symbolic b, row reduce, identify zero rows to get b-constraints.",
      speed: "Row reduction with symbolic b: 2-3 minutes.",
      whatMadeHard: "Sign tracking with symbolic b; recognizing that both constraints are needed (not just one).",
      generalization: "Same template for any tall matrix: characterize col(A) as a subspace via row reduction with symbolic b.",
      linkedConcept: "C2.3 Column Picture, M4 Rank-Consistency.",
      negAdvisory: "Attempt: methodical row reduction wins."
    }
  }];
  const C34_TECHNIQUES = [{
    name: "Particular + Null Decomposition",
    type: "Structural Insight",
    when: "Finding general solution to Ax = b.",
    steps: ["Find any particular solution xₚ (set free variables to convenient values like 0).", "Find basis of N(A) = {v₁, ..., vₖ}.", "General sol: x = xₚ + t₁v₁ + ... + tₖvₖ for t₁, ..., tₖ ∈ ℝ."],
    speed: "Full general sol: 2-3 minutes.",
    example: "xₚ = (1, 0, 0), N(A) = span{(0, 1, -1)}. Gen sol: x = (1, 0, 0) + t·(0, 1, -1) = (1, t, -t).",
    danger: "Don't include xₚ in null space basis.",
    freq: "Very Frequent"
  }, {
    name: "Existence + Uniqueness Two-Check",
    type: "Trap Avoidance",
    when: "Asked when system has unique solution.",
    steps: ["Existence: rank(A) = rank([A|b]).", "Uniqueness: rank(A) = n (no free variables).", "Both required for unique solution."],
    speed: "30 seconds.",
    example: "n = 3, rank 3, consistent: unique. n = 3, rank 2: infinite (if consistent).",
    danger: "Forgetting one of the two conditions.",
    freq: "Frequent"
  }, {
    name: "Symbolic-b Row Reduction for col(A) Characterization",
    type: "Structural Insight",
    when: "Asked to find all b for which Ax = b is consistent.",
    steps: ["Form augmented matrix [A | b] with b = (b₁, ..., bₘ) as symbolic.", "Row reduce A. Apply SAME row operations to b column.", "Identify rows where pivots vanish (0 = linear comb of bᵢ).", "Each such row gives a constraint on b. Together they define col(A)."],
    speed: "Characterization: 2-3 minutes for 4×3 matrix.",
    example: "See KILLER above.",
    danger: "Sign tracking with multiple bᵢ.",
    freq: "Frequent"
  }, {
    name: "Null Space Basis Algorithm",
    type: "Speed Shortcut",
    when: "Finding basis of N(A).",
    steps: ["Row reduce A to RREF.", "Identify free variables (no pivot).", "For each free variable: set it to 1, others to 0, solve for pivot variables.", "Each resulting vector is a null basis element."],
    speed: "60-90 seconds.",
    example: "A 2 × 3 with RREF [[1, 0, 2], [0, 1, -1]]. Free: x₃. Null basis: set x₃ = 1, get x₁ = -2, x₂ = 1. Basis = {(-2, 1, 1)}.",
    danger: "Sign errors when back-substituting.",
    freq: "Very Frequent"
  }];
  const C34_MISTAKES = [{
    name: "Confusing Particular Sol with Unique Sol",
    wrong: ["Problem: Found xₚ = (1, 2, 3) for Ax = b. Is the system uniquely solved?", "Solution: We found a solution → unique."],
    errorLine: 0,
    errorDescription: "Particular sol shows existence, not uniqueness. Need rank(A) = n for uniqueness.",
    rootCause: "Conflating existence with uniqueness.",
    correct: "Check nullity = 0. If N(A) ≠ {0}, infinite solutions exist.",
    prevention: "Always check BOTH existence and uniqueness.",
    gateCost: "Major conceptual error.",
    frequency: "Common"
  }, {
    name: "Adding xₚ to Null Basis",
    wrong: ["Problem: General sol when xₚ = (1, 1, 1) and N(A) = span{(1, 0, 0), (0, 1, 0)}.", "Solution: General sol = t₁·(1, 1, 1) + t₂·(1, 0, 0) + t₃·(0, 1, 0)."],
    errorLine: 0,
    errorDescription: "xₚ is a FIXED translation, not a basis vector. Coefficient is always 1.",
    rootCause: "Treating xₚ as part of the parametric family.",
    correct: "General sol = xₚ + t₂·(1, 0, 0) + t₃·(0, 1, 0). xₚ has implicit coefficient 1, not a free parameter.",
    prevention: "xₚ is fixed; only null basis vectors get parameters.",
    gateCost: "Wrong sol structure.",
    frequency: "Common"
  }, {
    name: "Missing a Consistency Constraint on b",
    wrong: ["Problem: 4 × 3 matrix A. Row-reduce gave 2 zero rows. Constraint on b: only one of them.", "Solution: b must satisfy ONE equation (from one zero row)."],
    errorLine: 0,
    errorDescription: "EACH zero row gives one constraint. If 2 zero rows, b must satisfy BOTH.",
    rootCause: "Reading only the first constraint.",
    correct: "All zero-row constraints required simultaneously.",
    prevention: "List every constraint, then take intersection (all must hold).",
    gateCost: "Wrong col(A) characterization.",
    frequency: "Common"
  }, {
    name: "Treating Free Variable Count as Solution Count",
    wrong: ["Problem: 3 free variables in solution. How many solutions?", "Solution: 3 solutions."],
    errorLine: 0,
    errorDescription: "Free variables = parametric directions. Solutions = infinite (a 3D family).",
    rootCause: "Confusing dim with count.",
    correct: "3 free variables → 3D family = infinite solutions.",
    prevention: "Free vars = dim of sol set, not number.",
    gateCost: "Conceptual error.",
    frequency: "Common"
  }];
  const C34_PYQS = [];
  function ConceptLab34({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 4,
      title: "Intuition Deep Dive \u2014 x = x\u209A + x\u2099 and Characterizing col(A)",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "The MOST tested M3 concept. Three skills: (1) decompose general solution as particular + null. (2) Separate existence from uniqueness checks. (3) Characterize col(A) for a tall A \u2014 the mandated KILLER pattern."),
      patterns: C34_PATTERNS,
      problems: C34_PROBLEMS,
      techniques: C34_TECHNIQUES,
      mistakes: C34_MISTAKES,
      pyqs: C34_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     APP ROOT
     ════════════════════════════════════════════════════════════════ */
  const CONCEPTS_MAP = [{
    num: 1,
    shortName: "Why Solve",
    title: "Why Solve Systems?",
    total: C31_PROBLEMS.length,
    Comp: ConceptLab31
  }, {
    num: 2,
    shortName: "Ax = b form",
    title: "Writing a System as Ax = b",
    total: C32_PROBLEMS.length,
    Comp: ConceptLab32
  }, {
    num: 3,
    shortName: "Geometric",
    title: "Geometric Interpretation",
    total: C33_PROBLEMS.length,
    Comp: ConceptLab33
  }, {
    num: 4,
    shortName: "Deep Dive",
    title: "Intuition Deep Dive",
    total: C34_PROBLEMS.length,
    Comp: ConceptLab34
  }];
  function App() {
    useEffect(() => {
      hideLoading();
    }, []);
    const progress31 = useConceptProgress(1, C31_PROBLEMS.length);
    const progress32 = useConceptProgress(2, C32_PROBLEMS.length);
    const progress33 = useConceptProgress(3, C33_PROBLEMS.length);
    const progress34 = useConceptProgress(4, C34_PROBLEMS.length);
    const progressMap = {
      1: progress31,
      2: progress32,
      3: progress33,
      4: progress34
    };
    const [active, setActive] = useState(1);
    const totalSolved = progress31.correct.length + progress32.correct.length + progress33.correct.length + progress34.correct.length;
    const totalProblems = C31_PROBLEMS.length + C32_PROBLEMS.length + C33_PROBLEMS.length + C34_PROBLEMS.length;
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen"
    }, /*#__PURE__*/React.createElement(TopNav, {
      currentModule: 3
    }), /*#__PURE__*/React.createElement("section", {
      className: "relative overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "grid-bg absolute inset-0",
      style: {
        opacity: 0.45
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "absolute inset-0",
      style: {
        background: "radial-gradient(800px 400px at 20% 0%, var(--accent-soft), transparent 60%), radial-gradient(600px 400px at 80% 20%, var(--accent-2-soft), transparent 60%)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "relative max-w-5xl mx-auto px-5 py-12 md:py-16"
    }, /*#__PURE__*/React.createElement("div", {
      className: "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-5",
      style: {
        background: "var(--accent-soft)",
        border: "1px solid var(--accent-border)",
        color: "var(--accent)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "pulse-dot"
    }), " MODULE 3 \xB7 PROBLEM LAB"), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, "Linear Systems \xB7 Problem Lab", /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, "Ax = b in Depth")), /*#__PURE__*/React.createElement("p", {
      className: "text-lg max-w-3xl leading-relaxed mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "Four concept labs covering scenario translation, augmented matrix construction, all 7 geometric configurations of 3 planes, and the mandated KILLER pattern: characterizing all b for which a 4\xD73 system Ax = b is consistent."), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-3 text-sm"
    }, /*#__PURE__*/React.createElement("div", {
      className: "px-3 py-1.5 rounded-full flex items-center gap-2",
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--accent-3)"
      }
    }, "\u25CF "), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text)"
      }
    }, totalSolved, " / ", totalProblems, " solved")), /*#__PURE__*/React.createElement("div", {
      className: "px-3 py-1.5 rounded-full flex items-center gap-2",
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--accent-2)"
      }
    }, "\u25CF "), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text)"
      }
    }, "4 concept labs \xB7 36 problems \xB7 16 techniques \xB7 13 mistake autopsies")), /*#__PURE__*/React.createElement("div", {
      className: "px-3 py-1.5 rounded-full flex items-center gap-2",
      style: {
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--warn)"
      }
    }, "\u25CF "), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text)"
      }
    }, "All 7 plane configurations \xB7 KILLER on col(A) characterization"))))), /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto px-5"
    }, /*#__PURE__*/React.createElement(ConceptNavigator, {
      concepts: CONCEPTS_MAP,
      active: active,
      setActive: setActive,
      progressMap: progressMap
    })), /*#__PURE__*/React.createElement(ConceptLab31, {
      progress: progress31
    }), /*#__PURE__*/React.createElement(ConceptLab32, {
      progress: progress32
    }), /*#__PURE__*/React.createElement(ConceptLab33, {
      progress: progress33
    }), /*#__PURE__*/React.createElement(ConceptLab34, {
      progress: progress34
    }), /*#__PURE__*/React.createElement(ModuleFooter, {
      moduleNum: 3,
      nextModuleTitle: "Echelon & Rank \u2014 Problem Lab",
      nextModuleFile: "module-04-problem-lab.html",
      checklist: ["I can translate any word problem into Ax = b in under 60 seconds.", "I can identify all 7 geometric configurations of 3 planes from rank pairs (and vice versa).", "I can characterize col(A) by row-reducing [A | b] with symbolic b.", "I decompose general solutions as xₚ + (parametric null space).", "I separate existence (rank match) from uniqueness (rank = n).", "I never confuse free-variable COUNT with solution COUNT.", "I've cleared all 36 problems and beaten my drill personal-best per concept."]
    }));
  }
  mountApp(App);
})();