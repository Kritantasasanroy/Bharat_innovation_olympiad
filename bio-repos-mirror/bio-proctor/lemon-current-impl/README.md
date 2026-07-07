# Lemon Ideas — current proctoring implementation (preserved)

This folder holds the **production proctoring implementation** used by the Bharat Innovation
Olympiad platform today, preserved here in `bio-proctor` at the maintainer's request.

It is intentionally **different from this repo's target** (`bio-proctor` = Python / FastAPI model
runtime). The current platform does proctoring **client-side, for free**, with
[face-api.js](https://github.com/justadudewhohacks/face-api.js) running in the student's browser
(WebGL) — there is no Python service in production. This TypeScript implementation is kept here so
the proctoring repo carries the real, working behaviour while the Python runtime is built out.

## What's here

```
web-client/
  useFaceProctor.ts   React hook — face-api.js inference (NO_FACE, MULTIPLE_FACES, LOOKING_AWAY,
                      FACE_MISMATCH), 5s detection tick + 1s sustain timer, event reporting.
  proctor.ts          ProctorEventType union + LiveMonitoringEntry types.
api/
  proctor.controller.ts  POST /proctor/enroll|verify|events, GET /proctor/enrollment|live|report.
  proctor.service.ts     enrollFace, verifyFace (128-D Euclidean), createEvent, risk aggregation,
                         getLiveMonitoring, getReport.
  proctor.module.ts      NestJS module wiring.
```

## How it works (summary)

- **Enrollment:** the student's 128-D face descriptor (from `faceRecognitionNet`) is stored on
  `User.faceEmbedding` (`POST /proctor/enroll`). Attempt start is gated on enrollment existing.
- **In-exam:** `useFaceProctor` runs `tinyFaceDetector` + `faceLandmark68TinyNet` every 5s via
  `requestIdleCallback`; a 1s timer turns "sustained N seconds" into counted violations. Only small
  JSON events are POSTed to the server (`POST /proctor/events`) — never raw frames.
- **Live review:** admins poll `GET /proctor/live`; per-attempt timelines via
  `GET /proctor/report/:attemptId`. Risk score is severity-weighted.

## Migration note

When the Python `bio-proctor` runtime lands, the wire contract should be
`@bio/domain-contracts` proctor events (`ProctorSessionRequested`, `RiskScoreChanged`,
`ProctorReportFinalized`), so the browser client and/or the Python service can produce the same
events the rest of BIO already consumes.
