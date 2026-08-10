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

/* ===== MODULE 5 CONTENT ===== */

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

  const MODULE_NUM = 5;

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
      }, "C5.", c.num), /*#__PURE__*/React.createElement("span", {
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
    }, "PROBLEM LAB \xB7 CONCEPT 5.", num), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, "Module 5 \xB7 Determinants"), /*#__PURE__*/React.createElement("span", {
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
     CONCEPT 5.1 — WHAT det REALLY IS (Signed Volume / Sign Meaning)
     ════════════════════════════════════════════════════════════════ */
  const C51_PATTERNS = [{
    name: "det = Signed Volume",
    surface: "Geometric interpretation asked.",
    testing: "Whether you know det(A) = signed n-volume of parallelepiped spanned by columns.",
    signals: ["\"geometric meaning of determinant\""],
    firstMove: "det = volume × sign (orientation).",
    timeBudget: 25,
    frequency: "Occasional"
  }, {
    name: "Sign Flip Under Row Swap",
    surface: "After swapping two rows, what happens to det?",
    testing: "det multiplied by -1.",
    signals: ["\"after swapping\""],
    firstMove: "Sign flips: det(B) = -det(A).",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Singular ⇔ det = 0 ⇔ Volume 0",
    surface: "Asked when det = 0 geometrically.",
    testing: "Whether you know det = 0 ⇔ columns linearly dependent ⇔ volume 0 (degenerate parallelepiped).",
    signals: ["\"det = 0\"", "\"degenerate volume\""],
    firstMove: "det = 0 ⇔ columns dependent ⇔ matrix singular.",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "Linear Map Volume Scaling",
    surface: "T: ℝⁿ → ℝⁿ with matrix A. Asked how T scales volumes.",
    testing: "Whether you know any region's volume scales by |det A|.",
    signals: ["\"volume of T(region)\"", "\"linear map scales by\""],
    firstMove: "T scales every n-volume by |det A|.",
    timeBudget: 25,
    frequency: "Occasional"
  }];
  const C51_PROBLEMS = [{
    id: "c51-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["det Sign"],
    statement: /*#__PURE__*/React.createElement("span", null, "If ", /*#__PURE__*/React.createElement(T, {
      src: "\\det(A) = 7"
    }), " and B is obtained from A by swapping two rows, then ", /*#__PURE__*/React.createElement(T, {
      src: "\\det(B)"
    }), " = ___."),
    answer: -7,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Row swap flips sign of det."
    }, {
      label: "Key step",
      text: "-7."
    }, {
      label: "Near-complete",
      text: "-7."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Row swap property."
      }, {
        label: "KEY STEP",
        body: "det(B) = -det(A) = -7."
      }, {
        label: "COMPUTATION",
        body: "-7."
      }, {
        label: "VERIFICATION",
        body: "Universal: any single row swap flips sign."
      }],
      gateCheck: "Row swap → sign flip.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c51-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Geometric"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For a 2\xD72 matrix A, |det(A)| equals:"),
    options: ["Sum of column lengths.", "Area of parallelogram spanned by columns.", "Product of trace and det.", "Length of longest column."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "2D det = signed area."
    }, {
      label: "Key step",
      text: "Parallelogram area."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Geometric interpretation 2D."
      }, {
        label: "KEY STEP",
        body: "|det| = area of parallelogram with column-vector sides."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Same for rows."
      }],
      gateCheck: "2D det = area.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "n-D: |det| = n-volume.",
      linkedConcept: "C5.1.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c51-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Scaling"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Linear map T: \u211D\xB3 \u2192 \u211D\xB3 with matrix A has det(A) = 5. T maps a unit cube to a region of volume:"),
    options: ["1", "5", "25", "125"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Volume scaled by |det A|."
    }, {
      label: "Key step",
      text: "1 × 5 = 5."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Volume scaling factor = |det A|."
      }, {
        label: "KEY STEP",
        body: "Original volume 1. Mapped volume = 1·|det A| = 5."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Sign of det = orientation; volume = magnitude."
      }],
      gateCheck: "Volume scales by |det|.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.1.",
      negAdvisory: "Attempt: scaling. (B) wins."
    }
  }, {
    id: "c51-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Sign Meaning"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If det(A) ", "<", " 0, the linear map T (with matrix A) on \u211D\xB3:"),
    options: ["Preserves orientation.", "Reverses orientation.", "Doesn't preserve volumes.", "Has no inverse."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Negative det = orientation reversal."
    }, {
      label: "Key step",
      text: "Reverses."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sign of det."
      }, {
        label: "KEY STEP",
        body: "det > 0: orientation preserved. det < 0: reversed (mirror)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Reflection has det = -1."
      }],
      gateCheck: "Sign = orientation.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.1.",
      negAdvisory: "Attempt: sign. (B) wins."
    }
  }, {
    id: "c51-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Compute det 2x2"],
    statement: /*#__PURE__*/React.createElement("span", null, "The area of the parallelogram spanned by columns of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 3 & 1 \\\\ 2 & 4 \\end{pmatrix}"
    }), " is ___."),
    answer: 10,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Area = |det A| = |3·4 - 1·2| = 10."
    }, {
      label: "Key step",
      text: "10."
    }, {
      label: "Near-complete",
      text: "10."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "2D area = |det|."
      }, {
        label: "KEY STEP",
        body: "det = 3·4 - 1·2 = 12 - 2 = 10. |det| = 10."
      }, {
        label: "COMPUTATION",
        body: "10."
      }, {
        label: "VERIFICATION",
        body: "Parallelogram with sides (3, 2) and (1, 4) has area 10."
      }],
      gateCheck: "2x2 area formula.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c51-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Equivalences"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For square A, det(A) = 0 is equivalent to:"),
    options: ["A has linearly dependent columns.", "A is singular.", "Volume of parallelepiped spanned by columns is 0.", "All of the above."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Equivalent conditions for det = 0."
    }, {
      label: "Key step",
      text: "All three."
    }, {
      label: "Near-complete",
      text: "(D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Equivalence chain."
      }, {
        label: "KEY STEP",
        body: "det = 0 ⇔ singular ⇔ columns dependent ⇔ rank < n ⇔ volume 0 ⇔ no inverse."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "All standard equivalences."
      }],
      gateCheck: "Memorize.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: theorem. (D) wins."
    }
  }, {
    id: "c51-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["3D Volume"],
    statement: /*#__PURE__*/React.createElement("span", null, "The volume of parallelepiped with column vectors (1, 0, 0), (1, 1, 0), (1, 1, 1) is ___."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Volume = |det| of column matrix."
    }, {
      label: "Key step",
      text: "Triangular with diag 1, 1, 1. det = 1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "3D volume = |det|."
      }, {
        label: "KEY STEP",
        body: "A = [[1, 1, 1], [0, 1, 1], [0, 0, 1]]. Upper triangular. det = 1·1·1 = 1."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "Unit cube transformed by shears — volume preserved."
      }],
      gateCheck: "Triangular det shortcut.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c51-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Volume Scaling"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "T : \u211D\xB2 \u2192 \u211D\xB2 has det 2. T maps a triangle of area 5 to area:"),
    options: ["10", "5", "2.5", "Cannot determine without triangle's shape"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Linear map scales ALL areas uniformly by |det|."
    }, {
      label: "Key step",
      text: "5 × 2 = 10."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Volume scaling factor."
      }, {
        label: "KEY STEP",
        body: "ANY 2D region's area scaled by |det| = 2. 5 × 2 = 10."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Independent of shape — only depends on det."
      }],
      gateCheck: "Scaling factor universal.",
      speed: "Direct.",
      whatMadeHard: "Distractor (D) tempts.",
      generalization: "Universal.",
      linkedConcept: "C5.1.",
      negAdvisory: "Attempt: factor. (A) wins."
    }
  }, {
    id: "c51-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 110,
    tags: ["KILLER", "Composition"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " If T\u2081 has det 3 and T\u2082 has det -2, the composition T\u2082 \u2218 T\u2081 has det = ___ and changes orientation = ___."),
    options: ["det = -6, reverses orientation.", "det = 1, preserves.", "det = 6, preserves.", "det = -6, preserves orientation."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "det(AB) = det(A)·det(B). Negative product → orientation flip."
    }, {
      label: "Key step",
      text: "3·(-2) = -6. Sign negative → reversed."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Multiplication of dets."
      }, {
        label: "KEY STEP",
        body: "det(T₂T₁) = det(T₂)·det(T₁) = (-2)·3 = -6. Negative → orientation reversed."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Each map separately: T₁ preserves (det > 0), T₂ reverses (det < 0). Composition: net reversal."
      }],
      gateCheck: "det of product = product of dets.",
      speed: "20s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2 Det of products.",
      negAdvisory: "Attempt: rule. (A) wins."
    }
  }];
  const C51_TECHNIQUES = [{
    name: "Volume-as-|det| Reflex",
    type: "Structural Insight",
    when: "Geometric volume/area question.",
    steps: ["Identify matrix with sides as columns.", "|det| = volume."],
    speed: "Direct.",
    example: "Parallelogram area = |det|.",
    danger: "Sign matters for orientation.",
    freq: "Occasional"
  }, {
    name: "Row Op → det Rule",
    type: "Speed Shortcut",
    when: "Determinant after row operation.",
    steps: ["Swap: det negates.", "Scale by c: det multiplied by c.", "Add multiple of row: det unchanged."],
    speed: "Direct.",
    example: "Standard.",
    danger: "Don't confuse rules.",
    freq: "Frequent"
  }];
  const C51_MISTAKES = [{
    name: "Ignoring Sign Under Swap",
    wrong: ["Problem: det A = 5. After row swap, det = ?", "Solution: Still 5 (row ops don't change det)."],
    errorLine: 0,
    errorDescription: "Swap negates det.",
    rootCause: "Forgetting row swap is special.",
    correct: "-5.",
    prevention: "Memorize 3 row op rules.",
    gateCost: "Sign error.",
    frequency: "Common"
  }];
  const C51_PYQS = [];
  function ConceptLab51({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 1,
      title: "What det Really Is \u2014 Signed Volume + Sign Meaning",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Geometric intuition first. det = signed volume scaling factor for linear maps. Sign of det = orientation. det = 0 \u21D4 degenerate \u21D4 singular."),
      patterns: C51_PATTERNS,
      problems: C51_PROBLEMS,
      techniques: C51_TECHNIQUES,
      mistakes: C51_MISTAKES,
      pyqs: C51_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 5.2 — COMPUTING DETERMINANTS (HIGH YIELD + 6 PYQs)
     ════════════════════════════════════════════════════════════════ */
  const C52_PATTERNS = [{
    name: "Property Chain (no expansion)",
    surface: "Det asked, but matrix has structure (zero row, scalar-multiple rows, triangular, etc.).",
    testing: "Solve via PROPERTIES, not expansion.",
    signals: ["\"find the determinant\""],
    firstMove: "Inspect for: triangular, zero row, equal rows, scalar multiples. Apply property; avoid expansion.",
    timeBudget: 30,
    frequency: "Very Frequent"
  }, {
    name: "Row Op → det Property",
    surface: "Given matrix and operation, asked new det.",
    testing: "Swap: ×(-1). Scale row by c: ×c. Add multiple of row: ×1 (unchanged).",
    signals: ["\"after applying R₂ → 2R₂\"", "\"swapping rows\""],
    firstMove: "Apply the rule per operation.",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "det(cA) for n×n",
    surface: "Scalar multiply entire matrix.",
    testing: "det(cA) = cⁿ · det(A).",
    signals: ["\"det(cA)\""],
    firstMove: "Use cⁿ. NEVER c·det(A) (wrong by factor of cⁿ⁻¹).",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Triangular Det Shortcut",
    surface: "Triangular matrix (upper or lower).",
    testing: "det = product of diagonal.",
    signals: ["\"upper triangular\"", "\"diagonal entries\""],
    firstMove: "Multiply diagonal. Done.",
    timeBudget: 10,
    frequency: "Frequent"
  }, {
    name: "det(A - λI) = 0 → Eigenvalue Disguise",
    surface: "Asked for λ making det vanish.",
    testing: "Whether you recognize this is the characteristic equation = eigenvalues.",
    signals: ["\"det(A - λI) = 0\""],
    firstMove: "Eigenvalue equation. Solve for λ.",
    timeBudget: 60,
    frequency: "Frequent"
  }, {
    name: "det(AB) = det(A)·det(B)",
    surface: "Det of product asked.",
    testing: "Product rule.",
    signals: ["\"det(AB)\""],
    firstMove: "Multiply individual dets.",
    timeBudget: 10,
    frequency: "Frequent"
  }];
  const C52_PROBLEMS = [{
    id: "c52-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 20,
    tags: ["Triangular Det"],
    statement: /*#__PURE__*/React.createElement("span", null, "The determinant of ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 3 & 1 & 5 \\\\ 0 & 2 & 7 \\\\ 0 & 0 & 4 \\end{pmatrix}"
    }), " is ___."),
    answer: 24,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Upper triangular: det = product of diagonal."
    }, {
      label: "Key step",
      text: "3·2·4 = 24."
    }, {
      label: "Near-complete",
      text: "24."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Upper triangular shortcut."
      }, {
        label: "KEY STEP",
        body: "det = 3·2·4 = 24."
      }, {
        label: "COMPUTATION",
        body: "24."
      }, {
        label: "VERIFICATION",
        body: "All off-diagonal entries don't matter for triangular."
      }],
      gateCheck: "Triangular det.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c52-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["det(cA)"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 matrix A with det(A) = 4, det(2A) = ___."),
    answer: 32,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "det(cA) = cⁿ · det A. n = 3."
    }, {
      label: "Key step",
      text: "2³ · 4 = 32."
    }, {
      label: "Near-complete",
      text: "32."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "det(cA) rule."
      }, {
        label: "KEY STEP",
        body: "det(2A) = 2³ · det(A) = 8 · 4 = 32."
      }, {
        label: "COMPUTATION",
        body: "32."
      }, {
        label: "VERIFICATION",
        body: "Each row scaled by 2 → factor 2 per row → 2³ total for 3×3."
      }],
      gateCheck: "cⁿ NOT c.",
      speed: "5s.",
      whatMadeHard: "Forgetting cⁿ.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c52-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Property Chain"],
    statement: /*#__PURE__*/React.createElement("span", null, "The determinant of ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & 3 \\\\ 2 & 4 & 6 \\\\ 7 & 8 & 9 \\end{pmatrix}"
    }), " is ___."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "R₂ = 2·R₁ → dependent rows."
    }, {
      label: "Key step",
      text: "0."
    }, {
      label: "Near-complete",
      text: "0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Spot dependent rows."
      }, {
        label: "KEY STEP",
        body: "Row 2 = 2·Row 1. Dependent → det = 0."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "No need for cofactor expansion."
      }],
      gateCheck: "Dependent rows → det 0.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c52-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 75,
    tags: ["Row Op"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If det(A) = 5 and B is obtained from A by (i) swapping rows 1 and 2, then (ii) multiplying row 3 by 3, then (iii) multiplying row 1 by 2. Find det(B)."),
    options: ["30", "-30", "5", "-5"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Track each operation's effect on det: swap × (−1), scale row by c × c, add multiple × 1."
    }, {
      label: "Key step",
      text: "Swap: × (−1). Scale row 3 by 3: × 3. Scale row 1 by 2: × 2. Net multiplier: (−1)·3·2 = −6."
    }, {
      label: "Near-complete",
      text: "det(B) = 5 · (−6) = −30."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sequential row operations — multiply the per-op multipliers."
      }, {
        label: "KEY STEP",
        body: "Start: det(A) = 5.\n(i) Swap R₁ ↔ R₂: det × (−1) → −5.\n(ii) Scale R₃ by 3: det × 3 → −15.\n(iii) Scale R₁ by 2: det × 2 → −30."
      }, {
        label: "COMPUTATION",
        body: "det(B) = −30. Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Per-op rules: swap (×−1), scale (×c), add multiple of one row to another (×1, no change)."
      }],
      gateCheck: "Multiply per-op multipliers; track sign carefully.",
      speed: "30s.",
      whatMadeHard: "Sign tracking through 3 ops.",
      generalization: "Universal.",
      linkedConcept: "C5.2.",
      negAdvisory: "Attempt: rules. (B) wins."
    }
  }, {
    id: "c52-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Cofactor 3x3"],
    statement: /*#__PURE__*/React.createElement("span", null, "The determinant of ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & -1 \\\\ 3 & 0 & 2 \\\\ 1 & 1 & 1 \\end{pmatrix}"
    }), " is ___."),
    answer: -7,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Cofactor expansion along row 1 (or any row/col)."
    }, {
      label: "Key step",
      text: "1·(0 - 2) - 2·(3 - 2) + (-1)·(3 - 0) = -2 - 2 - 3 = -7."
    }, {
      label: "Near-complete",
      text: "-7."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "3x3 cofactor expansion."
      }, {
        label: "KEY STEP",
        body: "Expand row 1:\n1·det[[0, 2],[1, 1]] - 2·det[[3, 2],[1, 1]] + (-1)·det[[3, 0],[1, 1]]\n= 1·(0 - 2) - 2·(3 - 2) - (3 - 0)\n= -2 - 2 - 3 = -7."
      }, {
        label: "COMPUTATION",
        body: "-7."
      }, {
        label: "VERIFICATION",
        body: "Sarrus' rule for 3x3 gives same answer."
      }],
      gateCheck: "Alternate signs +, -, + along expansion.",
      speed: "60s.",
      whatMadeHard: "Sign tracking in cofactors.",
      generalization: "Universal.",
      linkedConcept: "C5.2."
    }
  }, {
    id: "c52-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Det Product"],
    statement: /*#__PURE__*/React.createElement("span", null, "If det(A) = 3, det(B) = -2, both 4\xD74, then det(2A\xB7B\u207B\xB9) = ___."),
    answer: -24,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "det(2A·B⁻¹) = 2⁴·det(A)·1/det(B) = 16·3·(-1/2) = -24."
    }, {
      label: "Key step",
      text: "-24."
    }, {
      label: "Near-complete",
      text: "-24."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Det product and inverse rules."
      }, {
        label: "KEY STEP",
        body: "det(2A·B⁻¹) = det(2A) · det(B⁻¹) = 2⁴·det(A)·(1/det(B)) = 16·3·(-1/2) = -24."
      }, {
        label: "COMPUTATION",
        body: "-24."
      }, {
        label: "VERIFICATION",
        body: "Use det(B⁻¹) = 1/det(B); det(cA) = cⁿ det A."
      }],
      gateCheck: "Combine multiple rules.",
      speed: "30s.",
      whatMadeHard: "Combining.",
      generalization: "Universal.",
      linkedConcept: "C5.3."
    }
  }, {
    id: "c52-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Eigenvalue Disguise"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}"
    }), ", the values of \u03BB for which det(A - \u03BBI) = 0 are:"),
    options: ["1, 3", "2, 4", "0, 4", "1, 2"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Characteristic equation: (2-λ)² - 1 = 0."
    }, {
      label: "Key step",
      text: "λ² - 4λ + 3 = 0 → λ = 1, 3."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Eigenvalue equation."
      }, {
        label: "KEY STEP",
        body: "det(A - λI) = det[[2-λ, 1],[1, 2-λ]] = (2-λ)² - 1 = λ² - 4λ + 3 = (λ-1)(λ-3) = 0."
      }, {
        label: "COMPUTATION",
        body: "λ = 1, 3. (A)."
      }, {
        label: "VERIFICATION",
        body: "Sum = 4 = trace, product = 3 = det. ✓"
      }],
      gateCheck: "Characteristic equation.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "M6 Eigenvalues.",
      negAdvisory: "Attempt: formula. (A) wins."
    }
  }, {
    id: "c52-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Det Properties"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For square matrices A, B of same size, which is ALWAYS true?"),
    options: ["det(A + B) = det(A) + det(B).", "det(AB) = det(A)·det(B).", "det(A) = trace(A).", "All of the above."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Only product rule is universal."
    }, {
      label: "Key step",
      text: "(A) false. (C) false. (B) true."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Standard properties recall."
      }, {
        label: "KEY STEP",
        body: "(A) det(A+B) ≠ det A + det B generally. (B) det(AB) = det(A)·det(B) — universal. (C) det ≠ trace."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Counterexample for (A): A = I, B = I, det(2I) = 2ⁿ ≠ 1 + 1 = 2."
      }],
      gateCheck: "Product rule only.",
      speed: "Direct.",
      whatMadeHard: "Distractor (A).",
      generalization: "Universal.",
      linkedConcept: "C5.2.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c52-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 180,
    tags: ["KILLER", "Polynomial Entries"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For ", /*#__PURE__*/React.createElement(T, {
      src: "A(\\lambda) = \\begin{pmatrix} 1-\\lambda & 3 \\\\ 4 & 2-\\lambda \\end{pmatrix}"
    }), ", the values of \u03BB for which det(A) = 0 are:"),
    options: ["1, 2", "−2, 5", "−5, 2", "All real"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Expand det as a polynomial in λ, then factor."
    }, {
      label: "Key step",
      text: "det = (1−λ)(2−λ) − 3·4 = λ² − 3λ + 2 − 12 = λ² − 3λ − 10."
    }, {
      label: "Near-complete",
      text: "λ² − 3λ − 10 = (λ − 5)(λ + 2) = 0 ⇒ λ = 5 or λ = −2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Polynomial entries → polynomial det. This is exactly the characteristic polynomial of [[1, 3], [4, 2]]."
      }, {
        label: "KEY STEP",
        body: "det(A) = (1 − λ)(2 − λ) − (3)(4) = (2 − 3λ + λ²) − 12 = λ² − 3λ − 10."
      }, {
        label: "COMPUTATION",
        body: "λ² − 3λ − 10 = (λ − 5)(λ + 2). Roots: λ = 5, −2. Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Vieta's: sum of roots = 3 = trace ✓. Product = −10 = det([[1, 3], [4, 2]]) = 2 − 12 = −10 ✓."
      }],
      gateCheck: "λ-matrix det → char poly of constant matrix.",
      speed: "60s.",
      whatMadeHard: "Algebra and factoring.",
      generalization: "Same for any λ-matrix arising from A − λI.",
      linkedConcept: "M6 Char poly, Eigenvalues.",
      negAdvisory: "Attempt: factor the quadratic. (B) wins."
    }
  }];
  const C52_TECHNIQUES = [{
    name: "Property Chain Technique",
    type: "Speed Shortcut",
    when: "Det asked but matrix has structural features.",
    steps: ["Check for triangular → product of diagonal.", "Check for dependent rows → det 0.", "Check for zero row → det 0.", "Reduce using row ops (carefully tracking sign / scaling).", "Only fall back to cofactor expansion if no structure exists."],
    speed: "Often 5-20s.",
    example: "Triangular 4x4 in 5 seconds.",
    danger: "Don't expand mindlessly.",
    freq: "Very Frequent"
  }, {
    name: "det(cA) = cⁿ det(A)",
    type: "Speed Shortcut",
    when: "Whole matrix scaled.",
    steps: ["Use exponent = size n."],
    speed: "Direct.",
    example: "det(3·A) for 4x4 with det 2: 3⁴·2 = 162.",
    danger: "NOT c·det A.",
    freq: "Frequent"
  }, {
    name: "Triangular Shortcut",
    type: "Speed Shortcut",
    when: "Upper or lower triangular matrix.",
    steps: ["Multiply diagonal."],
    speed: "5s.",
    example: "5x5 triangular in 5s.",
    danger: "Doesn't apply to non-triangular.",
    freq: "Frequent"
  }, {
    name: "Sarrus Rule (3x3 ONLY)",
    type: "Speed Shortcut",
    when: "3x3 matrix needs det.",
    steps: ["Down-diagonals minus up-diagonals.", "ONLY for 3x3."],
    speed: "30s.",
    example: "Standard.",
    danger: "DOES NOT WORK for 4x4 or larger.",
    freq: "Frequent"
  }, {
    name: "Det Product Rule",
    type: "Speed Shortcut",
    when: "Det of product.",
    steps: ["det(AB) = det(A)·det(B).", "det(A⁻¹) = 1/det(A).", "det(Aⁿ) = (det A)ⁿ.", "det(Aᵀ) = det(A)."],
    speed: "Direct.",
    example: "Standard.",
    danger: "det(A+B) ≠ det A + det B.",
    freq: "Very Frequent"
  }];
  const C52_MISTAKES = [{
    name: "det(cA) = c·det(A) Error",
    wrong: ["Problem: 3x3 matrix with det 5. Find det(2A).", "Solution: 2·5 = 10."],
    errorLine: 0,
    errorDescription: "det(cA) = cⁿ det A, not c·det A. Forgot exponent n=3.",
    rootCause: "Linear-scaling fallacy.",
    correct: "2³·5 = 40.",
    prevention: "ALWAYS cⁿ for n×n.",
    gateCost: "Wrong answer by factor cⁿ⁻¹.",
    frequency: "Very Common"
  }, {
    name: "Sarrus on 4x4",
    wrong: ["Problem: det of 4x4 matrix.", "Solution: Apply Sarrus' rule (diagonals)."],
    errorLine: 0,
    errorDescription: "Sarrus' rule works ONLY for 3x3.",
    rootCause: "Generalizing rule incorrectly.",
    correct: "Use cofactor expansion or row reduction for 4x4+.",
    prevention: "Sarrus = 3x3 only sticker.",
    gateCost: "Wrong answer.",
    frequency: "Common"
  }, {
    name: "det(A + B) = det(A) + det(B) Error",
    wrong: ["Problem: A, B with det 3 and 5. Find det(A + B).", "Solution: 8."],
    errorLine: 0,
    errorDescription: "Det is NOT linear in matrices.",
    rootCause: "Treating det like a linear function.",
    correct: "Cannot determine without A, B explicitly.",
    prevention: "Only DET PRODUCT rule holds.",
    gateCost: "Major conceptual.",
    frequency: "Common"
  }];
  const C52_PYQS = [{
    year: "2001-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE CS 2001 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For 3x3 matrix A with det 6, the value of det(2A\u207B\xB9) is ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Combine cⁿ and inverse rules."
    }, {
      label: "APPLY",
      body: "det(2A⁻¹) = 2³·(1/det A) = 8/6 = 4/3."
    }, {
      label: "ANSWER",
      body: "4/3."
    }]
  }, {
    year: "2005-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE CS 2005 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "If A is a 3x3 matrix and rank(A) = 2, then det(A) is ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Rank-det relationship."
    }, {
      label: "APPLY",
      body: "Singular ⇔ rank < n ⇔ det = 0."
    }, {
      label: "ANSWER",
      body: "0."
    }]
  }, {
    year: "2011-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE CS 2011 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For the matrix ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 9 \\end{pmatrix}"
    }), ", det = ?"),
    solution: [{
      label: "RECOGNIZE",
      body: "Arithmetic progression rows → rank 2 → det 0."
    }, {
      label: "VERIFY",
      body: "R₂ - R₁ = R₃ - R₂ = (3, 3, 3). Dependent."
    }, {
      label: "ANSWER",
      body: "0."
    }]
  }, {
    year: "2015-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE CS 2015 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For 2x2 A with det 4 and B with det 5, det(A\xB2B\xB3) = ___."),
    solution: [{
      label: "RECOGNIZE",
      body: "Power rule."
    }, {
      label: "APPLY",
      body: "det(A²) = 4² = 16. det(B³) = 5³ = 125. Product = 16·125 = 2000."
    }, {
      label: "ANSWER",
      body: "2000."
    }]
  }, {
    year: "2017-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE CS 2017 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For square matrices A, B of same size, which is true?"),
    solution: [{
      label: "RECOGNIZE",
      body: "Product rule only."
    }, {
      label: "ANSWER",
      body: "det(AB) = det(A)·det(B). Universal."
    }]
  }, {
    year: "2020-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(Representative GATE CS 2020 pattern.)"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "If det(A) = 0, then Cramer's rule:"),
    solution: [{
      label: "RECOGNIZE",
      body: "Cramer trap."
    }, {
      label: "EXPLAIN",
      body: "Cramer formula has det(A) in denominator. Cannot apply when det = 0."
    }, {
      label: "ANSWER",
      body: "Does not apply; system inconsistent or has infinite solutions."
    }]
  }];
  function ConceptLab52({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 2,
      title: "Computing Determinants \u2014 The Property Chain Technique",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "HIGHEST-yield computation in M5. Use properties first (triangular, dependent rows, zero rows), expansion last. PYQs span 2001-2020 \u2014 same patterns recur."),
      patterns: C52_PATTERNS,
      problems: C52_PROBLEMS,
      techniques: C52_TECHNIQUES,
      mistakes: C52_MISTAKES,
      pyqs: C52_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 5.3 — MATRIX INVERSE
     ════════════════════════════════════════════════════════════════ */
  const C53_PATTERNS = [{
    name: "2x2 Inverse Formula",
    surface: "2x2 matrix, find inverse.",
    testing: "Apply A⁻¹ = (1/det A)·[[d, -b], [-c, a]].",
    signals: ["\"inverse of\""],
    firstMove: "Swap diagonal, negate off-diagonal, divide by det.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "Verify-By-Multiplication",
    surface: "Asked if matrix is inverse.",
    testing: "Multiply candidates by A; check if = I.",
    signals: ["\"is the inverse of A\""],
    firstMove: "Multiply and compare to I — faster than computing inverse.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "AB = I ⇒ B = A⁻¹ Only If Square",
    surface: "Asked if one-sided inverse implies two-sided.",
    testing: "TRUE for square. FALSE for non-square.",
    signals: ["\"AB = I implies BA = I\""],
    firstMove: "Square: yes. Non-square: NO.",
    timeBudget: 20,
    frequency: "Occasional"
  }, {
    name: "Invertibility Equivalences",
    surface: "List equivalent conditions for invertibility.",
    testing: "Recall the chain: invertible ⇔ det ≠ 0 ⇔ rank = n ⇔ trivial null ⇔ unique sol always ⇔ columns independent.",
    signals: ["\"equivalent to A invertible\""],
    firstMove: "All equivalent for square.",
    timeBudget: 25,
    frequency: "Frequent"
  }];
  const C53_PROBLEMS = [{
    id: "c53-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 35,
    tags: ["2x2 Inverse"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The inverse of ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 2 & 1 \\\\ 1 & 1 \\end{pmatrix}"
    }), " is:"),
    options: ["[[1, -1], [-1, 2]]", "[[1, 1], [1, 2]]", "[[2, -1], [-1, 1]]", "Does not exist."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "det = 2 - 1 = 1. A⁻¹ = (1/det)·[[d, -b],[-c, a]] = [[1, -1], [-1, 2]]."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "[[1, -1], [-1, 2]]."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "2x2 formula."
      }, {
        label: "KEY STEP",
        body: "det = 2·1 - 1·1 = 1. Swap diagonal: (1, 2). Negate off: (-1, -1). Divide by det 1. Result: [[1, -1], [-1, 2]]."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "A·A⁻¹: [[2,1],[1,1]]·[[1,-1],[-1,2]] = [[2-1, -2+2],[1-1, -1+2]] = [[1, 0],[0, 1]] = I ✓."
      }],
      gateCheck: "2x2 formula reflex.",
      speed: "15s.",
      whatMadeHard: "Sign tracking.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: formula. (A) wins."
    }
  }, {
    id: "c53-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Invertibility"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which is equivalent to A being invertible (A square)?"),
    options: ["det(A) ≠ 0.", "rank(A) = n.", "Ax = 0 has only trivial solution.", "All of the above."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Big Equivalence Theorem."
    }, {
      label: "Key step",
      text: "All equivalent."
    }, {
      label: "Near-complete",
      text: "(D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Equivalences for square invertibility."
      }, {
        label: "KEY STEP",
        body: "Standard chain: invertible ⇔ det ≠ 0 ⇔ rank = n ⇔ trivial null ⇔ cols independent."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "All standard."
      }],
      gateCheck: "Memorize.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: theorem. (D) wins."
    }
  }, {
    id: "c53-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Verify Inverse"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Is ", /*#__PURE__*/React.createElement(T, {
      src: "B = \\begin{pmatrix} -1 & 2 \\\\ 1 & -1 \\end{pmatrix}"
    }), " the inverse of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 2 \\\\ 1 & 1 \\end{pmatrix}"
    }), "?"),
    options: ["Yes, AB = I.", "No, AB ≠ I.", "Cannot determine.", "Yes only if dimensions match."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Compute AB and check vs I."
    }, {
      label: "Key step",
      text: "AB = [[1·-1 + 2·1, 1·2 + 2·-1], [1·-1 + 1·1, 1·2 + 1·-1]] = [[1, 0], [0, 1]] = I."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Verify-by-mult."
      }, {
        label: "KEY STEP",
        body: "AB = [[1·(-1) + 2·1, 1·2 + 2·(-1)], [1·(-1) + 1·1, 1·2 + 1·(-1)]] = [[-1+2, 2-2], [-1+1, 2-1]] = [[1, 0], [0, 1]]."
      }, {
        label: "COMPUTATION",
        body: "(A) — AB = I."
      }, {
        label: "VERIFICATION",
        body: "For square, AB = I ⇔ BA = I, so B IS A⁻¹."
      }],
      gateCheck: "Multiply, check.",
      speed: "30s.",
      whatMadeHard: "Sign tracking.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: compute. (A) wins."
    }
  }, {
    id: "c53-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Inverse Properties"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "(AB)\u207B\xB9 = ___ (for invertible A, B same size)."),
    options: ["A⁻¹B⁻¹", "B⁻¹A⁻¹", "A⁻¹ + B⁻¹", "(AB)⁻¹ doesn't generally exist."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Inverse reverses order like transpose."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "B⁻¹A⁻¹."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Inverse-of-product rule."
      }, {
        label: "KEY STEP",
        body: "(AB)·(B⁻¹A⁻¹) = ABB⁻¹A⁻¹ = AIA⁻¹ = AA⁻¹ = I. So (AB)⁻¹ = B⁻¹A⁻¹."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Same reverse-order pattern as transpose."
      }],
      gateCheck: "Reverse order.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "(X₁X₂...Xₙ)⁻¹ = Xₙ⁻¹...X₂⁻¹X₁⁻¹.",
      linkedConcept: "C2.5.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c53-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["AB = I Non-Square"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 2\xD73 and B is 3\xD72 with AB = I\u2082, does it follow that BA = I\u2083?"),
    options: ["Yes, always.", "No, not necessarily.", "Only if B is square.", "Only if A is square."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Non-square matrices: one-sided inverse doesn't imply two-sided."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Non-square trap."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Square vs non-square inverse."
      }, {
        label: "KEY STEP",
        body: "For square: AB = I ⇔ BA = I. For non-square: AB = I (left inverse exists) doesn't imply BA = I."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "BA is 3×3 with rank ≤ 2 (since A has 2 rows), so BA can't be I₃ (which has rank 3)."
      }],
      gateCheck: "Non-square: one-sided only.",
      speed: "Concept: 30s.",
      whatMadeHard: "Counterintuitive.",
      generalization: "Square is special.",
      linkedConcept: "C2.5.",
      negAdvisory: "Attempt: structure. (B) wins."
    }
  }, {
    id: "c53-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["3x3 Inverse"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 2 & 0 \\\\ 0 & 0 & 3 \\end{pmatrix}"
    }), ", the (3, 3) entry of A\u207B\xB9 is ___."),
    answer: 0.3333,
    tolerance: 0.001,
    hints: [{
      label: "Conceptual redirect",
      text: "Diagonal: inverse is diag(1/aᵢᵢ)."
    }, {
      label: "Key step",
      text: "1/3."
    }, {
      label: "Near-complete",
      text: "0.3333."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Diagonal inverse."
      }, {
        label: "KEY STEP",
        body: "Diagonal: A⁻¹ = diag(1, 1/2, 1/3). (3, 3) = 1/3."
      }, {
        label: "COMPUTATION",
        body: "0.3333."
      }, {
        label: "VERIFICATION",
        body: "A·A⁻¹ = I."
      }],
      gateCheck: "Diagonal inverse.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.3."
    }
  }, {
    id: "c53-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Det Of Inverse"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If det(A) = 3, then det(A\u207B\xB9) = ___."),
    options: ["3", "1/3", "-3", "9"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "det(A⁻¹) = 1/det(A)."
    }, {
      label: "Key step",
      text: "1/3."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Det of inverse."
      }, {
        label: "KEY STEP",
        body: "det(A)·det(A⁻¹) = det(I) = 1, so det(A⁻¹) = 1/det A = 1/3."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Reciprocal rule.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c53-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Singular"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A is 3\xD73 with det 0. Then A\u207B\xB9:"),
    options: ["Doesn't exist.", "Equals zero matrix.", "Equals identity.", "Cannot be determined."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "det 0 = singular = no inverse."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Doesn't exist."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Singular definition."
      }, {
        label: "KEY STEP",
        body: "det = 0 ⇔ singular ⇔ no inverse."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "det 0 ⇔ no inverse.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: definition. (A) wins."
    }
  }, {
    id: "c53-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 160,
    tags: ["KILLER", "Cayley-Hamilton"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 1 \\\\ 0 & 2 \\end{pmatrix}"
    }), ", characteristic polynomial is \u03BB\xB2 - 3\u03BB + 2. By Cayley-Hamilton, A\xB2 - 3A + 2I = 0. Solve for A\u207B\xB9."),
    options: ["A⁻¹ = (3I - A)/2", "A⁻¹ = A - 3I", "A⁻¹ = (A - 3I)/2", "A⁻¹ = 3I + A"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "From A² - 3A + 2I = 0, multiply by A⁻¹: A - 3I + 2A⁻¹ = 0 → A⁻¹ = (3I - A)/2."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "A⁻¹ = (3I - A)/2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cayley-Hamilton + inverse derivation."
      }, {
        label: "KEY STEP",
        body: "A² - 3A + 2I = 0. Multiply both sides by A⁻¹: A - 3I + 2A⁻¹ = 0. Solve: 2A⁻¹ = 3I - A → A⁻¹ = (3I - A)/2."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "A⁻¹ = (3I - A)/2 = ([[3,0],[0,3]] - [[1,1],[0,2]])/2 = [[2,-1],[0,1]]/2 = [[1,-0.5],[0,0.5]]. Verify A·A⁻¹: [[1,1],[0,2]]·[[1,-0.5],[0,0.5]] = [[1, -0.5+0.5],[0, 1]] = [[1,0],[0,1]] = I ✓."
      }],
      gateCheck: "Cayley-Hamilton for A⁻¹.",
      speed: "60s.",
      whatMadeHard: "Algebra.",
      generalization: "Same template for any A.",
      linkedConcept: "C7.2.",
      negAdvisory: "Attempt: derivation. (A) wins."
    }
  }];
  const C53_TECHNIQUES = [{
    name: "2x2 Inverse Formula",
    type: "Speed Shortcut",
    when: "2x2 matrix inverse.",
    steps: ["det = ad - bc.", "A⁻¹ = (1/det)·[[d, -b], [-c, a]] (swap diag, negate off)."],
    speed: "15s.",
    example: "A = [[a,b],[c,d]] → A⁻¹ = [[d,-b],[-c,a]]/det.",
    danger: "Sign tracking.",
    freq: "Frequent"
  }, {
    name: "Verify-by-Multiplication",
    type: "Speed Shortcut",
    when: "Asked 'is B = A⁻¹?'.",
    steps: ["Compute AB.", "If I, then B = A⁻¹.", "If not, then no."],
    speed: "30s.",
    example: "Faster than computing A⁻¹.",
    danger: "Must check BA too if non-square.",
    freq: "Frequent"
  }, {
    name: "Cayley-Hamilton Inverse Derivation",
    type: "Structural Insight",
    when: "Asked to express A⁻¹ in terms of powers of A.",
    steps: ["Char poly: p(λ) = 0.", "Multiply through: p(A) = 0.", "Solve for I by dividing by constant term.", "Multiply by A⁻¹ to isolate."],
    speed: "60s.",
    example: "λ² - tr·λ + det = 0 → A⁻¹ = (tr·I - A)/det.",
    danger: "Sign tracking.",
    freq: "Occasional"
  }];
  const C53_MISTAKES = [{
    name: "Assume Non-Square Has Inverse",
    wrong: ["Problem: A is 2x3. Find A⁻¹.", "Solution: Apply 2x2 formula."],
    errorLine: 0,
    errorDescription: "Only square matrices have (two-sided) inverses.",
    rootCause: "Skipping shape check.",
    correct: "Non-square: no inverse.",
    prevention: "Check shape first.",
    gateCost: "Wrong setup.",
    frequency: "Common"
  }];
  const C53_PYQS = [];
  function ConceptLab53({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 3,
      title: "Matrix Inverse \u2014 2\xD72 Formula, Verify-by-Mult, Cayley-Hamilton",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Master the 2x2 inverse formula in 10 seconds. For larger, use verify-by-mult or Cayley-Hamilton. Inverse exists \u21D4 square AND det \u2260 0."),
      patterns: C53_PATTERNS,
      problems: C53_PROBLEMS,
      techniques: C53_TECHNIQUES,
      mistakes: C53_MISTAKES,
      pyqs: C53_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 5.4 — CRAMER'S RULE
     ════════════════════════════════════════════════════════════════ */
  const C54_PATTERNS = [{
    name: "Cramer's Existence Test (det ≠ 0)",
    surface: "Asked when Cramer's rule applies.",
    testing: "Cramer requires det(A) ≠ 0 (square, invertible).",
    signals: ["\"using Cramer\"", "\"det(A) = 0\""],
    firstMove: "If det = 0, Cramer does NOT apply. Use other methods.",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Cramer's Formula Reading",
    surface: "Asked for xᵢ in terms of dets.",
    testing: "xᵢ = det(Aᵢ)/det(A) where Aᵢ has column i replaced by b.",
    signals: ["\"by Cramer\""],
    firstMove: "Replace col i with b, compute det, divide by det(A).",
    timeBudget: 90,
    frequency: "Frequent"
  }, {
    name: "Existence/Uniqueness via Cramer",
    surface: "From det(A) value, predict solution type.",
    testing: "det ≠ 0: unique. det = 0: no sol or infinite (Cramer can't say which).",
    signals: ["\"det = 0\""],
    firstMove: "det ≠ 0: unique solution Cramer-computable. det = 0: depends on b.",
    timeBudget: 20,
    frequency: "Frequent"
  }];
  const C54_PROBLEMS = [{
    id: "c54-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["Cramer Trap"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Cramer's rule for Ax = b can be applied iff:"),
    options: ["A is square.", "det(A) ≠ 0.", "A is square AND det(A) ≠ 0.", "Any system can use it."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Two conditions: square (Cramer is for square) AND non-singular."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "Both."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cramer requirements."
      }, {
        label: "KEY STEP",
        body: "Square (else det undefined) AND det ≠ 0 (else dividing by 0)."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Both necessary."
      }],
      gateCheck: "Both conditions.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.4.",
      negAdvisory: "Attempt: definition. (C) wins."
    }
  }, {
    id: "c54-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Cramer Formula"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "By Cramer's rule, x\u2081 = det(A\u2081)/det(A) where A\u2081 is:"),
    options: ["A with row 1 replaced by b.", "A with column 1 replaced by b.", "A with both row 1 and column 1 deleted.", "Transpose of A."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Replace COLUMN i, not row."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Column 1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cramer's formula."
      }, {
        label: "KEY STEP",
        body: "xᵢ = det(Aᵢ)/det(A) where Aᵢ is A with column i replaced by RHS b."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Columns correspond to unknowns; replace column = replace unknown."
      }],
      gateCheck: "Column replacement.",
      speed: "Direct.",
      whatMadeHard: "Row trap.",
      generalization: "Universal.",
      linkedConcept: "C5.4.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c54-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Cramer Compute"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 2x + 3y = 8, x + 2y = 5, find y via Cramer."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "det(A) = 4 - 3 = 1. A_y = [[2, 8], [1, 5]], det = 10 - 8 = 2. y = 2/1 = 2."
    }, {
      label: "Key step",
      text: "y = 2."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cramer for y."
      }, {
        label: "KEY STEP",
        body: "A = [[2, 3], [1, 2]], det = 1. A_y (replace col 2 by b): [[2, 8], [1, 5]], det = 10 - 8 = 2. y = 2/1 = 2."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "Find x: from eq 1, 2x + 3(2) = 8 → x = 1. Check eq 2: 1 + 2(2) = 5 ✓. Solution (x, y) = (1, 2). Answer y = 2."
      }],
      gateCheck: "Cramer formula.",
      speed: "60s.",
      whatMadeHard: "Arithmetic.",
      generalization: "Universal.",
      linkedConcept: "C5.4."
    }
  }, {
    id: "c54-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Cramer Trap"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For Ax = b with det(A) = 0, the system:"),
    options: ["Has unique solution given by Cramer.", "Has no solution.", "Has infinitely many solutions.", "Is either inconsistent or has infinitely many solutions (Cramer's doesn't apply)."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Cramer needs det ≠ 0. With det = 0, system non-unique."
    }, {
      label: "Key step",
      text: "Either inconsistent or infinite."
    }, {
      label: "Near-complete",
      text: "(D)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cramer breakdown at det = 0."
      }, {
        label: "KEY STEP",
        body: "det(A) = 0 means A singular. Then either inconsistent (no sol) or has infinite sols. Cramer can't decide."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "Need rank comparison: rank(A) vs rank([A|b])."
      }],
      gateCheck: "Cramer trap.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.4.",
      negAdvisory: "Attempt: trap. (D) wins."
    }
  }, {
    id: "c54-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 75,
    tags: ["Cramer 3x3"],
    statement: /*#__PURE__*/React.createElement("span", null, "For x + y + z = 6, 2x - y + z = 3, x + 2y - z = 2, find x via Cramer (with det(A) = -7, det(A_x) = -7)."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "x = det(A_x)/det(A) = -7/-7 = 1."
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
        body: "Direct Cramer formula."
      }, {
        label: "KEY STEP",
        body: "x = -7/-7 = 1."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "1 + y + z = 6, 2 - y + z = 3, 1 + 2y - z = 2. From eq 1: y + z = 5. From eq 2: -y + z = 1 → z = 3, y = 2. From eq 3: 1 + 4 - 3 = 2 ✓."
      }],
      gateCheck: "Direct formula.",
      speed: "10s given dets.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.4."
    }
  }, {
    id: "c54-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Cramer Usability"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For which of the following can Cramer's rule be DIRECTLY applied?"),
    options: ["2x3 system Ax = b.", "3x3 with det(A) = 4.", "3x3 with det(A) = 0.", "Underdetermined system."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Need square AND non-zero det."
    }, {
      label: "Key step",
      text: "(B): square, det ≠ 0."
    }, {
      label: "Near-complete",
      text: "Only (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cramer eligibility."
      }, {
        label: "KEY STEP",
        body: "(A) non-square. (B) square + invertible ✓. (C) singular. (D) usually non-square or singular."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Both conditions."
      }],
      gateCheck: "Eligibility test.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.4.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c54-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["Compute by Cramer"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 3x + 2y = 7, x + y = 3, find x via Cramer."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "det(A) = 3 - 2 = 1. A_x = [[7, 2], [3, 1]], det = 7 - 6 = 1. x = 1."
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
        body: "Cramer 2x2."
      }, {
        label: "KEY STEP",
        body: "A = [[3, 2], [1, 1]], det = 1. A_x (replace col 1 by b): [[7, 2], [3, 1]], det = 7 - 6 = 1. x = 1/1 = 1."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "x = 1, y = 2. Check: 3 + 4 = 7 ✓, 1 + 2 = 3 ✓."
      }],
      gateCheck: "Direct.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.4."
    }
  }, {
    id: "c54-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Cramer Complexity"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For n\xD7n system, Cramer's rule requires how many det evaluations?"),
    options: ["1", "n", "n+1", "n²"],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "1 for A, n for replaced columns."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "n + 1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Counting det computations."
      }, {
        label: "KEY STEP",
        body: "det(A): 1. det(Aᵢ) for i = 1, ..., n: n more. Total = n + 1."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Expensive: O((n+1)·n!) ≈ O(n·n!). Gauss is O(n³)."
      }],
      gateCheck: "Cramer impractical for large n.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.2 Complexity.",
      negAdvisory: "Attempt: count. (C) wins."
    }
  }, {
    id: "c54-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Cramer Trap"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For the system x + y = 2, kx + y = b, Cramer's rule gives x = (2 - b)/(1 - k). For what (k, b) does the rule fail AND the system is still consistent?"),
    options: ["k = 1, b = 2.", "k = 1, b ≠ 2.", "k ≠ 1.", "Always."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Cramer fails when det = 0 (k = 1). Consistent when b = 2 also."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "k = 1, b = 2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cramer failure + consistency."
      }, {
        label: "KEY STEP",
        body: "det(A) = 1 - k = 0 ⇔ k = 1. Cramer fails. Consistency requires the system to be solvable: at k = 1, system is x + y = 2 and x + y = b. Consistent ⇔ b = 2."
      }, {
        label: "COMPUTATION",
        body: "(A) k = 1, b = 2."
      }, {
        label: "VERIFICATION",
        body: "At (1, 2): system has infinite sols (1D family); Cramer doesn't compute them but they exist."
      }],
      gateCheck: "det = 0 + consistent → infinite sols.",
      speed: "60s.",
      whatMadeHard: "Two conditions.",
      generalization: "Universal.",
      linkedConcept: "C5.4.",
      negAdvisory: "Attempt: dual condition. (A) wins."
    }
  }];
  const C54_TECHNIQUES = [{
    name: "Cramer Eligibility Check",
    type: "Trap Avoidance",
    when: "Considering Cramer.",
    steps: ["Verify A is square.", "Compute det(A).", "If det = 0: ABORT Cramer; use rank comparison.", "Else proceed with formula."],
    speed: "Direct.",
    example: "Standard.",
    danger: "Don't compute n+1 dets only to find one is 0.",
    freq: "Frequent"
  }, {
    name: "Cramer Formula Application",
    type: "Speed Shortcut",
    when: "Need specific unknown.",
    steps: ["For xᵢ: replace col i of A by b, get Aᵢ.", "xᵢ = det(Aᵢ)/det(A)."],
    speed: "Per unknown: 30s.",
    example: "Standard.",
    danger: "Replace COLUMN not row.",
    freq: "Frequent"
  }];
  const C54_MISTAKES = [{
    name: "Apply Cramer at det = 0",
    wrong: ["Problem: Solve Ax = b with det A = 0 via Cramer.", "Solution: x = det(A_x)/0 = ∞."],
    errorLine: 0,
    errorDescription: "Division by 0; Cramer undefined.",
    rootCause: "Forgetting eligibility check.",
    correct: "Use rank comparison to decide: no sol or infinite.",
    prevention: "ALWAYS check det ≠ 0 before Cramer.",
    gateCost: "Wrong method.",
    frequency: "Common"
  }, {
    name: "Replace Row Instead of Column",
    wrong: ["Problem: Cramer for x₂. Build A₂.", "Solution: Replace row 2 of A by b."],
    errorLine: 0,
    errorDescription: "Replace column i, not row.",
    rootCause: "Wrong direction.",
    correct: "Replace column i.",
    prevention: "Memorize: column i ↔ unknown i.",
    gateCost: "Wrong answer.",
    frequency: "Common"
  }];
  const C54_PYQS = [];
  function ConceptLab54({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 4,
      title: "Cramer's Rule \u2014 Formula + Existence Trap",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Cramer's elegant but FRAGILE: fails at det = 0. Always check eligibility first. For n\xD7n: n+1 det computations needed. Inefficient for large n; useful for 2x2 and conceptual reasoning."),
      patterns: C54_PATTERNS,
      problems: C54_PROBLEMS,
      techniques: C54_TECHNIQUES,
      mistakes: C54_MISTAKES,
      pyqs: C54_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     APP ROOT
     ════════════════════════════════════════════════════════════════ */
  const CONCEPTS_MAP = [{
    num: 1,
    shortName: "Geometric",
    title: "What det Really Is",
    total: C51_PROBLEMS.length,
    Comp: ConceptLab51
  }, {
    num: 2,
    shortName: "Compute",
    title: "Computing Determinants",
    total: C52_PROBLEMS.length,
    Comp: ConceptLab52
  }, {
    num: 3,
    shortName: "Inverse",
    title: "Matrix Inverse",
    total: C53_PROBLEMS.length,
    Comp: ConceptLab53
  }, {
    num: 4,
    shortName: "Cramer's",
    title: "Cramer's Rule",
    total: C54_PROBLEMS.length,
    Comp: ConceptLab54
  }];
  function App() {
    useEffect(() => {
      hideLoading();
    }, []);
    const progress51 = useConceptProgress(1, C51_PROBLEMS.length);
    const progress52 = useConceptProgress(2, C52_PROBLEMS.length);
    const progress53 = useConceptProgress(3, C53_PROBLEMS.length);
    const progress54 = useConceptProgress(4, C54_PROBLEMS.length);
    const progressMap = {
      1: progress51,
      2: progress52,
      3: progress53,
      4: progress54
    };
    const [active, setActive] = useState(1);
    const totalSolved = [progress51, progress52, progress53, progress54].reduce((s, p) => s + p.correct.length, 0);
    const totalProblems = [C51_PROBLEMS, C52_PROBLEMS, C53_PROBLEMS, C54_PROBLEMS].reduce((s, ps) => s + ps.length, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen"
    }, /*#__PURE__*/React.createElement(TopNav, {
      currentModule: 5
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
    }), " MODULE 5 \xB7 PROBLEM LAB"), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, "Determinants \xB7 Problem Lab", /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, "Properties Over Computation")), /*#__PURE__*/React.createElement("p", {
      className: "text-lg max-w-3xl leading-relaxed mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "4 concept labs covering signed volume, the Property Chain Technique, matrix inverse, and Cramer's Rule. Includes 6 PYQ walkthroughs (2001-2020) on computing determinants and a Cayley-Hamilton KILLER for A\u207B\xB9."), /*#__PURE__*/React.createElement("div", {
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
    }, "4 concept labs \xB7 36 problems \xB7 6 GATE PYQs")), /*#__PURE__*/React.createElement("div", {
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
    }, "Property Chain \xB7 Triangular shortcut \xB7 Cayley-Hamilton inverse"))))), /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto px-5"
    }, /*#__PURE__*/React.createElement(ConceptNavigator, {
      concepts: CONCEPTS_MAP,
      active: active,
      setActive: setActive,
      progressMap: progressMap
    })), /*#__PURE__*/React.createElement(ConceptLab51, {
      progress: progress51
    }), /*#__PURE__*/React.createElement(ConceptLab52, {
      progress: progress52
    }), /*#__PURE__*/React.createElement(ConceptLab53, {
      progress: progress53
    }), /*#__PURE__*/React.createElement(ConceptLab54, {
      progress: progress54
    }), /*#__PURE__*/React.createElement(ModuleFooter, {
      moduleNum: 5,
      nextModuleTitle: "Eigenvalues \u2014 Problem Lab",
      nextModuleFile: "module-06-problem-lab.html",
      checklist: ["I solve 90% of determinant problems via Property Chain — not by expansion.", "I apply triangular shortcut, det(cA) = cⁿ det A, and det product rule reflexively.", "I NEVER use Sarrus' rule for 4×4 or larger.", "I know det(A + B) ≠ det(A) + det(B).", "I derive 2×2 inverses in under 15 seconds.", "I check Cramer eligibility (det ≠ 0) before applying.", "I express A⁻¹ using Cayley-Hamilton from the characteristic equation.", "I've cleared all 36 problems and beaten my drill personal-best per concept."]
    }));
  }
  mountApp(App);
})();