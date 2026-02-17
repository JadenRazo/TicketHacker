--
-- PostgreSQL database dump
--

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg12+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: CannedResponseScope; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."CannedResponseScope" AS ENUM (
    'PERSONAL',
    'TEAM',
    'TENANT'
);


ALTER TYPE public."CannedResponseScope" OWNER TO tickethacker;

--
-- Name: Channel; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."Channel" AS ENUM (
    'CHAT_WIDGET',
    'DISCORD',
    'TELEGRAM',
    'EMAIL',
    'API'
);


ALTER TYPE public."Channel" OWNER TO tickethacker;

--
-- Name: CustomFieldType; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."CustomFieldType" AS ENUM (
    'TEXT',
    'NUMBER',
    'DROPDOWN',
    'DATE',
    'BOOLEAN'
);


ALTER TYPE public."CustomFieldType" OWNER TO tickethacker;

--
-- Name: MacroScope; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."MacroScope" AS ENUM (
    'PERSONAL',
    'TEAM',
    'TENANT'
);


ALTER TYPE public."MacroScope" OWNER TO tickethacker;

--
-- Name: MessageDirection; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."MessageDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
);


ALTER TYPE public."MessageDirection" OWNER TO tickethacker;

--
-- Name: MessageType; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."MessageType" AS ENUM (
    'TEXT',
    'NOTE',
    'SYSTEM',
    'AI_SUGGESTION'
);


ALTER TYPE public."MessageType" OWNER TO tickethacker;

--
-- Name: Plan; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."Plan" AS ENUM (
    'FREE',
    'GROWTH',
    'PRO',
    'ENTERPRISE'
);


ALTER TYPE public."Plan" OWNER TO tickethacker;

--
-- Name: Priority; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."Priority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
);


ALTER TYPE public."Priority" OWNER TO tickethacker;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."Role" AS ENUM (
    'OWNER',
    'ADMIN',
    'AGENT',
    'VIEWER'
);


ALTER TYPE public."Role" OWNER TO tickethacker;

--
-- Name: TicketStatus; Type: TYPE; Schema: public; Owner: tickethacker
--

CREATE TYPE public."TicketStatus" AS ENUM (
    'OPEN',
    'PENDING',
    'RESOLVED',
    'CLOSED'
);


ALTER TYPE public."TicketStatus" OWNER TO tickethacker;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Attachment; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Attachment" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "messageId" text NOT NULL,
    filename text NOT NULL,
    "mimeType" text NOT NULL,
    "sizeBytes" integer NOT NULL,
    url text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Attachment" OWNER TO tickethacker;

--
-- Name: AutomationRule; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."AutomationRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AutomationRule" OWNER TO tickethacker;

--
-- Name: CannedResponse; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."CannedResponse" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    shortcut text,
    scope public."CannedResponseScope" DEFAULT 'TENANT'::public."CannedResponseScope" NOT NULL,
    "ownerId" text,
    "teamId" text,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CannedResponse" OWNER TO tickethacker;

--
-- Name: Contact; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Contact" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "externalId" text NOT NULL,
    name text,
    email text,
    "avatarUrl" text,
    channel public."Channel" NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "satisfactionRating" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Contact" OWNER TO tickethacker;

--
-- Name: CustomFieldDefinition; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."CustomFieldDefinition" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    "fieldType" public."CustomFieldType" NOT NULL,
    options jsonb,
    "isRequired" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CustomFieldDefinition" OWNER TO tickethacker;

--
-- Name: Macro; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Macro" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    scope public."MacroScope" DEFAULT 'TENANT'::public."MacroScope" NOT NULL,
    "ownerId" text,
    "teamId" text,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Macro" OWNER TO tickethacker;

--
-- Name: Message; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Message" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "ticketId" text NOT NULL,
    "senderId" text,
    "contactId" text,
    direction public."MessageDirection" NOT NULL,
    "contentText" text NOT NULL,
    "contentHtml" text,
    "messageType" public."MessageType" DEFAULT 'TEXT'::public."MessageType" NOT NULL,
    "externalId" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Message" OWNER TO tickethacker;

