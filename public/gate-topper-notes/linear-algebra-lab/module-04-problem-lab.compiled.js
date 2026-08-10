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

/* ===== MODULE 4 CONTENT ===== */

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

  const MODULE_NUM = 4;

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
      }, "C4.", c.num), /*#__PURE__*/React.createElement("span", {
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
    }, "PROBLEM LAB \xB7 CONCEPT 4.", num), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, "Module 4 \xB7 Echelon & Rank"), /*#__PURE__*/React.createElement("span", {
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
     CONCEPT 4.1 — ECHELON FORM & PIVOTS
     ════════════════════════════════════════════════════════════════ */
  const C41_PATTERNS = [{
    name: "Pivot Identification from Row Echelon",
    surface: "Matrix given in echelon (or row-reduced) form. Asked to identify pivot columns / free columns.",
    testing: "Whether you can read off pivots (first non-zero entry in each non-zero row).",
    signals: ["\"pivot columns\"", "\"free columns\"", "\"echelon form\""],
    firstMove: "Scan rows top-to-bottom. First non-zero entry in each row is the pivot. Its column is a pivot column.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "Reducing to Echelon Form",
    surface: "Numeric matrix. Asked to row-reduce to echelon form.",
    testing: "Whether you can apply the 3 legal row operations sequentially.",
    signals: ["\"reduce to row echelon\"", "\"forward elimination\""],
    firstMove: "Top-left pivot. Zero out below. Move to next row, next column. Repeat.",
    timeBudget: 90,
    frequency: "Very Frequent"
  }, {
    name: "Legal Operation Verification",
    surface: "Given a row operation, asked if it preserves the row space / solution set.",
    testing: "Knowledge of 3 legal operations: row swap, scalar multiply (non-zero), row addition.",
    signals: ["\"is the following operation legal\"", "\"preserves solution\""],
    firstMove: "3 legal: swap, scale by non-zero, add multiple of row to another. ANY OTHER is illegal.",
    timeBudget: 25,
    frequency: "Occasional"
  }, {
    name: "Counting Pivots vs Free Columns",
    surface: "Asked for number of free variables, columns, or pivot positions.",
    testing: "Pivots = rank. Free = n - rank.",
    signals: ["\"number of free variables\"", "\"how many pivots\""],
    firstMove: "Pivot count = rank = dim(col(A)). Free count = nullity = n - rank.",
    timeBudget: 25,
    frequency: "Frequent"
  }];
  const C41_PROBLEMS = [{
    id: "c41-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Pivots"],
    statement: /*#__PURE__*/React.createElement("span", null, "How many pivots does the row echelon matrix ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & 3 \\\\ 0 & 1 & 4 \\\\ 0 & 0 & 5 \\end{pmatrix}"
    }), " have?"),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Pivots = first non-zero entries per non-zero row."
    }, {
      label: "Key step",
      text: "All 3 rows have non-zero entries. 3 pivots."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Count pivots — first non-zero per row."
      }, {
        label: "KEY STEP",
        body: "Row 1 pivot at (1,1) = 1. Row 2 pivot at (2,2) = 1. Row 3 pivot at (3,3) = 5. Three pivots."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Rank = 3 = number of rows = number of columns. Full rank."
      }],
      gateCheck: "Pivot per non-zero row.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any echelon matrix.",
      linkedConcept: "C4.3 Rank."
    }
  }, {
    id: "c41-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Legal Operations"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — definition"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which of the following is NOT a legal elementary row operation?"),
    options: ["Swap two rows.", "Multiply a row by a non-zero scalar.", "Add a multiple of one row to another row.", "Square a row entry-wise."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Only 3 legal operations: swap, scale (non-zero), add multiple of row."
    }, {
      label: "Key step",
      text: "Squaring is NOT one of them."
    }, {
      label: "Near-complete",
      text: "Answer (D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Recall the 3 legal operations."
      }, {
        label: "KEY STEP",
        body: "Legal: (1) Rᵢ ↔ Rⱼ. (2) Rᵢ → c·Rᵢ for c ≠ 0. (3) Rᵢ → Rᵢ + c·Rⱼ. Illegal: scaling by 0, non-linear ops (squaring, etc)."
      }, {
        label: "COMPUTATION",
        body: "Squaring is not linear. Answer (D)."
      }, {
        label: "VERIFICATION",
        body: "Squaring changes solution set: x² = 4 has 2 solutions vs x = 2 has 1."
      }],
      gateCheck: "3 legal: swap, scale, add. NO non-linear operations.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for column operations.",
      linkedConcept: "C4.2 Gaussian Elimination.",
      negAdvisory: "Attempt: definition. (D) wins."
    }
  }, {
    id: "c41-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Echelon Form"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 & 1 \\\\ 2 & 4 & 1 \\\\ 3 & 6 & 0 \\end{pmatrix}"
    }), ", after reducing to echelon form, how many pivots are there?"),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Row reduce and count pivots."
    }, {
      label: "Key step",
      text: "R₂ → R₂ - 2R₁: (0, 0, -1). R₃ → R₃ - 3R₁: (0, 0, -3). R₃ → R₃ - 3R₂: (0, 0, 0). Result: [[1, 2, 1], [0, 0, -1], [0, 0, 0]]. 2 pivots."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Reduce, then count pivots."
      }, {
        label: "KEY STEP",
        body: "R₂ → R₂ - 2R₁: [1, 2, 1; 0, 0, -1; 3, 6, 0]. R₃ → R₃ - 3R₁: [1, 2, 1; 0, 0, -1; 0, 0, -3]. R₃ → R₃ - 3R₂: [1, 2, 1; 0, 0, -1; 0, 0, 0]. Two non-zero rows."
      }, {
        label: "COMPUTATION",
        body: "2 pivots."
      }, {
        label: "VERIFICATION",
        body: "Columns 2 and 3 — pivot in row 1 col 1, pivot in row 2 col 3. Column 2 is free."
      }],
      gateCheck: "Count non-zero rows after row reduction.",
      speed: "60 seconds.",
      whatMadeHard: "Sign tracking.",
      generalization: "Same for any matrix.",
      linkedConcept: "C4.3 Rank."
    }
  }, {
    id: "c41-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 55,
    tags: ["Free Columns"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — RREF reading"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For the RREF matrix ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 0 & 2 & 0 & 3 \\\\ 0 & 1 & 1 & 0 & -1 \\\\ 0 & 0 & 0 & 1 & 2 \\end{pmatrix}"
    }), ", the FREE columns are:"),
    options: ["Columns 1, 2, 4.", "Columns 3, 5.", "Columns 1, 3, 5.", "Columns 2, 4."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Pivot columns: 1, 2, 4. Free columns: 3, 5."
    }, {
      label: "Key step",
      text: "Columns 3, 5 have no pivot."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Pivots in cols 1, 2, 4. Free = remaining."
      }, {
        label: "KEY STEP",
        body: "Pivot cols: 1 (row 1), 2 (row 2), 4 (row 3). Non-pivot cols: 3, 5 → free."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Number of free = nullity = n - rank = 5 - 3 = 2. Matches."
      }],
      gateCheck: "Free cols ↔ no pivot in that column.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any RREF.",
      linkedConcept: "C4.4 Nullity.",
      negAdvisory: "Attempt: pattern. (B) wins."
    }
  }, {
    id: "c41-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Reduce to Echelon"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — row ops"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "After reducing ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 1 & 1 \\\\ 1 & 2 & 3 \\\\ 1 & 3 & 5 \\end{pmatrix}"
    }), " to row echelon form, what does the (2, 3) entry become?"),
    options: ["2", "3", "0", "1"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Apply R₂ → R₂ - R₁, R₃ → R₃ - R₁ first."
    }, {
      label: "Key step",
      text: "Result: [[1, 1, 1], [0, 1, 2], [0, 2, 4]]. (2, 3) = 2."
    }, {
      label: "Near-complete",
      text: "Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Step-by-step row reduction."
      }, {
        label: "KEY STEP",
        body: "R₂ → R₂ - R₁: (0, 1, 2). R₃ → R₃ - R₁: (0, 2, 4). Matrix: [[1, 1, 1], [0, 1, 2], [0, 2, 4]]. (2, 3) = 2."
      }, {
        label: "COMPUTATION",
        body: "2. Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Further reduction: R₃ → R₃ - 2R₂: (0, 0, 0). Final: [[1, 1, 1], [0, 1, 2], [0, 0, 0]]. (2, 3) still 2 in echelon form."
      }],
      gateCheck: "After first round of elimination, intermediate values often appear.",
      speed: "30 seconds.",
      whatMadeHard: "Tracking which form (intermediate vs final).",
      generalization: "Same template.",
      linkedConcept: "C4.2 Gaussian Elimination.",
      negAdvisory: "Attempt: direct compute. (A) wins."
    }
  }, {
    id: "c41-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["Pivot Count"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 4 & 1 & 3 \\\\ 1 & 2 & 1 & 0 \\\\ 3 & 6 & 2 & 5 \\\\ 1 & 2 & 0 & 1 \\end{pmatrix}"
    }), ", after row reduction the number of pivots is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Row reduce and count."
    }, {
      label: "Key step",
      text: "R₁ ↔ R₂. R₂ → R₂ - 2R₁: (0, 0, -1, 3). R₃ → R₃ - 3R₁: (0, 0, -1, 5). R₄ → R₄ - R₁: (0, 0, -1, 1). R₃ → R₃ - R₂: (0, 0, 0, 2). R₄ → R₄ - R₂: (0, 0, 0, -2). R₄ → R₄ + R₃: (0, 0, 0, 0)."
    }, {
      label: "Near-complete",
      text: "Result has pivots at columns 1, 3, 4. Three pivots."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Row reduce 4×4 matrix, count pivots."
      }, {
        label: "KEY STEP",
        body: "Swap R₁ ↔ R₂. Then eliminate column 1 from rows 2, 3, 4. Then eliminate column 3. Final: 3 non-zero rows, pivots in cols 1, 3, 4. rank = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Col 2 = 2·col 1. So col 2 is dependent → 1 dependency → rank = 4 - 1 = 3."
      }],
      gateCheck: "Look for obvious column dependencies first.",
      speed: "Inspection: 30 seconds. Row reduce: 90 seconds.",
      whatMadeHard: "Tracking signs through 4×4 reduction.",
      generalization: "Same template.",
      linkedConcept: "C4.3 Rank."
    }
  }, {
    id: "c41-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Echelon Properties"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — property check"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which of the following is TRUE for the row echelon form (REF) of a matrix?"),
    options: ["REF is unique for a given matrix.", "All pivots equal 1.", "Pivot positions are unique (any REF has them in the same places).", "Entries below pivots are 1."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "REF allows choice in pivot scaling. RREF is unique."
    }, {
      label: "Key step",
      text: "Pivot POSITIONS are unique even if REF itself isn't."
    }, {
      label: "Near-complete",
      text: "Answer (C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Differentiate REF (not unique) from RREF (unique)."
      }, {
        label: "KEY STEP",
        body: "REF allows different scaling for pivots, so not unique. Pivots can be any value (not just 1). But pivot POSITIONS are invariant — that's a theorem."
      }, {
        label: "COMPUTATION",
        body: "Answer (C)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (A): RREF is unique, REF is not. (B): pivots in REF can be any value. (D): below pivots are 0, not 1."
      }],
      gateCheck: "RREF unique. REF: positions unique, values can vary.",
      speed: "Concept recall: 30 seconds.",
      whatMadeHard: "Distinguishing REF and RREF.",
      generalization: "Pivot positions = rank-related invariant.",
      linkedConcept: "C4.8 RREF.",
      negAdvisory: "Attempt: definition decides. (C) wins."
    }
  }, {
    id: "c41-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Pivots", "Free Vars"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A is a 4\xD76 matrix with rank 3, the number of FREE columns in the RREF of A is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Free columns = n - rank."
    }, {
      label: "Key step",
      text: "6 - 3 = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free columns = nullity = n - rank."
      }, {
        label: "KEY STEP",
        body: "6 columns, 3 pivots (= rank). Free = 6 - 3 = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Each free column gives a parametric direction in null space."
      }],
      gateCheck: "Free count = nullity.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any rank/dim.",
      linkedConcept: "C4.4 Rank-Nullity."
    }
  }, {
    id: "c41-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Pivot Position"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " Two different sequences of row operations on a matrix yield two different REFs. Which of the following is GUARANTEED to be the same in both REFs?"),
    options: ["The exact values in each row.", "Pivot positions (the column indices where pivots occur).", "The sign of each non-zero entry.", "Nothing — both are completely different."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "REF is not unique, but pivot positions are invariant (theorem)."
    }, {
      label: "Key step",
      text: "Pivot column indices are determined by the matrix's rank structure."
    }, {
      label: "Near-complete",
      text: "Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "REF non-uniqueness — what's invariant?"
      }, {
        label: "KEY STEP",
        body: "Theorem: pivot positions in any REF of A are uniquely determined by A. Reason: they correspond to a particular basis of col(A) (specifically, the pivot columns = independent original columns)."
      }, {
        label: "COMPUTATION",
        body: "Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Number of pivots = rank — well-defined regardless of row ops."
      }],
      gateCheck: "Pivot positions invariant. Other things vary.",
      speed: "Concept recall: 30 seconds.",
      whatMadeHard: "Knowing the theorem about pivot position invariance.",
      generalization: "Same for any matrix.",
      linkedConcept: "C4.3 Rank.",
      negAdvisory: "Attempt: pivot invariance is the key fact. (B) wins."
    }
  }];
  const C41_TECHNIQUES = [{
    name: "Pivot Read Algorithm",
    type: "Speed Shortcut",
    when: "Identifying pivots in a given matrix.",
    steps: ["Scan top-to-bottom.", "For each row, first non-zero entry is a pivot.", "Its column is a pivot column."],
    speed: "Direct read: 5 seconds per matrix.",
    example: "[[1, 2], [0, 3]] → pivots at (1,1), (2,2).",
    danger: "Confusing zero rows with non-zero (zero rows have no pivot).",
    freq: "Frequent"
  }, {
    name: "Forward Elimination Recipe",
    type: "Speed Shortcut",
    when: "Reducing to row echelon form.",
    steps: ["Find first non-zero column. Use top entry as pivot.", "Zero out entries below the pivot via row addition.", "Move to next row, next pivot column. Repeat until done."],
    speed: "60-120 seconds for 3×3 or 4×4.",
    example: "Standard Gaussian elimination.",
    danger: "Tracking signs.",
    freq: "Very Frequent"
  }, {
    name: "Free vs Pivot Column Distinction",
    type: "Structural Insight",
    when: "Identifying free / pivot columns.",
    steps: ["Pivots: columns with leading non-zero in some row of REF.", "Free: columns without pivots.", "Each free column corresponds to a free variable in Ax = 0."],
    speed: "10 seconds.",
    example: "RREF [[1, 0, 2], [0, 1, 3]] → cols 1, 2 pivot; col 3 free.",
    danger: "Mistaking column indexing.",
    freq: "Frequent"
  }];
  const C41_MISTAKES = [{
    name: "Counting Pivots Without Reducing First",
    wrong: ["Problem: rank of A = [[1, 2, 3], [2, 4, 6]]?", "Solution: count non-zero rows directly = 2. Rank = 2."],
    errorLine: 1,
    errorDescription: "Need to reduce first. R₂ = 2·R₁ — dependent.",
    rootCause: "Skipping the reduction step.",
    correct: "Reduce: R₂ → R₂ - 2R₁ = (0, 0, 0). Rank = 1, not 2.",
    prevention: "ALWAYS row reduce before counting.",
    gateCost: "2-mark wrong rank.",
    frequency: "Very Common"
  }, {
    name: "Using Squaring as Row Op",
    wrong: ["Problem: simplify row (2, 4, 6).", "Solution: divide by 2 OR square: (4, 16, 36)."],
    errorLine: 1,
    errorDescription: "Squaring is non-linear — illegal.",
    rootCause: "Confusing row ops with arbitrary transformations.",
    correct: "Only 3 legal: swap, scale (non-zero), add multiple.",
    prevention: "Memorize the 3 legal ops.",
    gateCost: "Catastrophic — invalid reduction.",
    frequency: "Rare but Critical"
  }];
  const C41_PYQS = [];
  function ConceptLab41({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 1,
      title: "Echelon Form & Pivots \u2014 The 3 Legal Operations",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Row reduction is the workhorse algorithm of all of M4. Pivots identify col space basis, free columns the null space. This lab calibrates the mechanical skill."),
      patterns: C41_PATTERNS,
      problems: C41_PROBLEMS,
      techniques: C41_TECHNIQUES,
      mistakes: C41_MISTAKES,
      pyqs: C41_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.2 — GAUSSIAN ELIMINATION
     ════════════════════════════════════════════════════════════════ */
  const C42_PATTERNS = [{
    name: "Solve via Gauss + Back-Substitute",
    surface: "Numeric system Ax = b. Asked for solution.",
    testing: "Whether you can reduce [A|b] to echelon and back-substitute.",
    signals: ["\"solve the system\"", "\"using Gaussian elimination\""],
    firstMove: "Form augmented [A|b]. Reduce to echelon. Back-substitute starting from last row.",
    timeBudget: 120,
    frequency: "Very Frequent"
  }, {
    name: "Partial Pivoting Decision",
    surface: "Asked whether pivot needs to be swapped.",
    testing: "Whether you know swap is needed when current pivot is 0.",
    signals: ["\"pivoting\"", "\"zero on the diagonal\""],
    firstMove: "If current pivot = 0, swap with row below having non-zero entry.",
    timeBudget: 30,
    frequency: "Occasional"
  }, {
    name: "Inconsistency Detection",
    surface: "Asked when Gauss elimination reveals inconsistency.",
    testing: "Whether you can spot 0 = c rows.",
    signals: ["\"no solution\"", "\"inconsistent\""],
    firstMove: "After reduction, look for row of form (0, 0, ..., 0 | c ≠ 0).",
    timeBudget: 30,
    frequency: "Frequent"
  }];
  const C42_PROBLEMS = [{
    id: "c42-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 35,
    tags: ["Gauss Solve"],
    statement: /*#__PURE__*/React.createElement("span", null, "Solve ", /*#__PURE__*/React.createElement(T, {
      src: "x + y = 5, x - y = 1"
    }), " via elimination. Find x."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Add equations: 2x = 6 → x = 3."
    }, {
      label: "Key step",
      text: "x = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "2 equations 2 unknowns — eliminate."
      }, {
        label: "KEY STEP",
        body: "R₁ + R₂: 2x = 6 → x = 3. Then y = 5 - 3 = 2."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "(3, 2): 3+2 = 5, 3-2 = 1. ✓"
      }],
      gateCheck: "Add/subtract rows to eliminate variables.",
      speed: "10 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same template.",
      linkedConcept: "C4.2 Gauss method."
    }
  }, {
    id: "c42-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Inconsistency"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "After row reduction, the augmented matrix has the row ", /*#__PURE__*/React.createElement(T, {
      src: "(0, 0, 0 \\mid 5)"
    }), ". The system is:"),
    options: ["Consistent with unique solution.", "Consistent with infinite solutions.", "Inconsistent (no solution).", "Cannot be determined."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "0 = 5 is impossible."
    }, {
      label: "Key step",
      text: "Inconsistent."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Row of zeros with non-zero augmented entry = contradiction."
      }, {
        label: "KEY STEP",
        body: "0·x = 5 has no solution. Inconsistent."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "rank(A) < rank([A|b])."
      }],
      gateCheck: "Spot (0 ... 0 | c ≠ 0) → inconsistent.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C3.4 Consistency.",
      negAdvisory: "Attempt: pattern. (C) wins."
    }
  }, {
    id: "c42-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Gauss Solve 3x3"],
    statement: /*#__PURE__*/React.createElement("span", null, "Solve via Gauss: ", /*#__PURE__*/React.createElement(T, {
      src: "x + y + z = 6, 2x + y + z = 7, x + 2y + z = 8"
    }), ". Find x."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Eliminate x from eq 2 and 3 using eq 1."
    }, {
      label: "Key step",
      text: "R₂ → R₂ - 2R₁: -y - z = -5. R₃ → R₃ - R₁: y = 2. So y = 2. From -y - z = -5: z = 5 - 2 = 3. From R₁: x = 6 - y - z = 6 - 2 - 3 = 1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Forward eliminate, then back-substitute."
      }, {
        label: "KEY STEP",
        body: "After R₂ ← R₂ - 2R₁: (0, -1, -1 | -5). After R₃ ← R₃ - R₁: (0, 1, 0 | 2). From row 3: y = 2. From row 2: -2 - z = -5 → z = 3. From row 1: x = 6 - 2 - 3 = 1."
      }, {
        label: "COMPUTATION",
        body: "x = 1."
      }, {
        label: "VERIFICATION",
        body: "(1, 2, 3): 1+2+3=6, 2+2+3=7, 1+4+3=8. ✓"
      }],
      gateCheck: "Always back-substitute and verify.",
      speed: "60 seconds.",
      whatMadeHard: "Sign tracking.",
      generalization: "Same template for any 3×3.",
      linkedConcept: "C4.2 Gauss."
    }
  }, {
    id: "c42-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 65,
    tags: ["Pivoting"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "While reducing, you encounter a 0 in the pivot position with a non-zero entry below. What should you do?"),
    options: ["Discard the row.", "Swap with the row below (partial pivoting).", "Multiply the current row by 0.", "Stop — system has no solution."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Standard partial pivoting."
    }, {
      label: "Key step",
      text: "Swap."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Need non-zero pivot — swap."
      }, {
        label: "KEY STEP",
        body: "Swap rows. This is row exchange — a legal operation."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "After swap, proceed with elimination normally."
      }],
      gateCheck: "Swap when pivot = 0.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.1 Row ops.",
      negAdvisory: "Attempt: technique. (B) wins."
    }
  }, {
    id: "c42-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Operation Count"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — count flops"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For Gaussian elimination on an n \xD7 n system, the number of arithmetic operations (additions + multiplications) is approximately:"),
    options: ["O(n)", "O(n²)", "O(n³)", "O(n⁴)"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "n stages × n² work per stage = n³."
    }, {
      label: "Key step",
      text: "O(n³)."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Operation count for Gaussian elimination."
      }, {
        label: "KEY STEP",
        body: "Forward elimination: n stages. Each eliminates one column, requiring O(n²) operations (zeroing n entries with n multiplications each). Total: O(n³)."
      }, {
        label: "COMPUTATION",
        body: "(C). Exact: 2n³/3 leading-order."
      }, {
        label: "VERIFICATION",
        body: "Back-substitution is only O(n²)."
      }],
      gateCheck: "Memorize: Gauss is O(n³).",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for LU.",
      linkedConcept: "M8 LU decomposition.",
      negAdvisory: "Attempt: definition. (C) wins."
    }
  }, {
    id: "c42-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["Parametric System"],
    skipSignal: {
      type: "attempt",
      text: "Attempt — case analysis"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For the system ", /*#__PURE__*/React.createElement(T, {
      src: "x + y = 1, kx + y = 2"
    }), ", the solution exists uniquely iff:"),
    options: ["k = 1", "k ≠ 1", "k = 2", "All k"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Unique sol ⇔ det(A) ≠ 0."
    }, {
      label: "Key step",
      text: "det = 1 - k ≠ 0 ⇒ k ≠ 1."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Square system unique sol ⇔ det non-zero."
      }, {
        label: "KEY STEP",
        body: "A = [[1, 1], [k, 1]]. det = 1 - k. ≠ 0 ⇔ k ≠ 1."
      }, {
        label: "COMPUTATION",
        body: "(B). At k = 1: inconsistent (1 = 2 contradiction)."
      }, {
        label: "VERIFICATION",
        body: "k = 0: x = 1, y = 0 unique. ✓"
      }],
      gateCheck: "Square unique ⇔ invertible ⇔ det ≠ 0.",
      speed: "20 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any parametric square.",
      linkedConcept: "C5.1 Determinant.",
      negAdvisory: "Attempt: det test. (B) wins."
    }
  }, {
    id: "c42-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["Gauss with Param"],
    statement: /*#__PURE__*/React.createElement("span", null, "For what value of ", /*#__PURE__*/React.createElement(T, {
      src: "k"
    }), " does the system ", /*#__PURE__*/React.createElement(T, {
      src: "x + y + z = 1, x + 2y + z = 2, x + y + kz = 3"
    }), " have no solution?"),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Reduce and check for inconsistency at k = 1."
    }, {
      label: "Key step",
      text: "R₂ - R₁: (0, 1, 0 | 1). R₃ - R₁: (0, 0, k-1 | 2). At k = 1: (0, 0, 0 | 2) — inconsistent."
    }, {
      label: "Near-complete",
      text: "k = 1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Parametric system — reduce and detect inconsistency."
      }, {
        label: "KEY STEP",
        body: "After R₂ → R₂ - R₁: (0, 1, 0 | 1). After R₃ → R₃ - R₁: (0, 0, k - 1 | 2). At k = 1, row 3 becomes (0, 0, 0 | 2) — inconsistent."
      }, {
        label: "COMPUTATION",
        body: "k = 1."
      }, {
        label: "VERIFICATION",
        body: "At k = 1: third equation x + y + z = 3 contradicts first (= 1)."
      }],
      gateCheck: "Param value that makes 0 = (non-zero) gives no solution.",
      speed: "60 seconds.",
      whatMadeHard: "Tracking the parameter.",
      generalization: "Same technique.",
      linkedConcept: "C4.7 Solution Theory."
    }
  }, {
    id: "c42-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Gauss Insight"],
    skipSignal: {
      type: "skip",
      text: "Skip if <70%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Gaussian elimination preserves which of the following?"),
    options: ["All eigenvalues of A.", "The solution set of Ax = b.", "The determinant up to sign.", "Both (B) and (C)."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Solution set: yes. Det: changes only by sign (swap) or factor (scale)."
    }, {
      label: "Key step",
      text: "Eigenvalues: generally NO. Solution and det (up to sign): YES."
    }, {
      label: "Near-complete",
      text: "(D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "What's invariant under row ops?"
      }, {
        label: "KEY STEP",
        body: "Solution set of Ax = b: preserved (definition of legal ops).\nDet: swap changes sign, scale changes by factor (non-zero), add doesn't change. So det up to sign/scale preserved.\nEigenvalues: NO — row ops generally change them."
      }, {
        label: "COMPUTATION",
        body: "(D) covers (B) and (C)."
      }, {
        label: "VERIFICATION",
        body: "(A) wrong (eigenvalues change)."
      }],
      gateCheck: "Solution set + det (up to sign/scale) preserved.",
      speed: "40 seconds.",
      whatMadeHard: "Eigenvalue confusion.",
      generalization: "Same.",
      linkedConcept: "C5.2 Det properties.",
      negAdvisory: "Attempt: structure. (D) wins."
    }
  }, {
    id: "c42-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["KILLER", "Parametric"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For the system ", /*#__PURE__*/React.createElement(T, {
      src: "x + y + z = 1, x + ky + z = 2, x + y + k^2 z = 3"
    }), ", the system has UNIQUE solution iff:"),
    options: ["k ≠ 0, ±1", "k ≠ ±1", "k = 1", "k ≠ 1"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Unique ⇔ det ≠ 0."
    }, {
      label: "Key step",
      text: "Compute det of A = [[1,1,1],[1,k,1],[1,1,k²]] and find roots."
    }, {
      label: "Near-complete",
      text: "det = (k - 1)(k² - 1) = (k - 1)²(k + 1). Zero at k = 1 or k = -1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Parametric det = 0 for non-unique sol."
      }, {
        label: "KEY STEP",
        body: "A = [[1,1,1],[1,k,1],[1,1,k²]]. Compute det:\nExpand along row 1:\n1·(k·k² - 1·1) - 1·(1·k² - 1·1) + 1·(1·1 - k·1)\n= (k³ - 1) - (k² - 1) + (1 - k)\n= k³ - 1 - k² + 1 + 1 - k\n= k³ - k² - k + 1\n= k²(k - 1) - (k - 1)\n= (k - 1)(k² - 1)\n= (k - 1)²(k + 1)."
      }, {
        label: "COMPUTATION",
        body: "det = 0 at k = 1 (double) or k = -1. Unique sol ⇔ k ≠ ±1. Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "k = 2: det = 1·3 = 3 ≠ 0 → unique."
      }],
      gateCheck: "Factor determinant polynomial to find all bad k.",
      speed: "Det computation: 90-120 seconds.",
      whatMadeHard: "Polynomial factoring.",
      generalization: "Same for any parametric square.",
      linkedConcept: "C5.2 Det.",
      negAdvisory: "Attempt: factor det. (B) wins."
    }
  }];
  const C42_TECHNIQUES = [{
    name: "Gauss + Back-Sub Recipe",
    type: "Speed Shortcut",
    when: "Solving Ax = b numerically.",
    steps: ["Augment [A | b].", "Reduce to echelon.", "Back-substitute from last row up."],
    speed: "60-120s for 3×3.",
    example: "Standard.",
    danger: "Sign errors.",
    freq: "Very Frequent"
  }, {
    name: "Inconsistency Spotter",
    type: "Verification Method",
    when: "During reduction.",
    steps: ["Look for row (0...0 | c ≠ 0).", "If found, halt — no solution."],
    speed: "5 seconds.",
    example: "(0, 0 | 5) — inconsistent.",
    danger: "Confuse with (0, 0 | 0) — that's redundant, not inconsistent.",
    freq: "Frequent"
  }, {
    name: "Partial Pivoting",
    type: "Trap Avoidance",
    when: "Pivot is 0.",
    steps: ["Swap with row below having largest absolute value in that column."],
    speed: "10 seconds.",
    example: "Standard numerical practice.",
    danger: "Don't skip — gives wrong rank otherwise.",
    freq: "Occasional"
  }];
  const C42_MISTAKES = [{
    name: "Skipping Back-Sub",
    wrong: ["Problem: Solve Ax = b.", "Solution: Reduce, then claim sol from echelon."],
    errorLine: 0,
    errorDescription: "Need back-substitution to compute actual values.",
    rootCause: "Stopping mid-process.",
    correct: "Echelon gives structure; back-sub gives values.",
    prevention: "Always back-substitute.",
    gateCost: "Wrong numerical answer.",
    frequency: "Common"
  }];
  const C42_PYQS = [];
  function ConceptLab42({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 2,
      title: "Gaussian Elimination \u2014 Solving Ax = b in Practice",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "The canonical numerical method. Master forward elimination + back-substitution, recognize when to swap rows, spot inconsistency."),
      patterns: C42_PATTERNS,
      problems: C42_PROBLEMS,
      techniques: C42_TECHNIQUES,
      mistakes: C42_MISTAKES,
      pyqs: C42_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.3 — RANK OF A MATRIX (HIGH GATE WEIGHT)
     ════════════════════════════════════════════════════════════════ */
  const C43_PATTERNS = [{
    name: "Parameterized Rank Drop",
    surface: "Matrix has parameter k. Asked rank as function of k OR for what k the rank drops below max.",
    testing: "Symbolic row reduction or det = 0 condition.",
    signals: ["\"find k such that rank(A) = r\"", "\"the rank of A is\""],
    firstMove: "Form A. Compute det (if square) and set = 0 OR row-reduce symbolically.",
    timeBudget: 80,
    frequency: "Very Frequent"
  }, {
    name: "Rank Invariance Under Row/Col Ops",
    surface: "Asked how rank changes after row/col operations.",
    testing: "Whether you know rank is INVARIANT under elementary ops.",
    signals: ["\"after applying R₂ → R₂ + 3R₁\"", "\"rank remains\""],
    firstMove: "Rank invariant under row ops AND column ops. Don't re-compute.",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "Rank of Outer Product (uvᵀ)",
    surface: "Matrix written as column × row product. Asked for rank.",
    testing: "Whether you know uvᵀ (non-zero u, v) has rank exactly 1.",
    signals: ["\"uvᵀ\"", "\"outer product\"", "\"column times row\""],
    firstMove: "uvᵀ has rank 1 if u, v non-zero. Otherwise rank 0.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "Rank Inequalities for Products",
    surface: "Asked rank(AB) given rank(A), rank(B).",
    testing: "Whether you know rank(AB) ≤ min(rank A, rank B), and equality cases.",
    signals: ["\"rank(AB) ≤\"", "\"product rank\""],
    firstMove: "rank(AB) ≤ min(rank A, rank B). Equality when A or B full rank.",
    timeBudget: 40,
    frequency: "Frequent"
  }, {
    name: "Counting Non-Zero Rows Properly",
    surface: "Asked for rank of a matrix that's already in echelon form.",
    testing: "Whether you know rank = number of non-zero rows in echelon.",
    signals: ["\"rank of the following matrix\""],
    firstMove: "If echelon, count non-zero rows = rank.",
    timeBudget: 15,
    frequency: "Frequent"
  }];
  const C43_PROBLEMS = [{
    id: "c43-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Rank from Echelon"],
    statement: /*#__PURE__*/React.createElement("span", null, "The rank of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 & 3 \\\\ 0 & 4 & 5 \\\\ 0 & 0 & 6 \\end{pmatrix}"
    }), " is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Echelon form. Count non-zero rows."
    }, {
      label: "Key step",
      text: "3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Triangular non-zero diagonal → full rank."
      }, {
        label: "KEY STEP",
        body: "All 3 rows non-zero. Rank = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "det = 1·4·6 = 24 ≠ 0 → full rank 3."
      }],
      gateCheck: "Triangular non-zero diagonal → full rank.",
      speed: "3 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for upper/lower triangular.",
      linkedConcept: "C4.1 Pivots."
    }
  }, {
    id: "c43-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 30,
    tags: ["Rank Outer Product"],
    statement: /*#__PURE__*/React.createElement("span", null, "What is the rank of ", /*#__PURE__*/React.createElement(T, {
      src: "A = uv^T"
    }), " where ", /*#__PURE__*/React.createElement(T, {
      src: "u = (1, 2, 3)^T"
    }), " and ", /*#__PURE__*/React.createElement(T, {
      src: "v = (4, 5, 6)^T"
    }), "?"),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Outer product of non-zero vectors has rank exactly 1."
    }, {
      label: "Key step",
      text: "1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "uvᵀ outer product structure."
      }, {
        label: "KEY STEP",
        body: "uvᵀ = u·(scalar in each column from v). Every column is a scalar multiple of u. Col space = span{u}, dim 1."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "Compute: A = [[4,5,6],[8,10,12],[12,15,18]]. Each row is a multiple of (4,5,6). Rank 1."
      }],
      gateCheck: "uvᵀ has rank 1 when u, v non-zero. Memorize.",
      speed: "5 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for any outer product.",
      linkedConcept: "C7.3 Rank of products."
    }
  }, {
    id: "c43-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Parametric Rank"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 \\\\ 3 & k \\end{pmatrix}"
    }), ", the rank is less than 2 iff ", /*#__PURE__*/React.createElement(T, {
      src: "k"
    }), " = ___."),
    answer: 6,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Rank < 2 ⇔ det = 0."
    }, {
      label: "Key step",
      text: "det = k - 6 = 0 → k = 6."
    }, {
      label: "Near-complete",
      text: "6."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank < 2 in 2×2 ⇔ det = 0."
      }, {
        label: "KEY STEP",
        body: "det(A) = 1·k - 2·3 = k - 6. Set = 0: k = 6."
      }, {
        label: "COMPUTATION",
        body: "6."
      }, {
        label: "VERIFICATION",
        body: "At k = 6: rows (1, 2), (3, 6). R₂ = 3·R₁. Rank 1. ✓"
      }],
      gateCheck: "Parametric det test.",
      speed: "15 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same for 3×3 etc.",
      linkedConcept: "C5.2 Det."
    }
  }, {
    id: "c43-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 75,
    tags: ["Rank Invariance"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "After applying R\u2083 \u2192 R\u2083 + 5R\u2081 to matrix A, the rank of the resulting matrix is:"),
    options: ["Decreased by 1.", "Increased by 1.", "Unchanged.", "Cannot be determined."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Elementary row ops preserve rank."
    }, {
      label: "Key step",
      text: "Unchanged."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Row op = legal → rank invariant."
      }, {
        label: "KEY STEP",
        body: "All 3 elementary row operations (swap, scale, add) preserve rank. Same for column operations."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Rank = dim(row span) = dim(col span). Both unchanged under row ops."
      }],
      gateCheck: "Rank invariant under row AND column ops.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.1 Row ops.",
      negAdvisory: "Attempt: theorem. (C) wins."
    }
  }, {
    id: "c43-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Rank Product"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 3 \xD7 5 with rank 3, and B is 5 \xD7 4 with rank 2, then rank(AB) is at most:"),
    options: ["5", "3", "2", "4"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "rank(AB) ≤ min(rank A, rank B)."
    }, {
      label: "Key step",
      text: "min(3, 2) = 2."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank inequality for products."
      }, {
        label: "KEY STEP",
        body: "rank(AB) ≤ min(rank A, rank B) = min(3, 2) = 2."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "AB is 3×4 → rank ≤ min(3, 4) = 3 from dimension. Combined: ≤ 2."
      }],
      gateCheck: "rank(AB) bounded by both factors.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same for n-fold products.",
      linkedConcept: "M7 Rank inequalities.",
      negAdvisory: "Attempt: bound. (C) wins."
    }
  }, {
    id: "c43-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["Parametric Rank 3x3"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 & 3 \\\\ 2 & 4 & 6 \\\\ 3 & 6 & k \\end{pmatrix}"
    }), ", the rank of A equals 1 iff k = ___."),
    answer: 9,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Row 2 = 2·R₁, so rank ≤ 2. For rank = 1, R₃ must also be a multiple of R₁."
    }, {
      label: "Key step",
      text: "(3, 6, k) = 3·(1, 2, 3) requires k = 9."
    }, {
      label: "Near-complete",
      text: "9."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Inspect for scalar-multiple rows."
      }, {
        label: "KEY STEP",
        body: "R₂ = 2·R₁ already. For rank 1: need R₃ ∝ R₁ too. R₃ = (3, 6, k) and 3·R₁ = (3, 6, 9). So k = 9."
      }, {
        label: "COMPUTATION",
        body: "9."
      }, {
        label: "VERIFICATION",
        body: "At k = 9: all rows multiples of (1, 2, 3). Rank 1."
      }],
      gateCheck: "All rows scalar multiples of first → rank 1.",
      speed: "20 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same template.",
      linkedConcept: "C4.3 Parametric rank."
    }
  }, {
    id: "c43-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Rank of Sum"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For n \xD7 n matrices A, B with rank(A) = r and rank(B) = s, the rank of A + B is at most:"),
    options: ["r + s", "r · s", "max(r, s)", "min(r, s)"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "rank(A + B) ≤ rank(A) + rank(B). Subadditivity."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "r + s."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank subadditivity for sums."
      }, {
        label: "KEY STEP",
        body: "col(A + B) ⊆ col(A) + col(B) (any column of A+B is sum of column of A and column of B). dim(sum) ≤ dim(A) + dim(B) = r + s."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Equality when col(A) ∩ col(B) = {0}. Else strict."
      }],
      gateCheck: "rank(A+B) ≤ rank(A) + rank(B).",
      speed: "Definition: 30 seconds.",
      whatMadeHard: "Nothing.",
      generalization: "Same.",
      linkedConcept: "M7 Rank inequalities.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c43-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["Rank Computation"],
    statement: /*#__PURE__*/React.createElement("span", null, "The rank of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 & 3 & 4 \\\\ 2 & 4 & 7 & 10 \\\\ 3 & 6 & 10 & 14 \\end{pmatrix}"
    }), " is ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Row reduce and count pivots."
    }, {
      label: "Key step",
      text: "R₂ - 2R₁: (0, 0, 1, 2). R₃ - 3R₁: (0, 0, 1, 2). R₃ - R₂: (0, 0, 0, 0). Two non-zero rows."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Row reduce."
      }, {
        label: "KEY STEP",
        body: "R₂ → R₂ - 2R₁: (0, 0, 1, 2). R₃ → R₃ - 3R₁: (0, 0, 1, 2). R₃ → R₃ - R₂: (0, 0, 0, 0). 2 non-zero rows."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "Note: col 2 = 2·col 1, so col 2 dependent."
      }],
      gateCheck: "Reduce; count non-zero rows.",
      speed: "60 seconds.",
      whatMadeHard: "Sign tracking.",
      generalization: "Same.",
      linkedConcept: "C4.1 Pivots."
    }
  }, {
    id: "c43-k1",
    difficulty: "killer",
    kind: "nat",
    marks: 2,
    timeTarget: 150,
    tags: ["KILLER", "Parametric 4x4"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 1 & 1 & 1 \\\\ 1 & 2 & 3 & 4 \\\\ 1 & 3 & 5 & k \\\\ 1 & 4 & 7 & 9 \\end{pmatrix}"
    }), ", the rank is at most 3 iff k = ___."),
    answer: 7,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Rank < 4 ⇔ det = 0."
    }, {
      label: "Key step",
      text: "Reduce: R₂ - R₁, R₃ - R₁, R₄ - R₁. Then R₃ - 2R₂, R₄ - 3R₂. Then R₄ - 2R₃ (if pattern holds)."
    }, {
      label: "Near-complete",
      text: "Compute det as polynomial in k, set = 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Parametric rank in 4×4."
      }, {
        label: "KEY STEP",
        body: "R₂ → R₂ - R₁: (0, 1, 2, 3). R₃ → R₃ - R₁: (0, 2, 4, k-1). R₄ → R₄ - R₁: (0, 3, 6, 8).\nR₃ → R₃ - 2R₂: (0, 0, 0, k-1-6) = (0, 0, 0, k-7).\nR₄ → R₄ - 3R₂: (0, 0, 0, 8 - 9) = (0, 0, 0, -1).\nFor rank < 4: row 3 and row 4 are both in column 4 only.\nThe matrix after reduction has rows (1, 1, 1, 1), (0, 1, 2, 3), (0, 0, 0, k-7), (0, 0, 0, -1).\nFor rank ≤ 3: rank stays at the first two non-zero rows plus possibly one of the bottom two.\nIf k - 7 = 0, row 3 becomes zero → rank 3 (rows 1, 2, 4 independent). Then full rank = 3. So k = 7."
      }, {
        label: "COMPUTATION",
        body: "7."
      }, {
        label: "VERIFICATION",
        body: "k = 7: row 3 of reduced form is zero. Rank = 3 (top two rows + row 4)."
      }],
      gateCheck: "Parametric value making a row zero in reduction reduces rank.",
      speed: "Reduction: 90-120 seconds.",
      whatMadeHard: "4×4 reduction; sign tracking.",
      generalization: "Same template for n×n parametric.",
      linkedConcept: "C4.7 Solution theory."
    }
  }];
  const C43_TECHNIQUES = [{
    name: "Rank-as-Pivot-Count",
    type: "Speed Shortcut",
    when: "Standard rank query.",
    steps: ["Row reduce A.", "Count pivots = rank."],
    speed: "60-90s.",
    example: "Standard.",
    danger: "Sign errors in reduction.",
    freq: "Very Frequent"
  }, {
    name: "Outer Product Rank-1 Reflex",
    type: "Speed Shortcut",
    when: "Matrix expressed as uvᵀ.",
    steps: ["If u, v non-zero: rank = 1.", "If u = 0 or v = 0: rank = 0."],
    speed: "Direct.",
    example: "uvᵀ rank 1 always (u, v ≠ 0).",
    danger: "Don't forget the non-zero condition.",
    freq: "Frequent"
  }, {
    name: "Rank Product Inequality",
    type: "Structural Insight",
    when: "Computing or bounding rank(AB).",
    steps: ["rank(AB) ≤ min(rank A, rank B).", "Equality if A or B has full rank along the shared dim."],
    speed: "Bound: 10 seconds.",
    example: "rank(A)=3, rank(B)=2: rank(AB) ≤ 2.",
    danger: "Strict inequality when neither has full rank.",
    freq: "Frequent"
  }, {
    name: "Rank Sum Inequality",
    type: "Structural Insight",
    when: "Computing rank(A + B).",
    steps: ["rank(A + B) ≤ rank(A) + rank(B)."],
    speed: "Bound: 5 seconds.",
    example: "I + I = 2I → rank n. Sum of two rank-1 can give rank 1 or 2.",
    danger: "Lower bound: rank(A+B) ≥ |rank A - rank B|.",
    freq: "Occasional"
  }, {
    name: "Parametric Rank via det = 0",
    type: "Structural Insight",
    when: "Matrix has a parameter, asked for rank.",
    steps: ["For square A: compute det as polynomial in k.", "Set det = 0; solve for k.", "Rank < n at these k. Else rank = n."],
    speed: "60-120s.",
    example: "See KILLER above.",
    danger: "Polynomial factoring care.",
    freq: "Frequent"
  }];
  const C43_MISTAKES = [{
    name: "Counting Non-Zero Rows Without Reducing",
    wrong: ["Problem: rank of [[1, 2, 3], [2, 4, 6], [3, 6, 9]] = ?", "Solution: 3 non-zero rows → rank 3."],
    errorLine: 0,
    errorDescription: "All rows are scalar multiples of (1, 2, 3). Rank 1, not 3.",
    rootCause: "Treating raw matrix like echelon.",
    correct: "Row reduce: rank = 1.",
    prevention: "ALWAYS reduce before counting.",
    gateCost: "2-mark error.",
    frequency: "Very Common"
  }, {
    name: "Forgetting Rank Invariance Under Row Ops",
    wrong: ["Problem: After R₂ → R₂ + 3R₁, does rank change?", "Solution: We added rows, so rank goes up."],
    errorLine: 0,
    errorDescription: "Elementary row ops preserve rank.",
    rootCause: "Not knowing the invariance theorem.",
    correct: "Rank unchanged by row ops.",
    prevention: "Memorize: row ops preserve rank.",
    gateCost: "Major conceptual error.",
    frequency: "Common"
  }, {
    name: "Outer Product Rank Confusion",
    wrong: ["Problem: rank of uvᵀ where u, v ∈ ℝ³.", "Solution: 3 by 3 matrix → rank 3."],
    errorLine: 0,
    errorDescription: "uvᵀ has rank exactly 1 (or 0 if u or v is zero), regardless of size.",
    rootCause: "Confusing matrix size with rank.",
    correct: "uvᵀ rank = 1 always (when both non-zero).",
    prevention: "Outer product = rank 1.",
    gateCost: "2-mark error.",
    frequency: "Common"
  }];
  const C43_PYQS = [{
    year: "1994-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative of GATE CS 1994 patterns.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "The rank of the matrix ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 9 \\end{pmatrix}"
    }), " is ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Arithmetic progression rows. Suggests dependency."
    }, {
      label: "REDUCE",
      body: "R₂ → R₂ - 4R₁: (0, -3, -6). R₃ → R₃ - 7R₁: (0, -6, -12). R₃ → R₃ - 2R₂: (0, 0, 0). Rank 2."
    }, {
      label: "ANSWER",
      body: "2."
    }, {
      label: "WHY GATE LOVES THIS",
      body: "Tests AP dependency recognition + reduction."
    }]
  }, {
    year: "2002-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2002 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For real ", /*#__PURE__*/React.createElement(T, {
      src: "\\lambda"
    }), ", the rank of ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & \\lambda \\\\ \\lambda & 1 \\end{pmatrix}"
    }), " is less than 2 iff ", /*#__PURE__*/React.createElement(T, {
      src: "\\lambda"
    }), " = ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Symmetric parametric 2×2."
    }, {
      label: "DET",
      body: "det = 1 - λ². Set = 0: λ = ±1."
    }, {
      label: "ANSWER",
      body: "λ = ±1."
    }, {
      label: "TRAP",
      body: "Two values, not just one!"
    }]
  }, {
    year: "2014-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2014 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "The rank of ", /*#__PURE__*/React.createElement(T, {
      src: "A = uv^T"
    }), " where ", /*#__PURE__*/React.createElement(T, {
      src: "u, v \\in \\mathbb{R}^n"
    }), " are non-zero is ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Outer product."
    }, {
      label: "REASONING",
      body: "Each col is a multiple of u → col(A) = span{u} → dim 1."
    }, {
      label: "ANSWER",
      body: "1 (always)."
    }, {
      label: "MEMORIZE",
      body: "uvᵀ → rank 1."
    }]
  }, {
    year: "2019-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2019 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For matrices A (3\xD75) and B (5\xD73), rank(AB) is at most ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Rank product inequality."
    }, {
      label: "BOUND",
      body: "rank(AB) ≤ min(rank A, rank B) ≤ min(3, 3) = 3 (dimension bound on rank A and B)."
    }, {
      label: "ANSWER",
      body: "3."
    }, {
      label: "NUANCE",
      body: "Could be less; 3 is the upper bound."
    }]
  }];
  function ConceptLab43({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 3,
      title: "Rank of a Matrix \u2014 The Single Most-Tested Concept in M4",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "GATE tests parameterized rank, outer product rank, product/sum inequalities, and invariance under row ops every year. This lab forges all reflexes \u2014 including the spec-mandated PYQs from 1994, 2002, 2014, 2019."),
      patterns: C43_PATTERNS,
      problems: C43_PROBLEMS,
      techniques: C43_TECHNIQUES,
      mistakes: C43_MISTAKES,
      pyqs: C43_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.4 — RANK-NULLITY THEOREM (with KILLER on ker(T))
     ════════════════════════════════════════════════════════════════ */
  const C44_PATTERNS = [{
    name: "Direct Rank-Nullity Application",
    surface: "Matrix or linear map. Given rank, find nullity (or vice versa).",
    testing: "Whether you apply rank + nullity = n (columns / domain dim) automatically.",
    signals: ["\"find the dimension of the null space\"", "\"nullity of A\""],
    firstMove: "nullity = n − rank, where n = number of columns (or domain dim for linear map).",
    timeBudget: 15,
    frequency: "Very Frequent"
  }, {
    name: "Linear Map T: V → W",
    surface: "Linear map between spaces. Given rank(T), find dim(ker(T)).",
    testing: "Use dim(V) (domain), not dim(W).",
    signals: ["\"T: ℝᵐ → ℝⁿ\"", "\"kernel of T\""],
    firstMove: "dim(ker(T)) = dim(V) - rank(T). DOMAIN, not codomain.",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "Free Variable Count = Nullity",
    surface: "Asked for free variables in Ax = 0.",
    testing: "Whether you know free vars = nullity.",
    signals: ["\"number of free variables\""],
    firstMove: "Free vars = nullity = n - rank.",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Reverse: Find Rank from Nullity",
    surface: "Nullity given, asked rank.",
    testing: "Same theorem, reverse direction.",
    signals: ["\"dim(N(A)) = 2\""],
    firstMove: "rank = n - nullity.",
    timeBudget: 15,
    frequency: "Frequent"
  }];
  const C44_PROBLEMS = [{
    id: "c44-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 20,
    tags: ["Rank-Nullity"],
    statement: /*#__PURE__*/React.createElement("span", null, "A 4 \xD7 7 matrix has rank 3. Nullity = ___."),
    answer: 4,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "nullity = n - rank = 7 - 3."
    }, {
      label: "Key step",
      text: "4."
    }, {
      label: "Near-complete",
      text: "4."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Direct rank-nullity."
      }, {
        label: "KEY STEP",
        body: "nullity = 7 - 3 = 4."
      }, {
        label: "COMPUTATION",
        body: "4."
      }, {
        label: "VERIFICATION",
        body: "Use n = columns = 7, NOT rows = 4."
      }],
      gateCheck: "n = columns.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C2.2 Rank-Nullity."
    }
  }, {
    id: "c44-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Linear Map"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "T: \\mathbb{R}^4 \\to \\mathbb{R}^3"
    }), " with rank 2, dim(ker T) = ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Use domain dim = 4."
    }, {
      label: "Key step",
      text: "ker dim = 4 - 2 = 2."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank-nullity for linear map."
      }, {
        label: "KEY STEP",
        body: "dim(ker T) = dim(domain) - rank(T) = 4 - 2 = 2."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "Codomain dim (3) doesn't enter."
      }],
      gateCheck: "Use DOMAIN dimension.",
      speed: "5s.",
      whatMadeHard: "Trap with codomain.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c44-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 40,
    tags: ["Rank from Nullity"],
    statement: /*#__PURE__*/React.createElement("span", null, "A 5 \xD7 6 matrix has 3-dimensional null space. Rank = ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "rank = n - nullity."
    }, {
      label: "Key step",
      text: "6 - 3 = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Reverse rank-nullity."
      }, {
        label: "KEY STEP",
        body: "rank = n - nullity = 6 - 3 = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "rank ≤ min(m, n) = 5. 3 ≤ 5 ✓."
      }],
      gateCheck: "Reverse formula.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c44-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 65,
    tags: ["Free Variables"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For Ax = 0 with A of size 6 \xD7 9 and rank 4, the number of free variables in the parametric solution is:"),
    options: ["4", "5", "6", "9"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Free vars = nullity = n - rank."
    }, {
      label: "Key step",
      text: "9 - 4 = 5."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free vars = nullity."
      }, {
        label: "KEY STEP",
        body: "nullity = 9 - 4 = 5."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "5 parameters in general null space solution."
      }],
      gateCheck: "Free vars count.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4.",
      negAdvisory: "Attempt: arithmetic. (B) wins."
    }
  }, {
    id: "c44-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["One-to-One"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A linear map T: \u211D\u2074 \u2192 \u211D\u2075 is ONE-TO-ONE iff:"),
    options: ["rank(T) = 4.", "rank(T) = 5.", "rank(T) = 0.", "T is the zero map."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "One-to-one ⇔ ker(T) = {0} ⇔ nullity 0 ⇔ rank = domain dim."
    }, {
      label: "Key step",
      text: "rank = 4."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "One-to-one ⇔ trivial kernel."
      }, {
        label: "KEY STEP",
        body: "nullity 0 ⇒ rank = n = 4. So rank(T) = 4."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (B): rank ≤ 4 here, can't be 5."
      }],
      gateCheck: "One-to-one ⇔ rank = domain dim.",
      speed: "20s.",
      whatMadeHard: "Codomain trap.",
      generalization: "Universal.",
      linkedConcept: "C4.4.",
      negAdvisory: "Attempt: definition. (A) wins."
    }
  }, {
    id: "c44-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Onto + One-to-One"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For T: \u211D\u2075 \u2192 \u211D\u2075, which of the following is equivalent to T being a bijection?"),
    options: ["rank(T) = 5.", "nullity(T) = 0.", "det(T) ≠ 0.", "All of the above."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "All three are equivalent characterizations of invertibility for square map."
    }, {
      label: "Key step",
      text: "(D)."
    }, {
      label: "Near-complete",
      text: "All."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Square map bijection equivalences."
      }, {
        label: "KEY STEP",
        body: "rank = n ⇔ ker = {0} (nullity 0) ⇔ det ≠ 0 ⇔ invertible ⇔ bijection."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "Each is necessary and sufficient."
      }],
      gateCheck: "All equivalent for square.",
      speed: "20s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal for square.",
      linkedConcept: "C5.3 Invertibility.",
      negAdvisory: "Attempt: theorem. (D) wins."
    }
  }, {
    id: "c44-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["Combined"],
    statement: /*#__PURE__*/React.createElement("span", null, "If T: V \u2192 W has dim(V) = 8, dim(W) = 5, and T is ONTO, then dim(ker T) = ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Onto ⇒ rank = 5. nullity = 8 - 5 = 3."
    }, {
      label: "Key step",
      text: "3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Onto ⇒ rank = codomain dim."
      }, {
        label: "KEY STEP",
        body: "rank(T) = dim(W) = 5 (onto). nullity = dim(V) - rank = 8 - 5 = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Sanity: T can't be 1-1 (would need dim V ≤ dim W, here 8 > 5)."
      }],
      gateCheck: "Onto ⇒ rank = codomain dim.",
      speed: "15s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c44-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Composition Rank"],
    skipSignal: {
      type: "skip",
      text: "Skip if <65%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For T: \u211D\u2074 \u2192 \u211D\xB3 with rank 2 and S: \u211D\xB3 \u2192 \u211D\u2076 with rank 3, the rank of S \u2218 T : \u211D\u2074 \u2192 \u211D\u2076 is at most:"),
    options: ["4", "3", "2", "6"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "rank(ST) ≤ min(rank S, rank T) = min(3, 2) = 2."
    }, {
      label: "Key step",
      text: "2."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Composition rank inequality."
      }, {
        label: "KEY STEP",
        body: "rank(S ∘ T) ≤ min(rank S, rank T) = min(3, 2) = 2."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Image of T is 2D; S restricted to it has rank ≤ 2."
      }],
      gateCheck: "Composition rank.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Same.",
      linkedConcept: "C4.3 Rank inequality.",
      negAdvisory: "Attempt: bound. (C) wins."
    }
  }, {
    id: "c44-k1",
    difficulty: "killer",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["KILLER", "ker(T)"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For a linear map T: \u211D\u2075 \u2192 \u211D\xB3 with rank 2, the dimension of ker(T) is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Rank-nullity using DOMAIN dim."
    }, {
      label: "Key step",
      text: "ker dim = 5 - 2 = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "GATE-mandated KILLER. Standard rank-nullity on a linear map."
      }, {
        label: "KEY STEP",
        body: "dim(domain) = 5, rank = 2. dim(ker) = 5 - 2 = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "TRAP: codomain dim (3) is NOT used. Many students use 3 - 2 = 1 — WRONG."
      }],
      gateCheck: "Use domain dim, NOT codomain.",
      speed: "10 seconds with the rule memorized — but TRIVIAL if you know it, KILLER if you don't.",
      whatMadeHard: "The trap is using codomain dim (3) instead of domain (5). Test-taker thinks 'rank 2, codomain 3, so 1 dim missing' — wrong.",
      generalization: "ALWAYS domain dim for rank-nullity.",
      linkedConcept: "C4.4 Universal application."
    }
  }];
  const C44_TECHNIQUES = [{
    name: "rank + nullity = n (Domain Dim)",
    type: "Speed Shortcut",
    when: "Any rank-nullity question.",
    steps: ["For matrix A (m × n): nullity(A) = n − rank(A). n = COLUMNS.", "For map T: V → W: dim(ker T) = dim(V) − rank(T). V = DOMAIN."],
    speed: "5s.",
    example: "5 × 7 rank 2 → nullity 5.",
    danger: "Use n (cols / domain) — NEVER m (rows / codomain).",
    freq: "Very Frequent"
  }, {
    name: "One-to-One ⇔ Trivial Kernel",
    type: "Structural Insight",
    when: "Asked if T is 1-1.",
    steps: ["T 1-1 ⇔ ker(T) = {0} ⇔ nullity = 0 ⇔ rank = domain dim."],
    speed: "Direct.",
    example: "T: ℝⁿ → ℝᵐ 1-1 needs rank n.",
    danger: "Don't confuse with onto.",
    freq: "Frequent"
  }, {
    name: "Onto ⇔ Rank = Codomain Dim",
    type: "Structural Insight",
    when: "Asked if T is onto.",
    steps: ["T onto ⇔ image = W ⇔ rank(T) = dim(W)."],
    speed: "Direct.",
    example: "T: ℝ⁵ → ℝ³ onto needs rank 3.",
    danger: "Don't confuse with 1-1.",
    freq: "Frequent"
  }, {
    name: "Square Map Bijection Pack",
    type: "Structural Insight",
    when: "Square A or T: V → V.",
    steps: ["rank = n ⇔ nullity 0 ⇔ det ≠ 0 ⇔ invertible ⇔ bijection."],
    speed: "All equivalent.",
    example: "Standard.",
    danger: "Equivalences only for SQUARE.",
    freq: "Very Frequent"
  }];
  const C44_MISTAKES = [{
    name: "Using Rows Instead of Columns",
    wrong: ["Problem: A is 4 × 6, rank 3. Nullity?", "Solution: nullity = 4 - 3 = 1."],
    errorLine: 0,
    errorDescription: "Wrong: should be n - rank = 6 - 3 = 3.",
    rootCause: "Conflating m and n.",
    correct: "Always n (columns).",
    prevention: "Underline COLUMN count.",
    gateCost: "Wrong answer.",
    frequency: "Very Common"
  }, {
    name: "Using Codomain for Linear Map",
    wrong: ["Problem: T: ℝ⁵ → ℝ³, rank 2. ker dim?", "Solution: ker dim = 3 - 2 = 1."],
    errorLine: 0,
    errorDescription: "Should use domain (5), not codomain (3).",
    rootCause: "Wrong dimension in formula.",
    correct: "ker dim = 5 - 2 = 3.",
    prevention: "DOMAIN always.",
    gateCost: "2-mark error.",
    frequency: "Very Common"
  }];
  const C44_PYQS = [];
  function ConceptLab44({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 4,
      title: "Rank-Nullity Theorem \u2014 rank + nullity = (domain dim)",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "One theorem, two traps: rows-vs-columns (matrix form), domain-vs-codomain (linear map form). The KILLER tests exactly this confusion: T: \u211D\u2075 \u2192 \u211D\xB3, rank 2, ker dim = ?"),
      patterns: C44_PATTERNS,
      problems: C44_PROBLEMS,
      techniques: C44_TECHNIQUES,
      mistakes: C44_MISTAKES,
      pyqs: C44_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.5 — SOLVING Ax = b · COMPLETE SOLUTION
     ════════════════════════════════════════════════════════════════ */
  const C45_PATTERNS = [{
    name: "General Solution x = xₚ + xₙ",
    surface: "Asked for general solution of Ax = b with non-trivial null space.",
    testing: "Finding xₚ + null space basis representation.",
    signals: ["\"general solution\"", "\"complete solution\""],
    firstMove: "Find one xₚ. Find null basis. Combine: x = xₚ + Σ tᵢvᵢ.",
    timeBudget: 100,
    frequency: "Frequent"
  }, {
    name: "Particular Solution via RREF",
    surface: "Asked for any specific solution.",
    testing: "Set free variables to 0 (or convenient values).",
    signals: ["\"a particular solution\"", "\"one solution\""],
    firstMove: "Row reduce [A|b]. Set free = 0. Back-substitute for pivot vars.",
    timeBudget: 60,
    frequency: "Frequent"
  }, {
    name: "Solution Type Identification",
    surface: "Asked unique / infinite / no solution.",
    testing: "Rank comparison protocol.",
    signals: ["\"how many solutions\""],
    firstMove: "Compare rank(A) and rank([A|b]). rank match + rank = n: unique. rank match + rank < n: infinite. rank mismatch: no sol.",
    timeBudget: 40,
    frequency: "Very Frequent"
  }];
  const C45_PROBLEMS = [{
    id: "c45-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Sol Type"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If rank(A) = 3, rank([A|b]) = 3, and A is 4 \xD7 5, the system Ax = b has:"),
    options: ["Unique solution.", "Infinitely many.", "No solution.", "Cannot determine."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "rank match → consistent. rank 3 < n = 5 → free vars exist."
    }, {
      label: "Key step",
      text: "Infinite."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank comparison."
      }, {
        label: "KEY STEP",
        body: "rank(A) = rank([A|b]) = 3 < n = 5. Consistent + 2 free vars → infinite."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Sol set is a 2D affine subspace."
      }],
      gateCheck: "Match + rank < n → infinite.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.7 Solution theory.",
      negAdvisory: "Attempt: pattern. (B) wins."
    }
  }, {
    id: "c45-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 35,
    tags: ["Sol Set Dim"],
    statement: /*#__PURE__*/React.createElement("span", null, "Ax = b is consistent with A of size 3 \xD7 5, rank 2. The dimension of the solution set is ___."),
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
        body: "Sol set dim."
      }, {
        label: "KEY STEP",
        body: "Sol set is translate of N(A). Dim = nullity = 5 - 2 = 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Independent of b."
      }],
      gateCheck: "Dim sol = nullity.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4 Rank-Nullity."
    }
  }, {
    id: "c45-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Particular Sol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For x + y + z = 6 with x, y, z \u2208 \u211D, a particular solution is:"),
    options: ["(6, 0, 0)", "(0, 0, 0)", "(1, 1, 1)", "(2, 2, 2) only"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Setting free vars to 0 gives quick particular."
    }, {
      label: "Key step",
      text: "Set y = z = 0: x = 6. → (6, 0, 0)."
    }, {
      label: "Near-complete",
      text: "(6, 0, 0): 6 + 0 + 0 = 6 ✓. Only (A) satisfies; (C) gives 1 + 1 + 1 = 3 ≠ 6."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Particular solution — set free variables to convenient values."
      }, {
        label: "KEY STEP",
        body: "Set y = z = 0 (free vars). Then x = 6. So xₚ = (6, 0, 0)."
      }, {
        label: "COMPUTATION",
        body: "Answer (A). Verify: 6 + 0 + 0 = 6 ✓."
      }, {
        label: "VERIFICATION",
        body: "(C) (1, 1, 1) gives 1 + 1 + 1 = 3 ≠ 6, so it's NOT a solution and was a trap."
      }],
      gateCheck: "Always verify particular sol.",
      speed: "10s.",
      whatMadeHard: "(C) trap.",
      generalization: "Same template.",
      linkedConcept: "C3.4.",
      negAdvisory: "Attempt: verify each. (A) wins."
    }
  }, {
    id: "c45-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Complete Sol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If x\u209A = (1, 2, 0) solves Ax = b and N(A) = span", (1, -1, 1), ", the general solution is:"),
    options: ["(1, 2, 0)", "(1, 2, 0) + t(1, -1, 1), t ∈ ℝ", "t(1, -1, 1), t ∈ ℝ", "(1+t, 2-t, t) for t = 1 only"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "General = particular + null param."
    }, {
      label: "Key step",
      text: "(1, 2, 0) + t(1, -1, 1)."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "x = xₚ + xₙ structure."
      }, {
        label: "KEY STEP",
        body: "xₙ = t·(1, -1, 1). General = (1, 2, 0) + t·(1, -1, 1)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Each t gives a valid sol."
      }],
      gateCheck: "xₚ + parametric null.",
      speed: "Direct.",
      whatMadeHard: "Distractor (D) restricts t.",
      generalization: "Same.",
      linkedConcept: "C3.4.",
      negAdvisory: "Attempt: structure. (B) wins."
    }
  }, {
    id: "c45-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Sol Count"],
    statement: /*#__PURE__*/React.createElement("span", null, "Ax = b with A 4 \xD7 4, rank 4 has how many solutions?"),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Square full rank → unique."
    }, {
      label: "Key step",
      text: "1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Square invertible."
      }, {
        label: "KEY STEP",
        body: "rank = n = 4 → invertible. Unique sol x = A⁻¹b."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "Consistent for any b in this case."
      }],
      gateCheck: "Square + full rank → unique.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.3 Inverse."
    }
  }, {
    id: "c45-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 110,
    tags: ["Parametric Sys"],
    skipSignal: {
      type: "skip",
      text: "Skip if <70%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For x + y = 2, 2x + 2y = k, the system has solution iff:"),
    options: ["k = 2 only", "k = 4 only", "k ≠ 4", "All k"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Rows scalar multiples; b must match."
    }, {
      label: "Key step",
      text: "(2, 2 | k) = 2·(1, 1 | 2) requires k = 4."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Dependent rows: consistency depends on b."
      }, {
        label: "KEY STEP",
        body: "R₂ = 2·R₁ for A, requires b₂ = 2·b₁ = 4."
      }, {
        label: "COMPUTATION",
        body: "(B). For k = 4: infinite. For k ≠ 4: none."
      }, {
        label: "VERIFICATION",
        body: "k = 4: x + y = 2 (one equation, two unknowns)."
      }],
      gateCheck: "Rank match for b too.",
      speed: "15s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C3.4.",
      negAdvisory: "Attempt: consistency. (B) wins."
    }
  }, {
    id: "c45-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["Particular Sol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If Ax = b has solutions x = (1, 0, 0) AND x = (0, 1, 0), it must also have:"),
    options: ["x = (1, 1, 0)", "x = (0.5, 0.5, 0) (the midpoint)", "x = (1, -1, 0)", "All x of form t(1,0,0) + (1-t)(0,1,0)"],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Solution set is affine — any convex (or affine) combination of solutions is also a solution."
    }, {
      label: "Key step",
      text: "Affine combos t·x₁ + (1-t)·x₂."
    }, {
      label: "Near-complete",
      text: "(D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Affine combinations of solutions."
      }, {
        label: "KEY STEP",
        body: "x₁ - x₂ ∈ N(A). x₁ + t(x₁ - x₂) ∈ solution set ⇔ t(x₁ - x₂) ∈ N(A) ✓. Same as: t·x₁ + (1-t)·x₂ = affine combo, in sol set."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "(B) is just t = 0.5. (D) covers all t."
      }],
      gateCheck: "Sol set is affine subspace.",
      speed: "30s.",
      whatMadeHard: "Affine vs linear combo.",
      generalization: "Same.",
      linkedConcept: "C2.6 Solution structure.",
      negAdvisory: "Attempt: structure. (D) wins."
    }
  }, {
    id: "c45-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["Sol Set"],
    statement: /*#__PURE__*/React.createElement("span", null, "For consistent Ax = b with A 4 \xD7 7 and rank 3, the dim of solution set is ___."),
    answer: 4,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Sol set dim = nullity."
    }, {
      label: "Key step",
      text: "nullity = 7 - 3 = 4."
    }, {
      label: "Near-complete",
      text: "4."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sol set dim formula."
      }, {
        label: "KEY STEP",
        body: "nullity = n - rank = 7 - 3 = 4."
      }, {
        label: "COMPUTATION",
        body: "4."
      }, {
        label: "VERIFICATION",
        body: "4 free vars → 4D sol set."
      }],
      gateCheck: "Dim sol = nullity.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c45-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["KILLER", "Sol Synthesis"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " Three vectors x\u2081, x\u2082, x\u2083 are solutions to Ax = b. Which is NOT necessarily a solution?"),
    options: ["(x₁ + x₂)/2", "x₁ + x₂ - x₃", "x₁ + x₂", "(x₁ + x₂ + x₃)/3"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Affine combinations (coefficients summing to 1) preserve. Plain sums (sum to 2) don't."
    }, {
      label: "Key step",
      text: "x₁ + x₂: coefficients (1, 1) sum to 2, not 1."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Affine combination test."
      }, {
        label: "KEY STEP",
        body: "If Σcᵢxᵢ = x, then A·Σcᵢxᵢ = ΣcᵢAxᵢ = Σcᵢb = (Σcᵢ)·b. For x to solve Ax = b, need Σcᵢ = 1.\n(A) (1/2, 1/2): sum 1 ✓.\n(B) (1, 1, -1): sum 1 ✓.\n(C) (1, 1, 0): sum 2 ≠ 1 ✗.\n(D) (1/3, 1/3, 1/3): sum 1 ✓."
      }, {
        label: "COMPUTATION",
        body: "(C). Sum coefs = 2 → gives 2b, not b."
      }, {
        label: "VERIFICATION",
        body: "A(x₁ + x₂) = 2b ≠ b (unless b = 0)."
      }],
      gateCheck: "Affine combinations: Σcᵢ = 1 required for sol set membership.",
      speed: "60s.",
      whatMadeHard: "Distinguishing linear from affine combinations.",
      generalization: "Sol set is affine, NOT linear (except when b = 0).",
      linkedConcept: "C2.6 Solution structure.",
      negAdvisory: "Attempt: sum-of-coefs test. (C) wins."
    }
  }];
  const C45_TECHNIQUES = [{
    name: "Complete Solution Recipe",
    type: "Structural Insight",
    when: "General sol to Ax = b.",
    steps: ["Find one xₚ.", "Find null space basis.", "x = xₚ + Σtᵢvᵢ."],
    speed: "2-3 min.",
    example: "Standard.",
    danger: "Don't include xₚ as a free parameter.",
    freq: "Very Frequent"
  }, {
    name: "Rank Comparison Protocol",
    type: "Structural Insight",
    when: "Determining solution count.",
    steps: ["Compute rank(A) and rank([A|b]).", "Match + rank = n: unique.", "Match + rank < n: infinite.", "Mismatch: no solution."],
    speed: "Direct.",
    example: "Universal protocol.",
    danger: "Don't skip the rank = n check.",
    freq: "Very Frequent"
  }, {
    name: "Affine Combo Preservation",
    type: "Trap Avoidance",
    when: "Combining known solutions.",
    steps: ["For Σcᵢxᵢ to be a solution: need Σcᵢ = 1 (when b ≠ 0)."],
    speed: "Direct.",
    example: "Midpoint, weighted avgs.",
    danger: "x₁ + x₂ alone is NOT a sol.",
    freq: "Occasional"
  }];
  const C45_MISTAKES = [{
    name: "Treating x₁ + x₂ as Solution",
    wrong: ["Problem: x₁, x₂ solve Ax = b. Is x₁ + x₂?", "Solution: Yes, by linearity."],
    errorLine: 0,
    errorDescription: "Linearity gives A(x₁+x₂) = 2b ≠ b.",
    rootCause: "Confusing affine with linear.",
    correct: "Affine combos (sum coefs = 1) preserve, not plain sums.",
    prevention: "Always check sum of coefficients.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }];
  const C45_PYQS = [];
  function ConceptLab45({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 5,
      title: "Solving Ax = b \xB7 The Complete Solution",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "x = x\u209A + x\u2099 is THE general form. Master particular sol via setting free vars to 0, null basis via parametric reading, and the rank comparison protocol."),
      patterns: C45_PATTERNS,
      problems: C45_PROBLEMS,
      techniques: C45_TECHNIQUES,
      mistakes: C45_MISTAKES,
      pyqs: C45_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.6 — MULTIPLE FREE VARIABLES (Null Basis from RREF)
     ════════════════════════════════════════════════════════════════ */
  const C46_PATTERNS = [{
    name: "Read Null Basis from RREF",
    surface: "RREF given. Asked basis of N(A).",
    testing: "Whether you can convert RREF to parametric null space vectors.",
    signals: ["\"basis of null space\""],
    firstMove: "For each free col: set that free var = 1, others = 0, solve pivots.",
    timeBudget: 90,
    frequency: "Very Frequent"
  }, {
    name: "Count Free Variables",
    surface: "Number of free variables in Ax = 0.",
    testing: "Free count = n - rank.",
    signals: ["\"how many free variables\""],
    firstMove: "n - rank.",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Multi-Dim Null Solution Structure",
    surface: "General null space solution as linear combo.",
    testing: "Sum over free vars.",
    signals: ["\"general solution\""],
    firstMove: "Σ (free var)·(basis vector).",
    timeBudget: 30,
    frequency: "Frequent"
  }];
  const C46_PROBLEMS = [{
    id: "c46-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Free Vars Count"],
    statement: /*#__PURE__*/React.createElement("span", null, "An m \xD7 n matrix with rank r has how many free variables in Ax = 0? (n = 8, r = 3)."),
    answer: 5,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Free = n - r."
    }, {
      label: "Key step",
      text: "5."
    }, {
      label: "Near-complete",
      text: "5."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free vars formula."
      }, {
        label: "KEY STEP",
        body: "8 - 3 = 5."
      }, {
        label: "COMPUTATION",
        body: "5."
      }, {
        label: "VERIFICATION",
        body: "5 parameters in null space."
      }],
      gateCheck: "Free = n - rank.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c46-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["Null Basis"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For RREF ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 0 & 2 \\\\ 0 & 1 & 3 \\\\ 0 & 0 & 0 \\end{pmatrix}"
    }), ", a basis vector for N(A) is:"),
    options: ["(0, 0, 1)", "(-2, -3, 1)", "(2, 3, 1)", "(1, 0, 0)"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Free var x₃. Set x₃ = 1, then x₁ = -2, x₂ = -3 from rows."
    }, {
      label: "Key step",
      text: "(-2, -3, 1)."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Null basis from RREF."
      }, {
        label: "KEY STEP",
        body: "x₃ free. Set x₃ = 1. Row 1: x₁ + 2x₃ = 0 ⇒ x₁ = -2. Row 2: x₂ + 3x₃ = 0 ⇒ x₂ = -3."
      }, {
        label: "COMPUTATION",
        body: "(B) (-2, -3, 1)."
      }, {
        label: "VERIFICATION",
        body: "A·(-2, -3, 1)ᵀ: row 1: -2 + 0 + 2 = 0. Row 2: 0 - 3 + 3 = 0. ✓"
      }],
      gateCheck: "Set free = 1, solve for pivot vars.",
      speed: "30s.",
      whatMadeHard: "Sign tracking.",
      generalization: "Same algorithm.",
      linkedConcept: "C4.8 RREF.",
      negAdvisory: "Attempt: substitute. (B) wins."
    }
  }, {
    id: "c46-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Two Free Vars"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For RREF ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & 0 & 1 \\\\ 0 & 0 & 1 & 3 \\\\ 0 & 0 & 0 & 0 \\end{pmatrix}"
    }), ", a basis of N(A) is:"),
    options: ["{(-2, 1, 0, 0), (-1, 0, -3, 1)}", "{(2, 1, 0, 0), (1, 0, 3, 1)}", "{(-2, 1, 0, 0)} only", "Empty"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Free vars x₂, x₄. Two basis vectors."
    }, {
      label: "Key step",
      text: "Set x₂ = 1, x₄ = 0: x₁ = -2, x₃ = 0. → (-2, 1, 0, 0). Set x₂ = 0, x₄ = 1: x₁ = -1, x₃ = -3. → (-1, 0, -3, 1)."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Multi-free RREF → null basis."
      }, {
        label: "KEY STEP",
        body: "Free: x₂, x₄. Two basis vectors.\nBasis 1: x₂ = 1, x₄ = 0. Row 1: x₁ + 2 = 0 ⇒ x₁ = -2. Row 2: x₃ = 0. → (-2, 1, 0, 0).\nBasis 2: x₂ = 0, x₄ = 1. Row 1: x₁ + 1 = 0 ⇒ x₁ = -1. Row 2: x₃ + 3 = 0 ⇒ x₃ = -3. → (-1, 0, -3, 1)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Each vector kills the matrix."
      }],
      gateCheck: "One basis vector per free variable.",
      speed: "60s.",
      whatMadeHard: "Sign tracking.",
      generalization: "Same.",
      linkedConcept: "C4.8.",
      negAdvisory: "Attempt: compute each. (A) wins."
    }
  }, {
    id: "c46-m2",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 50,
    tags: ["Free Vars in RREF"],
    statement: /*#__PURE__*/React.createElement("span", null, "For RREF with pivots in cols 1, 3 and total 5 columns, the number of free variables is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Free cols: those without pivots."
    }, {
      label: "Key step",
      text: "Free: 2, 4, 5 → 3 free."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free count."
      }, {
        label: "KEY STEP",
        body: "Pivots at 1, 3 → 2 pivots → free at 2, 4, 5 → 3 free."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "5 - 2 = 3 ✓."
      }],
      gateCheck: "n - pivots.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.1."
    }
  }, {
    id: "c46-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 75,
    tags: ["Sign Reading"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "From RREF row (1, -2, 3, 0, -1), with cols 2, 4, 5 free, the basis vector for x\u2082 = 1 (others free = 0) has x\u2081 = ___."),
    options: ["2", "-2", "1", "-1"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "x₁ - 2·1 = 0 ⇒ x₁ = 2."
    }, {
      label: "Key step",
      text: "2."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Set x₂ = 1, free others = 0, solve x₁ from row."
      }, {
        label: "KEY STEP",
        body: "Row: 1·x₁ + (-2)·x₂ + 3·x₃ + 0·x₄ + (-1)·x₅ = 0. Free: x₄ = x₅ = 0. Pivot: x₃ from another row, but for x₂ = 1, focus on x₁: x₁ - 2(1) = 0 ⇒ x₁ = 2."
      }, {
        label: "COMPUTATION",
        body: "(A) 2."
      }, {
        label: "VERIFICATION",
        body: "Sign flip: -2·(1) = -2, move to right: x₁ = 2."
      }],
      gateCheck: "Set free var = 1, sign flip the coefficient.",
      speed: "20s.",
      whatMadeHard: "Sign.",
      generalization: "Same.",
      linkedConcept: "C4.6.",
      negAdvisory: "Attempt: arithmetic. (A) wins."
    }
  }, {
    id: "c46-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["Null Basis Dim"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 3 \xD7 5 RREF with 2 pivots, the null space has dimension ___ and a basis of ___ vectors."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Dim = nullity = 5 - 2 = 3."
    }, {
      label: "Key step",
      text: "3."
    }, {
      label: "Near-complete",
      text: "3 (dim and basis count are both 3)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free count = basis size."
      }, {
        label: "KEY STEP",
        body: "Free = 3. Basis has 3 vectors."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Each free var → one basis vector."
      }],
      gateCheck: "Free = basis count.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Same.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c46-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 95,
    tags: ["Reconstruction"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If the null space of A has basis ", (1, 1, 0, 0, 0, 1), ", the RREF of A must be:"),
    options: ["[[1, -1, 0]]", "[[1, 0, 0], [0, 0, 1]]", "Cannot be determined without rank.", "Always 3×3 identity."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Null basis (1, 1, 0): x₁ + x₂ = 0 → x₁ = -x₂. RREF row: (1, -1, 0)."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Single relation x₁ = -x₂; free vars x₂, x₃."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Reverse direction: given null basis, find RREF row(s)."
      }, {
        label: "KEY STEP",
        body: "The RREF rows must be orthogonal to every null basis vector.\nLet the unique RREF row be (a, b, c). Then:\n(a, b, c) · (1, 1, 0) = a + b = 0 ⇒ a = −b.\n(a, b, c) · (0, 0, 1) = c = 0.\nSet a = 1: row = (1, −1, 0)."
      }, {
        label: "COMPUTATION",
        body: "Answer (A) — RREF row is (1, −1, 0)."
      }, {
        label: "VERIFICATION",
        body: "(1, −1, 0) · (1, 1, 0) = 1 − 1 + 0 = 0 ✓. (1, −1, 0) · (0, 0, 1) = 0 ✓."
      }],
      gateCheck: "Null basis → row dependencies.",
      speed: "60s.",
      whatMadeHard: "Reverse direction.",
      generalization: "Same.",
      linkedConcept: "C4.8.",
      negAdvisory: "Attempt: structure. (A) wins."
    }
  }, {
    id: "c46-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["Full Reading"],
    statement: /*#__PURE__*/React.createElement("span", null, "For RREF ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 0 & 2 & 1 \\\\ 0 & 1 & -1 & 3 \\\\ 0 & 0 & 0 & 0 \\end{pmatrix}"
    }), ", the (2, 4) entry of the basis vector for x\u2084 = 1 (others = 0) is ___."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Basis vector for x₄ = 1: (-1, -3, 0, 1)."
    }, {
      label: "Key step",
      text: "Position 4 in vector = 1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Free variable contribution = 1 in its own slot."
      }, {
        label: "KEY STEP",
        body: "Free variables are x₃ and x₄. Set x₄ = 1 and x₃ = 0; solve for pivot variables.\nRow 1: x₁ + 2x₃ + x₄ = 0 ⇒ x₁ = −2(0) − 1(1) = −1.\nRow 2: x₂ − x₃ + 3x₄ = 0 ⇒ x₂ = 0 − 3(1) = −3.\nBasis vector: (−1, −3, 0, 1)."
      }, {
        label: "COMPUTATION",
        body: "Position 4 of (−1, −3, 0, 1) = 1."
      }, {
        label: "VERIFICATION",
        body: "By construction, the free variable that is set to 1 always appears as 1 in its slot of the corresponding basis vector."
      }],
      gateCheck: "Free var slot has value 1.",
      speed: "20s.",
      whatMadeHard: "Setup.",
      generalization: "Same.",
      linkedConcept: "C4.6."
    }
  }, {
    id: "c46-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 140,
    tags: ["KILLER", "Synthesis"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " A matrix A has N(A) with basis ", (1, -1, 0, 0, 0, 1, -1, 0, 0, 0, 1, -1), ". Then A must be:"),
    options: ["1 × 4 matrix [1, 1, 1, 1].", "Any matrix with row space = span{(1, 1, 1, 1)}.", "Cannot be determined.", "Identity matrix."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Each null basis vector is orthogonal to every row."
    }, {
      label: "Key step",
      text: "Common orthogonal direction is (1, 1, 1, 1) (check dot products = 0)."
    }, {
      label: "Near-complete",
      text: "(B) — any matrix with row space exactly span{(1,1,1,1)}."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Null space ↔ row space orthogonality."
      }, {
        label: "KEY STEP",
        body: "row(A) = N(A)⊥. dim N(A) = 3 → dim row(A) = 1 → A has rank 1.\nFind common orthogonal to {(1,-1,0,0), (0,1,-1,0), (0,0,1,-1)}: Let v = (a, b, c, d). v·(1,-1,0,0) = a - b = 0 → a = b. v·(0,1,-1,0) = b - c = 0 → b = c. v·(0,0,1,-1) = c - d = 0 → c = d. So v = (a, a, a, a) = a·(1, 1, 1, 1). Row space = span{(1,1,1,1)}."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "A could be (1, 1, 1, 1) or (2, 2, 2, 2) etc. — any non-zero scalar multiple."
      }],
      gateCheck: "Null space basis ⊥ row space.",
      speed: "Orthogonal computation: 90s.",
      whatMadeHard: "Identifying common ⊥ direction.",
      generalization: "Same.",
      linkedConcept: "M8 Four Subspaces.",
      negAdvisory: "Attempt: orthogonality. (B) wins."
    }
  }];
  const C46_TECHNIQUES = [{
    name: "Null Basis from RREF",
    type: "Speed Shortcut",
    when: "Need basis of N(A).",
    steps: ["Identify free cols from RREF.", "For each free col: set that var = 1, all other free = 0.", "Back-substitute for pivot vars (sign-flip RREF coefficients).", "Resulting vector is one basis vector."],
    speed: "30-60s.",
    example: "Standard.",
    danger: "Sign flips.",
    freq: "Very Frequent"
  }, {
    name: "Free Var Count = Basis Size",
    type: "Speed Shortcut",
    when: "Counting null basis size.",
    steps: ["Count free cols = nullity = basis size."],
    speed: "5s.",
    example: "Standard.",
    danger: "Don't include pivot cols.",
    freq: "Frequent"
  }];
  const C46_MISTAKES = [{
    name: "Sign Errors in Null Basis",
    wrong: ["Problem: Find null basis from RREF row (1, 2, 3) with col 3 free.", "Solution: Set x₃ = 1. x₁ = 2(0) + 3 = 3, x₂ = 0. → (3, 0, 1)."],
    errorLine: 0,
    errorDescription: "Sign flip needed: x₁ + 3 = 0 → x₁ = -3.",
    rootCause: "Forgetting to move RREF coefficient to RHS.",
    correct: "(-3, 0, 1).",
    prevention: "Always sign-flip when moving.",
    gateCost: "2-mark error.",
    frequency: "Very Common"
  }];
  const C46_PYQS = [];
  function ConceptLab46({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 6,
      title: "Multiple Free Variables \u2014 Null Basis from RREF",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "RREF tells you everything about N(A). Each free variable gives one basis vector. Master the sign-flip back-sub algorithm."),
      patterns: C46_PATTERNS,
      problems: C46_PROBLEMS,
      techniques: C46_TECHNIQUES,
      mistakes: C46_MISTAKES,
      pyqs: C46_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.7 — SOLUTION THEORY (HIGHEST YIELD + 5 PYQs + KILLER)
     ════════════════════════════════════════════════════════════════ */
  const C47_PATTERNS = [{
    name: "For what k: no / unique / infinite?",
    surface: "Parametric system. Asked for k values giving each of: no sol, unique sol, infinitely many.",
    testing: "Whether you can do case analysis on (rank A, rank [A|b]) as functions of k.",
    signals: ["\"for what value of k\"", "\"the system has no solution / unique / infinite\""],
    firstMove: "Form symbolic [A|b]. Row reduce. Each parametric row gives a condition.",
    timeBudget: 120,
    frequency: "Very Frequent"
  }, {
    name: "Rank Comparison Protocol",
    surface: "System given. Asked solution count without further qualification.",
    testing: "rank match → consistent. rank = n → unique. rank < n → infinite.",
    signals: ["\"how many solutions\""],
    firstMove: "Compute both ranks. Apply protocol.",
    timeBudget: 50,
    frequency: "Very Frequent"
  }, {
    name: "Trap: rank Match ≠ Unique",
    surface: "Asked under what conditions Ax = b has unique solution.",
    testing: "Trap: 'rank(A) = rank([A|b]) is sufficient for unique solution' — FALSE.",
    signals: ["\"is sufficient for unique\""],
    firstMove: "Need ALSO rank = n. Rank match alone only gives consistency.",
    timeBudget: 40,
    frequency: "Frequent"
  }, {
    name: "Number-of-Solutions Counting Trap",
    surface: "Linear system with parameter — count exact integer solutions.",
    testing: "Linear systems have 0, 1, or ∞ solutions. NEVER a finite > 1 count.",
    signals: ["\"how many solutions exist\""],
    firstMove: "Eliminate 'finite > 1' option immediately.",
    timeBudget: 20,
    frequency: "Frequent"
  }];
  const C47_PROBLEMS = [{
    id: "c47-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Sol Count"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A linear system in \u211D\u207F can have:"),
    options: ["0, 1, or 2 solutions only.", "0, 1, or infinitely many solutions.", "Always at least 1 solution.", "Any finite number of solutions."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Linear sol set: empty, single point, or affine subspace."
    }, {
      label: "Key step",
      text: "0, 1, or ∞."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sol set structure."
      }, {
        label: "KEY STEP",
        body: "Linear sol set = empty (no sol), single point (unique), or k-dim affine subspace (infinitely many for k ≥ 1)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Never 2, 7, or any finite >1."
      }],
      gateCheck: "Linear: 0, 1, ∞ only.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.5.",
      negAdvisory: "Attempt: theorem. (B) wins."
    }
  }, {
    id: "c47-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["Protocol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "rank(A) = rank([A|b]) is:"),
    options: ["Sufficient for unique solution.", "Sufficient for consistency (at least one solution).", "Sufficient for infinite solutions.", "Not related to existence of solution."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Rank match = consistency. Unique requires also rank = n."
    }, {
      label: "Key step",
      text: "Consistency only."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank comparison — only existence."
      }, {
        label: "KEY STEP",
        body: "rank(A) = rank([A|b]) ⇔ b ∈ col(A) ⇔ system consistent. Uniqueness needs additional rank = n condition."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Distractor (A) is the canonical TRAP."
      }],
      gateCheck: "Match → consistency only.",
      speed: "Direct.",
      whatMadeHard: "Trap (A).",
      generalization: "Universal.",
      linkedConcept: "C4.7 Trap.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c47-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Parametric Sol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For 2x + y = 3, 4x + 2y = k, the system has infinitely many solutions iff:"),
    options: ["k = 6", "k = 3", "k ≠ 6", "All k"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "R₂ = 2·R₁ for A. Need R₂(augmented) = 2·R₁(augmented) too."
    }, {
      label: "Key step",
      text: "k = 2·3 = 6."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Dependent rows: consistency condition on b."
      }, {
        label: "KEY STEP",
        body: "(4, 2 | k) = 2·(2, 1 | 3) requires k = 6. At k = 6: rank 1 < n = 2 → infinite. At k ≠ 6: inconsistent."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "At k = 6: x + y/2 = 1.5, single eq with 2 unknowns → 1D family."
      }],
      gateCheck: "Dependent rows + b matches → infinite.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.5.",
      negAdvisory: "Attempt: structure. (A) wins."
    }
  }, {
    id: "c47-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Parametric No Sol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For x + 2y = 1, 2x + 4y = k, the system has NO solution iff:"),
    options: ["k = 2", "k ≠ 2", "k = 1", "All k"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "R₂ = 2·R₁ for A. Consistency needs k = 2."
    }, {
      label: "Key step",
      text: "k ≠ 2 → no solution."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Parametric inconsistency."
      }, {
        label: "KEY STEP",
        body: "Coefficient rows parallel. Consistent only if RHS also matches: k = 2. Else: no sol."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "At k = 3: x + 2y = 1 and x + 2y = 1.5 — contradiction."
      }],
      gateCheck: "Parallel rows, non-matching RHS → inconsistent.",
      speed: "20s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.5.",
      negAdvisory: "Attempt: structure. (B) wins."
    }
  }, {
    id: "c47-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Unique Sol"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For the system 2x + 3y = 5, 4x + 6y = k, the system has unique solution iff:"),
    options: ["k = 10", "k ≠ 10", "Never (rows are parallel)", "Always"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Parallel rows → rank A = 1 < n = 2. Never unique."
    }, {
      label: "Key step",
      text: "Never."
    }, {
      label: "Near-complete",
      text: "(C)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Detect rank < n always — never unique."
      }, {
        label: "KEY STEP",
        body: "(4, 6) = 2·(2, 3). rank A = 1 always. n = 2. Unique would need rank = n = 2. Never."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Distractors (A), (B) incorrectly suggest some k gives unique. They give either infinite or none."
      }],
      gateCheck: "Detect structural impossibility.",
      speed: "30s.",
      whatMadeHard: "Trap of (A), (B).",
      generalization: "Same.",
      linkedConcept: "C4.7.",
      negAdvisory: "Attempt: structural. (C) wins."
    }
  }, {
    id: "c47-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 110,
    tags: ["Parametric Full"],
    skipSignal: {
      type: "skip",
      text: "Skip if <65%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For x + y + z = 1, x + 2y + 3z = 2, x + 4y + 9z = k\xB2, the system is inconsistent iff:"),
    options: ["k² = 4", "k² ≠ 4", "k² = 1", "Never (always consistent)"],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "A is 3×3. Check det(A)."
    }, {
      label: "Key step",
      text: "det = (2-1)(4-1) - (3-1) ... compute carefully. A = [[1,1,1],[1,2,3],[1,4,9]] — Vandermonde, det = (2-1)(4-1)(4-2) = 1·3·2 = 6 ≠ 0."
    }, {
      label: "Near-complete",
      text: "(D). Always unique (and consistent) regardless of k."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Vandermonde det non-zero → invertible → always unique sol for any RHS."
      }, {
        label: "KEY STEP",
        body: "A = Vandermonde(1, 2, 3). det = (2-1)(3-1)(3-2) = 1·2·1 = 2 ≠ 0. A invertible → unique sol for ANY k²."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "Square invertible → unique always."
      }],
      gateCheck: "Vandermonde with distinct gen points → invertible.",
      speed: "30s.",
      whatMadeHard: "Vandermonde recognition.",
      generalization: "Same.",
      linkedConcept: "C2.2 Vandermonde.",
      negAdvisory: "Attempt: structural. (D) wins."
    }
  }, {
    id: "c47-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["Three Cases"],
    skipSignal: {
      type: "skip",
      text: "Skip if <70%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For x + y = 2, ax + y = b, the values of (a, b) for which the system has NO solution are:"),
    options: ["a = 1, b ≠ 2.", "a = 1, b = 2.", "a ≠ 1.", "Cannot determine."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Rows parallel when a = 1. Consistency needs b = 2 then."
    }, {
      label: "Key step",
      text: "a = 1 and b ≠ 2 → no sol."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Case analysis."
      }, {
        label: "KEY STEP",
        body: "If a ≠ 1: det ≠ 0, unique sol for any b. If a = 1: rows (1, 1) and (1, 1) parallel. Consistency needs RHS match: b = 2. b ≠ 2 → no sol."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "a = 1, b = 5: x + y = 2 and x + y = 5 — contradiction."
      }],
      gateCheck: "Full case analysis.",
      speed: "60s.",
      whatMadeHard: "Two conditions combined.",
      generalization: "Same.",
      linkedConcept: "C4.7.",
      negAdvisory: "Attempt: case. (A) wins."
    }
  }, {
    id: "c47-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 110,
    tags: ["Parametric Reduce"],
    statement: /*#__PURE__*/React.createElement("span", null, "For the system 2x + y - z = 1, x + 2y + kz = 0, the smallest non-negative integer k for which the system has a non-trivial null space (extending to 3 unknowns: x, y, z) is ___."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "2 × 3 system always has nullity ≥ 1."
    }, {
      label: "Key step",
      text: "rank ≤ 2 always for 2×3, so nullity ≥ 1 for ALL k."
    }, {
      label: "Near-complete",
      text: "k = 0 (smallest non-neg)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Non-trivial null space = nullity > 0."
      }, {
        label: "KEY STEP",
        body: "A is 2 × 3 → rank ≤ 2 < 3 = n → nullity ≥ 1 ALWAYS. So any k works, including k = 0."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "For any 2×3 matrix, nullity ≥ 1 since rank ≤ min(2, 3) = 2 < 3."
      }],
      gateCheck: "Underdetermined → nullity > 0.",
      speed: "10s.",
      whatMadeHard: "Recognizing it's always true.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c47-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 180,
    tags: ["KILLER", "5x3 Parametric"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " The 5 \xD7 3 system ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 1 & 1 \\\\ 1 & 2 & 4 \\\\ 1 & 3 & 9 \\\\ 1 & 4 & 16 \\\\ 1 & 5 & k \\end{pmatrix} \\mathbf{x} = \\begin{pmatrix} 0 \\\\ 0 \\\\ 0 \\\\ 0 \\\\ 0 \\end{pmatrix}"
    }), " has non-trivial solutions iff k = ___."),
    options: ["k = 25 only", "Trivial solution only for every k (no non-trivial exists)", "k ≠ 25", "Always non-trivial regardless of k"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Non-trivial null ⇔ rank(A) < n = 3 (n = number of unknowns)."
    }, {
      label: "Key step",
      text: "Examine rank just from the first FOUR rows: V(1, 2, 3, 4) is a 4 × 3 Vandermonde with distinct generators, so it has full column rank = 3."
    }, {
      label: "Near-complete",
      text: "Adding row 5 cannot DECREASE rank. So rank(A) = 3 for every k ⇒ nullity = 0 ⇒ only the trivial solution exists for any k."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Homogeneous 5×3 system — non-trivial null ⇔ rank < 3 (rank-nullity)."
      }, {
        label: "KEY STEP",
        body: "First 4 rows form V(1, 2, 3, 4), a 4 × 3 Vandermonde matrix. Distinct generators ⇒ full column rank 3. Adding a 5th row can only INCREASE or keep rank — never decrease. So rank(A) = 3 for all k."
      }, {
        label: "COMPUTATION",
        body: "rank(A) = 3 = n always ⇒ nullity = 0 ⇒ only trivial solution. Answer: (B)."
      }, {
        label: "VERIFICATION",
        body: "Trap: the value k = 25 makes row 5 equal to the Vandermonde extension (1, 5, 25), which keeps the matrix Vandermonde-shaped but rank stays 3 — that affects which rows are dependent on others, not the column rank."
      }],
      gateCheck: "Adding rows never decreases rank. Look at the existing rank floor first.",
      speed: "60s.",
      whatMadeHard: "Trap: students compute when row 5 is dependent on rows 1–4 and pick k = 25. But row-dependence doesn't change COLUMN rank.",
      generalization: "Overdetermined homogeneous system with full column rank ⇒ only trivial solution.",
      linkedConcept: "C4.3 Rank invariance, C4.4 Rank-Nullity.",
      negAdvisory: "Attempt: (A) is the classic trap. (B) is correct."
    }
  }];
  const C47_TECHNIQUES = [{
    name: "Rank Comparison Protocol",
    type: "Structural Insight",
    when: "Determining sol count.",
    steps: ["Compute rank(A), rank([A|b]).", "Mismatch → no solution.", "Match + rank = n → unique.", "Match + rank < n → infinitely many."],
    speed: "30s.",
    example: "Universal.",
    danger: "Skip rank = n check leads to wrong 'unique'.",
    freq: "Very Frequent"
  }, {
    name: "Three-Case Parametric Analysis",
    type: "Structural Insight",
    when: "Parametric system asked for all 3 cases.",
    steps: ["Symbolic row reduction.", "Find k values for rank drops.", "At each, check consistency separately.", "Tabulate: no sol / unique / infinite."],
    speed: "120s.",
    example: "See problems above.",
    danger: "Forgetting case at boundary.",
    freq: "Very Frequent"
  }];
  const C47_MISTAKES = [{
    name: "Rank Match Sufficient for Unique TRAP",
    wrong: ["Problem: rank(A) = rank([A|b]) implies unique sol.", "Solution: True — by rank comparison."],
    errorLine: 0,
    errorDescription: "Rank match only gives CONSISTENCY. Unique requires also rank = n.",
    rootCause: "Half-remembering the protocol.",
    correct: "Need BOTH rank match AND rank = n.",
    prevention: "Memorize: 'match AND full' for unique.",
    gateCost: "Catastrophic — 2-mark + neg.",
    frequency: "Very Common"
  }, {
    name: "Reporting 'Two Solutions'",
    wrong: ["Problem: How many solutions does the system have?", "Solution: Two."],
    errorLine: 0,
    errorDescription: "Linear systems have 0, 1, or infinite. Never finite > 1.",
    rootCause: "Confusing with quadratic systems.",
    correct: "0, 1, or ∞ only.",
    prevention: "Memorize.",
    gateCost: "Direct error.",
    frequency: "Common"
  }];
  const C47_PYQS = [{
    year: "GATE-Style A",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE Solution Theory PYQ.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For x + y + z = 6, 2x + 3y + z = 11, 3x + ky + z = k\xB2, determine k such that the system has NO solution."),
    solution: [{
      label: "REDUCE",
      body: "R₂ → R₂ − 2R₁: (0, 1, −1 | −1).\nR₃ → R₃ − 3R₁: (0, k−3, −2 | k²−18).\nR₃ → R₃ − (k−3)R₂: (0, 0, (k−3)−2 | k²−18 + (k−3)) = (0, 0, k−5 | k² + k − 21)."
    }, {
      label: "CASE ANALYSIS",
      body: "No solution ⇔ rank A < rank [A|b] ⇔ the last row reads 0 = (non-zero).\nThis requires k − 5 = 0 AND k² + k − 21 ≠ 0.\nAt k = 5: coefficient is 0, augmented entry = 25 + 5 − 21 = 9 ≠ 0. ✓ So at k = 5 the row reads 0 = 9 — INCONSISTENT."
    }, {
      label: "ANSWER",
      body: "k = 5 gives no solution. For k ≠ 5, the system has a unique solution."
    }, {
      label: "TRAP",
      body: "Don't ask for infinite solutions: at the candidate k = 5 the augmented entry is non-zero, so we get inconsistency, not infinite. Always check BOTH coefficient and augmented column after the reduction."
    }]
  }, {
    year: "GATE-Style B",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "For what k does the system kx + y = 0, x + ky = 0 have only the trivial solution?")),
    solution: [{
      label: "RECOGNIZE",
      body: "Homogeneous. Trivial only ⇔ det ≠ 0."
    }, {
      label: "DET",
      body: "det = k² - 1."
    }, {
      label: "ANSWER",
      body: "k ≠ ±1."
    }, {
      label: "TRAP",
      body: "At k = ±1: rank 1, non-trivial null space."
    }]
  }, {
    year: "GATE-Style C",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "For x + 2y + 3z = 1, x + 2y + 3z = k (note: same LHS!), the system has:")),
    solution: [{
      label: "RECOGNIZE",
      body: "Same row, different RHS."
    }, {
      label: "ANALYZE",
      body: "At k = 1: same equation; rank 1, nullity 2. Infinite sols. At k ≠ 1: contradiction; no sol."
    }, {
      label: "ANSWER",
      body: "Infinite if k = 1, none otherwise."
    }, {
      label: "TRAP",
      body: "Detect identical LHS quickly."
    }]
  }, {
    year: "GATE-Style D",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "For x + y + z = 1, ax + by + cz = d, when does the system have unique solution?")),
    solution: [{
      label: "ANALYZE",
      body: "2 equations, 3 unknowns. rank ≤ 2 < 3 always. Never unique."
    }, {
      label: "ANSWER",
      body: "Never."
    }, {
      label: "TRAP",
      body: "Underdetermined never has unique sol."
    }]
  }, {
    year: "GATE-Style E",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "For 5 \xD7 3 system Ax = b, the system has at most how many solutions?")),
    solution: [{
      label: "ANALYZE",
      body: "0 (overdetermined often inconsistent), 1 (rank 3 + match), or ∞ (rank < 3 + match)."
    }, {
      label: "ANSWER",
      body: "0, 1, or ∞."
    }, {
      label: "TRAP",
      body: "Don't say 'finite > 1'."
    }]
  }];
  function ConceptLab47({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 7,
      title: "Solution Theory \u2014 The Single Highest-Yield Topic in M4",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "The Rank Comparison Protocol + Three-Case Parametric Analysis = 80% of M4 exam marks. 5 PYQ walkthroughs train both directions: given system \u2192 count, given conditions \u2192 solve for k. Trap of 'rank match = unique' must be memorized as FALSE."),
      patterns: C47_PATTERNS,
      problems: C47_PROBLEMS,
      techniques: C47_TECHNIQUES,
      mistakes: C47_MISTAKES,
      pyqs: C47_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 4.8 — RREF (BONUS)
     ════════════════════════════════════════════════════════════════ */
  const C48_PATTERNS = [{
    name: "RREF Uniqueness Recognition",
    surface: "Asked if RREF is unique.",
    testing: "Yes — RREF is unique for a given matrix.",
    signals: ["\"unique\""],
    firstMove: "RREF unique by theorem.",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Null Space Algorithm from RREF",
    surface: "Compute null basis from RREF.",
    testing: "Apply sign-flip back-sub for each free var.",
    signals: ["\"null space basis\""],
    firstMove: "Free var = 1, others 0, solve pivots.",
    timeBudget: 60,
    frequency: "Very Frequent"
  }, {
    name: "RREF Structure Properties",
    surface: "Asked properties of RREF: leading 1s, zeros above pivots, etc.",
    testing: "RREF requirements: pivots = 1, only non-zero in their col is the pivot, pivots move right going down, zero rows at bottom.",
    signals: ["\"properties of RREF\""],
    firstMove: "Memorize the 4 properties.",
    timeBudget: 20,
    frequency: "Frequent"
  }];
  const C48_PROBLEMS = [{
    id: "c48-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["RREF Definition"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which of the following is TRUE about RREF?"),
    options: ["RREF is unique for each matrix.", "RREF is not unique.", "RREF exists only for square matrices.", "RREF requires matrix to be invertible."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "RREF uniqueness theorem."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Unique."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "RREF theorem."
      }, {
        label: "KEY STEP",
        body: "RREF is unique (Hermite normal form for matrices over ℝ)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "REF is not unique; RREF is."
      }],
      gateCheck: "RREF unique.",
      speed: "Direct.",
      whatMadeHard: "Distinguish from REF.",
      generalization: "Universal.",
      linkedConcept: "C4.1.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c48-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["RREF Properties"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which property is NOT required for a matrix to be in RREF?"),
    options: ["Pivots are 1.", "Above each pivot are zeros.", "Determinant is non-zero.", "Zero rows at the bottom."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "RREF properties: 1s pivots, zeros above and below, staircase, zero rows bottom. Det doesn't enter."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "Det isn't a RREF requirement."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "RREF requirements."
      }, {
        label: "KEY STEP",
        body: "RREF: leading 1s, zeros above pivots in same col, staircase, zero rows at bottom. Det is unrelated."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Zero matrix in RREF has det = 0 — still RREF."
      }],
      gateCheck: "Det not a RREF requirement.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.1.",
      negAdvisory: "Attempt: definition. (C) wins."
    }
  }, {
    id: "c48-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Null Basis"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "From RREF ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 0 & 2 & 1 \\\\ 0 & 1 & 0 & 3 \\end{pmatrix}"
    }), ", the null basis is:"),
    options: ["{(-2, 0, 1, 0), (-1, -3, 0, 1)}", "{(2, 0, -1, 0), (1, 3, 0, -1)}", "{(1, 0, 0, 0), (0, 0, 1, 0)}", "Empty (only trivial)"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Free: x₃, x₄. Two basis vectors."
    }, {
      label: "Key step",
      text: "x₃ = 1, x₄ = 0: x₁ = -2, x₂ = 0 → (-2, 0, 1, 0). x₃ = 0, x₄ = 1: x₁ = -1, x₂ = -3 → (-1, -3, 0, 1)."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sign-flip algorithm."
      }, {
        label: "KEY STEP",
        body: "Free: x₃, x₄.\nBasis 1: x₃ = 1, x₄ = 0. Row 1: x₁ + 2 = 0 ⇒ x₁ = -2. Row 2: x₂ = 0. → (-2, 0, 1, 0).\nBasis 2: x₃ = 0, x₄ = 1. Row 1: x₁ + 1 = 0 ⇒ x₁ = -1. Row 2: x₂ + 3 = 0 ⇒ x₂ = -3. → (-1, -3, 0, 1)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Each vector kills both rows."
      }],
      gateCheck: "Sign-flip from RREF.",
      speed: "60s.",
      whatMadeHard: "Sign tracking.",
      generalization: "Universal.",
      linkedConcept: "C4.6.",
      negAdvisory: "Attempt: algorithm. (A) wins."
    }
  }, {
    id: "c48-m2",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Pivot Count"],
    statement: /*#__PURE__*/React.createElement("span", null, "The RREF of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 \\\\ 2 & 4 \\\\ 3 & 6 \\end{pmatrix}"
    }), " has ___ pivots."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "All rows are scalar multiples of (1, 2). Rank 1."
    }, {
      label: "Key step",
      text: "1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Compute rank from inspection."
      }, {
        label: "KEY STEP",
        body: "Rows: (1, 2), 2·(1, 2), 3·(1, 2). All parallel. RREF: [[1, 2], [0, 0], [0, 0]]. 1 pivot."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "rank 1."
      }],
      gateCheck: "Inspect for dependent rows first.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Same.",
      linkedConcept: "C4.3."
    }
  }, {
    id: "c48-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["RREF Identification"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which of the following is in RREF?"),
    options: ["[[2, 0, 1], [0, 1, 3]]", "[[1, 2, 0], [0, 1, 3]]", "[[1, 0, 2], [0, 1, 3]]", "[[0, 0, 1], [1, 0, 0]]"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Check 4 RREF rules: pivots = 1, zeros above, staircase, zero rows at bottom."
    }, {
      label: "Key step",
      text: "(C) satisfies all."
    }, {
      label: "Near-complete",
      text: "(A): pivot is 2, not 1. (B): col 2 has both pivot (1) and another non-zero (2). (D): not staircase. (C): OK."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Verify each property."
      }, {
        label: "KEY STEP",
        body: "(C): pivots at (1,1) and (2,2), both = 1. Zeros above pivots. Staircase. No zero rows. ✓\n(A): pivot (1,1) = 2 ≠ 1.\n(B): col 2 has (1,2) = 2 above pivot — violates 'zeros above pivot'.\n(D): pivot in row 1 is at col 3; row 2 pivot at col 1 — not staircase."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Apply each property."
      }],
      gateCheck: "All 4 properties required.",
      speed: "30s.",
      whatMadeHard: "Property checking.",
      generalization: "Same.",
      linkedConcept: "C4.1.",
      negAdvisory: "Attempt: rule check. (C) wins."
    }
  }, {
    id: "c48-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Same RREF"],
    skipSignal: {
      type: "skip",
      text: "Skip if <65%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Two matrices A and B have the same RREF iff:"),
    options: ["Same row space.", "Same column space.", "Both A and B are square.", "Same rank only."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Row ops preserve row space. RREF is canonical row-space representative."
    }, {
      label: "Key step",
      text: "Same row space ⇔ same RREF."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "RREF = canonical for row space."
      }, {
        label: "KEY STEP",
        body: "Row ops preserve row(A). RREF is unique canonical form for row spaces. So A, B have same RREF ⇔ same row(A)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Same rank alone insufficient: many matrices with rank 2 have different RREFs."
      }],
      gateCheck: "RREF ↔ row space.",
      speed: "Concept: 30s.",
      whatMadeHard: "Distinguishing rank from row space.",
      generalization: "Universal.",
      linkedConcept: "C4.8.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c48-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 95,
    tags: ["RREF Computation"],
    statement: /*#__PURE__*/React.createElement("span", null, "The (1, 3) entry of the RREF of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 & 3 \\\\ 2 & 4 & 7 \\\\ 3 & 6 & 10 \\end{pmatrix}"
    }), " is ___."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Reduce to RREF and read (1, 3)."
    }, {
      label: "Key step",
      text: "R₂ - 2R₁: (0, 0, 1). R₃ - 3R₁: (0, 0, 1). R₃ - R₂: (0, 0, 0). R₁ - 3R₂: (1, 2, 0). RREF: [[1, 2, 0], [0, 0, 1], [0, 0, 0]]."
    }, {
      label: "Near-complete",
      text: "0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Full RREF reduction."
      }, {
        label: "KEY STEP",
        body: "Reduce: R₂ → R₂ - 2R₁: (0, 0, 1). R₃ → R₃ - 3R₁: (0, 0, 1). R₃ → R₃ - R₂: (0, 0, 0).\nMatrix: [[1, 2, 3], [0, 0, 1], [0, 0, 0]].\nClear above pivot in col 3: R₁ → R₁ - 3·R₂: (1, 2, 0).\nFinal RREF: [[1, 2, 0], [0, 0, 1], [0, 0, 0]]. (1, 3) = 0."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "Pivot col 3 should have only (2, 3) = 1, rest 0."
      }],
      gateCheck: "RREF cleans above pivots too.",
      speed: "60s.",
      whatMadeHard: "Above-pivot cleanup.",
      generalization: "Same.",
      linkedConcept: "C4.8."
    }
  }, {
    id: "c48-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["RREF Uniqueness"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Two distinct row operations on A both lead to the same RREF. This implies:"),
    options: ["RREF depends on order.", "RREF is unique regardless of operation order.", "Mistakes were made.", "Cannot happen."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "RREF uniqueness theorem."
    }, {
      label: "Key step",
      text: "Same RREF regardless of path."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "RREF unique theorem."
      }, {
        label: "KEY STEP",
        body: "Theorem: RREF is unique. Different sequences of legal row ops lead to the same RREF."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Intermediate REF can differ; final RREF is canonical."
      }],
      gateCheck: "RREF unique.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.8.",
      negAdvisory: "Attempt: theorem. (B) wins."
    }
  }, {
    id: "c48-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 140,
    tags: ["KILLER", "RREF + Null"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " If A has RREF = ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & 0 & 3 \\\\ 0 & 0 & 1 & 4 \\\\ 0 & 0 & 0 & 0 \\end{pmatrix}"
    }), ", the dimension of col(A) + dim(N(A)) = ___."),
    options: ["4", "5", "3", "6"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Rank-nullity: rank + nullity = n."
    }, {
      label: "Key step",
      text: "rank = 2, nullity = 4 - 2 = 2. Sum = 4."
    }, {
      label: "Near-complete",
      text: "(A). This IS the rank-nullity theorem stated differently!"
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "rank-nullity disguised."
      }, {
        label: "KEY STEP",
        body: "rank(A) = 2 (two pivots). dim(col(A)) = rank = 2. dim(N(A)) = nullity = n - rank = 4 - 2 = 2. Sum = 4 = n."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Rank-nullity in disguise: dim(col) + dim(null) = n always."
      }],
      gateCheck: "Rank + nullity = n = #columns.",
      speed: "20s.",
      whatMadeHard: "Recognizing the disguise.",
      generalization: "Universal.",
      linkedConcept: "C4.4.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }];
  const C48_TECHNIQUES = [{
    name: "Null Space from RREF Algorithm",
    type: "Speed Shortcut",
    when: "Need basis of N(A) from RREF.",
    steps: ["Identify free columns.", "For each free col j: set xⱼ = 1, others free = 0.", "Back-substitute: each pivot row gives one pivot var = (-RREF coefficient on xⱼ).", "Collect into vector. Repeat for each free col."],
    speed: "60s.",
    example: "Universal.",
    danger: "Sign flips.",
    freq: "Very Frequent"
  }, {
    name: "RREF Property Check (4 rules)",
    type: "Verification Method",
    when: "Verifying a matrix is in RREF.",
    steps: ["(1) Pivots = 1.", "(2) Only non-zero in pivot col is the pivot itself.", "(3) Pivots staircase right going down.", "(4) Zero rows at bottom."],
    speed: "Per matrix: 20s.",
    example: "Standard.",
    danger: "All 4 must hold.",
    freq: "Frequent"
  }];
  const C48_MISTAKES = [{
    name: "Missing 'Zeros Above Pivots' in RREF",
    wrong: ["Problem: Is [[1, 2, 0], [0, 1, 3]] in RREF?", "Solution: Pivots are 1 at (1,1) and (2,2). Looks like RREF."],
    errorLine: 0,
    errorDescription: "Col 2 has (1, 2) at top — should be 0 above pivot.",
    rootCause: "Forgetting rule (2).",
    correct: "Not in RREF. RREF would clean (1, 2) → 0: row 1 becomes (1, 0, -6).",
    prevention: "Memorize all 4 rules.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }];
  const C48_PYQS = [];
  function ConceptLab48({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 8,
      title: "RREF (Bonus) \u2014 Unique Canonical Form + 4-Subspace Recipe",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "RREF is the unique canonical form. It IS the algorithm for: extract null basis, identify col(A) basis, identify row(A) basis, characterize rank."),
      patterns: C48_PATTERNS,
      problems: C48_PROBLEMS,
      techniques: C48_TECHNIQUES,
      mistakes: C48_MISTAKES,
      pyqs: C48_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     APP ROOT
     ════════════════════════════════════════════════════════════════ */
  const CONCEPTS_MAP = [{
    num: 1,
    shortName: "Echelon",
    title: "Echelon Form & Pivots",
    total: C41_PROBLEMS.length,
    Comp: ConceptLab41
  }, {
    num: 2,
    shortName: "Gauss",
    title: "Gaussian Elimination",
    total: C42_PROBLEMS.length,
    Comp: ConceptLab42
  }, {
    num: 3,
    shortName: "Rank",
    title: "Rank of a Matrix",
    total: C43_PROBLEMS.length,
    Comp: ConceptLab43
  }, {
    num: 4,
    shortName: "Rank-Nullity",
    title: "Rank-Nullity Theorem",
    total: C44_PROBLEMS.length,
    Comp: ConceptLab44
  }, {
    num: 5,
    shortName: "Solve Ax=b",
    title: "Solving Ax = b",
    total: C45_PROBLEMS.length,
    Comp: ConceptLab45
  }, {
    num: 6,
    shortName: "Free Vars",
    title: "Multiple Free Variables",
    total: C46_PROBLEMS.length,
    Comp: ConceptLab46
  }, {
    num: 7,
    shortName: "Sol Theory",
    title: "Solution Theory",
    total: C47_PROBLEMS.length,
    Comp: ConceptLab47
  }, {
    num: 8,
    shortName: "RREF",
    title: "RREF (Bonus)",
    total: C48_PROBLEMS.length,
    Comp: ConceptLab48
  }];
  function App() {
    useEffect(() => {
      hideLoading();
    }, []);
    const progress41 = useConceptProgress(1, C41_PROBLEMS.length);
    const progress42 = useConceptProgress(2, C42_PROBLEMS.length);
    const progress43 = useConceptProgress(3, C43_PROBLEMS.length);
    const progress44 = useConceptProgress(4, C44_PROBLEMS.length);
    const progress45 = useConceptProgress(5, C45_PROBLEMS.length);
    const progress46 = useConceptProgress(6, C46_PROBLEMS.length);
    const progress47 = useConceptProgress(7, C47_PROBLEMS.length);
    const progress48 = useConceptProgress(8, C48_PROBLEMS.length);
    const progressMap = {
      1: progress41,
      2: progress42,
      3: progress43,
      4: progress44,
      5: progress45,
      6: progress46,
      7: progress47,
      8: progress48
    };
    const [active, setActive] = useState(1);
    const totalSolved = [progress41, progress42, progress43, progress44, progress45, progress46, progress47, progress48].reduce((s, p) => s + p.correct.length, 0);
    const totalProblems = [C41_PROBLEMS, C42_PROBLEMS, C43_PROBLEMS, C44_PROBLEMS, C45_PROBLEMS, C46_PROBLEMS, C47_PROBLEMS, C48_PROBLEMS].reduce((s, ps) => s + ps.length, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen"
    }, /*#__PURE__*/React.createElement(TopNav, {
      currentModule: 4
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
    }), " MODULE 4 \xB7 PROBLEM LAB"), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, "Echelon, Rank & Solution Theory", /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, "The Highest-Yield GATE Topic")), /*#__PURE__*/React.createElement("p", {
      className: "text-lg max-w-3xl leading-relaxed mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "8 concept labs covering parametric rank, rank-nullity, the Rank Comparison Protocol, RREF, and the full solution-theory case analysis. Includes 4 PYQ walkthroughs on Rank (1994/2002/2014/2019), 5 PYQ walkthroughs on Solution Theory, and a KILLER on ker(T) for T: \u211D\u2075 \u2192 \u211D\xB3."), /*#__PURE__*/React.createElement("div", {
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
    }, "8 concept labs \xB7 72 problems \xB7 9 GATE PYQs \xB7 timed drill mode")), /*#__PURE__*/React.createElement("div", {
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
    }, "Outer product rank, rank inequalities, Rank Comparison Protocol"))))), /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto px-5"
    }, /*#__PURE__*/React.createElement(ConceptNavigator, {
      concepts: CONCEPTS_MAP,
      active: active,
      setActive: setActive,
      progressMap: progressMap
    })), /*#__PURE__*/React.createElement(ConceptLab41, {
      progress: progress41
    }), /*#__PURE__*/React.createElement(ConceptLab42, {
      progress: progress42
    }), /*#__PURE__*/React.createElement(ConceptLab43, {
      progress: progress43
    }), /*#__PURE__*/React.createElement(ConceptLab44, {
      progress: progress44
    }), /*#__PURE__*/React.createElement(ConceptLab45, {
      progress: progress45
    }), /*#__PURE__*/React.createElement(ConceptLab46, {
      progress: progress46
    }), /*#__PURE__*/React.createElement(ConceptLab47, {
      progress: progress47
    }), /*#__PURE__*/React.createElement(ConceptLab48, {
      progress: progress48
    }), /*#__PURE__*/React.createElement(ModuleFooter, {
      moduleNum: 4,
      nextModuleTitle: "Determinants \u2014 Problem Lab",
      nextModuleFile: "module-05-problem-lab.html",
      checklist: ["I apply rank-nullity using n (columns / domain dim) — never m or codomain.", "I recognize uvᵀ has rank 1 (when u, v non-zero) instantly.", "I use the Rank Comparison Protocol: match → consistent, rank = n → unique.", "I never claim rank match alone implies unique solution.", "I solve parametric 'for what k' problems via symbolic row reduction.", "I read null basis from RREF using the sign-flip back-sub algorithm.", "I distinguish REF (not unique) from RREF (unique).", "I've cleared all 72 problems and beaten my drill personal-best per concept."]
    }));
  }
  mountApp(App);
})();