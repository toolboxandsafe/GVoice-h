import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// --- Parser for Google Voice Takeout HTML files ---
function parseGVoiceHTML(htmlString, fileName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const messages = [];

  // Try multiple known Google Voice Takeout formats
  // Format 1: Modern Takeout with <div class="message">
  const messageDivs = doc.querySelectorAll(".message, .hChatLog .message");
  if (messageDivs.length > 0) {
    messageDivs.forEach((div) => {
      const senderEl =
        div.querySelector(".sender, cite, .fn") ||
        div.querySelector('[class*="sender"]');
      const timeEl =
        div.querySelector(".dt, abbr, time") ||
        div.querySelector('[class*="time"]');
      const bodyEl =
        div.querySelector(".SMS, .sms, q, .message-text") ||
        div.querySelector('[class*="text"]');

      const sender = senderEl?.textContent?.trim() || "Unknown";
      const timeStr =
        timeEl?.getAttribute("title") ||
        timeEl?.getAttribute("datetime") ||
        timeEl?.textContent?.trim() ||
        "";
      const body = bodyEl?.textContent?.trim() || div.textContent?.trim() || "";

      if (body) {
        messages.push({
          sender,
          time: timeStr,
          date: timeStr ? new Date(timeStr) : null,
          body,
          file: fileName,
        });
      }
    });
  }

  // Format 2: Older format with specific class patterns
  if (messages.length === 0) {
    const rows = doc.querySelectorAll("div.haudio, div[class*='message']");
    rows.forEach((row) => {
      const sender =
        row.querySelector("span.fn, cite")?.textContent?.trim() || "Unknown";
      const timeStr =
        row.querySelector("abbr")?.getAttribute("title") ||
        row.querySelector("abbr")?.textContent?.trim() ||
        "";
      const body =
        row.querySelector("q, span.sms-text, div.sms-text")?.textContent?.trim() ||
        "";

      if (body) {
        messages.push({
          sender,
          time: timeStr,
          date: timeStr ? new Date(timeStr) : null,
          body,
          file: fileName,
        });
      }
    });
  }

  // Format 3: Fallback - look for any structured text content
  if (messages.length === 0) {
    const allDivs = doc.querySelectorAll("div");
    let currentSender = "";
    let currentTime = "";

    allDivs.forEach((div) => {
      const abbrEl = div.querySelector("abbr");
      const citeEl = div.querySelector("cite");
      const qEl = div.querySelector("q");

      if (citeEl) currentSender = citeEl.textContent.trim();
      if (abbrEl)
        currentTime =
          abbrEl.getAttribute("title") || abbrEl.textContent.trim();
      if (qEl && qEl.textContent.trim()) {
        messages.push({
          sender: currentSender || "Unknown",
          time: currentTime,
          date: currentTime ? new Date(currentTime) : null,
          body: qEl.textContent.trim(),
          file: fileName,
        });
      }
    });
  }

  // Extract conversation partner from filename
  // Google Voice files are typically named like "Contact Name - Text - 2023-01-15T12_00_00Z.html"
  let contact = fileName.replace(/\.html$/i, "");
  const dashParts = contact.split(" - ");
  if (dashParts.length >= 2) {
    contact = dashParts[0].trim();
  }

  return { messages, contact, fileName };
}