--
-- Name: PlatformConnection; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."PlatformConnection" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    channel public."Channel" NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PlatformConnection" OWNER TO tickethacker;

--
-- Name: SavedView; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."SavedView" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    "sortBy" text DEFAULT 'createdAt'::text NOT NULL,
    "sortOrder" text DEFAULT 'desc'::text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."SavedView" OWNER TO tickethacker;

--
-- Name: Team; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Team" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Team" OWNER TO tickethacker;

--
-- Name: TeamMember; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."TeamMember" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "teamId" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TeamMember" OWNER TO tickethacker;

--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Tenant" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    plan public."Plan" DEFAULT 'FREE'::public."Plan" NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Tenant" OWNER TO tickethacker;

--
-- Name: Ticket; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."Ticket" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    subject text NOT NULL,
    status public."TicketStatus" DEFAULT 'OPEN'::public."TicketStatus" NOT NULL,
    priority public."Priority" DEFAULT 'NORMAL'::public."Priority" NOT NULL,
    channel public."Channel" NOT NULL,
    "assigneeId" text,
    "teamId" text,
    "contactId" text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    "snoozedUntil" timestamp(3) without time zone,
    "mergedIntoId" text,
    "slaDeadline" timestamp(3) without time zone,
    "customFields" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "closedAt" timestamp(3) without time zone
);


ALTER TABLE public."Ticket" OWNER TO tickethacker;

--
-- Name: User; Type: TABLE; Schema: public; Owner: tickethacker
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role public."Role" NOT NULL,
    "passwordHash" text NOT NULL,
    "avatarUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastSeenAt" timestamp(3) without time zone,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO tickethacker;

--
-- Name: Attachment Attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_pkey" PRIMARY KEY (id);


--
-- Name: AutomationRule AutomationRule_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."AutomationRule"
    ADD CONSTRAINT "AutomationRule_pkey" PRIMARY KEY (id);


--
-- Name: CannedResponse CannedResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."CannedResponse"
    ADD CONSTRAINT "CannedResponse_pkey" PRIMARY KEY (id);


--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);


--
-- Name: CustomFieldDefinition CustomFieldDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."CustomFieldDefinition"
    ADD CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY (id);


--
-- Name: Macro Macro_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Macro"
    ADD CONSTRAINT "Macro_pkey" PRIMARY KEY (id);


--
-- Name: Message Message_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);


--
-- Name: PlatformConnection PlatformConnection_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."PlatformConnection"
    ADD CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY (id);


--
-- Name: SavedView SavedView_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."SavedView"
    ADD CONSTRAINT "SavedView_pkey" PRIMARY KEY (id);


--
-- Name: TeamMember TeamMember_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_pkey" PRIMARY KEY (id);


--
-- Name: Team Team_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Team"
    ADD CONSTRAINT "Team_pkey" PRIMARY KEY (id);


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);


--
-- Name: Ticket Ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Contact_tenantId_channel_externalId_key; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE UNIQUE INDEX "Contact_tenantId_channel_externalId_key" ON public."Contact" USING btree ("tenantId", channel, "externalId");


--
-- Name: PlatformConnection_tenantId_channel_key; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE UNIQUE INDEX "PlatformConnection_tenantId_channel_key" ON public."PlatformConnection" USING btree ("tenantId", channel);


--
-- Name: TeamMember_teamId_userId_key; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON public."TeamMember" USING btree ("teamId", "userId");


--
-- Name: Tenant_slug_key; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE UNIQUE INDEX "Tenant_slug_key" ON public."Tenant" USING btree (slug);


--
-- Name: User_tenantId_email_key; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE UNIQUE INDEX "User_tenantId_email_key" ON public."User" USING btree ("tenantId", email);


--
-- Name: Ticket_tenantId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE INDEX "Ticket_tenantId_status_createdAt_idx" ON public."Ticket" USING btree ("tenantId", status, "createdAt");


--
-- Name: Ticket_tenantId_assigneeId_idx; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE INDEX "Ticket_tenantId_assigneeId_idx" ON public."Ticket" USING btree ("tenantId", "assigneeId");


