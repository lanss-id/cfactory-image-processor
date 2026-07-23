import { useState, useRef, useCallback, useEffect } from "react";

const API = "/api";

function fmt(n: number): string {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}

type S = "idle" | "uploading" | "pending" | "processing" | "completed" | "failed";

const Ico = {
  upload: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

export default function App() {
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [state, setState] = useState<S>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [origSize, setOrigSize] = useState(0);
  const [resSize, setResSize] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [preview, setPreview] = useState("");
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [polls, setPolls] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const stop = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    document.body.className = mode === "light" ? "light" : "";
  }, [mode]);

  useEffect(() => () => stop(), [stop]);

  const poll = useCallback(async (id: string, d = 1000) => {
    try {
      const r = await fetch(`${API}/images/${id}/status`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.status === "completed") {
        setState("completed");
        setResSize(j.resultSize || 0);
        setPreview(`${API}/images/${id}/download`);
        stop();
        return;
      }
      if (j.status === "failed") {
        setState("failed");
        setErrMsg(j.errorMessage || "Processing failed");
        stop();
        return;
      }
      setState(j.status === "processing" ? "processing" : "pending");
      setPolls(p => p + 1);
      const next = Math.min(d * 1.5, 8000);
      pollRef.current = setTimeout(() => poll(id, next), d);
    } catch {
      pollRef.current = setTimeout(() => poll(id, d), 2000);
    }
  }, [stop]);

  const upload = useCallback(async (f: File) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setState("failed");
      setErrMsg("File too large. Max 20MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setState("failed");
      setErrMsg("Unsupported format. Use JPG, PNG, or WebP.");
      return;
    }
    setState("uploading");
    setProgress(0);
    setOrigSize(f.size);
    setErrMsg("");
    setPreview("");
    setPolls(0);

    try {
      const fd = new FormData();
      fd.append("image", f);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API}/images`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      const r = await new Promise<{ jobId: string }>((res, rej) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) res(JSON.parse(xhr.responseText));
          else rej(new Error(JSON.parse(xhr.responseText).error || "Upload failed"));
        };
        xhr.onerror = () => rej(new Error("Upload failed"));
        xhr.send(fd);
      });
      setState("pending");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
      poll(r.jobId);
    } catch (e) {
      setState("failed");
      setErrMsg(e instanceof Error ? e.message : "Upload failed");
    }
  }, [poll]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && ["image/jpeg", "image/png", "image/webp"].includes(f.type)) upload(f);
  }, [upload]);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) upload(f);
  }, [upload]);

  const reset = useCallback(() => {
    stop();
    setState("idle");
    setElapsed(0);
    setErrMsg("");
    setPreview("");
    setProgress(0);
    setResSize(0);
    setPolls(0);
  }, [stop]);

  const pct = resSize && origSize ? Math.round((1 - resSize / origSize) * 100) : 0;
  const color = (origSize > 0 && resSize > 0) ? (resSize < origSize ? "green" : "red") : "";

  return (
    <div>
      <button className="theme-btn" onClick={() => setMode(m => m === "light" ? "dark" : "light")}
        dangerouslySetInnerHTML={{ __html: mode === "light" ? Ico.moon : Ico.sun }} />

      <div className="page">
        <div className="header">
          <div className="logo">cfactory</div>
          <h1 className="title">Image Processor</h1>
          <div className="subtitle">Upload, resize, compress, and convert to WebP async.</div>
        </div>

        {state === "idle" && (
          <div className={"dropzone" + (drag ? " drag-over" : "")}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}>
            <span className="dropzone-icon" dangerouslySetInnerHTML={{ __html: Ico.upload }} />
            <div className="dropzone-text">Drop image or click</div>
            <div className="dropzone-sub">JPG, PNG, WebP (max 20MB)</div>
            <div className="dropzone-supported">Supports aspect ratio preservation</div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={onSelect} hidden />
          </div>
        )}

        {(state === "uploading" || state === "pending" || state === "processing") && (
          <div className="card">
            <div className="status-row">
              <div className="spinner" />
              <div>
                <div className="status-text">
                  {state === "uploading" ? `Uploading... ${progress}%` :
                   state === "pending" ? "Queued" : "Processing"}
                </div>
                {state !== "uploading" && (
                  <div className="status-sub">{elapsed}s elapsed · {polls} polls</div>
                )}
              </div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill"
                style={{ width: state === "uploading" ? progress + "%" : Math.min((elapsed / 20) * 100, 90) + "%" }} />
            </div>
          </div>
        )}

        {state === "completed" && (
          <div className="card">
            {preview && <img src={preview} alt="Result" className="preview" />}
            <div className="stats">
              <div className="stat">
                <div className="stat-label">Original</div>
                <div className="stat-value">{fmt(origSize)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Result</div>
                <div className="stat-value">{resSize ? fmt(resSize) : "-"}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Reduction</div>
                <div className={"stat-value " + color}>{origSize && resSize ? pct + "%" : "-"}</div>
              </div>
            </div>
            <div className="actions">
              <a href={preview} download className="btn btn-primary">Download WebP</a>
              <button onClick={reset} className="btn btn-secondary">New Image</button>
            </div>
          </div>
        )}

        {state === "failed" && (
          <div className="card">
            <div className="error-box">⚠ {errMsg}</div>
            <div className="actions">
              <button onClick={reset} className="btn btn-primary">Try Again</button>
            </div>
          </div>
        )}

        <div className="footer">cfactory by <a href="https://lanss.my.id" className="footer-link">Alan</a>  Bun  Hono  Sharp  BullMQ</div>
      </div>
    </div>
  );
}