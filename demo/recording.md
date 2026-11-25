# 80-second demo walkthrough

Use an approved WhatsApp test phone, a fictional patient, and the clinic inbox. Choose an available date and time from the bot’s prompt. Close other chats and notifications before recording.

| Time | Show | Say |
| --- | --- | --- |
| 0–10 s | Send `مرحبا` and show the Arabic menu. | “A patient messages the clinic on WhatsApp and gets an Arabic menu right away.” |
| 10–23 s | Send `١` for prices, then `٢` for hours and location. | “They can check prices and opening hours without waiting for reception.” |
| 23–50 s | Send `٣`, a fictional name, a demo phone number with country code, and a service number plus the date and time. Show the acknowledgment. | “The bot captures the appointment request. The clinic will follow up to confirm the time.” |
| 50–63 s | Open the matching appointment email and show the service and requested slot. | “Reception gets the details in its inbox.” |
| 63–80 s | Return to WhatsApp, send `Hello`, then `4`, and show the handoff email. | “The same workflow works in English and can pass a conversation to the clinic.” |

Before sharing, run a separate English booking using `Hello → 3` and an Arabic handoff using `مرحبا → ٤`. Check the lead file for both languages and retry an invalid phone number or closed day. Capture screenshots of the Arabic menu, booking acknowledgment and clinic inbox from the live run. Redact phone numbers, inbox addresses and tokens before sharing.
