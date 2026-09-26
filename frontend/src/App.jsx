import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import NetworkScene from "./components/NetworkScene";
import DetailsPanel from "./components/DetailsPanel";
import PrivacyPanel from "./components/PrivacyPanel";

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
  const [privacyOpen, setPrivacyOpen] = useState(() => new URLSearchParams(window.location.search).has("privacy"));
  const [mode, setMode] =
    useState("normal");

  const [selectedNode, setSelectedNode] =
    useState(null);

  const [selectedRequest, setSelectedRequest] =
    useState(null);

  const [viewServiceId, setViewServiceId] =
    useState(null);

  const [events, setEvents] =
    useState([]);

  const [activeNodeId, setActiveNodeId] =
    useState(null);

  const eventIndex = useRef(0);
  const eventNumber = useRef(0);

  const drillService = useMemo(
    () =>
      mockNodes.find(
        (node) =>
          node.id === viewServiceId
      ) || null,
    [viewServiceId]
  );

  useEffect(() => {
    function addNextEvent() {
      const template =
        mockEventSequence[
          eventIndex.current %
            mockEventSequence.length
        ];

      eventNumber.current += 1;

      const event =
        createEvent(
          template,
          eventNumber.current
        );

      setEvents((current) => {
        const updated = [
          ...current,
          event,
        ];

        return updated.slice(-8);
      });

      setActiveNodeId(
        template.nodeId
      );

      eventIndex.current += 1;

      window.setTimeout(() => {
        setActiveNodeId((current) =>
          current ===
          template.nodeId
            ? null
            : current
        );
      }, 2200);
    }

    addNextEvent();

    const interval =
      window.setInterval(
        addNextEvent,
        4200
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, []);

  function enterService(service) {
    setSelectedNode(service);
    setSelectedRequest(null);
    setViewServiceId(service.id);
  }

  function goBack() {
    setViewServiceId(null);
    setSelectedRequest(null);
    setSelectedNode(null);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== "Escape") {
        return;
      }

      if (viewServiceId) {
        goBack();
      } else {
        setSelectedNode(null);
        setSelectedRequest(null);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [viewServiceId]);

  function selectTimelineEvent(event) {
    const service =
      mockNodes.find(
        (node) =>
          node.id === event.nodeId
      );

    if (!service) return;

    const request =
      service.requests.find(
        (item) =>
          item.id ===
          event.requestId
      );

    setSelectedNode(service);
    setViewServiceId(service.id);

    if (request) {
      setSelectedRequest(request);
    }
  }

  const sensitiveCount =
    events.filter(
      (event) => event.sensitive
    ).length;

  const contactedServices =
    new Set(
      events.map(
        (event) =>
          event.nodeId
      )
    ).size;

  return (
    <div className={`app ${privacyOpen ? "privacy-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <h1>HealthTrace</h1>

          <span className="subtitle">
            Live data flow
          </span>
        </div>

        <div className="topbar-actions">
          <button className="privacy-button" aria-pressed={privacyOpen} onClick={() => setPrivacyOpen((open) => !open)}>
            {privacyOpen ? "Network inspector" : "Privacy opt-outs"}
          </button>
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

      <main className={`workspace ${privacyOpen ? "privacy-open" : ""}`}>
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

          <div className="breadcrumb">
            <button
              className={
                drillService
                  ? "breadcrumb-link"
                  : "breadcrumb-current"
              }
              onClick={
                drillService
                  ? goBack
                  : undefined
              }
            >
              MyHealth App
            </button>

            {drillService && (
              <>
                <span className="breadcrumb-arrow">
                  ›
                </span>

                <span className="breadcrumb-current">
                  {drillService.name}
                </span>
              </>
            )}
          </div>

          {!drillService && (
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
          )}

          {drillService && (
            <div className="drill-summary">
              <span className="session-label">
                Service requests
              </span>

              <strong>
                {
                  drillService
                    .requests
                    .length
                }
              </strong>

              <span>
                observed requests
              </span>
            </div>
          )}

          <NetworkScene
            nodes={mockNodes}
            selectedNode={
              selectedNode
            }
            selectedRequest={
              selectedRequest
            }
            drillService={
              drillService
            }
            activeNodeId={
              activeNodeId
            }
            onEnterService={
              enterService
            }
            onSelectRequest={
              setSelectedRequest
            }
            onClear={() => {
              if (
                !drillService
              ) {
                setSelectedNode(
                  null
                );
              }

              setSelectedRequest(
                null
              );
            }}
          />
        </section>

        {privacyOpen ? <PrivacyPanel /> : <DetailsPanel
          selectedNode={
            selectedNode
          }
          selectedRequest={
            selectedRequest
          }
          mode={mode}
        />}
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
          {events.map(
            (event) => (
              <button
                key={
                  event.runtimeId
                }
                className={`timeline-event ${
                  event.sensitive
                    ? "sensitive"
                    : ""
                }`}
                onClick={() =>
                  selectTimelineEvent(
                    event
                  )
                }
              >
                <span className="timeline-time">
                  {
                    event.timestamp
                  }
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
            )
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;