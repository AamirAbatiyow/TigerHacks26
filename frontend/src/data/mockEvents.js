export const mockEventSequence = [
  {
    id: "page-loaded",
    nodeId: "cdn",
    requestId: "cdn-assets",
    title: "Page loaded",
    detail: "Application resources requested",
    sensitive: false,
  },

  {
    id: "auth-session",
    nodeId: "auth",
    requestId: "auth-session",
    title: "Session created",
    detail: "User session initialized",
    sensitive: false,
  },

  {
    id: "symptom-event",
    nodeId: "analytics",
    requestId: "analytics-symptom",
    title: "Symptom information",
    detail: "Health information sent to analytics",
    sensitive: true,
  },

  {
    id: "advertising-event",
    nodeId: "advertising",
    requestId: "ad-session",
    title: "Session identifier",
    detail: "Identifier sent to advertising",
    sensitive: true,
  },

  {
    id: "medication-event",
    nodeId: "metrics",
    requestId: "metrics-medication",
    title: "Medication information",
    detail: "Medication event transmitted",
    sensitive: true,
  },

  {
    id: "device-event",
    nodeId: "unknown",
    requestId: "unknown-device",
    title: "Device identifier",
    detail: "Identifier sent to unknown service",
    sensitive: true,
  },

  {
    id: "behavior-event",
    nodeId: "session-analytics",
    requestId: "session-click",
    title: "Interaction event",
    detail: "Page interaction recorded",
    sensitive: false,
  },
];