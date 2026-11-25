# Nile Dental Care WhatsApp demo

A fictional Cairo clinic built to demonstrate WhatsApp Cloud API and n8n. Customers get an Arabic or English menu, FAQs, appointment requests and a human handoff. n8n routes the conversation and emails the clinic. The gateway verifies Meta webhooks, stores leads, and sends replies through Cloud API.

See the [PRD](PRD.md) and [demo walkthrough](demo/recording.md).

## Run the demo

1. In Meta for Developers, create an app with the WhatsApp use case. Open **WhatsApp → API Setup** and copy the temporary access token, the test **Phone Number ID**, and the API version shown in the sample request. Add and verify each tester’s WhatsApp number under **To**. Copy the app secret from the app settings. [Meta Cloud API setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
2. Install Docker with Compose. Copy `.env.example` to `.env`, fill in the Meta values, and generate a webhook verification token with `openssl rand -hex 32`. Set **CLINIC_EMAIL_FROM** to the sender authorized by your SMTP account and **CLINIC_EMAIL_TO** to your demo inbox. Keep `.env` local.
3. Run `docker compose up -d`. Open <http://localhost:5678>, create the n8n owner account, and import `workflow.json` using **Import from File**. Open **Email clinic**, choose or create an SMTP credential, then save and **Publish** the workflow. The two n8n webhooks are called on the private Compose network. [n8n Docker setup](https://docs.n8n.io/hosting/installation/docker/) · [n8n SMTP credentials](https://docs.n8n.io/integrations/builtin/credentials/send-email/)
4. Start an HTTPS tunnel to the gateway with `ngrok http 8080`. In the Meta app’s WhatsApp configuration, use the tunnel’s HTTPS URL followed by `/whatsapp` as the callback. Enter the verification token from `.env`, verify the callback, and subscribe to **messages**. If the URL changes, update Meta’s callback. [Meta webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
5. From an approved test phone, message the test number with `Hello` or `مرحبا`. Follow the [walkthrough](demo/recording.md) and confirm both booking and handoff emails arrive. For handoff, the email includes the sender's WhatsApp number and the last free-text message so the clinic can follow up.
6. Inspect stored contacts, bookings, handoffs and pending deliveries locally.

   ```sh
   docker compose exec gateway cat /data/leads.json
   docker compose logs gateway
   ```

   The data lives in the Compose `leads` volume and survives restarts. This demo uses a single gateway process and a local lead store in place of Google Sheets. Use fictional booking details and keep the lead file and inbox private.

## Meta test number and reply window

Meta provisions a test number for sandbox testing. Use the approved recipient list shown in the app dashboard and confirm its current capacity before inviting prospects. The bot sends free-form replies within the 24-hour customer service window that starts or resets with each inbound message. Use the test number, an existing SMTP inbox and a free development tunnel for the demo. Review current pricing before using a real business number. Rotate temporary tokens when they expire, update `.env`, and run `docker compose up -d --force-recreate gateway`. [Meta test setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) · [Meta reply windows and pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)

If tester onboarding is impractical, use the live screen recording. WhatsApp Web automation libraries such as Baileys and whatsapp-web.js are unofficial fallback options with account-ban risk.

## Customize and test

- Edit `faq.json` and `clinic.json` for the clinic name, FAQ, services, time zone and booking hours. Keep the FAQ's `hours` and `location` entries and make sure every booking service ID points to an FAQ entry. Keep the time zone aligned with the wording in the conversational prompts. Restart the gateway to load data changes.
- To change conversation logic, edit `conversation.js`, run `node scripts/build-workflow.js`, and reimport and publish the regenerated workflow. Unpublish the old workflow before publishing its replacement to release the two webhook paths.
- Run `node test/demo.test.js` with Node.js 20 or later. The tests run the exported workflow's Code node and exercise the webhook handler, lead storage, delivery retries and deduplication with simulated n8n and Meta HTTP responses.
- Lead and booking writes are deduplicated by Meta message ID. SMTP and WhatsApp sends can be retried if a network failure leaves delivery uncertain. An occasional duplicate notification or reply is possible in that case.
