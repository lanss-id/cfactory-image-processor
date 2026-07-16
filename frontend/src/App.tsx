import { useState, useRef, useCallback, useEffect, useMemo, type CSSProperties } from "react";

const API = import.meta.env.VITE_API_URL || "/api";
type Status = "processing" | "done" | "error";
type Mode = "light" | "dark";

const light = {
  bg: "#ffffff", fg: "#202020", surface: "#ffffff", cardBorder: "#202020",
  gray: "#646464", red: "#ea2804", green: "#2b9a66",
  inputBg: "#ffffff", btnBg: "#202020", btnFg: "#fcfcfc",
  logoFg: "#ea2804", sectionTitle: "#646464",
};

const dark: typeof light = {
  bg: "#202020", fg: "#ffffff", surface: "#202020", cardBorder: "#ffffff",
  gray: "#bbbbbb", red: "#ea2804", green: "#2b9a66",
  inputBg: "#202020", btnBg: "#ffffff", btnFg: "#202020",
  logoFg: "#ea2804", sectionTitle: "#bbbbbb",
};

function App() {
  const [mode, setMode] = useState<Mode>("light");
  const t = useMemo(() => mode === "light" ? light : dark, [mode]);
  const toggleMode = () => setMode(m => m === "light" ? "dark" : "light");

  const [prompt, setPrompt] = useState("");
  const [cards, setCards] = useState<Array<{ id: string; st: Status }>>([]);
  const ivs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const stopPoll = useCallback((id: string) => {
    const iv = ivs.current.get(id);
    if (iv) { clearInterval(iv); ivs.current.delete(id); }
  }, []);

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API}/generations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "completed" || data.status === "failed") {
        stopPoll(id);
        setCards(prev => prev.map(c => c.id === id ? { ...c, st: data.status === "completed" ? "done" : "error" } : c));
      }
    } catch {}
  }, [stopPoll]);

  const submit = async () => {
    if (!prompt.trim()) return;
    const p = prompt;
    setPrompt("");
    try {
      const res = await fetch(`${API}/generations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      if (!res.ok) return;
      const { id } = await res.json();
      setCards(prev => [...prev, { id, st: "processing" }]);
      ivs.current.set(id, setInterval(() => poll(id), 2000));
    } catch {}
  };

  const s = useMemo(() => ({
    page: { background: t.bg, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: t.fg, transition: "background .3s, color .3s" } as CSSProperties,
    inner: { maxWidth: 720, margin: "0 auto", padding: "48px 24px" } as CSSProperties,
    header: { marginBottom: 56, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } as CSSProperties,
    logo: { fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: t.logoFg, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" } as CSSProperties,
    title: { fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: "-1.8px", marginBottom: 12, color: t.fg } as CSSProperties,
    subtitle: { fontSize: 18, fontWeight: 400, color: t.gray, lineHeight: 1.5, maxWidth: 520 } as CSSProperties,
    toggle: { padding: "6px 16px", background: "transparent", border: `1px solid ${t.cardBorder}`, borderRadius: 9999, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", color: t.fg, marginTop: 4, whiteSpace: "nowrap" } as CSSProperties,
    formWrap: { background: `linear-gradient(135deg, ${t.red}, #ff6b35, #e91e63)`, borderRadius: 9999, padding: 3, marginBottom: 56 } as CSSProperties,
    formInner: { background: t.inputBg, borderRadius: 9999, display: "flex", gap: 0, overflow: "hidden" } as CSSProperties,
    input: { flex: 1, padding: "14px 24px", border: "none", borderRadius: 9999, fontSize: 15, color: t.fg, outline: "none", fontFamily: "'Inter', system-ui, sans-serif", background: "transparent" } as CSSProperties,
    btn: { padding: "14px 32px", background: t.btnBg, color: t.btnFg, border: "none", borderRadius: 9999, cursor: "pointer", fontWeight: 600, fontSize: 15, fontFamily: "'Inter', system-ui, sans-serif", whiteSpace: "nowrap", flexShrink: 0, margin: 4 } as CSSProperties,
    section: { marginTop: 64 } as CSSProperties,
    sectionTitle: { fontSize: 14, fontFamily: "'JetBrains Mono', monospace", color: t.sectionTitle, marginBottom: 20, letterSpacing: "0.03em", textTransform: "uppercase" } as CSSProperties,
    grid: { display: "flex", flexDirection: "column", gap: 16 } as CSSProperties,
    card: { border: `1px solid ${t.cardBorder}`, borderRadius: 9999, padding: "20px 24px", transition: "border .3s" } as CSSProperties,
    cardTop: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 } as CSSProperties,
    cardId: { fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: t.gray, fontWeight: 500 } as CSSProperties,
    img: { width: "100%", borderRadius: 9999, border: `1px solid ${t.cardBorder}` } as CSSProperties,
    empty: { textAlign: "center", padding: "64px 0", color: t.gray, fontSize: 15, lineHeight: 1.6 } as CSSProperties,
  }), [t]);

  const badgeStyle = (st: Status): CSSProperties => {
    const bg = st === "done" ? t.green : st === "error" ? t.red : "#f0f0f0";
    const color = st === "processing" ? t.gray : "#ffffff";
    return { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", background: bg, color };
  };

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <header style={s.header}>
          <div>
            <div style={s.logo}>cfactory × replicate</div>
            <h1 style={s.title}>AI Image Generator</h1>
            <p style={s.subtitle}>Generate images with Flux Schnell — submit a prompt and get results in seconds.</p>
          </div>
          <button onClick={toggleMode} style={s.toggle}>{mode === "light" ? "🌙 Dark" : "☀️ Light"}</button>
        </header>

        <form onSubmit={e => { e.preventDefault(); submit(); }} style={s.formWrap}>
          <div style={s.formInner}>
            <input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the image you want..." style={s.input} />
            <button type="submit" style={s.btn}>Generate</button>
          </div>
        </form>

        <div style={s.section}>
          <div style={s.sectionTitle}>Generations</div>
          <div style={s.grid}>
            {cards.length === 0 && (
              <div style={s.empty}>No generations yet. Write a prompt above.</div>
            )}
            {[...cards].reverse().map(({ id, st }) => (
              <div key={id} style={s.card}>
                <div style={s.cardTop}>
                  <code style={s.cardId}>{id.slice(0, 8)}</code>
                  <span style={badgeStyle(st)}>
                    {st === "processing" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#646464", display: "inline-block" }} />}
                    {{ processing: "Running", done: "Completed", error: "Failed" }[st]}
                  </span>
                </div>
                {st === "done" && <ResultImage id={id} cardBorder={t.cardBorder} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultImage({ id, cardBorder }: { id: string; cardBorder: string }) {
  const API = import.meta.env.VITE_API_URL || "/api";
  const [src, setSrc] = useState("");
  useEffect(() => {
    let dead = false;
    fetch(`${API}/generations/${id}`).then(r => r.json()).then(d => { if (!dead) setSrc(d.resultUrl); }).catch(() => {});
    return () => { dead = true; };
  }, [id]);
  if (!src) return null;
  return <img src={src} alt="" style={{ width: "100%", borderRadius: 9999, border: `1px solid ${cardBorder}` } as CSSProperties} />;
}

export default App;
