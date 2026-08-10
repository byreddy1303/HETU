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

/* ===== MODULE 6 CONTENT ===== */

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

  const MODULE_NUM = 6;

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
      }, "C6.", c.num), /*#__PURE__*/React.createElement("span", {
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
    }, "PROBLEM LAB \xB7 CONCEPT 6.", num), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, "Module 6 \xB7 Eigenvalues"), /*#__PURE__*/React.createElement("span", {
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
     CONCEPT 6.1 — WHAT EIGENVALUES REALLY ARE
     ════════════════════════════════════════════════════════════════ */
  const C61_PATTERNS = [{
    name: "Eigenvector Verification",
    surface: "Vector v and matrix A given. Asked if v is an eigenvector.",
    testing: "Compute Av; check if it equals a scalar multiple of v.",
    signals: ["\"is v an eigenvector of A\""],
    firstMove: "Compute Av. If Av = λv for some λ → yes. Else no.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "Geometric Interpretation",
    surface: "Asked what eigenvalues mean geometrically.",
    testing: "Whether you know they're scaling factors along special directions.",
    signals: ["\"geometric meaning\"", "\"direction\""],
    firstMove: "Eigenvector = direction A only stretches/flips. Eigenvalue = stretch factor (negative = flip).",
    timeBudget: 20,
    frequency: "Occasional"
  }, {
    name: "Eigenvalue from Definition",
    surface: "Av = λv given for known v. Find λ.",
    testing: "Computing Av and identifying the scalar factor.",
    signals: ["\"corresponding eigenvalue\""],
    firstMove: "Av = λv; read off λ from any non-zero component.",
    timeBudget: 25,
    frequency: "Frequent"
  }];
  const C61_PROBLEMS = [{
    id: "c61-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Verify"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}"
    }), ", the eigenvalue corresponding to eigenvector (1, 0) is ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Compute A·(1, 0) = ?"
    }, {
      label: "Key step",
      text: "A(1, 0) = (2, 0) = 2·(1, 0). λ = 2."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Av direct compute."
      }, {
        label: "KEY STEP",
        body: "A·(1, 0) = (2·1 + 0·0, 0·1 + 3·0) = (2, 0) = 2·(1, 0). So λ = 2."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "(1, 0) is the eigenvector for λ = 2; (0, 1) is for λ = 3."
      }],
      gateCheck: "Diagonal entries are eigenvalues.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Diagonal matrix: eigvals = diag entries.",
      linkedConcept: "C6.1."
    }
  }, {
    id: "c61-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Definition"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For a square A, \u03BB is an eigenvalue iff there exists non-zero v such that:"),
    options: ["Av = 0", "Av = λv", "A = λv", "v = λA"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Definition."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Av = λv."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Eigenvalue definition."
      }, {
        label: "KEY STEP",
        body: "Av = λv where v ≠ 0."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "v = 0 makes the equation trivially true; we exclude it."
      }],
      gateCheck: "Av = λv with v ≠ 0.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.1.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c61-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 50,
    tags: ["Verify Multi"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 1 \\\\ 0 & 2 \\end{pmatrix}"
    }), ", which is an eigenvector?"),
    options: ["(1, 0)", "(0, 1)", "(1, 1)", "Both (1, 0) and (1, 1)"],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Test each by computing Av."
    }, {
      label: "Key step",
      text: "A(1, 0) = (1, 0) = 1·(1, 0) ✓. A(0, 1) = (1, 2), not parallel to (0,1) ✗. A(1, 1) = (2, 2) = 2·(1, 1) ✓."
    }, {
      label: "Near-complete",
      text: "(1, 0) for λ=1, (1, 1) for λ=2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Verify each candidate."
      }, {
        label: "KEY STEP",
        body: "A(1,0)=(1,0)=1·(1,0) ✓ λ=1. A(0,1)=(1,2) — not multiple of (0,1) ✗. A(1,1)=(2,2)=2·(1,1) ✓ λ=2."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "Triangular: eigvals 1, 2 from diagonal. Eigenvectors found."
      }],
      gateCheck: "Verify by direct Av compute.",
      speed: "30s.",
      whatMadeHard: "Distractor (B).",
      generalization: "Test each.",
      linkedConcept: "C6.1.",
      negAdvisory: "Attempt: verify. (D) wins."
    }
  }, {
    id: "c61-m2",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 50,
    tags: ["Stretch Factor"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A has eigenvalue 3 with eigenvector v = (1, 2), find the y-component of Av."),
    answer: 6,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Av = 3v = (3, 6). y = 6."
    }, {
      label: "Key step",
      text: "6."
    }, {
      label: "Near-complete",
      text: "6."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Av = λv."
      }, {
        label: "KEY STEP",
        body: "Av = 3·(1, 2) = (3, 6). y = 6."
      }, {
        label: "COMPUTATION",
        body: "6."
      }, {
        label: "VERIFICATION",
        body: "Don't need A; just λ and v."
      }],
      gateCheck: "Av = λv directly.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.1."
    }
  }, {
    id: "c61-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Eigen Geometric"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A has eigenvalue \u03BB = -1 with eigenvector v, then A maps v to:"),
    options: ["v (unchanged)", "-v (flipped direction)", "0 (origin)", "2v (doubled)"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "λ = -1 means flip."
    }, {
      label: "Key step",
      text: "Av = -v."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Negative eigenvalue interpretation."
      }, {
        label: "KEY STEP",
        body: "Av = -1·v = -v. Direction reversed, magnitude same."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Reflection map has eigenvalue -1."
      }],
      gateCheck: "Sign = direction flip.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.1.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c61-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Eigen Multiplicities"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 identity matrix I, the eigenvalues and their multiplicities are:"),
    options: ["Three distinct: 1, 2, 3.", "Only λ = 1, with multiplicity 3.", "λ = 0 with multiplicity 3.", "No eigenvalues."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Iv = v for every v. So every non-zero vector is eigenvector with λ = 1."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "λ = 1, triple."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Identity matrix."
      }, {
        label: "KEY STEP",
        body: "Iv = 1·v for all v ⇒ λ = 1 only, with multiplicity = dimension = 3."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Char poly: (1-λ)³ = 0."
      }],
      gateCheck: "Identity → λ = 1, mult n.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.4 multiplicities.",
      negAdvisory: "Attempt: pattern. (B) wins."
    }
  }, {
    id: "c61-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Singular Eigen"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A is singular (det = 0), then:"),
    options: ["A has no eigenvalues.", "0 is an eigenvalue of A.", "All eigenvalues are positive.", "Eigenvectors are all zero."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Singular ⇔ null space non-trivial ⇔ Av = 0 = 0·v for some v ≠ 0."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "0 is eigenvalue."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Singular = det 0 = null non-trivial."
      }, {
        label: "KEY STEP",
        body: "∃ v ≠ 0 with Av = 0 = 0·v. So λ = 0 is eigenvalue."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal: det(A - 0·I) = det A = 0."
      }],
      gateCheck: "Singular ⇔ λ = 0 ∈ spec.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7.",
      negAdvisory: "Attempt: theorem. (B) wins."
    }
  }, {
    id: "c61-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Eigen Scaling"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB is an eigenvalue of A, then 3\u03BB is an eigenvalue of:"),
    options: ["3A", "A + 3I", "A - 3I", "3A⁻¹"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "(3A)v = 3·(Av) = 3·λv = (3λ)v."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "3A."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Scalar multiplication of A."
      }, {
        label: "KEY STEP",
        body: "(cA)v = c(Av) = c(λv) = (cλ)v. Eigenvalue cλ."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Distractors: (B) gives λ+3, (C) gives λ-3, (D) gives 3/λ."
      }],
      gateCheck: "Scaling A scales eigenvalues.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7.",
      negAdvisory: "Attempt: rule. (A) wins."
    }
  }, {
    id: "c61-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Inverse Eigen"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " If A is invertible with eigenvalue \u03BB and eigenvector v, then A\u207B\xB9 has eigenvector ___ with eigenvalue ___."),
    options: ["v, 1/λ", "v, -λ", "Av, 1/λ", "A⁻¹v, λ"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "From Av = λv, multiply both sides by A⁻¹: v = λ·A⁻¹v → A⁻¹v = (1/λ)·v."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Same v, eigenvalue 1/λ."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Inverse eigenvalue derivation."
      }, {
        label: "KEY STEP",
        body: "Av = λv ⇒ A⁻¹Av = A⁻¹·λv ⇒ v = λ·A⁻¹v ⇒ A⁻¹v = (1/λ)·v. Eigenvector v, eigenvalue 1/λ."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "λ ≠ 0 required (A invertible)."
      }],
      gateCheck: "Same v, reciprocal eigenvalue.",
      speed: "30s.",
      whatMadeHard: "Manipulation.",
      generalization: "Universal.",
      linkedConcept: "C7.4.",
      negAdvisory: "Attempt: derivation. (A) wins."
    }
  }];
  const C61_TECHNIQUES = [{
    name: "Av Direct Verification",
    type: "Speed Shortcut",
    when: "Asked if v is an eigenvector.",
    steps: ["Compute Av.", "Check if Av = λv for some scalar λ.", "Read λ from any non-zero component."],
    speed: "30s.",
    example: "Standard.",
    danger: "Distractor where Av looks similar but isn't a multiple.",
    freq: "Frequent"
  }, {
    name: "Triangular/Diagonal → Diag Entries",
    type: "Speed Shortcut",
    when: "Triangular or diagonal matrix.",
    steps: ["Eigenvalues = diagonal entries (counted with multiplicity)."],
    speed: "5s.",
    example: "Standard.",
    danger: "Only works for triangular/diagonal.",
    freq: "Frequent"
  }];
  const C61_MISTAKES = [{
    name: "Forgetting v ≠ 0 Requirement",
    wrong: ["Problem: Define eigenvalue.", "Solution: λ such that Av = λv for ANY v."],
    errorLine: 0,
    errorDescription: "v = 0 always satisfies; must exclude.",
    rootCause: "Half-remembering definition.",
    correct: "v ≠ 0.",
    prevention: "Memorize: non-zero eigenvector.",
    gateCost: "Definitional error.",
    frequency: "Common"
  }];
  const C61_PYQS = [];
  function ConceptLab61({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 1,
      title: "What Eigenvalues Really Are \u2014 Special Directions",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Eigenvectors = directions A only stretches/flips. Eigenvalues = stretch factors. Before formulas, grasp the picture."),
      patterns: C61_PATTERNS,
      problems: C61_PROBLEMS,
      techniques: C61_TECHNIQUES,
      mistakes: C61_MISTAKES,
      pyqs: C61_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 6.2 + 6.3 — CHARACTERISTIC EQUATION + SOLVING
     (HIGHEST YIELD IN M6 — 7 PYQs + Cayley-Hamilton KILLER)
     ════════════════════════════════════════════════════════════════ */
  const C62_PATTERNS = [{
    name: "Trace-Det Quadratic (2x2)",
    surface: "2x2 matrix; find eigenvalues.",
    testing: "Whether you use λ² − tr(A)·λ + det(A) = 0 instead of expanding det(A - λI).",
    signals: ["\"eigenvalues of 2x2\""],
    firstMove: "Compute trace and det. Solve λ² − tr·λ + det = 0 using factoring or quadratic formula.",
    timeBudget: 25,
    frequency: "Very Frequent"
  }, {
    name: "Function-of-A Eigenvalues",
    surface: "Asked eigenvalues of p(A) given eigenvalues of A.",
    testing: "Whether you know p(A) has eigenvalues p(λᵢ).",
    signals: ["\"eigenvalue of A³ + 2A - I\""],
    firstMove: "For each eigenvalue λ of A, p(A) has eigenvalue p(λ).",
    timeBudget: 30,
    frequency: "Very Frequent"
  }, {
    name: "Shift Property (A − cI)",
    surface: "Asked eigenvalues of A − cI given those of A.",
    testing: "Whether you know they shift by -c.",
    signals: ["\"eigenvalues of A − 3I\""],
    firstMove: "Each λᵢ becomes λᵢ − c.",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Power Property (Aⁿ)",
    surface: "Eigenvalues of A^n.",
    testing: "Each λᵢ becomes λᵢⁿ.",
    signals: ["\"eigenvalues of A⁵\""],
    firstMove: "Each λᵢ → λᵢⁿ.",
    timeBudget: 15,
    frequency: "Frequent"
  }, {
    name: "Number of Independent Eigenvectors",
    surface: "Asked for number of LI eigenvectors.",
    testing: "Whether you sum geometric multiplicities.",
    signals: ["\"how many linearly independent eigenvectors\""],
    firstMove: "Σ gm(λᵢ). Maximum n; equals n iff diagonalizable.",
    timeBudget: 60,
    frequency: "Frequent"
  }];
  const C62_PROBLEMS = [{
    id: "c62-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 20,
    tags: ["Trace-Det 2x2"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 3 & 1 \\\\ 0 & 2 \\end{pmatrix}"
    }), ", the larger eigenvalue is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Triangular → eigenvalues = diagonal entries."
    }, {
      label: "Key step",
      text: "Diagonal: 3, 2. Larger = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Triangular shortcut."
      }, {
        label: "KEY STEP",
        body: "Upper triangular: eigvals = diagonal = 3, 2."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Trace = 5 = 3 + 2 ✓. Det = 6 = 3·2 ✓."
      }],
      gateCheck: "Triangular: read diagonal.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c62-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 30,
    tags: ["Trace-Det Quadratic"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 4 & 1 \\\\ 2 & 3 \\end{pmatrix}"
    }), ", the smaller eigenvalue is ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "λ² - 7λ + 10 = 0 → (λ-2)(λ-5) = 0 → λ = 2, 5."
    }, {
      label: "Key step",
      text: "Smaller = 2."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Trace-det quadratic."
      }, {
        label: "KEY STEP",
        body: "trace = 7, det = 12 - 2 = 10. λ² - 7λ + 10 = (λ-2)(λ-5) = 0. λ = 2, 5."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "2 + 5 = 7 ✓, 2·5 = 10 ✓."
      }],
      gateCheck: "λ² - tr·λ + det = 0.",
      speed: "20s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal for 2x2.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c62-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Function-of-A"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A has eigenvalues 1, 2, 3, the LARGEST eigenvalue of A\xB2 is ___."),
    answer: 9,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "λ → λ² under the power rule."
    }, {
      label: "Key step",
      text: "1² = 1, 2² = 4, 3² = 9. Largest is 9."
    }, {
      label: "Near-complete",
      text: "9."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Power property."
      }, {
        label: "KEY STEP",
        body: "Eigvals of A² = (1, 4, 9). Largest = 9."
      }, {
        label: "COMPUTATION",
        body: "9."
      }, {
        label: "VERIFICATION",
        body: "Same eigenvectors as A; only eigenvalues get squared."
      }],
      gateCheck: "λⁿ rule.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c62-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Shift"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A has eigenvalues 2, 5, then A - 2I has eigenvalues:"),
    options: ["0, 3", "0, 7", "2, 5", "-2, 3"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "λ → λ - 2."
    }, {
      label: "Key step",
      text: "2 - 2 = 0, 5 - 2 = 3."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Shift property."
      }, {
        label: "KEY STEP",
        body: "(A - cI)v = Av - cv = λv - cv = (λ - c)v. So shift each by -c = -2."
      }, {
        label: "COMPUTATION",
        body: "(A) 0, 3."
      }, {
        label: "VERIFICATION",
        body: "Eigenvalue 0 means A - 2I singular — true since 2 is eigval of A."
      }],
      gateCheck: "Shift by -c.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7.",
      negAdvisory: "Attempt: rule. (A) wins."
    }
  }, {
    id: "c62-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["f(A) Eigenvalues"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A has eigenvalue \u03BB = 2, then A\xB3 - 2A + I has eigenvalue ___."),
    answer: 5,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "p(A) → p(λ). p(2) = 8 - 4 + 1 = 5."
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
        body: "Polynomial of A."
      }, {
        label: "KEY STEP",
        body: "p(λ) = λ³ - 2λ + 1. p(2) = 8 - 4 + 1 = 5."
      }, {
        label: "COMPUTATION",
        body: "5."
      }, {
        label: "VERIFICATION",
        body: "Same eigenvector v."
      }],
      gateCheck: "p(A) → p(λ).",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c62-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Char Eq 3x3"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 0 & 0 \\\\ 0 & 3 & 1 \\\\ 0 & 0 & 3 \\end{pmatrix}"
    }), ", the sum of all eigenvalues (with algebraic multiplicity) is ___."),
    answer: 8,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Triangular: eigvals = diag entries = 2, 3, 3."
    }, {
      label: "Key step",
      text: "2 + 3 + 3 = 8."
    }, {
      label: "Near-complete",
      text: "8."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Triangular + sum = trace."
      }, {
        label: "KEY STEP",
        body: "Eigvals: 2, 3, 3 (3 has am = 2). Sum = trace = 8."
      }, {
        label: "COMPUTATION",
        body: "8."
      }, {
        label: "VERIFICATION",
        body: "Trace = 2 + 3 + 3 = 8 ✓."
      }],
      gateCheck: "Trace = Σλ with am.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c62-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Inverse Eigen"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 3\xD73 invertible with eigenvalues 1, 2, 4, then det(A\u207B\xB9) and trace(A\u207B\xB9) are:"),
    options: ["det = 1/8, trace = 7/4", "det = 8, trace = 7", "det = 1/8, trace = 1 + 1/2 + 1/4 = 7/4", "Both (A) and (C) — same answer."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "A⁻¹ has eigvals 1/1, 1/2, 1/4. det = product, trace = sum."
    }, {
      label: "Key step",
      text: "det = 1·(1/2)·(1/4) = 1/8. trace = 1 + 1/2 + 1/4 = 7/4."
    }, {
      label: "Near-complete",
      text: "(D) — (A) and (C) match."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Inverse eigenvalues."
      }, {
        label: "KEY STEP",
        body: "A⁻¹ eigvals: 1/λᵢ = 1, 1/2, 1/4. det = product = 1/8. trace = sum = 7/4."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "det(A) = 8 ✓, det(A⁻¹) = 1/8 ✓."
      }],
      gateCheck: "Reciprocal eigvals.",
      speed: "30s.",
      whatMadeHard: "Distractor format.",
      generalization: "Universal.",
      linkedConcept: "C7.4.",
      negAdvisory: "Attempt: rule. (D) wins."
    }
  }, {
    id: "c62-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["LI Eigenvectors"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 1 & 0 \\\\ 0 & 2 & 0 \\\\ 0 & 0 & 3 \\end{pmatrix}"
    }), ", the number of linearly independent eigenvectors is:"),
    options: ["1", "2", "3", "None"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Eigvals 2 (am=2), 3 (am=1). Find gm for each."
    }, {
      label: "Key step",
      text: "A - 2I = [[0,1,0],[0,0,0],[0,0,1]]. Null space dim = 1 (kernel of rank 2). gm(2) = 1. gm(3) = 1."
    }, {
      label: "Near-complete",
      text: "Total LI eigenvectors = 1 + 1 = 2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sum of gm = LI eigenvectors."
      }, {
        label: "KEY STEP",
        body: "λ = 2 (am = 2): A - 2I has rank 2 → null dim 1 → gm = 1.\nλ = 3 (am = 1): gm = 1.\nTotal LI eigenvectors = 1 + 1 = 2."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Defective! gm(2) = 1 < am(2) = 2. So not diagonalizable."
      }],
      gateCheck: "Σ gm = number of LI eigenvectors.",
      speed: "60s.",
      whatMadeHard: "Computing gm.",
      generalization: "Universal.",
      linkedConcept: "C6.4-5.",
      negAdvisory: "Attempt: nullity. (B) wins."
    }
  }, {
    id: "c62-k1",
    difficulty: "killer",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["KILLER", "Cayley-Hamilton"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " Let A be 3\xD73 with eigenvalues 1, 2, 3. Find ", /*#__PURE__*/React.createElement(T, {
      src: "\\det(A^3 - 6A^2 + 11A - 6I)"
    }), "."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Char poly: p(λ) = (λ-1)(λ-2)(λ-3) = λ³ - 6λ² + 11λ - 6."
    }, {
      label: "Key step",
      text: "A satisfies its own char poly: p(A) = 0 (Cayley-Hamilton). So A³ - 6A² + 11A - 6I = 0."
    }, {
      label: "Near-complete",
      text: "det(0) = 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cayley-Hamilton."
      }, {
        label: "KEY STEP",
        body: "Char poly: p(λ) = (λ-1)(λ-2)(λ-3) = λ³ - 6λ² + 11λ - 6.\nCayley-Hamilton: A satisfies p(A) = 0. So A³ - 6A² + 11A - 6I = 0 (zero matrix).\ndet(0) = 0."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "Eigenvalues of (A³ - 6A² + 11A - 6I) = p(λ) for each λ = 1, 2, 3. p(1) = p(2) = p(3) = 0. All eigenvalues 0 → det = product = 0."
      }],
      gateCheck: "Cayley-Hamilton: p(A) = 0 always.",
      speed: "30s.",
      whatMadeHard: "Recognizing the polynomial is the char poly.",
      generalization: "p(A) = 0 ⇒ det(p(A)) = 0.",
      linkedConcept: "C7.2."
    }
  }];
  const C62_TECHNIQUES = [{
    name: "Trace-Det Quadratic for 2x2",
    type: "Speed Shortcut",
    when: "Eigenvalues of 2×2.",
    steps: ["Compute trace and det.", "Solve λ² − tr·λ + det = 0.", "Factor or quadratic formula."],
    speed: "20s.",
    example: "tr = 5, det = 6 → λ² - 5λ + 6 = (λ-2)(λ-3).",
    danger: "Sign of det.",
    freq: "Very Frequent"
  }, {
    name: "Triangular Eigenvalue Shortcut",
    type: "Speed Shortcut",
    when: "Triangular matrix (upper or lower).",
    steps: ["Eigenvalues = diagonal entries (with multiplicity)."],
    speed: "5s.",
    example: "Standard.",
    danger: "Only triangular.",
    freq: "Frequent"
  }, {
    name: "f(A) Eigenvalue Reflex",
    type: "Speed Shortcut",
    when: "Asked eigenvalues of polynomial/function of A.",
    steps: ["p(A) has eigenvalues p(λᵢ).", "Same eigenvectors as A."],
    speed: "Direct.",
    example: "λ = 2 → A² has 4, A - 3I has -1, etc.",
    danger: "Doesn't work for A + B unless A and B commute.",
    freq: "Very Frequent"
  }, {
    name: "Cayley-Hamilton",
    type: "Structural Insight",
    when: "Polynomial of A with same degree as size.",
    steps: ["Char poly p(λ) = det(A - λI).", "p(A) = 0 ALWAYS.", "Use to reduce powers Aⁿ for n ≥ size."],
    speed: "Depends.",
    example: "See KILLER.",
    danger: "Apply only to p(A), not arbitrary polys.",
    freq: "Frequent"
  }, {
    name: "Inverse Eigenvalues",
    type: "Speed Shortcut",
    when: "Eigenvalues of A⁻¹.",
    steps: ["A⁻¹ has eigvals 1/λᵢ.", "Same eigenvectors.", "Requires A invertible (all λᵢ ≠ 0)."],
    speed: "Direct.",
    example: "λ = 2 → 1/2.",
    danger: "0 eigenvalue → no inverse.",
    freq: "Frequent"
  }];
  const C62_MISTAKES = [{
    name: "eig(A+B) = eig(A) + eig(B) Error",
    wrong: ["Problem: A has eigvals 1, 2. B has eigvals 3, 4. Eigenvalues of A + B?", "Solution: 1+3=4, 2+4=6."],
    errorLine: 0,
    errorDescription: "Eigenvalues of sums are NOT sums of eigenvalues unless A, B simultaneously diagonalizable.",
    rootCause: "Treating eigenvalues as linear.",
    correct: "Need actual matrices; cannot deduce from eigvals alone.",
    prevention: "Memorize: only f(A) = polynomial in A gives p(λ).",
    gateCost: "Major error.",
    frequency: "Very Common"
  }, {
    name: "am vs gm Confusion",
    wrong: ["Problem: A has λ = 2 with am 3. So gm = 3.", "Solution: Yes."],
    errorLine: 0,
    errorDescription: "gm ≤ am; equality optional. Could be 1, 2, or 3.",
    rootCause: "Half-knowledge.",
    correct: "Compute gm = nullity(A - λI).",
    prevention: "am, gm separate.",
    gateCost: "Diagonalizability error.",
    frequency: "Common"
  }];
  const C62_PYQS = [{
    year: "2014-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2014 pattern.)"), /*#__PURE__*/React.createElement("br", null), "For 2x2 A with trace 5 and det 6, eigenvalues are ___."),
    solution: [{
      label: "APPLY",
      body: "λ² - 5λ + 6 = (λ-2)(λ-3) = 0."
    }, {
      label: "ANSWER",
      body: "λ = 2, 3."
    }]
  }, {
    year: "2015-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2015 pattern.)"), /*#__PURE__*/React.createElement("br", null), "If A has eigenvalues 1, 2, 3, then A\u207B\xB9 has eigenvalues ___."),
    solution: [{
      label: "RULE",
      body: "λ → 1/λ."
    }, {
      label: "ANSWER",
      body: "1, 1/2, 1/3."
    }]
  }, {
    year: "2016-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2016 pattern.)"), /*#__PURE__*/React.createElement("br", null), "For A 3\xD73 with eigenvalues 1, 2, 3, trace(A) = ___ and det(A) = ___."),
    solution: [{
      label: "TRACE",
      body: "1 + 2 + 3 = 6."
    }, {
      label: "DET",
      body: "1·2·3 = 6."
    }]
  }, {
    year: "2018-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2018 pattern.)"), /*#__PURE__*/React.createElement("br", null), "If A has eigenvalue \u03BB then 2A + 3I has eigenvalue ___."),
    solution: [{
      label: "RULE",
      body: "2λ + 3."
    }]
  }, {
    year: "2019-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2019 pattern.)"), /*#__PURE__*/React.createElement("br", null), "Eigenvalues of ", /*#__PURE__*/React.createElement(T, {
      src: "\\begin{pmatrix} 1 & 2 \\\\ 4 & 3 \\end{pmatrix}"
    }), " are ___."),
    solution: [{
      label: "TR-DET",
      body: "tr = 4, det = -5. λ² - 4λ - 5 = (λ-5)(λ+1)."
    }, {
      label: "ANSWER",
      body: "5, -1."
    }]
  }, {
    year: "2021-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2021 pattern.)"), /*#__PURE__*/React.createElement("br", null), "For 3\xD73 A with eigvals 1, 2, 3, det(A\xB2 - 3A + 2I) = ___."),
    solution: [{
      label: "RULE",
      body: "p(A) eigvals: p(λᵢ). p(λ) = λ² - 3λ + 2 = (λ-1)(λ-2). p(1)=0, p(2)=0, p(3)=2."
    }, {
      label: "ANSWER",
      body: "det = 0·0·2 = 0."
    }]
  }, {
    year: "2022-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2022 pattern.)"), /*#__PURE__*/React.createElement("br", null), "If \u03BB is an eigenvalue of A, what is an eigenvalue of A\xB2?"),
    solution: [{
      label: "RULE",
      body: "λ²."
    }]
  }];
  function ConceptLab62({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 2,
      title: "Characteristic Equation + Solving \u2014 7 PYQs + Cayley-Hamilton KILLER",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Two concepts merged: char poly + eigenvalue extraction. Trace-Det quadratic for 2\xD72, f(A) \u2192 f(\u03BB) reflex, Cayley-Hamilton p(A) = 0. 7 PYQs span 2014\u20132022."),
      patterns: C62_PATTERNS,
      problems: C62_PROBLEMS,
      techniques: C62_TECHNIQUES,
      mistakes: C62_MISTAKES,
      pyqs: C62_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 6.4 + 6.5 — ALGEBRAIC vs GEOMETRIC MULTIPLICITY
     (Diagonalizability + Defective Matrices)
     ════════════════════════════════════════════════════════════════ */
  const C64_PATTERNS = [{
    name: "Diagonalizability Test",
    surface: "Asked if A is diagonalizable.",
    testing: "Whether you check gm = am for every eigenvalue.",
    signals: ["\"diagonalizable\""],
    firstMove: "For each eigenvalue λ: am = power in char poly. gm = nullity(A - λI). Diagonalizable iff gm = am for ALL eigvals.",
    timeBudget: 80,
    frequency: "Very Frequent"
  }, {
    name: "Distinct Eigenvalues → Diagonalizable",
    surface: "If A has n distinct eigenvalues, is it diagonalizable?",
    testing: "Yes always.",
    signals: ["\"n distinct eigenvalues\""],
    firstMove: "Distinct eigvals ⇒ each has am = 1 = gm ⇒ diagonalizable.",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "Repeated Eigenvalue Trap",
    surface: "Eigenvalue has am > 1. Diagonalizable?",
    testing: "Depends on gm. Could be either.",
    signals: ["\"repeated eigenvalue\""],
    firstMove: "Compute gm = nullity(A - λI) and compare to am.",
    timeBudget: 60,
    frequency: "Frequent"
  }, {
    name: "Defective Matrix Recognition",
    surface: "Asked if matrix is defective.",
    testing: "Defective = some gm < am = NOT diagonalizable.",
    signals: ["\"defective\""],
    firstMove: "Some gm < am ⇒ defective.",
    timeBudget: 30,
    frequency: "Occasional"
  }];
  const C64_PROBLEMS = [{
    id: "c64-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["Diag Test"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A 3\xD73 matrix has 3 distinct eigenvalues. Then A is:"),
    options: ["Always diagonalizable.", "Never diagonalizable.", "Diagonalizable only if symmetric.", "Cannot determine."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Distinct eigvals ⇒ each am = 1 = gm."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Always."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Distinct eigvals rule."
      }, {
        label: "KEY STEP",
        body: "Distinct eigvals → independent eigenvectors → diagonalizable."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Theorem: distinct λ → LI eigenvectors."
      }],
      gateCheck: "Distinct → diagonalizable always.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.4.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c64-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["am vs gm"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For an eigenvalue \u03BB:"),
    options: ["gm ≤ am always.", "gm > am always.", "gm = am always.", "No relation."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Standard inequality."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "gm ≤ am."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Multiplicity inequality."
      }, {
        label: "KEY STEP",
        body: "Always 1 ≤ gm ≤ am. Equality (gm = am) → diagonalizable contribution."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Theorem."
      }],
      gateCheck: "gm ≤ am.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.4.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c64-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Diag Decision"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The matrix ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 1 \\\\ 0 & 2 \\end{pmatrix}"
    }), " is:"),
    options: ["Diagonalizable.", "Not diagonalizable (defective).", "Symmetric.", "Singular."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Single eigenvalue 2 with am = 2. Check gm."
    }, {
      label: "Key step",
      text: "A - 2I = [[0, 1], [0, 0]]. rank 1 → nullity 1. gm = 1 < am = 2."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Repeated eigenvalue — check gm."
      }, {
        label: "KEY STEP",
        body: "λ = 2 (am 2). A - 2I = [[0, 1], [0, 0]]. Rank 1 → null dim 1. gm = 1 < am = 2 ⇒ defective."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Only one eigenvector direction; can't diagonalize."
      }],
      gateCheck: "Defective = some gm < am.",
      speed: "30s.",
      whatMadeHard: "Computing gm.",
      generalization: "Same template.",
      linkedConcept: "C6.4-5.",
      negAdvisory: "Attempt: nullity. (B) wins."
    }
  }, {
    id: "c64-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Identity Case"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The matrix ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 0 \\\\ 0 & 2 \\end{pmatrix}"
    }), " is:"),
    options: ["Diagonalizable (in fact, already diagonal).", "Defective.", "Has only one eigenvector.", "Singular."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Already diagonal. Single eigenvalue 2 with full multiplicity."
    }, {
      label: "Key step",
      text: "gm = am = 2. Diagonalizable."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Already diagonal."
      }, {
        label: "KEY STEP",
        body: "A = 2I. Every non-zero v is eigenvector. gm = 2 = am. Diagonalizable trivially."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Repeated eigenvalue can still give diagonalizable if gm matches am."
      }],
      gateCheck: "Diagonal ⇒ diagonalizable.",
      speed: "Direct.",
      whatMadeHard: "Distractor (C) trap.",
      generalization: "Universal.",
      linkedConcept: "C6.4-5.",
      negAdvisory: "Attempt: structure. (A) wins."
    }
  }, {
    id: "c64-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Count LI eigenvectors"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 3 & 1 & 0 \\\\ 0 & 3 & 0 \\\\ 0 & 0 & 5 \\end{pmatrix}"
    }), ", total number of LI eigenvectors is ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Sum gm."
    }, {
      label: "Key step",
      text: "λ = 3 (am 2): A-3I = [[0,1,0],[0,0,0],[0,0,2]]. Rank 2, null 1. gm = 1. λ = 5 (am 1): gm = 1."
    }, {
      label: "Near-complete",
      text: "1 + 1 = 2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Sum of gm."
      }, {
        label: "KEY STEP",
        body: "λ = 3: A - 3I has rank 2, gm = 1. λ = 5: gm = 1. Total = 2."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "Defective: gm(3) = 1 < am(3) = 2."
      }],
      gateCheck: "Σ gm.",
      speed: "60s.",
      whatMadeHard: "Nullity calc.",
      generalization: "Universal.",
      linkedConcept: "C6.4-5."
    }
  }, {
    id: "c64-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Diag Property"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Which is NECESSARY for A to be diagonalizable?"),
    options: ["A has n distinct eigenvalues.", "A is symmetric.", "Σ gm = n.", "A is invertible."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Diagonalizable ⇔ n LI eigenvectors ⇔ Σ gm = n."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "Σ gm = n is necessary and sufficient."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Definition of diagonalizable."
      }, {
        label: "KEY STEP",
        body: "Diagonalizable ⇔ exists basis of eigenvectors ⇔ Σ gm(λᵢ) = n."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "(A) sufficient but not necessary. (B) sufficient not necessary. (D) irrelevant."
      }],
      gateCheck: "Σ gm = n iff diagonalizable.",
      speed: "Direct.",
      whatMadeHard: "Distractors.",
      generalization: "Universal.",
      linkedConcept: "C6.4.",
      negAdvisory: "Attempt: definition. (C) wins."
    }
  }, {
    id: "c64-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Trap"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "'A repeated eigenvalue means A is NOT diagonalizable' is:"),
    options: ["Always true.", "Always false.", "Sometimes true.", "Only true if A is real."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Counterexample: I has λ = 1 repeated but is diagonal."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "Depends on gm vs am."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Common trap."
      }, {
        label: "KEY STEP",
        body: "Repeated eigenvalue doesn't preclude diagonalizability — only matters if gm < am. Identity I has all eigvals = 1 (repeated n times) but is fully diagonalizable."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Repeated + gm = am: still diagonalizable."
      }],
      gateCheck: "Repeated ≠ defective.",
      speed: "Concept: 30s.",
      whatMadeHard: "Trap.",
      generalization: "Universal.",
      linkedConcept: "C6.4.",
      negAdvisory: "Attempt: pattern. (C) wins."
    }
  }, {
    id: "c64-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["am vs gm Compute"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 0 \\\\ 1 & 2 \\end{pmatrix}"
    }), ", am(2) - gm(2) = ___."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "λ = 2 with am 2. A - 2I = [[0, 0], [1, 0]]. Nullity 1 → gm = 1."
    }, {
      label: "Key step",
      text: "am - gm = 2 - 1 = 1."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Compute am - gm."
      }, {
        label: "KEY STEP",
        body: "am = 2 (double root). A - 2I = [[0, 0], [1, 0]] rank 1, null 1. gm = 1. Difference = 1."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "am - gm > 0 → defective."
      }],
      gateCheck: "Defect = am - gm.",
      speed: "30s.",
      whatMadeHard: "Nullity.",
      generalization: "Universal.",
      linkedConcept: "C6.4-5."
    }
  }, {
    id: "c64-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Triple Eigen"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " Construct 3\xD73 A with eigenvalue 2 of am = 3 but only 1 LI eigenvector. The structure of A - 2I must satisfy:"),
    options: ["rank(A - 2I) = 0.", "rank(A - 2I) = 1.", "rank(A - 2I) = 2.", "rank(A - 2I) = 3."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "gm = 1 means null(A - 2I) is 1D. rank-nullity: rank = 3 - 1 = 2."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "rank 2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Defect via rank."
      }, {
        label: "KEY STEP",
        body: "gm(2) = nullity(A - 2I) = 1. rank-nullity: rank(A - 2I) = 3 - 1 = 2.\n\nExample: Jordan block [[2, 1, 0], [0, 2, 1], [0, 0, 2]]. A - 2I = [[0, 1, 0], [0, 0, 1], [0, 0, 0]] which has rank 2."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "am = 3, gm = 1, defect = 2 (max possible)."
      }],
      gateCheck: "rank(A - λI) = n - gm.",
      speed: "60s.",
      whatMadeHard: "Jordan structure.",
      generalization: "Universal.",
      linkedConcept: "C6.4-5.",
      negAdvisory: "Attempt: rank-nullity. (C) wins."
    }
  }];
  const C64_TECHNIQUES = [{
    name: "Diagonalizability via Σ gm = n",
    type: "Structural Insight",
    when: "Check if A diagonalizable.",
    steps: ["Find eigenvalues with am.", "For each, compute gm = nullity(A - λI).", "Diagonalizable iff Σ gm = n (or equivalently, gm = am for every λ)."],
    speed: "60-120s for 3×3.",
    example: "Standard.",
    danger: "Repeated eigenvalues need gm check.",
    freq: "Very Frequent"
  }, {
    name: "Distinct Eigenvalues Shortcut",
    type: "Speed Shortcut",
    when: "All eigenvalues distinct.",
    steps: ["Diagonalizable automatically."],
    speed: "Direct.",
    example: "Standard.",
    danger: "Doesn't extend to repeated case.",
    freq: "Frequent"
  }];
  const C64_MISTAKES = [{
    name: "Distinct Eigvals NOT Guaranteed Diagonalizable",
    wrong: ["Problem: A has 3 distinct eigvals. Is it diagonalizable?", "Solution: No, requires further conditions."],
    errorLine: 0,
    errorDescription: "Distinct eigvals → always diagonalizable.",
    rootCause: "Wrong recall.",
    correct: "Yes, always.",
    prevention: "Memorize.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }, {
    name: "Repeated → Not Diagonalizable",
    wrong: ["Problem: A has λ = 2 with am 3. Diagonalizable?", "Solution: No, since repeated."],
    errorLine: 0,
    errorDescription: "Need to check gm.",
    rootCause: "Half-knowledge.",
    correct: "Depends on gm.",
    prevention: "Always compute gm.",
    gateCost: "Wrong conclusion.",
    frequency: "Very Common"
  }];
  const C64_PYQS = [];
  function ConceptLab64({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 4,
      title: "Algebraic vs Geometric Multiplicity \u2014 Defective vs Diagonalizable",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "am from char poly, gm from nullity. gm \u2264 am always. Diagonalizable \u21D4 \u03A3 gm = n \u21D4 gm = am for all \u03BB. Distinct eigvals \u2192 automatic."),
      patterns: C64_PATTERNS,
      problems: C64_PROBLEMS,
      techniques: C64_TECHNIQUES,
      mistakes: C64_MISTAKES,
      pyqs: C64_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 6.6 — SYMMETRIC MATRICES (Spectral Theorem)
     ════════════════════════════════════════════════════════════════ */
  const C66_PATTERNS = [{
    name: "Real Symmetric Properties",
    surface: "Asked about eigenvalues of real symmetric A.",
    testing: "Whether you know: real eigenvalues, orthogonal eigenvectors (for distinct eigvals), always diagonalizable.",
    signals: ["\"A is real symmetric\""],
    firstMove: "Recall: real eigvals, orthogonal eigenvectors, always diagonalizable.",
    timeBudget: 25,
    frequency: "Frequent"
  }, {
    name: "PSD/PD Recognition",
    surface: "Asked if A is positive (semi-)definite.",
    testing: "Whether you know: A symmetric + all eigvals ≥ 0 (or > 0).",
    signals: ["\"positive definite\"", "\"PSD\""],
    firstMove: "PD: all eigvals > 0. PSD: all ≥ 0. Both require symmetric A.",
    timeBudget: 30,
    frequency: "Occasional"
  }, {
    name: "AᵀA / AAᵀ Symmetry",
    surface: "Are these matrices symmetric?",
    testing: "AᵀA always symmetric and PSD.",
    signals: ["\"AᵀA\""],
    firstMove: "(AᵀA)ᵀ = AᵀA always. Always symmetric.",
    timeBudget: 20,
    frequency: "Frequent"
  }];
  const C66_PROBLEMS = [{
    id: "c66-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["Symmetric"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Real symmetric A has eigenvalues that are:"),
    options: ["Always real.", "Always complex.", "Always positive.", "Always zero."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Spectral theorem."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Real."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Spectral theorem."
      }, {
        label: "KEY STEP",
        body: "Real symmetric → real eigenvalues."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Real symmetric → real eigvals.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.6.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c66-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["AᵀA"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For any matrix A, A\u1D40A is:"),
    options: ["Always symmetric.", "Always invertible.", "Always positive definite.", "Never symmetric."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "(AᵀA)ᵀ = AᵀA."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Symmetric."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Transpose property."
      }, {
        label: "KEY STEP",
        body: "(AᵀA)ᵀ = Aᵀ(Aᵀ)ᵀ = AᵀA. Symmetric.\nAlso PSD: vᵀAᵀAv = ‖Av‖² ≥ 0."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Not always PD; only when A has independent columns."
      }],
      gateCheck: "AᵀA = symmetric PSD.",
      speed: "Direct.",
      whatMadeHard: "Distractor (C).",
      generalization: "Universal.",
      linkedConcept: "M8 SVD.",
      negAdvisory: "Attempt: rule. (A) wins."
    }
  }, {
    id: "c66-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Orthogonality"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For symmetric A with DISTINCT eigenvalues, eigenvectors corresponding to different eigenvalues are:"),
    options: ["Parallel.", "Orthogonal.", "Identical.", "Arbitrary."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Spectral theorem."
    }, {
      label: "Key step",
      text: "Orthogonal."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Spectral theorem property."
      }, {
        label: "KEY STEP",
        body: "Distinct eigvals of symmetric A → eigenvectors are mutually orthogonal."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Proof: λ₁v₁ᵀv₂ = (Av₁)ᵀv₂ = v₁ᵀAv₂ = λ₂v₁ᵀv₂. If λ₁ ≠ λ₂, then v₁ᵀv₂ = 0."
      }],
      gateCheck: "Symmetric distinct → orthogonal.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "M8 Orthogonal basis.",
      negAdvisory: "Attempt: theorem. (B) wins."
    }
  }, {
    id: "c66-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["PSD Test"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Symmetric A is positive definite iff all eigenvalues are:"),
    options: ["Real.", "Positive.", "Non-negative.", "Distinct."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "PD definition via eigvals."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Positive."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "PD test."
      }, {
        label: "KEY STEP",
        body: "Symmetric A is PD iff all λᵢ > 0. PSD iff all λᵢ ≥ 0."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Reason: xᵀAx > 0 for x ≠ 0 ⇔ all eigvals positive."
      }],
      gateCheck: "PD ⇔ all λ > 0.",
      speed: "Direct.",
      whatMadeHard: "Distinguishing PSD/PD.",
      generalization: "Universal.",
      linkedConcept: "C6.6.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c66-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Symmetric Diag"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Every real symmetric matrix is:"),
    options: ["Always diagonalizable.", "Diagonalizable only if eigvals distinct.", "Never diagonalizable.", "Diagonalizable only if positive definite."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Spectral theorem."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Always."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Spectral theorem."
      }, {
        label: "KEY STEP",
        body: "Real symmetric → orthogonally diagonalizable: A = QΛQᵀ with Q orthogonal."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Even with repeated eigvals, gm = am for symmetric."
      }],
      gateCheck: "Real symmetric always diagonalizable.",
      speed: "Direct.",
      whatMadeHard: "Distractor.",
      generalization: "Universal.",
      linkedConcept: "M8 PCA.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c66-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Covariance"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The covariance matrix C = (1/n)\xB7X\u1D40X of centered data X is:"),
    options: ["Symmetric positive semi-definite.", "Always positive definite.", "Always invertible.", "Never symmetric."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "AᵀA template."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Symmetric PSD."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Covariance structure."
      }, {
        label: "KEY STEP",
        body: "C = (1/n)XᵀX is symmetric (transpose property), PSD (vᵀCv = (1/n)‖Xv‖² ≥ 0)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "PD only if X has independent columns (rank-full); else PSD with eigval 0."
      }],
      gateCheck: "Covariance always sym PSD.",
      speed: "Direct.",
      whatMadeHard: "PD vs PSD.",
      generalization: "Universal.",
      linkedConcept: "M8 PCA.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c66-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Symmetric Eig"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If symmetric A has eigenvalues 1, 2, 3, then A is:"),
    options: ["Positive definite and diagonalizable.", "Diagonalizable but not PD.", "PD but not diagonalizable.", "Singular."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Symmetric → diagonalizable. All eigvals > 0 → PD."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Both."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Symmetric properties."
      }, {
        label: "KEY STEP",
        body: "Symmetric → diagonalizable. All λ > 0 → PD."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "det = 1·2·3 = 6 > 0 → invertible."
      }],
      gateCheck: "Both properties from spectral theorem + PD test.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.6.",
      negAdvisory: "Attempt: theorems. (A) wins."
    }
  }, {
    id: "c66-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Spectral"],
    statement: /*#__PURE__*/React.createElement("span", null, "If symmetric A is 3\xD73 with trace 6 and det 6 and one eigenvalue is 1, then the largest eigenvalue is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "λ₁ + λ₂ + λ₃ = 6, λ₁·λ₂·λ₃ = 6, λ₁ = 1."
    }, {
      label: "Key step",
      text: "λ₂ + λ₃ = 5, λ₂·λ₃ = 6. λ²-5λ+6=0 → λ = 2, 3."
    }, {
      label: "Near-complete",
      text: "Largest = 3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Trace and det shortcuts."
      }, {
        label: "KEY STEP",
        body: "Given λ₁ = 1. λ₂ + λ₃ = 6 - 1 = 5. λ₂·λ₃ = 6/1 = 6. Quadratic: λ² - 5λ + 6 = (λ-2)(λ-3) = 0. λ = 2, 3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Sum 1+2+3 = 6 ✓. Product 1·2·3 = 6 ✓."
      }],
      gateCheck: "Vieta's for given partial info.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c66-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["KILLER", "PCA"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " ML BRIDGE: PCA finds the principal direction by computing eigenvectors of the (symmetric) covariance matrix C. The TOP principal component direction corresponds to:"),
    options: ["The eigenvector for the smallest eigenvalue.", "The eigenvector for the largest eigenvalue.", "The eigenvector for λ = 0.", "Any eigenvector."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "PCA: max variance direction = max eigval direction."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Largest eigval."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "ML bridge: PCA = top eigenvector of covariance."
      }, {
        label: "KEY STEP",
        body: "Variance along direction v is vᵀCv. Maximized over unit v by top eigenvector (Rayleigh quotient)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "C symmetric PSD → always orthogonal eigenvectors → PCA always works."
      }],
      gateCheck: "Top eigenvalue → top principal component.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal in ML.",
      linkedConcept: "M8 PCA.",
      negAdvisory: "Attempt: ML knowledge. (B) wins."
    }
  }];
  const C66_TECHNIQUES = [{
    name: "Spectral Theorem Reflex",
    type: "Structural Insight",
    when: "Real symmetric matrix question.",
    steps: ["Real eigvals.", "Orthogonal eigenvectors (distinct eigvals).", "Always diagonalizable: A = QΛQᵀ."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Don't apply to non-symmetric.",
    freq: "Frequent"
  }, {
    name: "AᵀA / AAᵀ Symmetry Check",
    type: "Speed Shortcut",
    when: "Asked properties of products with transpose.",
    steps: ["(AᵀA)ᵀ = AᵀA — always symmetric.", "AᵀA is PSD.", "AᵀA is PD iff A has independent columns."],
    speed: "Direct.",
    example: "Used in SVD, PCA.",
    danger: "AᵀA and AAᵀ are different sizes.",
    freq: "Frequent"
  }];
  const C66_MISTAKES = [{
    name: "Non-Symmetric Assumed to Have Real Eig",
    wrong: ["Problem: 2x2 matrix [[0, -1], [1, 0]] has real eigenvalues.", "Solution: Yes."],
    errorLine: 0,
    errorDescription: "Not symmetric. Eigenvalues are ±i (purely imaginary).",
    rootCause: "Over-applying spectral theorem.",
    correct: "Only SYMMETRIC has guaranteed real eigvals.",
    prevention: "Check symmetric first.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }];
  const C66_PYQS = [];
  function ConceptLab66({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 6,
      title: "Symmetric Matrices \u2014 Spectral Theorem",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Real symmetric: real eigvals, orthogonal eigenvectors, ALWAYS diagonalizable. A\u1D40A = symmetric PSD. Covariance matrix = symmetric PSD \u2192 PCA always works. The math backbone of ML."),
      patterns: C66_PATTERNS,
      problems: C66_PROBLEMS,
      techniques: C66_TECHNIQUES,
      mistakes: C66_MISTAKES,
      pyqs: C66_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 6.7 — TRACE = Σλ, DET = Πλ (EXTREMELY HIGH ROI)
     ════════════════════════════════════════════════════════════════ */
  const C67_PATTERNS = [{
    name: "Trace = Sum of Eigenvalues",
    surface: "Asked sum of eigenvalues OR trace.",
    testing: "Whether you use trace formula directly.",
    signals: ["\"sum of eigenvalues\"", "\"trace\""],
    firstMove: "trace(A) = Σ λᵢ (with multiplicity).",
    timeBudget: 10,
    frequency: "Very Frequent"
  }, {
    name: "Det = Product of Eigenvalues",
    surface: "Asked product OR det.",
    testing: "det(A) = Π λᵢ.",
    signals: ["\"product of eigenvalues\"", "\"det of A\""],
    firstMove: "det(A) = Π λᵢ.",
    timeBudget: 10,
    frequency: "Very Frequent"
  }, {
    name: "20-Second 2x2 Eigenvalue Finder",
    surface: "2x2 matrix; find eigvals fast.",
    testing: "Apply tr and det to λ² − tr·λ + det = 0.",
    signals: ["\"eigenvalues of 2x2\""],
    firstMove: "Find tr, det. Factor quadratic.",
    timeBudget: 20,
    frequency: "Very Frequent"
  }, {
    name: "Find Missing Eigenvalue (Vieta's)",
    surface: "Some eigvals + trace/det given. Find rest.",
    testing: "Use Vieta's to back out unknowns.",
    signals: ["\"one eigenvalue is\"", "\"sum is\""],
    firstMove: "Sum + product → quadratic for unknowns.",
    timeBudget: 60,
    frequency: "Frequent"
  }];
  const C67_PROBLEMS = [{
    id: "c67-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 15,
    tags: ["Trace=Sum"],
    statement: /*#__PURE__*/React.createElement("span", null, "A 3x3 matrix has eigenvalues 2, 3, -1. Trace = ___."),
    answer: 4,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "trace = sum."
    }, {
      label: "Key step",
      text: "2 + 3 - 1 = 4."
    }, {
      label: "Near-complete",
      text: "4."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Trace formula."
      }, {
        label: "KEY STEP",
        body: "Σλ = 4."
      }, {
        label: "COMPUTATION",
        body: "4."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Trace = Σλ.",
      speed: "3s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 15,
    tags: ["Det=Product"],
    statement: /*#__PURE__*/React.createElement("span", null, "A 3x3 matrix has eigenvalues 2, 3, -1. det = ___."),
    answer: -6,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "det = product."
    }, {
      label: "Key step",
      text: "2·3·(-1) = -6."
    }, {
      label: "Near-complete",
      text: "-6."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Det formula."
      }, {
        label: "KEY STEP",
        body: "Πλ = -6."
      }, {
        label: "COMPUTATION",
        body: "-6."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Det = Πλ.",
      speed: "3s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 25,
    tags: ["2x2 Eigvals"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 4 & 2 \\\\ 1 & 3 \\end{pmatrix}"
    }), ", smaller eigenvalue = ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "tr = 7, det = 10. λ² - 7λ + 10 = 0."
    }, {
      label: "Key step",
      text: "(λ-2)(λ-5)."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "20-sec method."
      }, {
        label: "KEY STEP",
        body: "tr = 7, det = 12 - 2 = 10. λ² - 7λ + 10 = (λ-2)(λ-5)."
      }, {
        label: "COMPUTATION",
        body: "Smaller = 2."
      }, {
        label: "VERIFICATION",
        body: "2 + 5 = 7 ✓, 2·5 = 10 ✓."
      }],
      gateCheck: "Trace + det quadratic.",
      speed: "15s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal for 2x2.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-m2",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 30,
    tags: ["Trace Quick"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A has eigenvalues 1, 1, 4, and B is 3\xD73 with eigenvalues 2, 3, -1, then trace(A + B)... cannot be determined from eigvals alone. Find trace(A) + trace(B)."),
    answer: 10,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "trace is linear: tr(A+B) = trace A + trace B."
    }, {
      label: "Key step",
      text: "trace A = 6, trace B = 4. Sum = 10."
    }, {
      label: "Near-complete",
      text: "10."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Trace addition."
      }, {
        label: "KEY STEP",
        body: "trace A = 1+1+4=6. trace B = 2+3-1=4. Sum = 10."
      }, {
        label: "COMPUTATION",
        body: "10."
      }, {
        label: "VERIFICATION",
        body: "Trace IS linear (unlike eigvals)."
      }],
      gateCheck: "Trace is linear; eigvals are not.",
      speed: "5s.",
      whatMadeHard: "Distinction.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 30,
    tags: ["Quick 2x2"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 2x2 A with trace 3 and det -10, smaller eigenvalue is ___."),
    answer: -2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "λ² - 3λ - 10 = 0. (λ-5)(λ+2)."
    }, {
      label: "Key step",
      text: "λ = 5, -2."
    }, {
      label: "Near-complete",
      text: "-2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Direct quadratic."
      }, {
        label: "KEY STEP",
        body: "λ² - 3λ - 10 = 0. Factor: (λ-5)(λ+2). λ = 5 or -2."
      }, {
        label: "COMPUTATION",
        body: "-2."
      }, {
        label: "VERIFICATION",
        body: "5 + (-2) = 3 ✓, 5·(-2) = -10 ✓."
      }],
      gateCheck: "20-sec method.",
      speed: "15s.",
      whatMadeHard: "Sign.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Power of Trace"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 3x3 with eigenvalues 1, 2, 3, find trace(A\xB2)."),
    answer: 14,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "A² has eigvals 1, 4, 9. trace = sum."
    }, {
      label: "Key step",
      text: "1 + 4 + 9 = 14."
    }, {
      label: "Near-complete",
      text: "14."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Power property + trace formula."
      }, {
        label: "KEY STEP",
        body: "A² eigvals = 1², 2², 3² = 1, 4, 9. trace = 14."
      }, {
        label: "COMPUTATION",
        body: "14."
      }, {
        label: "VERIFICATION",
        body: "trace(A²) = Σλᵢ²."
      }],
      gateCheck: "trace(Aⁿ) = Σλⁿ.",
      speed: "15s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Symmetric Quick"],
    statement: /*#__PURE__*/React.createElement("span", null, "A 4\xD74 symmetric matrix has trace 10 and det 24. Three of its eigenvalues are 1, 2, 3. Find the missing fourth eigenvalue."),
    answer: 4,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Sum of eigvals = trace. 1 + 2 + 3 + λ₄ = 10 → λ₄ = 4."
    }, {
      label: "Key step",
      text: "4."
    }, {
      label: "Near-complete",
      text: "Cross-check product: 1·2·3·4 = 24 ✓ matches det."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Use trace to find missing eigenvalue."
      }, {
        label: "KEY STEP",
        body: "Σλᵢ = trace: 1 + 2 + 3 + λ₄ = 10 ⇒ λ₄ = 4."
      }, {
        label: "COMPUTATION",
        body: "4."
      }, {
        label: "VERIFICATION",
        body: "Product check: 1·2·3·4 = 24 = det ✓. Both invariants confirm λ₄ = 4."
      }],
      gateCheck: "Trace-method for missing eigval, det as cross-check.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c67-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Inverse Trace"],
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 3x3 invertible with eigenvalues 1, 2, 4, then trace(A\u207B\xB9) = ___."),
    answer: 1.75,
    tolerance: 0.01,
    hints: [{
      label: "Conceptual redirect",
      text: "A⁻¹ has eigvals 1, 1/2, 1/4."
    }, {
      label: "Key step",
      text: "1 + 1/2 + 1/4 = 1.75."
    }, {
      label: "Near-complete",
      text: "1.75."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Inverse eigvals + trace."
      }, {
        label: "KEY STEP",
        body: "A⁻¹ eigvals = 1, 0.5, 0.25. Sum = 1.75."
      }, {
        label: "COMPUTATION",
        body: "1.75."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Combine rules.",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c67-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 120,
    tags: ["KILLER", "Vieta's 3x3"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " A 3\xD73 matrix has eigenvalues with sum 9 and product 24. One eigenvalue is 4. The OTHER two are:"),
    options: ["(3, 1) — sum 4, product 3.", "(2, 3) — sum 5, product 6.", "(5, 0) — sum 5, product 0.", "Cannot be determined without more info."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Let the other two eigvals be a, b. Use Vieta's: a + b = 9 − 4 = 5 and a·b = 24/4 = 6."
    }, {
      label: "Key step",
      text: "a, b are roots of λ² − 5λ + 6 = 0."
    }, {
      label: "Near-complete",
      text: "Factor: λ² − 5λ + 6 = (λ − 2)(λ − 3). Roots 2 and 3. Answer (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Vieta's for missing roots from trace/det."
      }, {
        label: "KEY STEP",
        body: "Let unknown eigvals be a, b.\nTrace: 4 + a + b = 9 → a + b = 5.\nDet: 4·a·b = 24 → a·b = 6.\nThen a, b satisfy λ² − (a+b)λ + ab = λ² − 5λ + 6 = 0."
      }, {
        label: "COMPUTATION",
        body: "λ² − 5λ + 6 = (λ − 2)(λ − 3) ⇒ {a, b} = {2, 3}. Answer (B)."
      }, {
        label: "VERIFICATION",
        body: "Sum: 4 + 2 + 3 = 9 ✓. Product: 4·2·3 = 24 ✓."
      }],
      gateCheck: "Vieta's reduces unknowns to a quadratic.",
      speed: "45s.",
      whatMadeHard: "Setting up sum and product correctly.",
      generalization: "Universal — works for any n × n given trace and det.",
      linkedConcept: "C5.2 Vieta's.",
      negAdvisory: "Attempt: Vieta's gives clean factoring. (B) wins."
    }
  }];
  const C67_TECHNIQUES = [{
    name: "trace(A) = Σλ",
    type: "Speed Shortcut",
    when: "Need sum of eigenvalues or trace.",
    steps: ["Identity holds for ANY square matrix (with multiplicities)."],
    speed: "Instant.",
    example: "Universal.",
    danger: "Includes multiplicity.",
    freq: "Very Frequent"
  }, {
    name: "det(A) = Πλ",
    type: "Speed Shortcut",
    when: "Need product of eigenvalues or det.",
    steps: ["Universal identity."],
    speed: "Instant.",
    example: "Universal.",
    danger: "Includes multiplicity.",
    freq: "Very Frequent"
  }, {
    name: "20-Second 2x2 Eigenvalue Finder",
    type: "Speed Shortcut",
    when: "Need eigvals of 2x2.",
    steps: ["tr = sum diagonal.", "det = ad - bc.", "λ² − tr·λ + det = 0.", "Factor or quadratic formula."],
    speed: "20s.",
    example: "Standard.",
    danger: "Sign care.",
    freq: "Very Frequent"
  }, {
    name: "Vieta's for Missing Eigenvalues",
    type: "Structural Insight",
    when: "Some eigvals + trace/det known.",
    steps: ["Sum of unknowns = trace - known sum.", "Product of unknowns = det / known product.", "Build polynomial; solve."],
    speed: "60s.",
    example: "See KILLER.",
    danger: "Discriminant could be negative (complex roots).",
    freq: "Occasional"
  }];
  const C67_MISTAKES = [{
    name: "trace(AB) ≠ trace(A)·trace(B)",
    wrong: ["Problem: trace(AB) given trace A = 5, trace B = 7.", "Solution: 35."],
    errorLine: 0,
    errorDescription: "Trace NOT multiplicative. trace(AB) = trace(BA) but not products of traces.",
    rootCause: "Generalization error.",
    correct: "Cannot compute from individual traces alone.",
    prevention: "Memorize: trace cyclic, not multiplicative.",
    gateCost: "Big error.",
    frequency: "Common"
  }];
  const C67_PYQS = [];
  function ConceptLab67({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 7,
      title: "Trace = \u03A3\u03BB, det = \u03A0\u03BB \u2014 The 30-Second Shortcuts",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "EXTREMELY HIGH ROI. Two identities collapse most 2x2 eigval problems to 20 seconds. Vieta's lets you back-solve missing eigvals from trace/det. Mandatory drill."),
      patterns: C67_PATTERNS,
      problems: C67_PROBLEMS,
      techniques: C67_TECHNIQUES,
      mistakes: C67_MISTAKES,
      pyqs: C67_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     APP ROOT
     ════════════════════════════════════════════════════════════════ */
  const CONCEPTS_MAP = [{
    num: 1,
    shortName: "What",
    title: "What Eigenvalues Are",
    total: C61_PROBLEMS.length,
    Comp: ConceptLab61
  }, {
    num: 2,
    shortName: "Solving",
    title: "Char Eq + Solving",
    total: C62_PROBLEMS.length,
    Comp: ConceptLab62
  }, {
    num: 4,
    shortName: "am vs gm",
    title: "Algebraic vs Geometric Mult",
    total: C64_PROBLEMS.length,
    Comp: ConceptLab64
  }, {
    num: 6,
    shortName: "Symmetric",
    title: "Symmetric Matrices",
    total: C66_PROBLEMS.length,
    Comp: ConceptLab66
  }, {
    num: 7,
    shortName: "tr/det",
    title: "Trace = Σλ, det = Πλ",
    total: C67_PROBLEMS.length,
    Comp: ConceptLab67
  }];
  function App() {
    useEffect(() => {
      hideLoading();
    }, []);
    const progress61 = useConceptProgress(1, C61_PROBLEMS.length);
    const progress62 = useConceptProgress(2, C62_PROBLEMS.length);
    const progress64 = useConceptProgress(4, C64_PROBLEMS.length);
    const progress66 = useConceptProgress(6, C66_PROBLEMS.length);
    const progress67 = useConceptProgress(7, C67_PROBLEMS.length);
    const progressMap = {
      1: progress61,
      2: progress62,
      4: progress64,
      6: progress66,
      7: progress67
    };
    const [active, setActive] = useState(1);
    const totalSolved = [progress61, progress62, progress64, progress66, progress67].reduce((s, p) => s + p.correct.length, 0);
    const totalProblems = [C61_PROBLEMS, C62_PROBLEMS, C64_PROBLEMS, C66_PROBLEMS, C67_PROBLEMS].reduce((s, ps) => s + ps.length, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen"
    }, /*#__PURE__*/React.createElement(TopNav, {
      currentModule: 6
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
    }), " MODULE 6 \xB7 PROBLEM LAB"), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, "Eigenvalues \xB7 Problem Lab", /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, "The Highest-Frequency M6 Skill: Trace + Det")), /*#__PURE__*/React.createElement("p", {
      className: "text-lg max-w-3xl leading-relaxed mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "5 consolidated concept labs covering eigenvalue verification, trace-det quadratic, am vs gm with defective KILLER, spectral theorem for symmetric matrices, and the universal trace = \u03A3\u03BB / det = \u03A0\u03BB shortcuts. 7 GATE PYQ walkthroughs (2014\u20132022) plus a Cayley-Hamilton KILLER."), /*#__PURE__*/React.createElement("div", {
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
    }, "5 concept labs \xB7 45 problems \xB7 7 GATE PYQs \xB7 timed drill")), /*#__PURE__*/React.createElement("div", {
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
    }, "Cayley-Hamilton \xB7 Spectral Theorem \xB7 PCA bridge"))))), /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto px-5"
    }, /*#__PURE__*/React.createElement(ConceptNavigator, {
      concepts: CONCEPTS_MAP,
      active: active,
      setActive: setActive,
      progressMap: progressMap
    })), /*#__PURE__*/React.createElement(ConceptLab61, {
      progress: progress61
    }), /*#__PURE__*/React.createElement(ConceptLab62, {
      progress: progress62
    }), /*#__PURE__*/React.createElement(ConceptLab64, {
      progress: progress64
    }), /*#__PURE__*/React.createElement(ConceptLab66, {
      progress: progress66
    }), /*#__PURE__*/React.createElement(ConceptLab67, {
      progress: progress67
    }), /*#__PURE__*/React.createElement(ModuleFooter, {
      moduleNum: 6,
      nextModuleTitle: "Eigenvalue Power Tools \u2014 Problem Lab",
      nextModuleFile: "module-07-problem-lab.html",
      checklist: ["I find 2×2 eigenvalues in 20 seconds using λ² - tr·λ + det = 0.", "I apply Cayley-Hamilton: p(A) = 0 for char poly p.", "I use f(A) → f(λ) for ANY polynomial of A.", "I never claim eig(A+B) = eig(A) + eig(B).", "I check am vs gm separately for diagonalizability.", "Distinct eigenvalues → always diagonalizable (no need to compute gm).", "Real symmetric → real eigvals + orthogonal eigvecs + always diagonalizable.", "Trace(A) = Σλᵢ and det(A) = Πλᵢ — always.", "I've cleared all problems and beaten my drill personal-best per concept."]
    }));
  }
  mountApp(App);
})();