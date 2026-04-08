import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://tlbglqreblkvypoocscq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYmdscXJlYmxrdnlwb29jc2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjQ5MDksImV4cCI6MjA5MTI0MDkwOX0.ILFqHOrbsGEHQ3auxiIJbAJLpxMqdBfJnrrc8ZrKrsM"
);

async function fetchAllMessages() {
  const all = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .range(from, from + PAGE - 1)
      .order("id");
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all.map((row) => ({
    sender: row.sender,
    body: row.body,
    time: row.time_str || "",
    date: row.date ? new Date(row.date) : null,
    file: row.file,
    contact: row.contact,
  }));
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [view, setView] = useState("search"); // "search" | "conversation"
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);

  // Load messages from Supabase on mount
  useEffect(() => {
    fetchAllMessages()
      .then((msgs) => {
        setAllMessages(msgs);
        // Group into conversations by file
        const convoMap = new Map();
        msgs.forEach((m) => {
          if (!convoMap.has(m.file)) {
            convoMap.set(m.file, { messages: [], contact: m.contact, fileName: m.file });
          }
          convoMap.get(m.file).messages.push(m);
        });
        setConversations(Array.from(convoMap.values()));
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

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

  // --- LOADING STATE ---
  if (isLoading) {
    return (
      <div style={baseStyle}>
        <style>{fonts}</style>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        `}</style>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "40px",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "24px", animation: "pulse 1.5s ease-in-out infinite" }}>📱</div>
          <p style={{ fontWeight: 600, fontSize: "18px" }}>Loading archive…</p>
          <p style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "8px" }}>
            Fetching messages from database
          </p>
        </div>
      </div>
    );
  }

  // --- ERROR STATE ---
  if (loadError) {
    return (
      <div style={baseStyle}>
        <style>{fonts}</style>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "40px", textAlign: "center",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
          <p style={{ fontWeight: 600, fontSize: "18px", marginBottom: "8px" }}>Failed to load messages</p>
          <p style={{ color: "var(--text-dim)", fontSize: "14px", maxWidth: "400px" }}>{loadError}</p>
        </div>
      </div>
    );
  }

  // --- EMPTY STATE ---
  if (allMessages.length === 0) {
    return (
      <div style={baseStyle}>
        <style>{fonts}</style>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "40px", textAlign: "center",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>📱</div>
          <p style={{ fontWeight: 600, fontSize: "18px", marginBottom: "8px" }}>No messages yet</p>
          <p style={{ color: "var(--text-dim)", fontSize: "14px", maxWidth: "400px" }}>
            Run the upload script to import your Google Voice Takeout files.
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
