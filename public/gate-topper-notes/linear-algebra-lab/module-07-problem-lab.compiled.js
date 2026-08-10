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

/* ===== MODULE 7 CONTENT ===== */

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

  const MODULE_NUM = 7;

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
      }, "C7.", c.num), /*#__PURE__*/React.createElement("span", {
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
    }, "PROBLEM LAB \xB7 CONCEPT 7.", num), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, "Module 7 \xB7 Eigenvalue Power Tools"), /*#__PURE__*/React.createElement("span", {
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
      subtitle: "Top rankers classify the question first, then solve."
    }), patterns.map((p, i) => /*#__PURE__*/React.createElement(PatternCard, {
      key: i,
      idx: i + 1,
      pattern: p
    })), pyqs && pyqs.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LayerHeader, {
      num: "1.5",
      title: "GATE CS PYQ Walkthroughs",
      subtitle: "Real GATE CS questions with full reasoning chains. Read, don't solve."
    }), pyqs.map((p, i) => /*#__PURE__*/React.createElement(PYQWalkthrough, _extends({
      key: i
    }, p)))), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 2,
      title: "Progressive Problem Set",
      subtitle: "2 Easy \xB7 3 Medium \xB7 3 Hard \xB7 1 Killer."
    }), problems.map((p, i) => /*#__PURE__*/React.createElement(ProblemCard, {
      key: p.id,
      p: p,
      idx: i + 1,
      progress: progress
    })), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 3,
      title: "Technique Arsenal",
      subtitle: "How to think, not what to think."
    }), techniques.map((t, i) => /*#__PURE__*/React.createElement(TechniqueCard, {
      key: i,
      tech: t
    })), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 4,
      title: "Mistake Autopsy Lab",
      subtitle: "Real wrong solutions written exactly as students write them."
    }), mistakes.map((m, i) => /*#__PURE__*/React.createElement(MistakeCard, {
      key: i,
      mistake: m,
      idx: i + 1
    })), /*#__PURE__*/React.createElement(LayerHeader, {
      num: 5,
      title: "Timed Drill Mode",
      subtitle: "Knowing the answer \u2260 executing under 90-second pressure."
    }), /*#__PURE__*/React.createElement(DrillMode, {
      conceptNum: num,
      conceptTitle: title,
      problems: problems
    })));
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 7.1 — RANK & EIGENVALUES
     ════════════════════════════════════════════════════════════════ */
  const C71_PATTERNS = [{
    name: "Rank = # Non-Zero Eigenvalues (Diag)",
    surface: "Diagonalizable matrix, asked rank from eigenvalues.",
    testing: "Count non-zero eigvals.",
    signals: ["\"diagonalizable\", \"rank\""],
    firstMove: "If A diagonalizable: rank(A) = # non-zero eigvals (with multiplicity).",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "λ = 0 ⇔ A Singular",
    surface: "Asked when 0 is eigenvalue.",
    testing: "det(A) = 0 ⇔ 0 is eigenvalue ⇔ singular.",
    signals: ["\"A is singular\""],
    firstMove: "Singular ⇔ λ = 0 ∈ spec.",
    timeBudget: 15,
    frequency: "Very Frequent"
  }, {
    name: "rank(A) bounds eigenvalue counts",
    surface: "Asked min/max number of zero eigenvalues.",
    testing: "n - rank ≤ # zero eigvals ≤ n.",
    signals: ["\"how many eigenvalues are zero\""],
    firstMove: "# zero eigvals ≥ nullity = n - rank.",
    timeBudget: 30,
    frequency: "Frequent"
  }];
  const C71_PROBLEMS = [{
    id: "c71-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["Singular"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A 3\xD73 matrix with eigenvalues 0, 2, 5 is:"),
    options: ["Invertible.", "Singular (since 0 is eigenvalue).", "Diagonal.", "Symmetric."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "λ = 0 → det = 0 → singular."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Singular."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "0 in spec."
      }, {
        label: "KEY STEP",
        body: "det = Πλ = 0·2·5 = 0. Singular."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "0 eigval ⇔ singular.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c71-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Rank=NonZero"],
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A with eigenvalues 0, 0, 3, 5, rank(A) = ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Count non-zero."
    }, {
      label: "Key step",
      text: "3, 5 non-zero → 2."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Diagonalizable rank rule."
      }, {
        label: "KEY STEP",
        body: "rank = # non-zero eigvals = 2."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Count non-zero eigvals.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Diagonalizable case.",
      linkedConcept: "C7.1."
    }
  }, {
    id: "c71-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 50,
    tags: ["Bound"],
    statement: /*#__PURE__*/React.createElement("span", null, "An n\xD7n matrix has rank 3 with n = 6. The minimum number of eigenvalues equal to 0 is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Min # zero eigvals = nullity = n - rank."
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
        body: "Nullity = min # zero eigvals."
      }, {
        label: "KEY STEP",
        body: "nullity = 6 - 3 = 3. At least 3 zero eigvals."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Some non-zero eigvals might also be 0 if non-diagonalizable (defective)."
      }],
      gateCheck: "Nullity ≤ # zero eigvals.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C4.4."
    }
  }, {
    id: "c71-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Rank Sum"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A 4\xD74 with eigenvalues 0, 0, 0, 7, the rank is:"),
    options: ["1", "2", "3", "4"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "rank = # non-zero."
    }, {
      label: "Key step",
      text: "1."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Diagonalizable rank."
      }, {
        label: "KEY STEP",
        body: "Non-zero: just 7. rank = 1."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Count.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.1.",
      negAdvisory: "Attempt: count. (A) wins."
    }
  }, {
    id: "c71-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 65,
    tags: ["Singular Reverse"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If 4\xD74 A has eigenvalues 1, 2, 3, ___ and det = 12, the missing eigval is:"),
    options: ["1", "2", "12", "6"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "det = Πλ. 1·2·3·λ = 12 → λ = 2."
    }, {
      label: "Key step",
      text: "2."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "det = Πλ."
      }, {
        label: "KEY STEP",
        body: "1·2·3·λ₄ = 12 → λ₄ = 2."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Universal.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7.",
      negAdvisory: "Attempt: arithmetic. (B) wins."
    }
  }, {
    id: "c71-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Eigen 0"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 5\xD75 with rank 3, then 0 is an eigenvalue of A with geometric multiplicity:"),
    options: ["Exactly 2", "At least 2", "At most 2", "Exactly 0"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "gm(0) = dim(N(A)) = nullity = n - rank = 2."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "gm of 0 = nullity."
      }, {
        label: "KEY STEP",
        body: "gm(0) = nullity(A - 0·I) = nullity(A) = 5 - 3 = 2."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Exact."
      }],
      gateCheck: "gm(0) = nullity.",
      speed: "Direct.",
      whatMadeHard: "Distractor (B).",
      generalization: "Universal.",
      linkedConcept: "C6.4.",
      negAdvisory: "Attempt: rule. (A) wins."
    }
  }, {
    id: "c71-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Trace Bound"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A 4\xD74 nilpotent matrix has eigenvalues:"),
    options: ["All 0", "All 1", "Distinct", "Cannot determine"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Nilpotent: Aᵏ = 0 → λᵏ = 0 → λ = 0."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "All 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Nilpotent property."
      }, {
        label: "KEY STEP",
        body: "Aᵏ = 0 for some k. If λ is eigval, Aᵏv = λᵏv = 0 → λᵏ = 0 → λ = 0."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Nilpotent → all 0.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "M8 Special Matrices.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c71-h3",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Idempotent"],
    statement: /*#__PURE__*/React.createElement("span", null, "For idempotent A (A\xB2 = A), eigenvalues are 0 or ___."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "λ² = λ → λ(λ-1) = 0 → λ ∈ {0, 1}."
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
        body: "Idempotent."
      }, {
        label: "KEY STEP",
        body: "A² = A → λ²v = λv → λ² = λ → λ = 0 or 1."
      }, {
        label: "COMPUTATION",
        body: "1."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Universal.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "M8 Special."
    }
  }, {
    id: "c71-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 100,
    tags: ["KILLER", "Rank-Eigen"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " A 4\xD74 matrix has rank 2. Then it has:"),
    options: ["Exactly 2 eigenvalues equal to 0.", "At least 2 eigenvalues equal to 0.", "All eigenvalues equal to 0.", "No information."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "nullity = 2, so gm(0) ≥ 2 ⇒ am(0) ≥ 2."
    }, {
      label: "Key step",
      text: "(B) — at least 2."
    }, {
      label: "Near-complete",
      text: "Could be 2 (if 2 non-zero) or more (if defective)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Rank → eigval bound."
      }, {
        label: "KEY STEP",
        body: "rank = 2 → nullity = 2 → gm(0) = 2. Since am(0) ≥ gm(0), at least 2 zero eigvals. Could be exactly 2 (diagonalizable case) or more (defective)."
      }, {
        label: "COMPUTATION",
        body: "(B) at least 2."
      }, {
        label: "VERIFICATION",
        body: "(A) wrong — could be more if defective. Example: Jordan block contributes additional 0 eigvals."
      }],
      gateCheck: "rank → ≥ n-rank zero eigvals.",
      speed: "30s.",
      whatMadeHard: "Distinguishing 'exactly' vs 'at least'.",
      generalization: "Universal.",
      linkedConcept: "C7.1.",
      negAdvisory: "Attempt: bound. (B) wins."
    }
  }];
  const C71_TECHNIQUES = [{
    name: "Rank = # Non-Zero Eigvals (Diag)",
    type: "Speed Shortcut",
    when: "Diagonalizable matrix asked rank from eigvals.",
    steps: ["Count non-zero eigenvalues with am."],
    speed: "Direct.",
    example: "Eigvals 0, 0, 3 → rank 1.",
    danger: "Only for diagonalizable.",
    freq: "Frequent"
  }, {
    name: "Singular ⇔ λ = 0",
    type: "Structural Insight",
    when: "Determining singularity from eigvals.",
    steps: ["0 ∈ spec ⇔ det = 0 ⇔ singular."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Doesn't tell magnitude.",
    freq: "Very Frequent"
  }];
  const C71_MISTAKES = [{
    name: "Apply Rank Rule to Non-Diagonalizable",
    wrong: ["Problem: rank of A with eigvals 0, 0, 2 (defective).", "Solution: rank = 1."],
    errorLine: 0,
    errorDescription: "Rule only for diagonalizable.",
    rootCause: "Over-application.",
    correct: "For defective, more care needed.",
    prevention: "Check diagonalizability.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }];
  const C71_PYQS = [];
  function ConceptLab71({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 1,
      title: "Rank & Eigenvalues \u2014 Counting via Eigvals",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "For diagonalizable A: rank = # non-zero eigvals. 0 in spec \u21D4 singular. nullity = gm(0) = n - rank."),
      patterns: C71_PATTERNS,
      problems: C71_PROBLEMS,
      techniques: C71_TECHNIQUES,
      mistakes: C71_MISTAKES,
      pyqs: C71_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 7.2 — CAYLEY-HAMILTON
     ════════════════════════════════════════════════════════════════ */
  const C72_PATTERNS = [{
    name: "Apply p(A) = 0",
    surface: "Given char poly, show p(A) = 0 or use it.",
    testing: "Cayley-Hamilton: A satisfies char poly.",
    signals: ["\"Cayley-Hamilton\""],
    firstMove: "p(λ) = det(A − λI). Then p(A) = 0 (zero matrix).",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "Reduce Aⁿ via Char Poly",
    surface: "Compute large power Aⁿ.",
    testing: "Use p(A) = 0 to express Aⁿ as polynomial in lower powers.",
    signals: ["\"compute A⁵\"", "\"A^k for large k\""],
    firstMove: "p(A) = 0 → solve for highest power; substitute recursively.",
    timeBudget: 90,
    frequency: "Occasional"
  }, {
    name: "A⁻¹ via Cayley-Hamilton",
    surface: "Find A⁻¹ using char poly.",
    testing: "p(A) = 0 → multiply by A⁻¹ → solve for A⁻¹.",
    signals: ["\"inverse via Cayley\""],
    firstMove: "Aⁿ + cₙ₋₁Aⁿ⁻¹ + ... + c₀I = 0. Multiply by A⁻¹: Aⁿ⁻¹ + ... + c₀A⁻¹ = 0 → solve.",
    timeBudget: 60,
    frequency: "Occasional"
  }];
  const C72_PROBLEMS = [{
    id: "c72-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["CH Apply"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 2\xD72 A with characteristic equation \u03BB\xB2 - 5\u03BB + 6 = 0, by Cayley-Hamilton, A\xB2 - 5A + 6I = ___."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "p(A) = 0."
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
        body: "CH theorem."
      }, {
        label: "KEY STEP",
        body: "A² - 5A + 6I = 0 (zero matrix)."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "p(A) = 0.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.2."
    }
  }, {
    id: "c72-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["CH Statement"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Cayley-Hamilton states:"),
    options: ["Every matrix has real eigenvalues.", "A matrix satisfies its own characteristic polynomial.", "Determinant is multiplicative.", "Trace equals sum of diagonal."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Definition."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "B."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Statement."
      }, {
        label: "KEY STEP",
        body: "p(A) = 0 for char poly p."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Definition.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.2.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c72-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Reduce Power"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 2\xD72 A with char poly \u03BB\xB2 - 3\u03BB + 2, by CH A\xB2 = 3A - 2I. Then A\xB3 in terms of A and I has coefficient of A = ___."),
    answer: 7,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "A³ = A·A² = A(3A - 2I) = 3A² - 2A = 3(3A - 2I) - 2A = 9A - 6I - 2A = 7A - 6I."
    }, {
      label: "Key step",
      text: "Coefficient of A = 7."
    }, {
      label: "Near-complete",
      text: "7."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Power reduction via CH."
      }, {
        label: "KEY STEP",
        body: "A³ = A·A² = A(3A - 2I) = 3A² - 2A = 3(3A - 2I) - 2A = 7A - 6I."
      }, {
        label: "COMPUTATION",
        body: "7."
      }, {
        label: "VERIFICATION",
        body: "Cross-check: eigvals 1, 2. A³ eigvals 1, 8. 7λ - 6 at λ=1: 1 ✓. At λ=2: 8 ✓."
      }],
      gateCheck: "Iterate p(A) = 0.",
      speed: "60s.",
      whatMadeHard: "Substitution.",
      generalization: "Universal.",
      linkedConcept: "C7.2."
    }
  }, {
    id: "c72-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["CH Inverse"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For 2\xD72 A with char poly \u03BB\xB2 - 4\u03BB + 3, by CH, A\u207B\xB9 = ___."),
    options: ["(4I - A)/3", "(A - 4I)/3", "A - 4I", "(3I - A)/4"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "A² - 4A + 3I = 0 → multiply by A⁻¹: A - 4I + 3A⁻¹ = 0 → A⁻¹ = (4I - A)/3."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "(4I-A)/3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "CH inverse formula."
      }, {
        label: "KEY STEP",
        body: "A² - 4A + 3I = 0. ·A⁻¹: A - 4I + 3A⁻¹ = 0 → A⁻¹ = (4I - A)/3."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "CH manipulation.",
      speed: "30s.",
      whatMadeHard: "Sign.",
      generalization: "Universal.",
      linkedConcept: "C5.3.",
      negAdvisory: "Attempt: derivation. (A) wins."
    }
  }, {
    id: "c72-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 50,
    tags: ["CH 2x2 Quick"],
    statement: /*#__PURE__*/React.createElement("span", null, "For ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 1 & 1 \\\\ 0 & 2 \\end{pmatrix}"
    }), ", by CH the relation A\xB2 - tr\xB7A + det\xB7I = 0 gives A\xB2 in terms of A and I with coefficient of A = ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "tr = 3, det = 2. A² - 3A + 2I = 0 → A² = 3A - 2I. Coefficient of A = 3."
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
        body: "CH for 2×2."
      }, {
        label: "KEY STEP",
        body: "Char poly: λ² - 3λ + 2. By CH: A² - 3A + 2I = 0 → A² = 3A - 2I."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "tr-det quadratic.",
      speed: "15s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal for 2×2.",
      linkedConcept: "C7.2."
    }
  }, {
    id: "c72-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["A^k from CH"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 2\xD72 A with characteristic polynomial \u03BB\xB2 \u2212 \u03BB \u2212 1 (Fibonacci-like), express A\u2074 = a\xB7A + b\xB7I. The coefficient a is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "By Cayley-Hamilton, A² = A + I. Iterate to reduce A⁴ to a linear combination of A and I."
    }, {
      label: "Key step",
      text: "A³ = A·A² = A(A + I) = A² + A = (A + I) + A = 2A + I."
    }, {
      label: "Near-complete",
      text: "A⁴ = A·A³ = A(2A + I) = 2A² + A = 2(A + I) + A = 3A + 2I. So a = 3."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Iterate Cayley-Hamilton to reduce A⁴ to lower powers."
      }, {
        label: "KEY STEP",
        body: "Char poly λ² − λ − 1 = 0 ⇒ A² = A + I.\nA³ = A · A² = A(A + I) = A² + A = (A + I) + A = 2A + I.\nA⁴ = A · A³ = A(2A + I) = 2A² + A = 2(A + I) + A = 3A + 2I."
      }, {
        label: "COMPUTATION",
        body: "A⁴ = 3A + 2I ⇒ a = 3, b = 2."
      }, {
        label: "VERIFICATION",
        body: "Fibonacci pattern: Aᵏ = Fₖ·A + Fₖ₋₁·I. For k = 4: F₄ = 3, F₃ = 2. ✓\nEigenvalue check: φ⁴ = (φ + 1)² = 3φ + 2 ✓ (where φ is the golden ratio root)."
      }],
      gateCheck: "Recursive substitution via Cayley-Hamilton.",
      speed: "90s.",
      whatMadeHard: "Repeating substitution without arithmetic slips.",
      generalization: "Fibonacci pattern Aᵏ = Fₖ·A + Fₖ₋₁·I for this char poly.",
      linkedConcept: "C7.2."
    }
  }, {
    id: "c72-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["Det via CH"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 A with eigvals 1, 2, 3, find det(A\xB3 - 6A\xB2 + 11A - 6I):"),
    options: ["0", "12", "36", "Cannot determine"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Char poly = (λ-1)(λ-2)(λ-3) = λ³ - 6λ² + 11λ - 6. By CH, A³ - 6A² + 11A - 6I = 0."
    }, {
      label: "Key step",
      text: "det(0) = 0."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Recognize char poly."
      }, {
        label: "KEY STEP",
        body: "Char poly: p(λ) = (λ-1)(λ-2)(λ-3) = λ³ - 6λ² + 11λ - 6. CH: p(A) = 0. So matrix is 0, det = 0."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal CH application."
      }],
      gateCheck: "Recognize char poly = polynomial.",
      speed: "20s.",
      whatMadeHard: "Recognition.",
      generalization: "Universal.",
      linkedConcept: "C7.2.",
      negAdvisory: "Attempt: CH. (A) wins."
    }
  }, {
    id: "c72-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["CH Inverse"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For invertible A, p(A) = 0 (char poly) implies A\u207B\xB9 is a polynomial in:"),
    options: ["A.", "A⁻¹.", "p(A).", "I."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Solve p(A) = 0 for I: c₀I = -Aⁿ - cₙ₋₁Aⁿ⁻¹ - ... So I = (poly in A). A⁻¹ = (poly in A)/c₀."
    }, {
      label: "Key step",
      text: "A⁻¹ expressible as polynomial in A."
    }, {
      label: "Near-complete",
      text: "(A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "CH inversion."
      }, {
        label: "KEY STEP",
        body: "p(A) = Aⁿ + ... + c₁A + c₀I = 0 → c₀I = -(Aⁿ + ... + c₁A) → multiply by A⁻¹/c₀: A⁻¹ = -(Aⁿ⁻¹ + ... + c₁I)/c₀ — polynomial in A."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "A⁻¹ from CH is poly in A.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.2.",
      negAdvisory: "Attempt: derivation. (A) wins."
    }
  }, {
    id: "c72-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["KILLER", "A⁻¹ via CH"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For 3\xD73 A with char poly \u03BB\xB3 \u2212 6\u03BB\xB2 + 11\u03BB \u2212 6, A\u207B\xB9 equals:"),
    options: ["(A² − 6A + 11I) / 6", "(6I − 11A + A²) / 6", "(6I + A − A²) / 11", "Cannot determine."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Apply Cayley-Hamilton: p(A) = 0. Then multiply both sides by A⁻¹ to isolate it."
    }, {
      label: "Key step",
      text: "p(A) = A³ − 6A² + 11A − 6I = 0. Multiply both sides by A⁻¹: A² − 6A + 11I − 6A⁻¹ = 0."
    }, {
      label: "Near-complete",
      text: "Solve for A⁻¹: 6A⁻¹ = A² − 6A + 11I ⇒ A⁻¹ = (A² − 6A + 11I)/6. Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Cayley-Hamilton inversion algorithm."
      }, {
        label: "KEY STEP",
        body: "By CH, p(A) = A³ − 6A² + 11A − 6I = 0.\nMultiply both sides by A⁻¹: A² − 6A + 11I − 6A⁻¹ = 0.\nRearrange: 6A⁻¹ = A² − 6A + 11I ⇒ A⁻¹ = (A² − 6A + 11I) / 6."
      }, {
        label: "COMPUTATION",
        body: "Answer (A)."
      }, {
        label: "VERIFICATION",
        body: "Eigenvalue check: A has eigvals 1, 2, 3 (roots of char poly). A⁻¹ should have eigvals 1, 1/2, 1/3.\nEvaluate p(λ)/6 with p(λ) = λ² − 6λ + 11:\nλ=1: (1−6+11)/6 = 6/6 = 1 ✓.\nλ=2: (4−12+11)/6 = 3/6 = 1/2 ✓.\nλ=3: (9−18+11)/6 = 2/6 = 1/3 ✓."
      }],
      gateCheck: "Same template for any A.",
      speed: "60s.",
      whatMadeHard: "Algebra.",
      generalization: "Universal.",
      linkedConcept: "C7.2.",
      negAdvisory: "Attempt: derivation. (A) ≡ (B) wins."
    }
  }];
  const C72_TECHNIQUES = [{
    name: "Cayley-Hamilton Power Reducer",
    type: "Structural Insight",
    when: "Computing Aⁿ for large n.",
    steps: ["Find char poly p(λ).", "p(A) = 0 → solve for highest power.", "Substitute recursively to reduce Aⁿ to polynomial in lower powers."],
    speed: "Algorithm; per power 30s.",
    example: "See problems.",
    danger: "Algebra.",
    freq: "Occasional"
  }, {
    name: "CH Inverse Derivation",
    type: "Structural Insight",
    when: "Find A⁻¹ from char poly.",
    steps: ["p(A) = Aⁿ + cₙ₋₁Aⁿ⁻¹ + ... + c₀I = 0.", "Require c₀ ≠ 0 (else A singular).", "Multiply by A⁻¹ to isolate.", "Solve."],
    speed: "60s.",
    example: "See KILLER.",
    danger: "c₀ = 0 → singular.",
    freq: "Occasional"
  }];
  const C72_MISTAKES = [{
    name: "Char Poly Mistake",
    wrong: ["Problem: char poly of 2×2 [[a, b],[c, d]].", "Solution: λ² + tr·λ + det."],
    errorLine: 0,
    errorDescription: "Sign: λ² - tr·λ + det.",
    rootCause: "Sign error.",
    correct: "λ² - tr·λ + det.",
    prevention: "Memorize.",
    gateCost: "Wrong CH application.",
    frequency: "Common"
  }];
  const C72_PYQS = [{
    year: "2011-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2011 pattern.)"), /*#__PURE__*/React.createElement("br", null), "For 2\xD72 A with char eq \u03BB\xB2-5\u03BB+6=0, A\xB2 = ___."),
    solution: [{
      label: "CH",
      body: "A² = 5A - 6I."
    }]
  }, {
    year: "2015-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2015 pattern.)"), /*#__PURE__*/React.createElement("br", null), "For 3\xD73 A with eigvals 1, 2, 3, det(A\xB3 - 6A\xB2 + 11A - 6I) = ___."),
    solution: [{
      label: "CH",
      body: "Char poly = λ³ - 6λ² + 11λ - 6. p(A) = 0 → det = 0."
    }]
  }, {
    year: "2018-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2018 pattern.)"), /*#__PURE__*/React.createElement("br", null), "Find A\u207B\xB9 via CH for 2\xD72 A with char poly \u03BB\xB2 - 3\u03BB + 2."),
    solution: [{
      label: "CH",
      body: "A² - 3A + 2I = 0 → 2A⁻¹ = 3I - A → A⁻¹ = (3I-A)/2."
    }]
  }, {
    year: "2020-Style",
    marks: 2,
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "(GATE CS 2020 pattern.)"), /*#__PURE__*/React.createElement("br", null), "A satisfies its own char poly is which theorem?"),
    solution: [{
      label: "ANSWER",
      body: "Cayley-Hamilton."
    }]
  }];
  function ConceptLab72({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 2,
      title: "Cayley-Hamilton \u2014 p(A) = 0 Always",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "A satisfies its own char poly. Used for: power reduction (A\u207F), inverse derivation (A\u207B\xB9), and matrix function identities."),
      patterns: C72_PATTERNS,
      problems: C72_PROBLEMS,
      techniques: C72_TECHNIQUES,
      mistakes: C72_MISTAKES,
      pyqs: C72_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 7.3 — AB vs BA EIGENVALUES
     ════════════════════════════════════════════════════════════════ */
  const C73_PATTERNS = [{
    name: "Non-Zero Eigvals Shared",
    surface: "Asked relation between eigvals of AB and BA.",
    testing: "Non-zero eigvals are identical (with multiplicities).",
    signals: ["\"AB vs BA\""],
    firstMove: "Non-zero eigvals match. 0 eigvals may differ (if sizes differ).",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "AB and BA Same Size",
    surface: "Both are n×n.",
    testing: "Identical char polys; ALL eigvals (including 0) match.",
    signals: ["\"both n×n\""],
    firstMove: "Identical eigvals.",
    timeBudget: 20,
    frequency: "Frequent"
  }, {
    name: "AB and BA Different Sizes",
    surface: "A m×n, B n×m. AB is m×m, BA is n×n.",
    testing: "Non-zero eigvals match. Zero counts: m - rank for AB, n - rank for BA.",
    signals: ["\"A 3×5, B 5×3\""],
    firstMove: "Non-zero match. Zero counts differ.",
    timeBudget: 30,
    frequency: "Occasional"
  }];
  const C73_PROBLEMS = [{
    id: "c73-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["AB vs BA"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For square A, B of same size, AB and BA have:"),
    options: ["Identical eigenvalues.", "Different eigenvalues.", "Same non-zero eigvals only.", "No relation."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Same size: identical char polys."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Identical."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Same size theorem."
      }, {
        label: "KEY STEP",
        body: "AB and BA share char poly when both n×n. Hence identical eigvals."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "tr(AB) = tr(BA) → sum of eigvals matches."
      }],
      gateCheck: "Same size → identical.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.3.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c73-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["AB vs BA Diff Size"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For A 2\xD73 and B 3\xD72, AB and BA have:"),
    options: ["Identical eigenvalues.", "Same non-zero eigenvalues; zero counts may differ.", "No relation.", "Different signs."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Different sizes: non-zero match."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Same non-zero."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Different size theorem."
      }, {
        label: "KEY STEP",
        body: "Non-zero eigvals identical. Zero counts: AB has m - rank, BA has n - rank zero eigvals."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Non-zero match.",
      speed: "Direct.",
      whatMadeHard: "Distractor (A).",
      generalization: "Universal.",
      linkedConcept: "C7.3.",
      negAdvisory: "Attempt: theorem. (B) wins."
    }
  }, {
    id: "c73-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["AB vs BA — Cyclic Trace"],
    statement: /*#__PURE__*/React.createElement("span", null, "Let A and B be 2\xD72 matrices with eigenvalues ", "{", "2, 3", "}", " and ", "{", "1, \u22121", "}", " respectively. Which of the following ALWAYS holds (regardless of the specific A, B)?"),
    options: ["tr(AB) = tr(BA) and det(AB) = det(BA).", "tr(AB) > tr(BA).", "AB = BA.", "det(AB) = det(A) + det(B)."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Two identities are universal for any A, B (same size): trace is cyclic, and determinant is multiplicative."
    }, {
      label: "Key step",
      text: "tr(AB) = tr(BA) (cyclic property). det(AB) = det(A)·det(B) = det(B)·det(A) = det(BA)."
    }, {
      label: "Near-complete",
      text: "Both identities hold for ANY A, B of the same size. Answer (A)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Identities that are universal for matrix products."
      }, {
        label: "KEY STEP",
        body: "tr(AB) = Σᵢⱼ AᵢⱼBⱼᵢ = Σⱼᵢ BⱼᵢAᵢⱼ = tr(BA) — cyclic.\ndet(AB) = det(A)·det(B) = det(B)·det(A) = det(BA) — scalar multiplication commutes."
      }, {
        label: "COMPUTATION",
        body: "Answer (A). Both identities hold regardless of specific A, B."
      }, {
        label: "VERIFICATION",
        body: "(B) tr(AB) − tr(BA) = 0 always, not strictly > or <. (C) AB ≠ BA generally (matrix mult non-commutative). (D) det of sum doesn't decompose."
      }],
      gateCheck: "Cyclic trace + multiplicative det are universal.",
      speed: "30s.",
      whatMadeHard: "Distractor (C) preys on confusion of identity-of-product vs equality-of-matrices.",
      generalization: "Universal for any square A, B of the same size.",
      linkedConcept: "C2.5, C7.3.",
      negAdvisory: "Attempt: theorems. (A) wins."
    }
  }, {
    id: "c73-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Zero Counts"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For A 3\xD75 and B 5\xD73 with rank(AB) = 2, the number of zero eigvals of AB is:"),
    options: ["1", "2", "3", "5"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "AB is 3×3. Zero eigvals ≥ 3 - rank = 3 - 2 = 1."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "AB size 3×3. Zero count via rank."
      }, {
        label: "KEY STEP",
        body: "AB is 3×3 with rank 2. Number of zero eigvals = nullity = 3 - 2 = 1 (for diagonalizable; could be more if defective)."
      }, {
        label: "COMPUTATION",
        body: "(A) minimum."
      }, {
        label: "VERIFICATION",
        body: "BA is 5×5 with rank ≤ 2 → zero eigvals = 5 - 2 = 3 (minimum)."
      }],
      gateCheck: "Different zero counts.",
      speed: "30s.",
      whatMadeHard: "Size tracking.",
      generalization: "Universal.",
      linkedConcept: "C7.3.",
      negAdvisory: "Attempt: rank-nullity. (A) wins."
    }
  }, {
    id: "c73-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 50,
    tags: ["Non-Zero Match"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If AB has non-zero eigval \u03BB, then BA has:"),
    options: ["λ as non-zero eigval.", "-λ.", "1/λ.", "No relation."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Theorem: non-zero eigvals match."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "λ."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Non-zero match."
      }, {
        label: "KEY STEP",
        body: "If ABv = λv (v ≠ 0, λ ≠ 0), then BA(Bv) = B(AB·v) = B·λv = λ·Bv. So Bv is eigvec of BA with eigval λ (Bv ≠ 0 since λBv ≠ 0)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Standard proof."
      }],
      gateCheck: "Same non-zero.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.3.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c73-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 75,
    tags: ["Full Eig Match"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 A and B (both square), if AB has eigvals 0, 2, 5, then BA has eigvals ___, 2, 5. The missing value is ___."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Same size → identical eigvals."
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
        body: "Same size theorem."
      }, {
        label: "KEY STEP",
        body: "AB and BA share full spectrum when same size: 0, 2, 5."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Same size identical.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.3."
    }
  }, {
    id: "c73-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 75,
    tags: ["Sig Diff"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For A 2\xD73 and B 3\xD72, the size of AB is 2\xD72 and BA is 3\xD73. AB has non-zero eigvals 4 and 9. BA has non-zero eigvals:"),
    options: ["4 and 9.", "16 and 81.", "2 and 3.", "Different from AB."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Same non-zero."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "4, 9."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Non-zero match across sizes."
      }, {
        label: "KEY STEP",
        body: "AB and BA share non-zero eigvals: 4, 9. BA has also additional 0 (since 3×3 vs 2×2)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "BA: 4, 9, 0."
      }],
      gateCheck: "Non-zero match.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.3.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c73-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["det(AB)"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 A and 3\xD73 B with det(A) = 2, det(B) = 3, det(AB) = ___ and det(BA) = ___."),
    options: ["6, 5", "6, 6", "5, 6", "Cannot determine"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "det(AB) = det(A)·det(B) = 6 = det(BA)."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Both 6."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "det product rule."
      }, {
        label: "KEY STEP",
        body: "det(AB) = det A · det B = 6. det(BA) = det B · det A = 6 (commutative product of scalars)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Both 6."
      }],
      gateCheck: "det(AB) = det(BA).",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c73-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Proof"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " Prove: if A is m\xD7n and B is n\xD7m, then AB and BA share non-zero eigenvalues. Which is the KEY STEP?"),
    options: ["If ABv = λv, λ ≠ 0, then B(Bv) ≠ 0. Hmm, not quite.", "If ABv = λv, λ ≠ 0, then BA(Bv) = λ(Bv) and Bv ≠ 0.", "Use det(AB - λI) = det(BA - λI).", "Both (B) and (C) — different proofs."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "Two proofs available."
    }, {
      label: "Key step",
      text: "(D)."
    }, {
      label: "Near-complete",
      text: "Both work."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Theorem proof."
      }, {
        label: "KEY STEP",
        body: "PROOF 1 (Direct): ABv = λv, λ ≠ 0 → BA(Bv) = B(ABv) = B(λv) = λ(Bv). Bv ≠ 0 (since AB·v ≠ 0).\n\nPROOF 2 (Polynomial): det(AB - λI_m) = (-λ)^(m-n) · det(BA - λI_n). For λ ≠ 0, eigval of AB ⇔ eigval of BA."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "Standard proof."
      }],
      gateCheck: "Memorize one proof.",
      speed: "60s.",
      whatMadeHard: "Proof structure.",
      generalization: "Universal.",
      linkedConcept: "C7.3.",
      negAdvisory: "Attempt: proof. (D) wins."
    }
  }];
  const C73_TECHNIQUES = [{
    name: "AB vs BA Non-Zero Match",
    type: "Structural Insight",
    when: "Asked relation between eigvals.",
    steps: ["Non-zero eigvals (with multiplicity) identical.", "Same size: zero counts also match.", "Different sizes: zero counts may differ (m - rank vs n - rank)."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Don't assume all eigvals match for different sizes.",
    freq: "Frequent"
  }];
  const C73_MISTAKES = [{
    name: "Assume AB = BA always",
    wrong: ["Problem: Are AB and BA same matrix?", "Solution: Yes."],
    errorLine: 0,
    errorDescription: "AB ≠ BA generally; only eigvals match.",
    rootCause: "Confusing equivalence with equality.",
    correct: "Same eigvals but different matrices.",
    prevention: "Distinguish.",
    gateCost: "Major error.",
    frequency: "Common"
  }];
  const C73_PYQS = [];
  function ConceptLab73({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 3,
      title: "AB vs BA Eigenvalues \u2014 Same Non-Zero Spectrum",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Even when AB \u2260 BA, they share non-zero eigenvalues. Same size: identical spectra. Different sizes: shared non-zeros, different zero counts."),
      patterns: C73_PATTERNS,
      problems: C73_PROBLEMS,
      techniques: C73_TECHNIQUES,
      mistakes: C73_MISTAKES,
      pyqs: C73_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 7.4 — POWERS + p(A) (Full Eigval Table)
     ════════════════════════════════════════════════════════════════ */
  const C74_PATTERNS = [{
    name: "Full f(A) Table",
    surface: "Asked eigvals of f(A) for f ∈ {Aⁿ, A⁻¹, A-cI, cA, p(A), Aᵀ}.",
    testing: "Memorize the table.",
    signals: ["\"eigvals of A^k\""],
    firstMove: "Apply correct rule.",
    timeBudget: 15,
    frequency: "Very Frequent"
  }];
  const C74_PROBLEMS = [{
    id: "c74-e1",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 15,
    tags: ["A^n"],
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB = 3 is eigval of A, then \u03BB is eigval of A\u2074 as ___."),
    answer: 81,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "3⁴ = 81."
    }, {
      label: "Near-complete",
      text: "81."
    }, {
      label: "Conceptual redirect",
      text: "λⁿ rule."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Power rule."
      }, {
        label: "KEY STEP",
        body: "3⁴ = 81."
      }, {
        label: "COMPUTATION",
        body: "81."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "λⁿ.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c74-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 15,
    tags: ["A^-1"],
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB = 4 is eigval of A, then eigval of A\u207B\xB9 is ___."),
    answer: 0.25,
    tolerance: 0.001,
    hints: [{
      label: "Key step",
      text: "1/4 = 0.25."
    }, {
      label: "Near-complete",
      text: "0.25."
    }, {
      label: "Conceptual redirect",
      text: "1/λ rule."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Inverse rule."
      }, {
        label: "KEY STEP",
        body: "1/4 = 0.25."
      }, {
        label: "COMPUTATION",
        body: "0.25."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "1/λ.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c74-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 25,
    tags: ["A - cI"],
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB = 5 is eigval of A, eigval of A - 2I is ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "5 - 2 = 3."
    }, {
      label: "Near-complete",
      text: "3."
    }, {
      label: "Conceptual redirect",
      text: "Shift rule."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Shift."
      }, {
        label: "KEY STEP",
        body: "3."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "λ - c.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c74-m2",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 25,
    tags: ["cA"],
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB = 4 is eigval of A, eigval of 3A is ___."),
    answer: 12,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "3·4 = 12."
    }, {
      label: "Near-complete",
      text: "12."
    }, {
      label: "Conceptual redirect",
      text: "Scale rule."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Scale."
      }, {
        label: "KEY STEP",
        body: "12."
      }, {
        label: "COMPUTATION",
        body: "12."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "cλ.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c74-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 30,
    tags: ["p(A)"],
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB = 2 is eigval of A, then eigval of A\xB2 + 3A - I is ___."),
    answer: 9,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "p(2) = 4 + 6 - 1 = 9."
    }, {
      label: "Near-complete",
      text: "9."
    }, {
      label: "Conceptual redirect",
      text: "p(λ)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Polynomial."
      }, {
        label: "KEY STEP",
        body: "p(2) = 9."
      }, {
        label: "COMPUTATION",
        body: "9."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "p(λ).",
      speed: "10s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c74-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 30,
    tags: ["A^T"],
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB = 5 is eigval of A, then eigval of A\u1D40 is ___."),
    answer: 5,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "Same."
    }, {
      label: "Near-complete",
      text: "5."
    }, {
      label: "Conceptual redirect",
      text: "Aᵀ has same eigvals as A."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Transpose."
      }, {
        label: "KEY STEP",
        body: "det(Aᵀ - λI) = det((A - λI)ᵀ) = det(A - λI). Same eigvals."
      }, {
        label: "COMPUTATION",
        body: "5."
      }, {
        label: "VERIFICATION",
        body: "Eigenvectors differ."
      }],
      gateCheck: "Aᵀ same eigvals.",
      speed: "Direct.",
      whatMadeHard: "Distractor (eigenvectors different).",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c74-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 50,
    tags: ["Polynomial of A"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 A with eigenvalues 1, 2, 3, the sum of eigenvalues of (A\xB2 \u2212 I)(A \u2212 2I) is ___."),
    answer: 8,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "For polynomial p, eigenvalues of p(A) are p(λᵢ). Their sum = trace = Σ p(λᵢ)."
    }, {
      label: "Key step",
      text: "p(λ) = (λ² − 1)(λ − 2). Evaluate: p(1) = 0·(−1) = 0. p(2) = 3·0 = 0. p(3) = 8·1 = 8."
    }, {
      label: "Near-complete",
      text: "Sum = 0 + 0 + 8 = 8."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Polynomial-of-A → polynomial-of-eigenvalues rule."
      }, {
        label: "KEY STEP",
        body: "p(λ) = (λ² − 1)(λ − 2). Compute at each eigenvalue:\np(1) = (1 − 1)(1 − 2) = 0 · (−1) = 0.\np(2) = (4 − 1)(2 − 2) = 3 · 0 = 0.\np(3) = (9 − 1)(3 − 2) = 8 · 1 = 8."
      }, {
        label: "COMPUTATION",
        body: "Sum of eigenvalues of p(A) = 0 + 0 + 8 = 8."
      }, {
        label: "VERIFICATION",
        body: "Two eigenvalues are zero (since p has roots at λ = 1, 2, ±1) ⇒ p(A) is singular and rank-1."
      }],
      gateCheck: "p(λ) for each.",
      speed: "30s.",
      whatMadeHard: "Computation.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c74-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 50,
    tags: ["Combination"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If \u03BB is eigval of A, eigvals of A\xB2 + 2A + I is:"),
    options: ["(λ+1)²", "λ² + 2λ + 1", "Both (A) and (B)", "λ² + 2"],
    answer: "C",
    hints: [{
      label: "Key step",
      text: "λ² + 2λ + 1 = (λ+1)²."
    }, {
      label: "Near-complete",
      text: "(C)."
    }, {
      label: "Conceptual redirect",
      text: "Algebraic identity."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "p(λ) form."
      }, {
        label: "KEY STEP",
        body: "p(λ) = λ² + 2λ + 1 = (λ+1)²."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Equivalent forms.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4.",
      negAdvisory: "Attempt: identity. (C) wins."
    }
  }, {
    id: "c74-k1",
    difficulty: "killer",
    kind: "nat",
    marks: 2,
    timeTarget: 100,
    tags: ["KILLER", "Combined"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For 3\xD73 A with eigvals 1, 2, 3, find det((A\xB2 - 4I)(A + I))."),
    answer: 0,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "p(λ) = (λ²-4)(λ+1)."
    }, {
      label: "Key step",
      text: "p(1) = -3·2 = -6. p(2) = 0·3 = 0. p(3) = 5·4 = 20. det = product = 0."
    }, {
      label: "Near-complete",
      text: "0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "p(A) eigvals + det."
      }, {
        label: "KEY STEP",
        body: "p(λ) = (λ²-4)(λ+1). p(1)=-6, p(2)=0, p(3)=20. det = -6·0·20 = 0."
      }, {
        label: "COMPUTATION",
        body: "0."
      }, {
        label: "VERIFICATION",
        body: "p(2) = 0 since λ=2 is root of λ²-4."
      }],
      gateCheck: "Spot zero factor.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }];
  const C74_TECHNIQUES = [{
    name: "Full f(A) → f(λ) Table",
    type: "Speed Shortcut",
    when: "Any function-of-A eigenvalue question.",
    steps: ["Aⁿ → λⁿ.", "A⁻¹ → 1/λ.", "A - cI → λ - c.", "cA → cλ.", "p(A) → p(λ).", "Aᵀ → λ (same eigvals)."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Aᵀ has same eigvals but different eigenvectors.",
    freq: "Very Frequent"
  }];
  const C74_MISTAKES = [];
  const C74_PYQS = [];
  function ConceptLab74({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 4,
      title: "Eigenvalues of Powers + p(A) \u2014 The Full Table",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Memorize 6 rows: A\u207F \u2192 \u03BB\u207F, A\u207B\xB9 \u2192 1/\u03BB, A-cI \u2192 \u03BB-c, cA \u2192 c\u03BB, p(A) \u2192 p(\u03BB), A\u1D40 \u2192 \u03BB."),
      patterns: C74_PATTERNS,
      problems: C74_PROBLEMS,
      techniques: C74_TECHNIQUES,
      mistakes: C74_MISTAKES,
      pyqs: C74_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 7.5 — DIAGONALIZATION A = PDP⁻¹
     ════════════════════════════════════════════════════════════════ */
  const C75_PATTERNS = [{
    name: "Power via Diagonalization",
    surface: "Compute Aᵏ for diagonalizable A.",
    testing: "Aᵏ = PDᵏP⁻¹.",
    signals: ["\"Aᵏ\""],
    firstMove: "Diagonalize A = PDP⁻¹; then Aᵏ = PDᵏP⁻¹.",
    timeBudget: 90,
    frequency: "Frequent"
  }, {
    name: "Diagonalizable Construction",
    surface: "Given eigvals + eigvecs, build PDP⁻¹.",
    testing: "P = [v₁ | v₂ | ...], D = diag(λ).",
    signals: ["\"P and D\""],
    firstMove: "Columns of P = eigvecs; D diagonal of eigvals.",
    timeBudget: 30,
    frequency: "Frequent"
  }];
  const C75_PROBLEMS = [{
    id: "c75-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Diag Form"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Diagonalizable A = PDP\u207B\xB9. Then A\u1D4F = ___."),
    options: ["P⁻¹DᵏP", "PDᵏP⁻¹", "P⁻¹DᵏP⁻¹", "Pᵏ"],
    answer: "B",
    hints: [{
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "PDᵏP⁻¹."
    }, {
      label: "Conceptual redirect",
      text: "P, P⁻¹ cancel telescopically."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Power formula."
      }, {
        label: "KEY STEP",
        body: "Aᵏ = (PDP⁻¹)ᵏ = PDᵏP⁻¹."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Telescoping."
      }],
      gateCheck: "PDᵏP⁻¹.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.5.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c75-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["Cond Diag"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "A 3\xD73 matrix is diagonalizable iff:"),
    options: ["Distinct eigenvalues.", "Has 3 LI eigenvectors.", "Symmetric.", "Singular."],
    answer: "B",
    hints: [{
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "3 LI eigenvectors."
    }, {
      label: "Conceptual redirect",
      text: "iff Σ gm = n."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Diagonalizable condition."
      }, {
        label: "KEY STEP",
        body: "Iff n LI eigvecs (equivalently, Σ gm = n)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "(A) sufficient not necessary, (C) sufficient not necessary."
      }],
      gateCheck: "n LI eigvecs.",
      speed: "Direct.",
      whatMadeHard: "Distractors.",
      generalization: "Universal.",
      linkedConcept: "C6.4.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c75-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["A^k Diag"],
    statement: /*#__PURE__*/React.createElement("span", null, "Diagonal A = diag(2, 3). The (1, 1) entry of A\u2075 is ___."),
    answer: 32,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "2⁵ = 32."
    }, {
      label: "Near-complete",
      text: "32."
    }, {
      label: "Conceptual redirect",
      text: "Diagonal: A^k = diag(λᵢ^k)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Diagonal power."
      }, {
        label: "KEY STEP",
        body: "2⁵ = 32."
      }, {
        label: "COMPUTATION",
        body: "32."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Diag rule.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.5."
    }
  }, {
    id: "c75-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["P and D"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A = PDP\u207B\xB9, columns of P are:"),
    options: ["Rows of A.", "Eigenvectors of A.", "Eigenvalues of A.", "Random."],
    answer: "B",
    hints: [{
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Eigenvectors."
    }, {
      label: "Conceptual redirect",
      text: "By construction."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Diag construction."
      }, {
        label: "KEY STEP",
        body: "P = [v₁|v₂|...|vₙ], eigenvectors."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "D = diag(λᵢ) in matching order."
      }],
      gateCheck: "Eigenvectors as columns.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.5.",
      negAdvisory: "Attempt: definition. (B) wins."
    }
  }, {
    id: "c75-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Symmetric Diag"],
    statement: /*#__PURE__*/React.createElement("span", null, "For symmetric 2\xD72 A with eigvals 3 and -1, A\u2074 has eigvals ___ and ___."),
    answer: 1,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "3⁴ = 81, (-1)⁴ = 1."
    }, {
      label: "Near-complete",
      text: "1."
    }, {
      label: "Conceptual redirect",
      text: "Smaller of 81, 1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Power."
      }, {
        label: "KEY STEP",
        body: "81, 1."
      }, {
        label: "COMPUTATION",
        body: "Smaller = 1."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "λ^k.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.5."
    }
  }, {
    id: "c75-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["Polynomial of A", "det = Πλ"],
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A with eigenvalues 1, \u22121, 2, find det(A\u2076 + A\u2074 + A\xB2 + I)."),
    answer: 1360,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "p(A) eigenvalues are p(λᵢ). det = product of eigenvalues."
    }, {
      label: "Key step",
      text: "p(λ) = λ⁶ + λ⁴ + λ² + 1. p(1) = 1+1+1+1 = 4. p(−1) = 1+1+1+1 = 4. p(2) = 64 + 16 + 4 + 1 = 85."
    }, {
      label: "Near-complete",
      text: "det = 4 · 4 · 85 = 1360."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "f(A) eigenvalues + det = product of eigenvalues."
      }, {
        label: "KEY STEP",
        body: "p(λ) = λ⁶ + λ⁴ + λ² + 1.\np(1) = 1 + 1 + 1 + 1 = 4.\np(−1) = 1 + 1 + 1 + 1 = 4 (even polynomial in λ).\np(2) = 64 + 16 + 4 + 1 = 85."
      }, {
        label: "COMPUTATION",
        body: "det(p(A)) = product of eigenvalues = 4 · 4 · 85 = 1360."
      }, {
        label: "VERIFICATION",
        body: "Note λ = 1 and λ = −1 give the same p value (4) because p is an even polynomial in λ."
      }],
      gateCheck: "Evaluate p(λᵢ) for each eigenvalue, then multiply.",
      speed: "60s.",
      whatMadeHard: "Arithmetic on the 6th power.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c75-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["P^-1 Eigvecs"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For A = PDP\u207B\xB9, the rows of P\u207B\xB9 are:"),
    options: ["Eigvecs of A.", "Eigvecs of Aᵀ (left eigenvectors).", "Rows of A.", "Diagonal of D."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Rows of P⁻¹ are left eigvecs (or eigvecs of Aᵀ)."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Left eigvecs."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "P⁻¹ interpretation."
      }, {
        label: "KEY STEP",
        body: "From AP = PD: P⁻¹A = DP⁻¹. So (i-th row of P⁻¹)·A = λᵢ·(i-th row of P⁻¹). These are left eigenvectors."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "For symmetric A, P is orthogonal: rows of P⁻¹ = rows of Pᵀ = columns of P."
      }],
      gateCheck: "Rows of P⁻¹ = left eigvecs.",
      speed: "30s.",
      whatMadeHard: "Distinction.",
      generalization: "Universal.",
      linkedConcept: "C7.5.",
      negAdvisory: "Attempt: derivation. (B) wins."
    }
  }, {
    id: "c75-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Big Power"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A with all eigvals satisfying |\u03BB| ", "<", " 1, A\u1D4F approaches ___ as k \u2192 \u221E:"),
    options: ["Identity I", "Zero matrix 0", "A⁻¹", "Doesn't converge"],
    answer: "B",
    hints: [{
      label: "Key step",
      text: "λᵏ → 0, so D^k → 0, so A^k → 0."
    }, {
      label: "Near-complete",
      text: "(B)."
    }, {
      label: "Conceptual redirect",
      text: "Decay."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Asymptotic."
      }, {
        label: "KEY STEP",
        body: "|λ| < 1 → λᵏ → 0 → Dᵏ → 0 → Aᵏ = PDᵏP⁻¹ → 0."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Spectral radius < 1.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.5.",
      negAdvisory: "Attempt: convergence. (B) wins."
    }
  }, {
    id: "c75-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["KILLER", "Polynomial Sum"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For 3\xD73 diagonalizable A with eigvals 1, -1, 2, compute eigenvalues of A\u2076 + A\u2074 + A\xB2 + I."),
    options: ["(4, 4, 85).", "(1, 1, 1).", "(4, 4, 64).", "(0, 0, 64)."],
    answer: "A",
    hints: [{
      label: "Key step",
      text: "p(λ) = λ⁶+λ⁴+λ²+1. p(1) = 4. p(-1) = 4. p(2) = 64+16+4+1 = 85."
    }, {
      label: "Near-complete",
      text: "(A)."
    }, {
      label: "Conceptual redirect",
      text: "p(λᵢ) for each."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "f(A) eigvals."
      }, {
        label: "KEY STEP",
        body: "p(λ) evaluated at each: p(1)=4, p(-1)=4, p(2)=85."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Note: λ=1, λ=-1 give SAME value 4 because polynomial is even."
      }],
      gateCheck: "p(λᵢ).",
      speed: "30s.",
      whatMadeHard: "Polynomial eval.",
      generalization: "Universal.",
      linkedConcept: "C7.4.",
      negAdvisory: "Attempt: rule. (A) wins."
    }
  }];
  const C75_TECHNIQUES = [{
    name: "Aᵏ = PDᵏP⁻¹",
    type: "Speed Shortcut",
    when: "Compute Aᵏ.",
    steps: ["Diagonalize: A = PDP⁻¹.", "Aᵏ = PDᵏP⁻¹.", "Dᵏ = diag(λᵢᵏ)."],
    speed: "Algorithm.",
    example: "Universal.",
    danger: "Requires A diagonalizable.",
    freq: "Frequent"
  }];
  const C75_MISTAKES = [];
  const C75_PYQS = [];
  function ConceptLab75({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 5,
      title: "Diagonalization A = PDP\u207B\xB9 \u2014 A\u1D4F Computation",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Once diagonalized, A\u1D4F = PD\u1D4FP\u207B\xB9 is trivial. D\u1D4F = diag(\u03BB\u1D62\u1D4F). The crown jewel of M7."),
      patterns: C75_PATTERNS,
      problems: C75_PROBLEMS,
      techniques: C75_TECHNIQUES,
      mistakes: C75_MISTAKES,
      pyqs: C75_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 7.6 — TOUGH GATE PYQs
     ════════════════════════════════════════════════════════════════ */
  const C76_PATTERNS = [{
    name: "Multi-Concept Synthesis",
    surface: "PYQ combines eigvals + rank + det.",
    testing: "Use all M6+M7 reflexes.",
    signals: ["Real PYQ statement."],
    firstMove: "Identify pattern (trace-det, CH, diag, etc.).",
    timeBudget: 120,
    frequency: "Frequent"
  }];
  const C76_PROBLEMS = [{
    id: "c76-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["PYQ Recall"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For symmetric A 3\xD73 with eigvals all 1, A is:"),
    options: ["Identity I.", "Zero matrix.", "Cannot determine.", "Singular."],
    answer: "A",
    hints: [{
      label: "Key step",
      text: "Symmetric + all eigvals 1 → A = QIQᵀ = QQᵀ = I."
    }, {
      label: "Near-complete",
      text: "(A)."
    }, {
      label: "Conceptual redirect",
      text: "QQᵀ = I for orthogonal Q."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Symmetric diag."
      }, {
        label: "KEY STEP",
        body: "A = QDQᵀ with D = I. A = QQᵀ = I (orthogonal)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Symmetric eigvals → matrix.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.6.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c76-e2",
    difficulty: "easy",
    kind: "nat",
    marks: 1,
    timeTarget: 25,
    tags: ["Trace from Diag"],
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A 3\xD73 with all eigvals = 2, trace(A) = ___."),
    answer: 6,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "Sum = 2 + 2 + 2 = 6."
    }, {
      label: "Near-complete",
      text: "6."
    }, {
      label: "Conceptual redirect",
      text: "trace = Σλ."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Trace = Σλ."
      }, {
        label: "KEY STEP",
        body: "6."
      }, {
        label: "COMPUTATION",
        body: "6."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Σλ.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.7."
    }
  }, {
    id: "c76-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["GATE Trap"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 3\xD73 A with characteristic poly \u03BB\xB3 - 2\u03BB\xB2 + \u03BB = 0 (factored: \u03BB(\u03BB - 1)\xB2), A has eigvals 0, 1, 1. Then rank(A) = ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Diagonalizable assumed: rank = # non-zero eigvals = 2."
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
        body: "Rank from eigvals."
      }, {
        label: "KEY STEP",
        body: "Non-zero: 1, 1. rank = 2 (if diagonalizable)."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "If defective (gm(1) = 1 < am(1) = 2), rank could be 1."
      }],
      gateCheck: "Diag → count non-zero.",
      speed: "Direct.",
      whatMadeHard: "Defective case.",
      generalization: "Universal.",
      linkedConcept: "C7.1."
    }
  }, {
    id: "c76-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["GATE Pattern"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For A 4\xD74 with char poly \u03BB\u2074, A is:"),
    options: ["Identity.", "Nilpotent.", "Diagonal.", "Symmetric."],
    answer: "B",
    hints: [{
      label: "Key step",
      text: "All eigvals 0 ⇒ nilpotent (by CH: A⁴ = 0)."
    }, {
      label: "Near-complete",
      text: "(B)."
    }, {
      label: "Conceptual redirect",
      text: "CH gives A⁴ = 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "All eigvals 0."
      }, {
        label: "KEY STEP",
        body: "CH: p(λ) = λ⁴ → A⁴ = 0 → nilpotent."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "All 0 → nilpotent.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.1.",
      negAdvisory: "Attempt: CH. (B) wins."
    }
  }, {
    id: "c76-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 60,
    tags: ["Eigval p(A)"],
    statement: /*#__PURE__*/React.createElement("span", null, "If 2\xD72 A has eigvals 2 and 3, then trace(A\xB2 + A) = ___."),
    answer: 18,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "(λ² + λ) for each: 6, 12. Sum 18."
    }, {
      label: "Key step",
      text: "18."
    }, {
      label: "Near-complete",
      text: "18."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "f(A) + trace."
      }, {
        label: "KEY STEP",
        body: "p(λ) = λ² + λ. p(2) = 6, p(3) = 12. Sum 18."
      }, {
        label: "COMPUTATION",
        body: "18."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Trace via p(λ).",
      speed: "20s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c76-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Complex Combo"],
    skipSignal: {
      type: "skip",
      text: "Skip if <60%"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For diagonalizable A 3\xD73 with eigvals 1, -1, 2, the rank of A\xB2 - I is:"),
    options: ["0", "1", "2", "3"],
    answer: "B",
    hints: [{
      label: "Key step",
      text: "A² eigvals: 1, 1, 4. A² - I eigvals: 0, 0, 3. rank = # non-zero = 1."
    }, {
      label: "Near-complete",
      text: "(B)."
    }, {
      label: "Conceptual redirect",
      text: "f(A) eigvals + rank."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Combined."
      }, {
        label: "KEY STEP",
        body: "A² has eigvals 1, 1, 4. A² - I has 0, 0, 3. rank = 1."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Sequential rules.",
      speed: "30s.",
      whatMadeHard: "Multi-step.",
      generalization: "Universal.",
      linkedConcept: "C7.4.",
      negAdvisory: "Attempt: rules. (B) wins."
    }
  }, {
    id: "c76-h2",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 80,
    tags: ["Trace Power"],
    statement: /*#__PURE__*/React.createElement("span", null, "For 2\xD72 A with eigvals 2, 3, trace(A\u207F) = ___ when n = 3."),
    answer: 35,
    tolerance: 0,
    hints: [{
      label: "Key step",
      text: "2³ + 3³ = 8 + 27 = 35."
    }, {
      label: "Near-complete",
      text: "35."
    }, {
      label: "Conceptual redirect",
      text: "Σλⁿ."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "trace(Aⁿ) = Σλⁿ."
      }, {
        label: "KEY STEP",
        body: "35."
      }, {
        label: "COMPUTATION",
        body: "35."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Σλⁿ.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.4."
    }
  }, {
    id: "c76-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 90,
    tags: ["Trap"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A is 3\xD73 with rank 2, then A has:"),
    options: ["Exactly 2 non-zero eigvals.", "Always 0 is an eigval.", "Both (A) and (B) — true if diagonalizable.", "Only (B) is guaranteed."],
    answer: "D",
    hints: [{
      label: "Conceptual redirect",
      text: "rank < n always implies 0 is eigval. Non-zero count depends on diagonalizability."
    }, {
      label: "Key step",
      text: "(D)."
    }, {
      label: "Near-complete",
      text: "Only (B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Defective consideration."
      }, {
        label: "KEY STEP",
        body: "rank 2 → 0 eigval with gm = 1 → am ≥ 1. (A) wrong since am(0) could be 2 or 3 if defective. Only 'always 0' (B) is guaranteed."
      }, {
        label: "COMPUTATION",
        body: "(D)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Defective subtlety.",
      speed: "60s.",
      whatMadeHard: "Trap.",
      generalization: "Universal.",
      linkedConcept: "C7.1.",
      negAdvisory: "Attempt: rigor. (D) wins."
    }
  }, {
    id: "c76-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 150,
    tags: ["KILLER", "Hard PYQ"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For 3\xD73 A with eigvals 1, 2, 3, find rank(A\xB2 - 5A + 6I)."),
    options: ["0", "1", "2", "3"],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "p(λ) = λ² - 5λ + 6 = (λ-2)(λ-3). p(1) = 2, p(2) = 0, p(3) = 0. Eigvals: 2, 0, 0. rank = 1."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "rank 1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "p(A) + rank."
      }, {
        label: "KEY STEP",
        body: "p(1)=2, p(2)=0, p(3)=0. Non-zero: 1. rank = 1."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Distinct eigvals → diagonalizable, no defective concern."
      }],
      gateCheck: "f(A) eigvals + rank.",
      speed: "30s.",
      whatMadeHard: "Multi-step.",
      generalization: "Universal.",
      linkedConcept: "C7.4.",
      negAdvisory: "Attempt: rules. (B) wins."
    }
  }];
  const C76_TECHNIQUES = [{
    name: "GATE PYQ Pattern Pack",
    type: "Speed Shortcut",
    when: "Hard PYQ on eigvals.",
    steps: ["Identify which sub-tool: tr/det, CH, p(A), diag.", "Apply chain of reflexes from C6/C7.", "Verify by reading off."],
    speed: "60-120s.",
    example: "Standard.",
    danger: "Defective surprises.",
    freq: "Frequent"
  }];
  const C76_MISTAKES = [];
  const C76_PYQS = [];
  function ConceptLab76({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 6,
      title: "Tough GATE PYQs \u2014 Multi-Concept Synthesis",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Real PYQs combine all M6/M7 reflexes. Practice spotting the pattern, then applying the chain."),
      patterns: C76_PATTERNS,
      problems: C76_PROBLEMS,
      techniques: C76_TECHNIQUES,
      mistakes: C76_MISTAKES,
      pyqs: C76_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     APP ROOT
     ════════════════════════════════════════════════════════════════ */
  const CONCEPTS_MAP = [{
    num: 1,
    shortName: "Rank&Eig",
    title: "Rank & Eigenvalues",
    total: C71_PROBLEMS.length,
    Comp: ConceptLab71
  }, {
    num: 2,
    shortName: "CH",
    title: "Cayley-Hamilton",
    total: C72_PROBLEMS.length,
    Comp: ConceptLab72
  }, {
    num: 3,
    shortName: "AB vs BA",
    title: "AB vs BA Eigenvalues",
    total: C73_PROBLEMS.length,
    Comp: ConceptLab73
  }, {
    num: 4,
    shortName: "f(A)",
    title: "Powers + p(A)",
    total: C74_PROBLEMS.length,
    Comp: ConceptLab74
  }, {
    num: 5,
    shortName: "Diag",
    title: "Diagonalization PDᵏP⁻¹",
    total: C75_PROBLEMS.length,
    Comp: ConceptLab75
  }, {
    num: 6,
    shortName: "Tough",
    title: "Tough GATE PYQs",
    total: C76_PROBLEMS.length,
    Comp: ConceptLab76
  }];
  function App() {
    useEffect(() => {
      hideLoading();
    }, []);
    const p1 = useConceptProgress(1, C71_PROBLEMS.length);
    const p2 = useConceptProgress(2, C72_PROBLEMS.length);
    const p3 = useConceptProgress(3, C73_PROBLEMS.length);
    const p4 = useConceptProgress(4, C74_PROBLEMS.length);
    const p5 = useConceptProgress(5, C75_PROBLEMS.length);
    const p6 = useConceptProgress(6, C76_PROBLEMS.length);
    const progressMap = {
      1: p1,
      2: p2,
      3: p3,
      4: p4,
      5: p5,
      6: p6
    };
    const [active, setActive] = useState(1);
    const totalSolved = [p1, p2, p3, p4, p5, p6].reduce((s, p) => s + p.correct.length, 0);
    const totalProblems = [C71_PROBLEMS, C72_PROBLEMS, C73_PROBLEMS, C74_PROBLEMS, C75_PROBLEMS, C76_PROBLEMS].reduce((s, ps) => s + ps.length, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen"
    }, /*#__PURE__*/React.createElement(TopNav, {
      currentModule: 7
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
    }), " MODULE 7 \xB7 PROBLEM LAB"), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, "Eigenvalue Power Tools \xB7 Problem Lab", /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, "Cayley-Hamilton, AB vs BA, Diagonalization")), /*#__PURE__*/React.createElement("p", {
      className: "text-lg max-w-3xl leading-relaxed mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "6 concept labs: rank-eigval relations, Cayley-Hamilton, AB vs BA spectrum, full f(A) \u2192 f(\u03BB) table, A\u1D4F via diagonalization, and tough GATE PYQ synthesis."), /*#__PURE__*/React.createElement("div", {
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
    }, "6 concept labs \xB7 54 problems \xB7 4 PYQs \xB7 timed drill")), /*#__PURE__*/React.createElement("div", {
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
    }, "Cayley-Hamilton inverse \xB7 AB vs BA proof \xB7 f(A) table"))))), /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto px-5"
    }, /*#__PURE__*/React.createElement(ConceptNavigator, {
      concepts: CONCEPTS_MAP,
      active: active,
      setActive: setActive,
      progressMap: progressMap
    })), /*#__PURE__*/React.createElement(ConceptLab71, {
      progress: p1
    }), /*#__PURE__*/React.createElement(ConceptLab72, {
      progress: p2
    }), /*#__PURE__*/React.createElement(ConceptLab73, {
      progress: p3
    }), /*#__PURE__*/React.createElement(ConceptLab74, {
      progress: p4
    }), /*#__PURE__*/React.createElement(ConceptLab75, {
      progress: p5
    }), /*#__PURE__*/React.createElement(ConceptLab76, {
      progress: p6
    }), /*#__PURE__*/React.createElement(ModuleFooter, {
      moduleNum: 7,
      nextModuleTitle: "Decompositions \u2014 Problem Lab",
      nextModuleFile: "module-08-problem-lab.html",
      checklist: ["For diagonalizable A: rank = # non-zero eigvals.", "0 is an eigenvalue ⇔ A is singular.", "I apply Cayley-Hamilton to reduce Aⁿ for large n.", "I derive A⁻¹ from p(A) = 0 via the CH inversion algorithm.", "AB and BA share non-zero eigenvalues.", "I know the full f(A) → f(λ) table: Aⁿ, A⁻¹, A-cI, cA, p(A), Aᵀ.", "Aᵏ = PDᵏP⁻¹ where D = diag(λᵢ).", "I've cleared all 54 problems."]
    }));
  }
  mountApp(App);
})();