--
-- Name: Ticket_tenantId_contactId_idx; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE INDEX "Ticket_tenantId_contactId_idx" ON public."Ticket" USING btree ("tenantId", "contactId");


--
-- Name: Message_ticketId_createdAt_idx; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE INDEX "Message_ticketId_createdAt_idx" ON public."Message" USING btree ("ticketId", "createdAt");


--
-- Name: Message_tenantId_idx; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE INDEX "Message_tenantId_idx" ON public."Message" USING btree ("tenantId");


--
-- Name: Contact_tenantId_channel_idx; Type: INDEX; Schema: public; Owner: tickethacker
--

CREATE INDEX "Contact_tenantId_channel_idx" ON public."Contact" USING btree ("tenantId", channel);


--
-- Name: Attachment Attachment_messageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public."Message"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AutomationRule AutomationRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."AutomationRule"
    ADD CONSTRAINT "AutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CannedResponse CannedResponse_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."CannedResponse"
    ADD CONSTRAINT "CannedResponse_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CannedResponse CannedResponse_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."CannedResponse"
    ADD CONSTRAINT "CannedResponse_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CannedResponse CannedResponse_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."CannedResponse"
    ADD CONSTRAINT "CannedResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Contact Contact_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomFieldDefinition CustomFieldDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."CustomFieldDefinition"
    ADD CONSTRAINT "CustomFieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Macro Macro_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Macro"
    ADD CONSTRAINT "Macro_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Macro Macro_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Macro"
    ADD CONSTRAINT "Macro_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Macro Macro_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Macro"
    ADD CONSTRAINT "Macro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Message Message_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Message Message_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Message Message_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Message Message_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PlatformConnection PlatformConnection_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."PlatformConnection"
    ADD CONSTRAINT "PlatformConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SavedView SavedView_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."SavedView"
    ADD CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SavedView SavedView_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."SavedView"
    ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TeamMember TeamMember_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TeamMember TeamMember_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TeamMember TeamMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Team Team_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Team"
    ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Ticket Ticket_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ticket Ticket_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Ticket Ticket_mergedIntoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES public."Ticket"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ticket Ticket_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ticket Ticket_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."Ticket"
    ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: User User_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tickethacker
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."Attachment" ENABLE ROW LEVEL SECURITY;

--
-- Name: AutomationRule; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."AutomationRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: CannedResponse; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."CannedResponse" ENABLE ROW LEVEL SECURITY;

--
-- Name: Contact; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."Contact" ENABLE ROW LEVEL SECURITY;

--
-- Name: CustomFieldDefinition; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."CustomFieldDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: Macro; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."Macro" ENABLE ROW LEVEL SECURITY;

--
-- Name: Message; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

--
-- Name: PlatformConnection; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."PlatformConnection" ENABLE ROW LEVEL SECURITY;

--
-- Name: SavedView; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."SavedView" ENABLE ROW LEVEL SECURITY;

--
-- Name: Team; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."Team" ENABLE ROW LEVEL SECURITY;

--
-- Name: TeamMember; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."TeamMember" ENABLE ROW LEVEL SECURITY;

--
-- Name: Ticket; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."Ticket" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: tickethacker
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: Attachment tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."Attachment" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: AutomationRule tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."AutomationRule" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: CannedResponse tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."CannedResponse" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: Contact tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."Contact" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: CustomFieldDefinition tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."CustomFieldDefinition" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: Macro tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."Macro" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: Message tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."Message" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: PlatformConnection tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."PlatformConnection" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: SavedView tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."SavedView" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: Team tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."Team" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: TeamMember tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."TeamMember" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: Ticket tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."Ticket" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- Name: User tenant_isolation; Type: POLICY; Schema: public; Owner: tickethacker
--

CREATE POLICY tenant_isolation ON public."User" USING (("tenantId" = current_setting('app.current_tenant'::text, true))) WITH CHECK (("tenantId" = current_setting('app.current_tenant'::text, true)));


--
-- PostgreSQL database dump complete
--
