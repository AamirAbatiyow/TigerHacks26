export const mockNodes = [
  {
    id: "analytics",
    name: "Analytics Provider",
    position: [2.5, 1.25, -0.4],
    color: "#8B5CF6",
    category: "Analytics",
    domain: "analytics.example.com",
    sensitive: true,
    message:
      "Health-related activity was observed being sent to this analytics provider.",

    requests: [
      {
        id: "analytics-symptom",
        name: "symptom_logged",
        method: "POST",
        endpoint: "/collect",
        timestamp: "09:41:22.391",
        sensitive: true,
        category: "Health / Symptom",
        message:
          "Your symptom selection was included in this analytics request.",
        fields: [
          {
            name: "symptom",
            value: "missed_period",
          },
          {
            name: "session_id",
            value: "8f42a19c",
          },
          {
            name: "device_id",
            value: "29bc81e2",
          },
        ],
      },

      {
        id: "analytics-page",
        name: "page_view",
        method: "POST",
        endpoint: "/collect",
        timestamp: "09:41:18.104",
        sensitive: false,
        category: "Behavior",
        message:
          "A page-view event was sent to this analytics provider.",
        fields: [
          {
            name: "page",
            value: "/symptoms",
          },
          {
            name: "session_id",
            value: "8f42a19c",
          },
        ],
      },

      {
        id: "analytics-session",
        name: "session_start",
        method: "POST",
        endpoint: "/session",
        timestamp: "09:41:02.812",
        sensitive: false,
        category: "Identifier",
        message:
          "A session-start event was sent to this analytics provider.",
        fields: [
          {
            name: "session_id",
            value: "8f42a19c",
          },
          {
            name: "browser",
            value: "Chrome",
          },
        ],
      },

      {
        id: "analytics-device",
        name: "device_context",
        method: "POST",
        endpoint: "/context",
        timestamp: "09:41:03.118",
        sensitive: false,
        category: "Device",
        message:
          "Device information was included in this analytics request.",
        fields: [
          {
            name: "device_id",
            value: "29bc81e2",
          },
          {
            name: "platform",
            value: "Windows",
          },
        ],
      },
    ],
  },

  {
    id: "advertising",
    name: "Ad Network",
    position: [-2.6, 1.35, -0.6],
    color: "#EC4899",
    category: "Advertising",
    domain: "ads.example.com",
    sensitive: true,
    message:
      "Identifiers and browsing activity were observed being sent to an advertising service.",

    requests: [
      {
        id: "ad-session",
        name: "identify_user",
        method: "POST",
        endpoint: "/events",
        timestamp: "09:41:24.521",
        sensitive: true,
        category: "Identifier",
        message:
          "A session identifier was sent to an advertising service.",
        fields: [
          {
            name: "session_id",
            value: "8f42a19c",
          },
          {
            name: "page",
            value: "/symptoms",
          },
        ],
      },

      {
        id: "ad-view",
        name: "page_view",
        method: "POST",
        endpoint: "/events",
        timestamp: "09:41:17.945",
        sensitive: false,
        category: "Behavior",
        message:
          "Page activity was transmitted to the advertising service.",
        fields: [
          {
            name: "page_view",
            value: "symptom_form",
          },
        ],
      },

      {
        id: "ad-pixel",
        name: "tracking_pixel",
        method: "GET",
        endpoint: "/pixel",
        timestamp: "09:41:25.114",
        sensitive: false,
        category: "Tracking",
        message:
          "A tracking pixel request was observed.",
        fields: [
          {
            name: "browser_id",
            value: "brow_913ab",
          },
        ],
      },
    ],
  },

  {
    id: "metrics",
    name: "Metrics API",
    position: [2.7, -1.15, 0.4],
    color: "#2DD4BF",
    category: "API",
    domain: "metrics.example.com",
    sensitive: true,
    message:
      "Health-related information was observed being transmitted to this API.",

    requests: [
      {
        id: "metrics-medication",
        name: "medication_updated",
        method: "POST",
        endpoint: "/metrics",
        timestamp: "09:41:31.802",
        sensitive: true,
        category: "Medication",
        message:
          "Medication information was included in this request.",
        fields: [
          {
            name: "medication",
            value: "sertraline",
          },
          {
            name: "timestamp",
            value: "09:41:31",
          },
        ],
      },

      {
        id: "metrics-account",
        name: "account_event",
        method: "POST",
        endpoint: "/metrics",
        timestamp: "09:41:32.016",
        sensitive: false,
        category: "Account",
        message:
          "Account metadata was included in this request.",
        fields: [
          {
            name: "account_id",
            value: "user_4812",
          },
        ],
      },
    ],
  },

  {
    id: "auth",
    name: "Authentication",
    position: [-2.4, -1.45, 0.5],
    color: "#22D3EE",
    category: "First party",
    domain: "auth.myhealth.local",
    sensitive: false,
    message:
      "Authentication traffic remained within the first-party application.",

    requests: [
      {
        id: "auth-session",
        name: "create_session",
        method: "POST",
        endpoint: "/auth/session",
        timestamp: "09:41:01.221",
        sensitive: false,
        category: "Authentication",
        message:
          "The application created an authenticated session.",
        fields: [
          {
            name: "user_id",
            value: "user_4812",
          },
          {
            name: "session_token",
            value: "••••••••",
          },
        ],
      },
    ],
  },

  {
    id: "unknown",
    name: "Unknown Service",
    position: [0.35, 2.3, -0.9],
    color: "#FBBF24",
    category: "Unknown",
    domain: "unknown.example.net",
    sensitive: true,
    message:
      "Information was observed being transmitted to an unclassified destination.",

    requests: [
      {
        id: "unknown-device",
        name: "device_ping",
        method: "GET",
        endpoint: "/pixel",
        timestamp: "09:41:27.004",
        sensitive: true,
        category: "Device identifier",
        message:
          "A device identifier was included in a request to an unknown destination.",
        fields: [
          {
            name: "device_id",
            value: "29bc81e2",
          },
        ],
      },
    ],
  },

  {
    id: "logging",
    name: "Logging Service",
    position: [-0.6, -2.25, -0.7],
    color: "#8B5CF6",
    category: "Analytics",
    domain: "logs.example.com",
    sensitive: false,
    message:
      "Diagnostic information was transmitted to a logging service.",

    requests: [
      {
        id: "logging-error",
        name: "diagnostic_event",
        method: "POST",
        endpoint: "/log",
        timestamp: "09:41:34.112",
        sensitive: false,
        category: "Diagnostics",
        message:
          "Browser diagnostic information was sent to a logging service.",
        fields: [
          {
            name: "browser",
            value: "Chrome",
          },
          {
            name: "event",
            value: "form_rendered",
          },
        ],
      },
    ],
  },

  {
    id: "health-api",
    name: "Health API",
    position: [1.45, -2.1, -1],
    color: "#2DD4BF",
    category: "API",
    domain: "api.health.example",
    sensitive: true,
    message:
      "Health information was observed being transmitted to an external API.",

    requests: [
      {
        id: "health-symptom",
        name: "save_symptom",
        method: "POST",
        endpoint: "/health/events",
        timestamp: "09:41:23.011",
        sensitive: true,
        category: "Health / Symptom",
        message:
          "Symptom information was included in this API request.",
        fields: [
          {
            name: "symptom",
            value: "missed_period",
          },
          {
            name: "account_id",
            value: "user_4812",
          },
        ],
      },
    ],
  },

  {
    id: "session-analytics",
    name: "Session Analytics",
    position: [-1.55, 2.05, -1],
    color: "#8B5CF6",
    category: "Analytics",
    domain: "session.example.com",
    sensitive: false,
    message:
      "Interaction information was transmitted to a session analytics service.",

    requests: [
      {
        id: "session-click",
        name: "button_click",
        method: "POST",
        endpoint: "/session",
        timestamp: "09:41:21.102",
        sensitive: false,
        category: "Behavior",
        message:
          "A page interaction was recorded.",
        fields: [
          {
            name: "element",
            value: "save_symptom",
          },
          {
            name: "session_id",
            value: "8f42a19c",
          },
        ],
      },
    ],
  },

  {
    id: "cdn",
    name: "Content CDN",
    position: [3.25, 0.1, -1.4],
    color: "#22D3EE",
    category: "First party",
    domain: "cdn.myhealth.local",
    sensitive: false,
    message:
      "Static assets were loaded from a first-party content service.",

    requests: [
      {
        id: "cdn-assets",
        name: "load_assets",
        method: "GET",
        endpoint: "/assets",
        timestamp: "09:41:00.419",
        sensitive: false,
        category: "Content",
        message:
          "Static application resources were requested.",
        fields: [
          {
            name: "asset",
            value: "app.bundle.js",
          },
        ],
      },
    ],
  },
];