// --- Formatting helpers ---
function formatDate(date) {
  if (!date || isNaN(date)) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date) {
  if (!date || isNaN(date)) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function highlightMatch(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} style={{ background: "#F9E547", color: "#1a1a1a", borderRadius: "2px", padding: "0 1px" }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// --- Main App ---
export default function GoogleVoiceSearch() {
  const [conversations, setConversations] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [contactFilter, setContactFilter] = useState("all");
  const [dateSort, setDateSort] = useState("newest");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ done: 0, total: 0 });
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [view, setView] = useState("search"); // "search" | "conversation"
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);

  const handleFiles = useCallback(async (files) => {
    const htmlFiles = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".html")
    );
    if (htmlFiles.length === 0) return;

    setIsLoading(true);
    setLoadingProgress({ done: 0, total: htmlFiles.length });

    const convos = [];
    const msgs = [];
    const batchSize = 50;

    for (let i = 0; i < htmlFiles.length; i += batchSize) {
      const batch = htmlFiles.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(
          (file) =>
            new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const parsed = parseGVoiceHTML(e.target.result, file.name);
                resolve(parsed);
              };
              reader.onerror = () => resolve({ messages: [], contact: file.name, fileName: file.name });
              reader.readAsText(file);
            })
        )
      );

      results.forEach((r) => {
        if (r.messages.length > 0) {
          convos.push(r);
          r.messages.forEach((m) => msgs.push({ ...m, contact: r.contact }));
        }
      });

      setLoadingProgress({ done: Math.min(i + batchSize, htmlFiles.length), total: htmlFiles.length });
      // Let UI breathe
      await new Promise((r) => setTimeout(r, 0));
    }

    setConversations(convos);
    setAllMessages(msgs);
    setIsLoading(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const items = e.dataTransfer.items;
      if (items) {
        const entries = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) entries.push(entry);
        }
        if (entries.length > 0 && entries[0].isDirectory) {
          // Read directory recursively
          const dirReader = entries[0].createReader();
          const allFiles = [];
          const readEntries = () => {
            dirReader.readEntries((results) => {
              if (results.length === 0) {
                Promise.all(
                  allFiles.map(
                    (entry) =>
                      new Promise((resolve) => entry.file((f) => resolve(f)))
                  )
                ).then(handleFiles);
              } else {
                results.forEach((r) => {
                  if (r.isFile && r.name.toLowerCase().endsWith(".html"))
                    allFiles.push(r);
                });
                readEntries();
              }
            });
          };
          readEntries();
          return;
        }
      }
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const contacts = useMemo(() => {
    const set = new Set(allMessages.map((m) => m.contact));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allMessages]);

  const filteredMessages = useMemo(() => {
    let results = allMessages;

    if (contactFilter !== "all") {
      results = results.filter((m) => m.contact === contactFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (m) =>
          m.body.toLowerCase().includes(q) ||
          m.sender.toLowerCase().includes(q) ||
          m.contact.toLowerCase().includes(q)
      );
    }

    results.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return dateSort === "newest" ? b.date - a.date : a.date - b.date;
    });

    return results;
  }, [allMessages, searchQuery, contactFilter, dateSort]);

  const conversationMessages = useMemo(() => {
    if (!selectedConversation) return [];
    return allMessages
      .filter((m) => m.file === selectedConversation.fileName)
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date - b.date;
      });
  }, [allMessages, selectedConversation]);

  const stats = useMemo(() => {
    if (allMessages.length === 0) return null;
    const dates = allMessages.filter((m) => m.date && !isNaN(m.date)).map((m) => m.date);
    return {
      totalMessages: allMessages.length,
      totalConversations: conversations.length,
      totalContacts: contacts.length,
      earliest: dates.length ? new Date(Math.min(...dates)) : null,
      latest: dates.length ? new Date(Math.max(...dates)) : null,
    };
  }, [allMessages, conversations, contacts]);

  useEffect(() => {
    if (allMessages.length > 0 && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [allMessages.length]);

  // --- STYLES ---
  // Fonts loaded via index.html
  const fonts = ``;

  const cssVars = {
    "--bg": "#0C0C0E",
    "--bg-raised": "#16161A",
    "--bg-hover": "#1E1E24",
    "--border": "#2A2A32",
    "--text": "#E4E4E8",
    "--text-muted": "#8888A0",
    "--text-dim": "#5C5C72",
    "--accent": "#F9E547",
    "--accent-dim": "#F9E54720",
    "--green": "#4ADE80",
    "--blue": "#60A5FA",
    "--red": "#F87171",
    "--radius": "10px",
    "--font": "'Outfit', sans-serif",
    "--mono": "'DM Mono', monospace",
  };

  const baseStyle = {
    ...cssVars,
    fontFamily: "var(--font)",
    background: "var(--bg)",
    color: "var(--text)",
    minHeight: "100vh",
    padding: "0",
    margin: "0",
  };

  // --- EMPTY STATE ---
  if (allMessages.length === 0 && !isLoading) {
    return (
      <div style={baseStyle}>
        <style>{fonts}</style>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::selection { background: #F9E54740; color: #fff; }
          @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
          @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", padding: "40px 20px", textAlign: "center",
        }}>
          <div style={{
            animation: "float 4s ease-in-out infinite",
            fontSize: "56px", marginBottom: "32px", lineHeight: 1,
          }}>
            📱
          </div>
          <h1 style={{
            fontFamily: "var(--font)", fontWeight: 700, fontSize: "clamp(28px, 5vw, 42px)",
            letterSpacing: "-0.02em", marginBottom: "12px",
            background: "linear-gradient(135deg, #F9E547, #E4E4E8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Voice Archive
          </h1>
          <p style={{
            color: "var(--text-muted)", fontSize: "16px", maxWidth: "420px",
            lineHeight: 1.6, marginBottom: "40px",
          }}>
            Search through your entire Google Voice text message history.
            Drop your Takeout HTML files to get started.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: "100%", maxWidth: "520px", padding: "48px 32px",
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "16px", cursor: "pointer",
              background: dragOver ? "var(--accent-dim)" : "var(--bg-raised)",
              transition: "all 0.3s ease",
              animation: "fadeIn 0.6s ease-out",
            }}
          >
            <div style={{
              width: "56px", height: "56px", borderRadius: "14px",
              background: "var(--accent-dim)", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 20px", fontSize: "24px",
            }}>
              ↑
            </div>
            <p style={{ fontWeight: 600, fontSize: "17px", marginBottom: "8px" }}>
              Drop your Calls folder here
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.5 }}>
              or click to browse · accepts .html files from<br />
              <span style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-dim)" }}>
                Takeout/Voice/Calls/
              </span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          <div style={{
            marginTop: "48px", padding: "20px 28px", borderRadius: "12px",
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            maxWidth: "520px", width: "100%", textAlign: "left",
          }}>
            <p style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--accent)", marginBottom: "8px", letterSpacing: "0.05em" }}>
              HOW TO EXPORT
            </p>
            <ol style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.8, paddingLeft: "18px" }}>
              <li>Go to <span style={{ fontFamily: "var(--mono)", color: "var(--text)", fontSize: "12px" }}>takeout.google.com</span></li>
              <li>Deselect all, then check <strong style={{ color: "var(--text)" }}>Voice</strong></li>
              <li>Export &amp; download the .zip</li>
              <li>Unzip and drop the <span style={{ fontFamily: "var(--mono)", color: "var(--text)", fontSize: "12px" }}>Calls/</span> folder here</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // --- LOADING STATE ---
  if (isLoading) {
    const pct = loadingProgress.total > 0
      ? Math.round((loadingProgress.done / loadingProgress.total) * 100)
      : 0;
    return (
      <div style={baseStyle}>
        <style>{fonts}</style>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "40px",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "24px", animation: "pulse 1.5s ease-in-out infinite" }}>⏳</div>
          <p style={{ fontWeight: 600, fontSize: "18px", marginBottom: "16px" }}>
            Parsing {loadingProgress.total.toLocaleString()} files…
          </p>
          <div style={{
            width: "300px", height: "6px", borderRadius: "3px",
            background: "var(--bg-raised)", overflow: "hidden",
          }}>
            <div style={{
              width: `${pct}%`, height: "100%", borderRadius: "3px",
              background: "var(--accent)", transition: "width 0.3s ease",
            }} />
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "12px", fontFamily: "var(--mono)" }}>
            {loadingProgress.done} / {loadingProgress.total} · {pct}%
          </p>
        </div>
      </div>
    );
  }

  // --- CONVERSATION VIEW ---
  if (view === "conversation" && selectedConversation) {
    return (
      <div style={baseStyle}>
        <style>{fonts}</style>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::selection { background: #F9E54740; color: #fff; }
          @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        `}</style>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px 20px" }}>
          <button
            onClick={() => { setView("search"); setSelectedConversation(null); }}
            style={{
              background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
              padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
              fontFamily: "var(--font)", fontSize: "13px", marginBottom: "24px",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            ← Back to search
          </button>

          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontWeight: 700, fontSize: "24px", letterSpacing: "-0.01em" }}>
              {selectedConversation.contact}
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: "13px", fontFamily: "var(--mono)", marginTop: "4px" }}>
              {conversationMessages.length} messages · {selectedConversation.fileName}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {conversationMessages.map((msg, i) => {
              const isMe = msg.sender.toLowerCase() === "me";
              const showDateHeader =
                i === 0 ||
                (msg.date &&
                  conversationMessages[i - 1]?.date &&
                  formatDate(msg.date) !== formatDate(conversationMessages[i - 1].date));

              return (
                <div key={i} style={{ animation: `slideIn 0.3s ease-out ${Math.min(i * 0.02, 0.5)}s both` }}>
                  {showDateHeader && (
                    <div style={{
                      textAlign: "center", padding: "16px 0 12px",
                      color: "var(--text-dim)", fontSize: "12px", fontFamily: "var(--mono)",
                    }}>
                      {formatDate(msg.date)}
                    </div>
                  )}
                  <div style={{
                    display: "flex",
                    justifyContent: isMe ? "flex-end" : "flex-start",
                    padding: "2px 0",
                  }}>
                    <div style={{
                      maxWidth: "75%", padding: "10px 14px", borderRadius: "14px",
                      background: isMe ? "#2A2A5A" : "var(--bg-raised)",
                      border: `1px solid ${isMe ? "#3A3A6A" : "var(--border)"}`,
                    }}>
                      {!isMe && (
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent)", marginBottom: "4px" }}>
                          {msg.sender}
                        </p>
                      )}
                      <p style={{ fontSize: "14px", lineHeight: 1.5, wordBreak: "break-word" }}>
                        {highlightMatch(msg.body, searchQuery)}
                      </p>
                      <p style={{
                        fontSize: "10px", color: "var(--text-dim)", marginTop: "4px",
                        textAlign: isMe ? "right" : "left", fontFamily: "var(--mono)",
                      }}>
                        {formatTime(msg.date)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- SEARCH VIEW ---
  return (
    <div style={baseStyle}>
      <style>{fonts}</style>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #F9E54740; color: #fff; }
        input:focus, select:focus { outline: none; border-color: var(--accent) !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid var(--border)", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "22px" }}>📱</span>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em" }}>Voice Archive</h1>
            {stats && (
              <p style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)" }}>
                {stats.totalMessages.toLocaleString()} msgs · {stats.totalContacts} contacts
                {stats.earliest && stats.latest
                  ? ` · ${formatDate(stats.earliest)} – ${formatDate(stats.latest)}`
                  : ""}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            setConversations([]);
            setAllMessages([]);
            setSearchQuery("");
            setContactFilter("all");
          }}
          style={{
            background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
            padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
            fontFamily: "var(--font)", fontSize: "12px",
          }}
        >
          Load different files
        </button>
      </div>

      {/* Search Bar */}
      <div style={{
        padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center",
      }}>
        <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
          <span style={{
            position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
            color: "var(--text-dim)", fontSize: "16px", pointerEvents: "none",
          }}>
            🔍
          </span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search messages, contacts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%", padding: "12px 14px 12px 42px",
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: "10px", color: "var(--text)", fontSize: "15px",
              fontFamily: "var(--font)",
            }}
          />
        </div>
        <select
          value={contactFilter}
          onChange={(e) => setContactFilter(e.target.value)}
          style={{
            padding: "12px 14px", background: "var(--bg-raised)",
            border: "1px solid var(--border)", borderRadius: "10px",
            color: "var(--text)", fontSize: "14px", fontFamily: "var(--font)",
            cursor: "pointer", minWidth: "160px",
          }}
        >
          <option value="all">All contacts ({contacts.length})</option>
          {contacts.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={dateSort}
          onChange={(e) => setDateSort(e.target.value)}
          style={{
            padding: "12px 14px", background: "var(--bg-raised)",
            border: "1px solid var(--border)", borderRadius: "10px",
            color: "var(--text)", fontSize: "14px", fontFamily: "var(--font)",
            cursor: "pointer",
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Results */}
      <div ref={resultsRef} style={{ padding: "16px 24px" }}>
        <p style={{
          fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-dim)",
          marginBottom: "16px",
        }}>
          {filteredMessages.length.toLocaleString()} result{filteredMessages.length !== 1 ? "s" : ""}
          {searchQuery && ` for "${searchQuery}"`}
          {contactFilter !== "all" && ` from ${contactFilter}`}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {filteredMessages.slice(0, 200).map((msg, i) => (
            <div
              key={i}
              onClick={() => {
                const convo = conversations.find((c) => c.fileName === msg.file);
                if (convo) {
                  setSelectedConversation(convo);
                  setView("conversation");
                }
              }}
              style={{
                padding: "14px 16px", background: "var(--bg-raised)",
                border: "1px solid var(--border)", borderRadius: "10px",
                cursor: "pointer", transition: "all 0.15s ease",
                animation: `fadeUp 0.25s ease-out ${Math.min(i * 0.02, 0.4)}s both`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.borderColor = "#3A3A44";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-raised)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                marginBottom: "6px", gap: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 }}>
                  <span style={{
                    fontWeight: 600, fontSize: "14px",
                    color: msg.sender.toLowerCase() === "me" ? "var(--blue)" : "var(--accent)",
                    flexShrink: 0,
                  }}>
                    {msg.sender}
                  </span>
                  <span style={{
                    fontSize: "12px", color: "var(--text-dim)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    → {msg.contact}
                  </span>
                </div>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)",
                  flexShrink: 0,
                }}>
                  {msg.date ? `${formatDate(msg.date)} ${formatTime(msg.date)}` : msg.time}
                </span>
              </div>
              <p style={{
                fontSize: "14px", lineHeight: 1.5, color: "var(--text-muted)",
                wordBreak: "break-word",
              }}>
                {highlightMatch(msg.body, searchQuery)}
              </p>
            </div>
          ))}

          {filteredMessages.length > 200 && (
            <p style={{
              textAlign: "center", padding: "20px", color: "var(--text-dim)",
              fontFamily: "var(--mono)", fontSize: "12px",
            }}>
              Showing 200 of {filteredMessages.length.toLocaleString()} results — refine your search to see more
            </p>
          )}

          {filteredMessages.length === 0 && (
            <div style={{
              textAlign: "center", padding: "60px 20px", color: "var(--text-dim)",
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔍</div>
              <p style={{ fontSize: "15px" }}>No messages found</p>
              <p style={{ fontSize: "13px", marginTop: "4px" }}>Try a different search term or filter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
