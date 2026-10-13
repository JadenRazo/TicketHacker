-- Additive migration; must run through the deployment migration process, not db push.
ALTER TABLE public."Ticket" ADD COLUMN "agentVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE public."AgentOperation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "ticketId" TEXT NOT NULL REFERENCES public."Ticket"("id") ON DELETE CASCADE,
  "originMessageId" TEXT,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "ticketVersion" INTEGER NOT NULL,
  "completedTicketVersion" INTEGER,
  "predecessorId" TEXT,
  "settingsVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "claimToken" TEXT,
  "callbackEventId" TEXT,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AgentOperation_tenantId_ticketId_idx" ON public."AgentOperation"("tenantId", "ticketId");
ALTER TABLE public."AgentOperation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_operation_tenant ON public."AgentOperation"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

-- Every ticket write and message insertion/edit/deletion invalidates pending AI.
-- Triggers cover human, channel, automation, and SQL paths, not just this service.
CREATE FUNCTION public.bump_ticket_agent_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."agentVersion" := OLD."agentVersion" + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_agent_version BEFORE UPDATE ON public."Ticket"
  FOR EACH ROW EXECUTE FUNCTION public.bump_ticket_agent_version();
CREATE FUNCTION public.bump_message_ticket_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected_ids TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN affected_ids := ARRAY[NEW."ticketId"];
  ELSIF TG_OP = 'DELETE' THEN affected_ids := ARRAY[OLD."ticketId"];
  ELSE affected_ids := ARRAY[OLD."ticketId", NEW."ticketId"];
  END IF;
  -- A move invalidates both parents, always locking them in database order.
  PERFORM id FROM public."Ticket" WHERE id = ANY(affected_ids) ORDER BY id FOR UPDATE;
  UPDATE public."Ticket" SET "agentVersion" = "agentVersion" + 1 WHERE id = ANY(affected_ids);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER message_agent_version BEFORE INSERT OR UPDATE OR DELETE ON public."Message"
  FOR EACH ROW EXECUTE FUNCTION public.bump_message_ticket_version();
