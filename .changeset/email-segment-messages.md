---
"@laylo.com/node": minor
---

`messages.segments.send(input)` and `messages.segments.schedule(input)` can now email a segment as well as text one. Pass `segment.signUpType: "email"` with `email: { subject, ctaUrl?, ctaText? }`; Laylo lays the email out from `message`, turns its links into buttons, and adds `ctaUrl` with `ctaText` as the main button. An email segment without `email`, or `email` on an SMS segment, throws `LayloConfigurationError` before any request. New type: `SegmentMessageEmail`.
