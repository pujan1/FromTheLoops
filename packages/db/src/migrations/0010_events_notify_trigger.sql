-- Sprint 3 Day 3: low-latency wake-up for the events outbox.
--
-- Hand-written (drizzle-kit can't model triggers/functions). An AFTER INSERT
-- trigger on `events` fires pg_notify on the 'events' channel with the new
-- row's id. NOTIFY is transactional — it's delivered to listeners only when the
-- inserting transaction COMMITS — so a listener never sees an event whose report
-- write later rolled back, and always sees one that committed. The payload is
-- just the id (kept well under NOTIFY's 8000-byte limit); the worker loads the
-- full row by id. If a NOTIFY is ever dropped (listener down, restart), the row
-- is still there and the fallback poller picks it up — the table is the source
-- of truth, NOTIFY is only the fast path.
--
-- Meta snapshot for this migration copies 0009's (no Drizzle-schema change), so
-- `drizzle-kit generate` stays diff-free — same trick as 0002/0004/0008.

CREATE OR REPLACE FUNCTION notify_event() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_notify('events', NEW.id::text);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER events_notify
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_event();
