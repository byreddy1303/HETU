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

/* ===== MODULE 8 CONTENT ===== */

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

  const MODULE_NUM = 8;

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
      }, "C8.", c.num), /*#__PURE__*/React.createElement("span", {
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
    }, "PROBLEM LAB \xB7 CONCEPT 8.", num), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-faded)"
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", {
      className: "text-sm",
      style: {
        color: "var(--text-dim)"
      }
    }, "Module 8 \xB7 Decompositions & Types"), /*#__PURE__*/React.createElement("span", {
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
     CONCEPT 8.1 — LU DECOMPOSITION
     ════════════════════════════════════════════════════════════════ */
  const C81_PATTERNS = [{
    name: "LU Operation Count",
    surface: "Asked the operation count for LU and subsequent solves.",
    testing: "Whether you know LU is O(n³) once; each subsequent solve is O(n²).",
    signals: ["\"number of operations\""],
    firstMove: "LU once: O(n³). Per solve: O(n²) forward + back substitution.",
    timeBudget: 30,
    frequency: "Frequent"
  }, {
    name: "LU Existence Condition",
    surface: "Asked when LU exists (without pivoting).",
    testing: "Whether you know all leading principal minors must be non-zero.",
    signals: ["\"does LU exist\""],
    firstMove: "All leading principal minors ≠ 0. Else need PLU.",
    timeBudget: 30,
    frequency: "Occasional"
  }, {
    name: "PLU for General Matrices",
    surface: "Why permutation matrix P is needed.",
    testing: "Whether you know PLU always exists for non-singular A.",
    signals: ["\"PLU\"", "\"partial pivoting\""],
    firstMove: "If A non-singular but LU fails, swap rows: PA = LU.",
    timeBudget: 25,
    frequency: "Occasional"
  }, {
    name: "L and U Properties",
    surface: "Identify which is lower/upper, diagonal of L.",
    testing: "L is lower triangular with 1s on diag (in Doolittle). U is upper triangular.",
    signals: ["\"L is\""],
    firstMove: "L unit lower triangular; U upper triangular.",
    timeBudget: 20,
    frequency: "Frequent"
  }];
  const C81_PROBLEMS = [{
    id: "c81-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["LU Existence"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "LU decomposition exists without row swaps iff:"),
    options: ["All leading principal minors are non-zero.", "A is symmetric.", "A is invertible.", "A is square."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Need pivots through the elimination process."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Leading principal minors ≠ 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "LU existence."
      }, {
        label: "KEY STEP",
        body: "Without row swaps, requires non-zero pivots at each step ⇔ all leading principal minors ≠ 0."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Invertible alone is not sufficient (could need row swap)."
      }],
      gateCheck: "Leading minors all non-zero.",
      speed: "Direct.",
      whatMadeHard: "Distractor (C).",
      generalization: "Universal.",
      linkedConcept: "C8.1.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c81-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 30,
    tags: ["L Form"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "In Doolittle's LU decomposition, the diagonal of L is:"),
    options: ["All zeros.", "All ones.", "Arbitrary.", "Equal to diagonal of A."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "Doolittle = unit lower triangular L."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "All 1s."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "L convention."
      }, {
        label: "KEY STEP",
        body: "Doolittle: L diagonal = 1. Crout: U diagonal = 1."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Standard."
      }],
      gateCheck: "Doolittle vs Crout.",
      speed: "Direct.",
      whatMadeHard: "Convention.",
      generalization: "Universal.",
      linkedConcept: "C8.1.",
      negAdvisory: "Attempt: convention. (B) wins."
    }
  }, {
    id: "c81-m1",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Op Count"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "To solve Ax = b for k different b vectors using LU, total operations are:"),
    options: ["O(n³) per solve.", "O(n²) per solve.", "O(n³) once + O(n²) per solve.", "O(k·n³)."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Factor LU once, then forward + back per b."
    }, {
      label: "Key step",
      text: "(C)."
    }, {
      label: "Near-complete",
      text: "Once O(n³), each O(n²)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "LU complexity."
      }, {
        label: "KEY STEP",
        body: "LU factor: O(n³) ONCE. Then for each b: solve Ly = b (forward sub, O(n²)) and Ux = y (back sub, O(n²)). Total: O(n³ + k·n²)."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "LU once, solve k times.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.1.",
      negAdvisory: "Attempt: complexity. (C) wins."
    }
  }, {
    id: "c81-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 65,
    tags: ["When PLU"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For A = [[0, 1], [1, 0]], standard LU decomposition:"),
    options: ["Exists.", "Doesn't exist (need row swap).", "Equals A itself.", "Equals I."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "(1,1) entry = 0 → no pivot."
    }, {
      label: "Key step",
      text: "Need PLU instead."
    }, {
      label: "Near-complete",
      text: "(B)."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Leading principal minor check."
      }, {
        label: "KEY STEP",
        body: "Top-left = 0 → can't pivot without row swap. Standard LU fails. PLU with P = [[0,1],[1,0]] works: PA = [[1,0],[0,1]] = I."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "0 pivot → PLU.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.1.",
      negAdvisory: "Attempt: pivot test. (B) wins."
    }
  }, {
    id: "c81-m3",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 70,
    tags: ["L Entries"],
    statement: /*#__PURE__*/React.createElement("span", null, "For Doolittle LU of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 4 & 3 \\\\ 6 & 3 \\end{pmatrix}"
    }), ", L\u2082\u2081 = ___."),
    answer: 1.5,
    tolerance: 0.001,
    hints: [{
      label: "Conceptual redirect",
      text: "Multiplier = a₂₁/a₁₁ = 6/4."
    }, {
      label: "Key step",
      text: "1.5."
    }, {
      label: "Near-complete",
      text: "1.5."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Gaussian elimination as L entries."
      }, {
        label: "KEY STEP",
        body: "To eliminate a₂₁: subtract (a₂₁/a₁₁)·R₁ from R₂. Multiplier = 6/4 = 1.5. This becomes L₂₁."
      }, {
        label: "COMPUTATION",
        body: "1.5."
      }, {
        label: "VERIFICATION",
        body: "L = [[1, 0], [1.5, 1]]. U = [[4, 3], [0, -1.5]]. LU = [[4, 3], [6, 3]]. ✓"
      }],
      gateCheck: "Multipliers fill L.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.1."
    }
  }, {
    id: "c81-h1",
    difficulty: "hard",
    kind: "nat",
    marks: 2,
    timeTarget: 90,
    tags: ["U Entry"],
    statement: /*#__PURE__*/React.createElement("span", null, "For LU of ", /*#__PURE__*/React.createElement(T, {
      src: "A = \\begin{pmatrix} 2 & 1 & 1 \\\\ 4 & 3 & 3 \\\\ 8 & 7 & 9 \\end{pmatrix}"
    }), ", the (3, 3) entry of U is ___."),
    answer: 2,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Forward elimination on full matrix."
    }, {
      label: "Key step",
      text: "R₂ - 2R₁: (0, 1, 1). R₃ - 4R₁: (0, 3, 5). R₃ - 3R₂: (0, 0, 2)."
    }, {
      label: "Near-complete",
      text: "2."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Forward elimination."
      }, {
        label: "KEY STEP",
        body: "R₂ → R₂ - 2R₁ = (0, 1, 1). R₃ → R₃ - 4R₁ = (0, 3, 5). R₃ → R₃ - 3R₂ = (0, 0, 2). U[3,3] = 2."
      }, {
        label: "COMPUTATION",
        body: "2."
      }, {
        label: "VERIFICATION",
        body: "L = [[1,0,0],[2,1,0],[4,3,1]]. U = [[2,1,1],[0,1,1],[0,0,2]]. LU = original A. ✓"
      }],
      gateCheck: "Final upper triangular entry.",
      speed: "60s.",
      whatMadeHard: "3x3 reduction.",
      generalization: "Universal.",
      linkedConcept: "C8.1."
    }
  }, {
    id: "c81-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["det via LU"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "If A = LU (Doolittle), then det(A) = ___."),
    options: ["Product of L's diagonal.", "Product of U's diagonal.", "Product of all diagonal entries of L AND U.", "Always 1."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "det(A) = det(L)·det(U). L unit triangular → det(L) = 1."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "Product of U's diag."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Det via factorization."
      }, {
        label: "KEY STEP",
        body: "det(A) = det(L)·det(U). L triangular with 1s on diag → det L = 1. U triangular → det U = product of diag(U)."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Det shortcut via LU.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C5.2.",
      negAdvisory: "Attempt: rule. (B) wins."
    }
  }, {
    id: "c81-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["LU Uniqueness"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "LU decomposition (with L unit lower triangular) is:"),
    options: ["Unique when it exists.", "Never unique.", "Sometimes unique.", "Unique only for invertible A."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Theorem."
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
        body: "Uniqueness theorem."
      }, {
        label: "KEY STEP",
        body: "If LU exists (no pivoting), the decomposition is unique (fixing L's diagonal to 1)."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Unique when exists.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.1.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c81-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Op Count Realistic"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " For 1000\xD71000 matrix A, solving Ax = b for 5 different b vectors via LU takes approximately:"),
    options: ["5 · 10⁹ operations.", "10⁹ + 5 · 10⁶ operations.", "5 · 10⁶ operations.", "10⁹ · 5 operations."],
    answer: "B",
    hints: [{
      label: "Conceptual redirect",
      text: "LU once O(n³) ≈ 10⁹. Per solve O(n²) ≈ 10⁶."
    }, {
      label: "Key step",
      text: "(B)."
    }, {
      label: "Near-complete",
      text: "10⁹ + 5·10⁶."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Apply complexity to real numbers."
      }, {
        label: "KEY STEP",
        body: "LU: O(n³) = 10⁹. Per b: O(n²) = 10⁶. Total: 10⁹ + 5·10⁶ ≈ 10⁹."
      }, {
        label: "COMPUTATION",
        body: "(B)."
      }, {
        label: "VERIFICATION",
        body: "Comparison: Gaussian elimination each time would cost 5·10⁹ = 5 billion ops. LU saves a factor of 5."
      }],
      gateCheck: "Realistic application.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.1.",
      negAdvisory: "Attempt: complexity. (B) wins."
    }
  }];
  const C81_TECHNIQUES = [{
    name: "LU Existence Test",
    type: "Trap Avoidance",
    when: "Asked if LU works.",
    steps: ["Check all leading principal minors non-zero.", "If any is 0, must use PLU."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Invertibility alone doesn't guarantee LU.",
    freq: "Occasional"
  }, {
    name: "LU Complexity Reflex",
    type: "Speed Shortcut",
    when: "Op count questions.",
    steps: ["LU factor: O(n³).", "Each forward/back sub: O(n²).", "Total for k solves: O(n³ + k·n²)."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Don't multiply n³ by k.",
    freq: "Frequent"
  }];
  const C81_MISTAKES = [{
    name: "Assume Invertible ⇒ LU Always Works",
    wrong: ["Problem: A invertible. Does LU exist?", "Solution: Yes."],
    errorLine: 0,
    errorDescription: "Need leading principal minors ≠ 0, not just det ≠ 0.",
    rootCause: "Over-generalization.",
    correct: "PLU may be needed.",
    prevention: "Check minors.",
    gateCost: "Major conceptual.",
    frequency: "Common"
  }];
  const C81_PYQS = [];
  function ConceptLab81({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 1,
      title: "LU Decomposition \u2014 Solver Foundation",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "LU = Gaussian elimination as a factorization. Factor once O(n\xB3); reuse for k solves at O(n\xB2) each. Save n-fold vs naive."),
      patterns: C81_PATTERNS,
      problems: C81_PROBLEMS,
      techniques: C81_TECHNIQUES,
      mistakes: C81_MISTAKES,
      pyqs: C81_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONCEPT 8.2 — THE MATRIX TYPES (Eigenvalue Signatures)
     Idempotent, Nilpotent, Involutory, Orthogonal, Symmetric, PD,
     Skew-Symmetric — each tested by GATE
     ════════════════════════════════════════════════════════════════ */
  const C82_PATTERNS = [{
    name: "Idempotent (A² = A)",
    surface: "Asked properties of idempotent matrix.",
    testing: "Eigvals 0 or 1; rank = trace.",
    signals: ["\"A² = A\"", "\"idempotent\""],
    firstMove: "Eigvals in {0, 1}; rank = sum of eigvals = trace.",
    timeBudget: 25,
    frequency: "Frequent"
  }, {
    name: "Nilpotent (Aᵏ = 0)",
    surface: "Asked properties of nilpotent.",
    testing: "All eigvals 0.",
    signals: ["\"Aᵏ = 0\"", "\"nilpotent\""],
    firstMove: "All λ = 0. Rank can be > 0 (e.g., shift matrix).",
    timeBudget: 25,
    frequency: "Frequent"
  }, {
    name: "Involutory (A² = I)",
    surface: "Asked properties of involutory.",
    testing: "Eigvals ±1.",
    signals: ["\"A² = I\"", "\"involutory\""],
    firstMove: "λ = ±1.",
    timeBudget: 20,
    frequency: "Occasional"
  }, {
    name: "Orthogonal (AᵀA = I)",
    surface: "Asked properties of orthogonal.",
    testing: "det ±1, |λ| = 1, columns orthonormal.",
    signals: ["\"orthogonal\"", "\"AᵀA = I\""],
    firstMove: "det = ±1. |λ| = 1.",
    timeBudget: 25,
    frequency: "Frequent"
  }, {
    name: "Symmetric (A = Aᵀ)",
    surface: "Asked properties.",
    testing: "Real eigvals, orthogonal eigvecs (distinct), diagonalizable.",
    signals: ["\"symmetric\""],
    firstMove: "Spectral theorem.",
    timeBudget: 20,
    frequency: "Very Frequent"
  }, {
    name: "Positive Definite (xᵀAx > 0)",
    surface: "Asked properties of PD.",
    testing: "All λ > 0 (symmetric A).",
    signals: ["\"positive definite\""],
    firstMove: "Symmetric + all λ > 0.",
    timeBudget: 25,
    frequency: "Frequent"
  }, {
    name: "Skew-Symmetric (A = -Aᵀ)",
    surface: "Asked properties.",
    testing: "Diagonal = 0. Eigvals: 0 or pure imaginary. For real n odd: det = 0.",
    signals: ["\"skew-symmetric\""],
    firstMove: "Diag 0; eigvals 0 or imaginary.",
    timeBudget: 25,
    frequency: "Occasional"
  }];
  const C82_PROBLEMS = [{
    id: "c82-e1",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["Idempotent"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Idempotent matrix (A\xB2 = A) has eigenvalues in:"),
    options: ["{0, 1}", "{-1, 1}", "{0}", "All reals"],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "λ² = λ → λ(λ-1) = 0."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "0 or 1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Idempotent eigvals."
      }, {
        label: "KEY STEP",
        body: "A² = A → λ²v = λv → λ² = λ → λ = 0 or 1."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "λ²=λ.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.1.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c82-e2",
    difficulty: "easy",
    kind: "mcq",
    marks: 1,
    timeTarget: 25,
    tags: ["Nilpotent"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Nilpotent matrix (A\u1D4F = 0 for some k) has eigenvalues:"),
    options: ["All 0.", "All 1.", "±1.", "Arbitrary."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "λᵏ = 0 → λ = 0."
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
        body: "Nilpotent eigvals."
      }, {
        label: "KEY STEP",
        body: "Aᵏ = 0 → λᵏ = 0 → λ = 0."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Trace = 0 too."
      }],
      gateCheck: "Universal.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.1.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c82-m1",
    difficulty: "medium",
    kind: "nat",
    marks: 2,
    timeTarget: 35,
    tags: ["Idempotent Rank"],
    statement: /*#__PURE__*/React.createElement("span", null, "A 4\xD74 idempotent matrix with trace 3 has rank ___."),
    answer: 3,
    tolerance: 0,
    hints: [{
      label: "Conceptual redirect",
      text: "Idempotent: rank = trace."
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
        body: "Idempotent rank-trace identity."
      }, {
        label: "KEY STEP",
        body: "Eigvals 0 or 1. trace = sum = # 1's = rank."
      }, {
        label: "COMPUTATION",
        body: "3."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "rank = trace for idempotent.",
      speed: "5s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C7.1."
    }
  }, {
    id: "c82-m2",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 60,
    tags: ["Nilpotent Non-Zero"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Is there a non-zero nilpotent 2\xD72 matrix?"),
    options: ["Yes; e.g., [[0, 1], [0, 0]] has A² = 0.", "No, nilpotent must be zero.", "Only diagonal matrices.", "Only symmetric matrices."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Shift matrix is nilpotent."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Yes; shift example."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Concrete non-zero nilpotent."
      }, {
        label: "KEY STEP",
        body: "[[0,1],[0,0]]² = [[0,0],[0,0]] = 0. Non-zero, nilpotent."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "All eigvals 0 (triangular diag = 0)."
      }],
      gateCheck: "Shift matrix.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.2.",
      negAdvisory: "Attempt: example. (A) wins."
    }
  }, {
    id: "c82-m3",
    difficulty: "medium",
    kind: "mcq",
    marks: 2,
    timeTarget: 50,
    tags: ["Orthogonal Det"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "The det of an orthogonal matrix is:"),
    options: ["±1.", "Always 1.", "Always 0.", "Arbitrary."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "det²(A) = det(AᵀA) = det(I) = 1."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "±1."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Orthogonal det."
      }, {
        label: "KEY STEP",
        body: "AᵀA = I → det(A)² = 1 → det = ±1."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "±1.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.2.",
      negAdvisory: "Attempt: derivation. (A) wins."
    }
  }, {
    id: "c82-h1",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 70,
    tags: ["Skew-Symmetric Diag"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "Skew-symmetric matrix A satisfies A = -A\u1D40. The diagonal entries are:"),
    options: ["All 0.", "All 1.", "Arbitrary.", "Real."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Aᵢᵢ = -Aᵢᵢ → 2Aᵢᵢ = 0 → Aᵢᵢ = 0."
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
        body: "Skew-symmetric structure."
      }, {
        label: "KEY STEP",
        body: "Aᵢᵢ = -Aᵢᵢ → Aᵢᵢ = 0 for all i."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Diag = 0 for skew.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.2.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c82-h2",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["PD Equivalent"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For symmetric A, A is PD iff:"),
    options: ["All leading principal minors > 0 (Sylvester).", "All eigvals > 0.", "Both (A) and (B).", "Only (A)."],
    answer: "C",
    hints: [{
      label: "Conceptual redirect",
      text: "Two equivalent characterizations."
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
        body: "PD characterizations."
      }, {
        label: "KEY STEP",
        body: "Equivalent: all leading principal minors > 0 (Sylvester) AND all eigvals > 0."
      }, {
        label: "COMPUTATION",
        body: "(C)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "Two equivalent.",
      speed: "Direct.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C6.6.",
      negAdvisory: "Attempt: theorem. (C) wins."
    }
  }, {
    id: "c82-h3",
    difficulty: "hard",
    kind: "mcq",
    marks: 2,
    timeTarget: 80,
    tags: ["AᵀA"],
    skipSignal: {
      type: "attempt",
      text: "Attempt"
    },
    statement: /*#__PURE__*/React.createElement("span", null, "For any real matrix A, A\u1D40A is:"),
    options: ["Symmetric and PSD.", "Always invertible.", "Diagonal.", "Skew-symmetric."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Symmetric: (AᵀA)ᵀ = AᵀA. PSD: xᵀAᵀAx = ‖Ax‖² ≥ 0."
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
        body: "AᵀA template."
      }, {
        label: "KEY STEP",
        body: "Universal: symmetric + PSD."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Invertible iff A has indep cols."
      }],
      gateCheck: "Universal.",
      speed: "Direct.",
      whatMadeHard: "Distractor (B).",
      generalization: "Universal.",
      linkedConcept: "C6.6.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }, {
    id: "c82-k1",
    difficulty: "killer",
    kind: "mcq",
    marks: 2,
    timeTarget: 130,
    tags: ["KILLER", "Type Combo"],
    statement: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(B, null, "[KILLER]"), " A 3\xD73 idempotent matrix has rank 2. The trace and eigenvalues are:"),
    options: ["trace = 2, eigvals 0, 1, 1.", "trace = 0, eigvals 0, 0, 0.", "trace = 1, eigvals 0, 0, 1.", "Cannot determine."],
    answer: "A",
    hints: [{
      label: "Conceptual redirect",
      text: "Idempotent eigvals 0 or 1. rank = trace = # 1's = 2."
    }, {
      label: "Key step",
      text: "(A)."
    }, {
      label: "Near-complete",
      text: "Two 1's, one 0."
    }],
    solution: {
      steps: [{
        label: "TRIGGER",
        body: "Combined idempotent."
      }, {
        label: "KEY STEP",
        body: "Idempotent: eigvals ∈ {0, 1}. rank 2 = # non-zero = # of 1's = 2. Trace = sum = 2. Eigvals: 1, 1, 0."
      }, {
        label: "COMPUTATION",
        body: "(A)."
      }, {
        label: "VERIFICATION",
        body: "Universal."
      }],
      gateCheck: "rank = trace = #1's.",
      speed: "30s.",
      whatMadeHard: "Nothing.",
      generalization: "Universal.",
      linkedConcept: "C8.2.",
      negAdvisory: "Attempt: theorem. (A) wins."
    }
  }];
  const C82_TECHNIQUES = [{
    name: "Idempotent Quick Facts",
    type: "Speed Shortcut",
    when: "A² = A given.",
    steps: ["Eigvals ∈ {0, 1}.", "rank = trace = # of 1's.", "I - A is also idempotent."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Don't apply to general matrices.",
    freq: "Frequent"
  }, {
    name: "Nilpotent Quick Facts",
    type: "Speed Shortcut",
    when: "Aᵏ = 0 given.",
    steps: ["All eigvals 0.", "trace = det = 0.", "Not necessarily zero matrix."],
    speed: "Direct.",
    example: "Shift matrix [[0,1],[0,0]].",
    danger: "Can have non-zero rank.",
    freq: "Frequent"
  }, {
    name: "Orthogonal Quick Facts",
    type: "Speed Shortcut",
    when: "AᵀA = I given.",
    steps: ["det = ±1.", "|λ| = 1.", "Columns orthonormal.", "Preserves lengths and angles."],
    speed: "Direct.",
    example: "Rotation matrices.",
    danger: "λ may be complex.",
    freq: "Frequent"
  }, {
    name: "Symmetric Spectral Theorem",
    type: "Structural Insight",
    when: "A = Aᵀ given.",
    steps: ["Real eigvals.", "Orthogonal eigvecs (distinct).", "Always diagonalizable.", "A = QΛQᵀ with Q orthogonal."],
    speed: "Direct.",
    example: "Universal.",
    danger: "Don't apply to non-symmetric.",
    freq: "Very Frequent"
  }, {
    name: "PD Test (Sylvester or Eigvals)",
    type: "Verification Method",
    when: "Check if symmetric A is PD.",
    steps: ["Sylvester: all leading principal minors > 0.", "Or: all eigvals > 0."],
    speed: "60s.",
    example: "Universal.",
    danger: "Need symmetric first.",
    freq: "Frequent"
  }];
  const C82_MISTAKES = [{
    name: "Nilpotent = Zero",
    wrong: ["Problem: nilpotent 2x2 example.", "Solution: Zero matrix."],
    errorLine: 0,
    errorDescription: "Non-zero examples exist: [[0,1],[0,0]].",
    rootCause: "Confusion.",
    correct: "Shift matrix.",
    prevention: "Memorize example.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }, {
    name: "Idempotent ⇒ Identity",
    wrong: ["Problem: A² = A non-trivial?", "Solution: Only A = I."],
    errorLine: 0,
    errorDescription: "Projection matrices are non-trivial idempotents.",
    rootCause: "Over-restriction.",
    correct: "Many examples: projections, P = P².",
    prevention: "Think projections.",
    gateCost: "Conceptual.",
    frequency: "Common"
  }];
  const C82_PYQS = [];
  function ConceptLab82({
    progress
  }) {
    return /*#__PURE__*/React.createElement(ConceptLab, {
      num: 2,
      title: "Matrix Types \u2014 Eigenvalue Signatures (Idempotent / Nilpotent / Orthogonal / Symmetric / PD / Skew)",
      why: /*#__PURE__*/React.createElement(React.Fragment, null, "Each type has a signature in eigvals + det + trace. Memorize the table. GATE tests these every year."),
      patterns: C82_PATTERNS,
      problems: C82_PROBLEMS,
      techniques: C82_TECHNIQUES,
      mistakes: C82_MISTAKES,
      pyqs: C82_PYQS,
      progress: progress
    });
  }

  /* ════════════════════════════════════════════════════════════════
     APP ROOT
     ════════════════════════════════════════════════════════════════ */
  const CONCEPTS_MAP = [{
    num: 1,
    shortName: "LU",
    title: "LU Decomposition",
    total: C81_PROBLEMS.length,
    Comp: ConceptLab81
  }, {
    num: 2,
    shortName: "Types",
    title: "Matrix Types — Eigval Signatures",
    total: C82_PROBLEMS.length,
    Comp: ConceptLab82
  }];
  function App() {
    useEffect(() => {
      hideLoading();
    }, []);
    const p1 = useConceptProgress(1, C81_PROBLEMS.length);
    const p2 = useConceptProgress(2, C82_PROBLEMS.length);
    const progressMap = {
      1: p1,
      2: p2
    };
    const [active, setActive] = useState(1);
    const totalSolved = [p1, p2].reduce((s, p) => s + p.correct.length, 0);
    const totalProblems = [C81_PROBLEMS, C82_PROBLEMS].reduce((s, ps) => s + ps.length, 0);
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen"
    }, /*#__PURE__*/React.createElement(TopNav, {
      currentModule: 8
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
    }), " MODULE 8 \xB7 PROBLEM LAB"), /*#__PURE__*/React.createElement("h1", {
      className: "text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.04]",
      style: {
        color: "var(--text)"
      }
    }, "Decompositions & Matrix Types \xB7 Problem Lab", /*#__PURE__*/React.createElement("span", {
      className: "block gradient-text mt-1"
    }, "LU + 7 Matrix Type Signatures")), /*#__PURE__*/React.createElement("p", {
      className: "text-lg max-w-3xl leading-relaxed mb-6",
      style: {
        color: "var(--text-dim)"
      }
    }, "2 consolidated concept labs covering LU decomposition (operation count, existence, PLU) and 7 matrix types (idempotent, nilpotent, involutory, orthogonal, symmetric, positive definite, skew-symmetric) with their eigenvalue signatures."), /*#__PURE__*/React.createElement("div", {
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
    }, "2 concept labs \xB7 18 problems \xB7 timed drill")), /*#__PURE__*/React.createElement("div", {
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
    }, "LU complexity \xB7 Idempotent rank=trace \xB7 Sylvester PD test"))))), /*#__PURE__*/React.createElement("div", {
      className: "max-w-5xl mx-auto px-5"
    }, /*#__PURE__*/React.createElement(ConceptNavigator, {
      concepts: CONCEPTS_MAP,
      active: active,
      setActive: setActive,
      progressMap: progressMap
    })), /*#__PURE__*/React.createElement(ConceptLab81, {
      progress: p1
    }), /*#__PURE__*/React.createElement(ConceptLab82, {
      progress: p2
    }), /*#__PURE__*/React.createElement(ModuleFooter, {
      moduleNum: 8,
      nextModuleTitle: "Cheat Sheet",
      nextModuleFile: "module-09-cheatsheet.html",
      checklist: ["I know LU factor is O(n³) ONCE, then O(n²) per solve.", "LU exists iff all leading principal minors are non-zero; else use PLU.", "Idempotent A: eigvals ∈ {0, 1}, rank = trace.", "Nilpotent A: all eigvals 0; non-zero examples exist.", "Involutory A² = I: eigvals ±1.", "Orthogonal AᵀA = I: det ±1, |λ| = 1.", "Symmetric: real eigvals, orthogonal eigvecs, always diagonalizable.", "Positive definite: symmetric + all λ > 0 (or Sylvester).", "Skew-symmetric: diagonal 0, eigvals 0 or pure imaginary.", "I've cleared all 18 problems."]
    }));
  }
  mountApp(App);
})();