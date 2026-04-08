import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://tlbglqreblkvypoocscq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYmdscXJlYmxrdnlwb29jc2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjQ5MDksImV4cCI6MjA5MTI0MDkwOX0.ILFqHOrbsGEHQ3auxiIJbAJLpxMqdBfJnrrc8ZrKrsM"
);

const THREADS_PAGE_SIZE = 10;
const SEARCH_PAGE_SIZE = 50;

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

// --- Skeleton loader ---
function SkeletonRow() {
  return (
    <div style={{
      padding: "14px 16px", background: "var(--bg-raised)",
      border: "1px solid var(--border)", borderRadius: "10px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ width: "120px", height: "14px", borderRadius: "4px", background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: "80px", height: "11px", borderRadius: "4px", background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ width: "70%", height: "14px", borderRadius: "4px", background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

function SkeletonBubble({ align }) {
  return (
    <div style={{ display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start", padding: "2px 0" }}>
      <div style={{
        width: `${40 + Math.random() * 35}%`, height: "48px", borderRadius: "14px",
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        animation: "pulse 1.5s ease-in-out infinite",
      }} />
    </div>
  );
}

// --- Main App ---
export default function GoogleVoiceSearch() {
  // Thread list state
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsOffset, setThreadsOffset] = useState(0);
  const [hasMoreThreads, setHasMoreThreads] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Stats & contacts
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreSearch, setHasMoreSearch] = useState(true);
  const [contactFilter, setContactFilter] = useState("all");

  // Conversation view state
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [convoLoading, setConvoLoading] = useState(false);
  const [view, setView] = useState("list"); // "list" | "conversation"

  // Error
  const [loadError, setLoadError] = useState(null);

  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);

  // --- Load initial threads, stats, contacts ---
  useEffect(() => {
    Promise.all([
      supabase.rpc("get_threads", { p_limit: THREADS_PAGE_SIZE, p_offset: 0 }),
      supabase.rpc("get_stats"),
      supabase.rpc("get_contacts"),
    ])
      .then(([threadsRes, statsRes, contactsRes]) => {
        if (threadsRes.error) throw threadsRes.error;
        if (statsRes.error) throw statsRes.error;
        if (contactsRes.error) throw contactsRes.error;

        setThreads(threadsRes.data);
        setHasMoreThreads(threadsRes.data.length === THREADS_PAGE_SIZE);
        setThreadsOffset(threadsRes.data.length);
        setStats(statsRes.data[0] || null);
        setContacts(contactsRes.data.map((r) => r.contact));
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setThreadsLoading(false));
  }, []);

  // --- Load more threads ---
  const loadMoreThreads = useCallback(async () => {
    if (loadingMore || !hasMoreThreads) return;
    setLoadingMore(true);
    try {
      const { data, error } = await supabase.rpc("get_threads", {
        p_limit: THREADS_PAGE_SIZE,
        p_offset: threadsOffset,
      });
      if (error) throw error;
      setThreads((prev) => [...prev, ...data]);
      setHasMoreThreads(data.length === THREADS_PAGE_SIZE);
      setThreadsOffset((prev) => prev + data.length);
    } catch (err) {
      console.error("Failed to load more threads:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreThreads, threadsOffset]);

  // --- Debounced search ---
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setDebouncedQuery("");
      setSearchResults([]);
      setSearchOffset(0);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery) return;
    setSearchLoading(true);
    setSearchOffset(0);
    const contact = contactFilter !== "all" ? contactFilter : null;
    supabase
      .rpc("search_messages", {
        query: debouncedQuery,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: 0,
        p_contact: contact,
      })
      .then(({ data, error }) => {
        if (error) throw error;
        setSearchResults(data);
        setHasMoreSearch(data.length === SEARCH_PAGE_SIZE);
        setSearchOffset(data.length);
      })
      .catch((err) => console.error("Search error:", err))
      .finally(() => setSearchLoading(false));
  }, [debouncedQuery, contactFilter]);

  // --- Load more search results ---
  const loadMoreSearch = useCallback(async () => {
    if (searchLoading || !hasMoreSearch) return;
    setSearchLoading(true);
    try {
      const contact = contactFilter !== "all" ? contactFilter : null;
      const { data, error } = await supabase.rpc("search_messages", {
        query: debouncedQuery,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: searchOffset,
        p_contact: contact,
      });
      if (error) throw error;
      setSearchResults((prev) => [...prev, ...data]);
      setHasMoreSearch(data.length === SEARCH_PAGE_SIZE);
      setSearchOffset((prev) => prev + data.length);
    } catch (err) {
      console.error("Search load more error:", err);
    } finally {
      setSearchLoading(false);
    }
  }, [searchLoading, hasMoreSearch, searchOffset, debouncedQuery, contactFilter]);

  // --- Open conversation (fetch on demand) ---
  const openConversation = useCallback(async (file, contact) => {
    setSelectedConversation({ fileName: file, contact });
    setView("conversation");
    setConvoLoading(true);
    setConversationMessages([]);
    try {
      const all = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("file", file)
          .order("date", { ascending: true, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setConversationMessages(
        all.map((row) => ({
          sender: row.sender,
          body: row.body,
          time: row.time_str || "",
          date: row.date ? new Date(row.date) : null,
          file: row.file,
          contact: row.contact,
        }))
      );
    } catch (err) {
      console.error("Failed to load conversation:", err);
    } finally {
      setConvoLoading(false);
    }
  }, []);

  // --- Focus search on load ---
  useEffect(() => {
    if (!threadsLoading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [threadsLoading]);

  // --- STYLES ---
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

  const globalCSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::selection { background: #F9E54740; color: #fff; }
    input:focus, select:focus { outline: none; border-color: var(--accent) !important; }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  `;

  // --- ERROR STATE ---
  if (loadError) {
    return (
      <div style={baseStyle}>
        <style>{globalCSS}</style>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "40px", textAlign: "center",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
          <p style={{ fontWeight: 600, fontSize: "18px", marginBottom: "8px" }}>Failed to load</p>
          <p style={{ color: "var(--text-dim)", fontSize: "14px", maxWidth: "400px" }}>{loadError}</p>
        </div>
      </div>
    );
  }

  // --- CONVERSATION VIEW ---
  if (view === "conversation" && selectedConversation) {
    return (
      <div style={baseStyle}>
        <style>{globalCSS}</style>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px 20px" }}>
          <button
            onClick={() => { setView("list"); setSelectedConversation(null); setConversationMessages([]); }}
            style={{
              background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
              padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
              fontFamily: "var(--font)", fontSize: "13px", marginBottom: "24px",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            ← Back
          </button>

          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontWeight: 700, fontSize: "24px", letterSpacing: "-0.01em" }}>
              {selectedConversation.contact}
            </h2>
            {!convoLoading && (
              <p style={{ color: "var(--text-dim)", fontSize: "13px", fontFamily: "var(--mono)", marginTop: "4px" }}>
                {conversationMessages.length} messages
              </p>
            )}
          </div>

          {convoLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonBubble key={i} align={i % 3 === 0 ? "right" : "left"} />
              ))}
            </div>
          ) : (
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
          )}
        </div>
      </div>
    );
  }

  // --- MAIN LIST / SEARCH VIEW ---
  const isSearching = debouncedQuery.length > 0;

  return (
    <div style={baseStyle}>
      <style>{globalCSS}</style>

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
                {Number(stats.total_messages).toLocaleString()} msgs · {Number(stats.total_contacts)} contacts
                {stats.earliest && stats.latest
                  ? ` · ${formatDate(new Date(stats.earliest))} – ${formatDate(new Date(stats.latest))}`
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
      </div>

      {/* Results */}
      <div style={{ padding: "16px 24px" }}>

        {/* --- SEARCH RESULTS MODE --- */}
        {isSearching ? (
          <>
            <p style={{
              fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-dim)",
              marginBottom: "16px",
            }}>
              {searchLoading && searchResults.length === 0
                ? "Searching…"
                : `${searchResults.length.toLocaleString()}${hasMoreSearch ? "+" : ""} result${searchResults.length !== 1 ? "s" : ""} for "${debouncedQuery}"${contactFilter !== "all" ? ` from ${contactFilter}` : ""}`}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {searchLoading && searchResults.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {searchResults.map((msg, i) => (
                    <div
                      key={msg.id || i}
                      onClick={() => openConversation(msg.file, msg.contact)}
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
                          {msg.date ? `${formatDate(new Date(msg.date))} ${formatTime(new Date(msg.date))}` : msg.time_str}
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

                  {hasMoreSearch && !searchLoading && (
                    <button
                      onClick={loadMoreSearch}
                      style={{
                        padding: "12px", background: "var(--bg-raised)", border: "1px solid var(--border)",
                        borderRadius: "10px", color: "var(--text-muted)", cursor: "pointer",
                        fontFamily: "var(--font)", fontSize: "14px", width: "100%",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-raised)"; }}
                    >
                      Load more results
                    </button>
                  )}

                  {searchLoading && searchResults.length > 0 && <SkeletonRow />}

                  {!searchLoading && searchResults.length === 0 && (
                    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
                      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔍</div>
                      <p style={{ fontSize: "15px" }}>No messages found</p>
                      <p style={{ fontSize: "13px", marginTop: "4px" }}>Try a different search term or filter</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          /* --- CONVERSATION THREADS MODE --- */
          <>
            <p style={{
              fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-dim)",
              marginBottom: "16px",
            }}>
              {threadsLoading ? "Loading conversations…" : `${threads.length} conversation${threads.length !== 1 ? "s" : ""}`}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {threadsLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {threads.map((thread, i) => {
                    const date = thread.date ? new Date(thread.date) : null;
                    return (
                      <div
                        key={thread.file}
                        onClick={() => openConversation(thread.file, thread.contact)}
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
                            <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--accent)", flexShrink: 0 }}>
                              {thread.contact}
                            </span>
                            <span style={{
                              fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)",
                              flexShrink: 0,
                            }}>
                              {thread.msg_count} msg{thread.msg_count !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <span style={{
                            fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)",
                            flexShrink: 0,
                          }}>
                            {date ? formatDate(date) : ""}
                          </span>
                        </div>
                        <p style={{
                          fontSize: "14px", lineHeight: 1.5, color: "var(--text-muted)",
                          wordBreak: "break-word",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          <span style={{ color: thread.sender.toLowerCase() === "me" ? "var(--blue)" : "var(--text-muted)", fontSize: "12px" }}>
                            {thread.sender}:
                          </span>{" "}
                          {thread.body}
                        </p>
                      </div>
                    );
                  })}

                  {hasMoreThreads && (
                    <button
                      onClick={loadMoreThreads}
                      disabled={loadingMore}
                      style={{
                        padding: "12px", background: "var(--bg-raised)", border: "1px solid var(--border)",
                        borderRadius: "10px", color: "var(--text-muted)", cursor: loadingMore ? "default" : "pointer",
                        fontFamily: "var(--font)", fontSize: "14px", width: "100%",
                        opacity: loadingMore ? 0.6 : 1, transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => { if (!loadingMore) e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-raised)"; }}
                    >
                      {loadingMore ? "Loading…" : "Load more conversations"}
                    </button>
                  )}

                  {threads.length === 0 && !threadsLoading && (
                    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
                      <div style={{ fontSize: "40px", marginBottom: "16px" }}>📱</div>
                      <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>No messages yet</p>
                      <p style={{ fontSize: "14px" }}>Run the upload script to import your Google Voice Takeout files.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
