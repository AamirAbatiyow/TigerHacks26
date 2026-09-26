import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import NetworkScene from "./components/NetworkScene";
import DetailsPanel from "./components/DetailsPanel";

import { mockNodes } from "./data/mockNodes";
import { mockEventSequence } from "./data/mockEvents";

import "./index.css";

function createEvent(template, number) {
  return {
    ...template,
    runtimeId: `${template.id}-${number}`,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function App() {
  const [selectedNode, setSelectedNode] =
    useState(null);

  const [mode, setMode] =
    useState("normal");

  const [events, setEvents] =
    useState([]);

  const [activeNodeId, setActiveNodeId] =
    useState(null);

  const eventIndex = useRef(0);
  const eventNumber = useRef(0);

  useEffect(() => {
    const addNextEvent = () => {
      const template =
        mockEventSequence[
          eventIndex.current %
            mockEventSequence.length
        ];

      eventNumber.current += 1;

      const event = createEvent(
        template,
        eventNumber.current
      );

      setEvents((current) => {
        const updated = [...current, event];

        return updated.slice(-8);
      });

      setActiveNodeId(template.nodeId);

      eventIndex.current += 1;

      window.setTimeout(() => {
        setActiveNodeId((current) =>
          current === template.nodeId
            ? null
            : current
        );
      }, 2200);
    };

    addNextEvent();

    const interval = window.setInterval(
      addNextEvent,
      4200
    );

    return () =>
      window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedNode(null);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, []);

  const sensitiveCount = useMemo(
    () =>
      events.filter(
        (event) => event.sensitive
      ).length,
    [events]
  );

  const contactedServices = useMemo(
    () =>
      new Set(
        events.map(
          (event) => event.nodeId
        )
      ).size,
    [events]
  );

  function selectFromTimeline(event) {
    const node = mockNodes.find(
      (item) =>
        item.id === event.nodeId
    );

    if (node) {
      setSelectedNode(node);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>HealthTrace</h1>
          <span className="subtitle">
            Live data flow
          </span>
        </div>

        <div className="topbar-actions">
          <div className="mode-toggle">
            <button
              className={
                mode === "normal"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMode("normal")
              }
            >
              Normal
            </button>

            <button
              className={
                mode === "technical"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMode("technical")
              }
            >
              Technical
            </button>
          </div>

          <div className="status">
            <span className="status-dot" />
            Monitoring
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="visualization">
          <div className="legend">
            <span>
              <i className="cyan" />
              First party
            </span>

            <span>
              <i className="purple" />
              Analytics
            </span>

            <span>
              <i className="pink" />
              Advertising
            </span>

            <span>
              <i className="green" />
              API
            </span>

            <span>
              <i className="yellow" />
              Unknown
            </span>
          </div>

          <div className="session-summary">
            <span className="session-label">
              Current session
            </span>

            <div className="summary-stat">
              <strong>
                {contactedServices}
              </strong>
              <span>
                services contacted
              </span>
            </div>

            <div className="summary-stat">
              <strong>
                {sensitiveCount}
              </strong>
              <span>
                sensitive events
              </span>
            </div>

            <div className="summary-stat">
              <strong>
                {events.length}
              </strong>
              <span>
                events observed
              </span>
            </div>
          </div>

          <NetworkScene
            nodes={mockNodes}
            selectedNode={selectedNode}
            activeNodeId={activeNodeId}
            onSelectNode={setSelectedNode}
          />
        </section>

        <DetailsPanel
          selectedNode={selectedNode}
          mode={mode}
        />
      </main>

      <footer className="timeline">
        <div className="timeline-heading">
          <span className="panel-label">
            Session activity
          </span>

          <span className="timeline-live">
            <i />
            Live
          </span>
        </div>

        <div className="timeline-events">
          {events.length === 0 ? (
            <div className="timeline-empty">
              Waiting for network activity…
            </div>
          ) : (
            events.map((event) => (
              <button
                key={event.runtimeId}
                className={`timeline-event ${
                  event.sensitive
                    ? "sensitive"
                    : ""
                }`}
                onClick={() =>
                  selectFromTimeline(event)
                }
              >
                <span className="timeline-time">
                  {event.timestamp}
                </span>

                <span className="timeline-event-body">
                  <strong>
                    {event.title}
                  </strong>

                  <small>
                    {event.detail}
                  </small>
                </span>

                {event.sensitive && (
                  <span className="sensitive-dot" />
                )}
              </button>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;