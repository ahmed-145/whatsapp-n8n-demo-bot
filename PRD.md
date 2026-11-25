# PRD: WhatsApp + n8n Demo Bot for Direct-Client Outreach

- **Owner:** Ahmed Mahmoud Abbas (software engineer in Egypt offering automation work to small businesses)
- **Status:** v1 demo verified on the Meta test number (Nov 25, 2026). Video deferred.
- **Build time target:** ~1 day
- **Budget:** $0 (free tiers and self-hosted only)

## 0. Summary for a reader with no context

**What it is.** A working WhatsApp chatbot for a fictional dental clinic in Cairo, built with n8n (an open source workflow automation tool). A patient messages it in Arabic or English, sees a menu, gets answers about services, prices and hours, and can request an appointment. The clinic side gets a notification with the booking details.

**The problem.** Small businesses in Egypt and the Gulf (clinics, real estate offices, language centers, online shops) get most customer messages on WhatsApp and answer them by hand, often late. They lose bookings to slow replies. The owner of this repo sells WhatsApp bots and automations to such businesses, but a written offer is hard to trust. A business owner wants to try it on their own phone before paying.

**The solution.** One real, demoable bot that costs nothing to run, plus screenshots from the live demo. The same workflow can be cloned per client by editing data (business name, FAQ answers, booking rules), not code.

**Who it is for.**
1. Prospective clients: a non-technical business owner who should understand the value in under two minutes.
2. The owner, as a sales and portfolio artifact.
3. Anyone reviewing the repo: it shows working integration of a messaging API, a workflow engine and a lead store.

**Terms.** WhatsApp Cloud API: Meta's official API for sending and receiving WhatsApp messages from software. Webhook: a URL that receives incoming messages. n8n: a visual workflow automation tool that can be self-hosted. Lead: a person who showed interest and left contact details. Handoff: passing a chat to a human.

## 1. Background

The owner sells WhatsApp bots, n8n automations, and simple dashboards to small businesses in Egypt and the Gulf (dental clinics, real estate offices, language centers, online stores, marketing agencies). His existing portfolio (Python backend, bots, scraping, REST APIs, Docker, RAG) has no WhatsApp or n8n artifact, so cold outreach has nothing visual to point at. This repo builds that artifact: one working, demoable WhatsApp bot built on n8n that a clinic owner can try from their own phone in under a minute.

## 2. Goals

- A live demo bot a prospect can message on WhatsApp and get instant, useful replies.
- Screenshots from the live demo for outreach emails and freelance marketplace gigs (Fiverr, Khamsat).
- Honest proof of skill: everything in the demo must actually work, no mockups.
- Reusable base: the same n8n workflow should be cloneable per client with only content changes (business name, FAQ answers, booking rules).

## 3. Non-goals (v1)

- No payments inside WhatsApp.
- No real calendar integration (booking is captured as a request, not confirmed).
- No AI/RAG answering (v1 uses a fixed FAQ table; RAG upgrade is a later milestone that reuses existing RAG experience).
- No production hosting, no Meta business verification, no multi-tenant support.

## 4. Demo persona and script

Persona: a dental clinic in Cairo ("Nile Dental Care" - fictional). The prospect is told: "Message this number and pretend you are a patient."

Demo conversation the client sees:

1. Patient sends any message (Arabic or English).
2. Bot replies in the same language with a menu: 1) Services & prices 2) Working hours & location 3) Book an appointment 4) Talk to a human.
3. Option 1-2: bot answers instantly from the FAQ table (bilingual).
4. Option 3: bot collects name, phone, service, preferred day/time in 3 short messages, confirms back, saves the request, and sends a notification to the "clinic" (the owner's own WhatsApp or email) so the prospect sees the business side too.
5. Option 4: bot says a human will reply soon and forwards the chat to the "clinic" notification channel.
6. Unknown input: polite fallback + menu again. No dead ends.

## 5. Functional requirements

P0 (must work in the demo):

- Receive and send WhatsApp messages through the Meta WhatsApp Cloud API (free test number from a Meta developer app).
- Language detect (Arabic vs English) per message and reply accordingly; full Arabic and English copies of every reply.
- FAQ table (10-15 Q&A pairs for the demo clinic) stored as data, not hard-coded in the workflow, so swapping content per client is a data edit.
- Booking capture: name, phone, service, preferred slot; validated and confirmed back to the user.
- Lead storage: every booking request and every new contact appended to a Google Sheet (or n8n's built-in datastore) with timestamp and language.
- Business notification: on each booking request or human-handoff, send a WhatsApp message or email to the business inbox.
- Human handoff path with a clear "you are now talking to the clinic" message.

P1 (nice to have, add only if the day allows):

- Simple dashboard: one read-only page (or the Google Sheet itself styled) showing today's leads.
- Typing delay simulation so replies feel natural.
- "Send location" reply with a Google Maps pin.

## 6. Technical architecture

- **n8n**, self-hosted with Docker (`docker run` with the official n8n image), workflow kept as an exported JSON in this repo so any client setup is reproducible.
- **WhatsApp Cloud API** (Meta for Developers): free test number + webhook into n8n. Verify current free-tier limits on Meta's docs before the build; note them in the README. Alternative if the test number blocks the demo: the unofficial whatsapp-web.js/Baileys route, documented as a fallback only (ban risk, never sold to a client as-is).
- **Local webhook exposure** for development: n8n tunnel option or ngrok free tier.
- **Storage:** Google Sheets via n8n's Google node (free) as the lead database.
- **Language detection:** simple rule (Arabic Unicode range check) inside the workflow; no external API.
- Everything must run with tools the owner already knows: Docker, REST, JSON. No new paid service.

## 7. Deliverables (definition of done)

- This repo, private, containing:
  - `PRD.md` (this file)
  - `README.md`: setup steps from zero to running demo (Meta app creation, test number, webhook, n8n import), written so a client-facing technical person could follow it
  - `workflow.json`: the exported n8n workflow
  - `faq.json`: the bilingual FAQ table
  - `demo/`: eight screenshots from the live demo showing English and Arabic booking and handoff, with the tester’s real number redacted from the notification previews. The [recording script](demo/recording.md) is retained for a future video.
- Live verification completed on the Meta test number. English and Arabic booking and handoff each produced a WhatsApp reply and an email in the Mailpit test inbox.
- **Pending for outreach:** a link prospects can open. The repository is private. The screenshots can be shared directly, and the WhatsApp test number is available for demos while the temporary tunnel and local services are running.

## 8. Success criteria

- **Verified with the project owner:** a tester can message the number, request an appointment, and see the clinic notification. A walkthrough with a non-technical clinic owner is unverified.
- **Untimed:** the full walkthrough target is under two minutes.
- Zero cost incurred.
- Every claim in the outreach offer ("WhatsApp bots, n8n automations") now has a working artifact behind it.

## 9. Risks and mitigations

- **Meta test number limits** (restricted recipient count, 24-hour windows): check current Meta docs at build time; demo with the prospect's number added as an allowed recipient, or share the screenshots when live messaging is unavailable.
- **n8n tunnel instability:** share the screenshots if the temporary tunnel is unavailable.
- **Scope creep into AI/RAG:** explicitly deferred; v1's fixed FAQ is more reliable in a demo anyway.
- **WhatsApp policy:** never use the unofficial library for a paying client without disclosing the ban risk; Cloud API is the sellable path.

## 10. Later milestones (not in this build)

- Optional 60–90 second outreach recording using the existing script.
- RAG answering over the client's real documents (reuses existing RAG experience).
- Real calendar booking (Google Calendar node).
- Dashboard productization for the paid starter package (about $100).
- Meta business verification path for real client deployments.
