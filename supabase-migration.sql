-- Run this in Supabase SQL Editor

-- 1. Get conversation threads (latest message per thread, paginated)
CREATE OR REPLACE FUNCTION get_threads(p_limit int DEFAULT 10, p_offset int DEFAULT 0)
RETURNS TABLE(file text, contact text, sender text, body text, date timestamptz, time_str text, msg_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT t.file, t.contact, t.sender, t.body, t.date, t.time_str, t.msg_count
  FROM (
    SELECT DISTINCT ON (m.file)
      m.file, m.contact, m.sender, m.body, m.date, m.time_str,
      COUNT(*) OVER (PARTITION BY m.file) as msg_count
    FROM messages m
    ORDER BY m.file, m.date DESC NULLS LAST
  ) t
  ORDER BY t.date DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

-- 2. Search messages server-side with ILIKE
CREATE OR REPLACE FUNCTION search_messages(
  query text,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_contact text DEFAULT NULL
)
RETURNS TABLE(id bigint, sender text, body text, date timestamptz, file text, contact text, time_str text)
LANGUAGE sql STABLE AS $$
  SELECT m.id, m.sender, m.body, m.date, m.file, m.contact, m.time_str
  FROM messages m
  WHERE (m.body ILIKE '%' || query || '%'
      OR m.sender ILIKE '%' || query || '%'
      OR m.contact ILIKE '%' || query || '%')
    AND (p_contact IS NULL OR m.contact = p_contact)
  ORDER BY m.date DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

-- 3. Get archive stats
CREATE OR REPLACE FUNCTION get_stats()
RETURNS TABLE(total_messages bigint, total_conversations bigint, total_contacts bigint, earliest timestamptz, latest timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*) as total_messages,
    COUNT(DISTINCT file) as total_conversations,
    COUNT(DISTINCT contact) as total_contacts,
    MIN(date) as earliest,
    MAX(date) as latest
  FROM messages;
$$;

-- 4. Get distinct contacts for the filter dropdown
CREATE OR REPLACE FUNCTION get_contacts()
RETURNS TABLE(contact text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT m.contact FROM messages m ORDER BY m.contact;
$$;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_threads TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_messages TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_stats TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_contacts TO anon, authenticated;

-- 6. Add index to speed up ILIKE search
CREATE INDEX IF NOT EXISTS idx_messages_body_lower ON messages (lower(body));
CREATE INDEX IF NOT EXISTS idx_messages_file ON messages (file);
