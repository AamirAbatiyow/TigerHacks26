import {
  useEffect,
  useMemo,
  useState,
} from "react";

import NetworkScene from "./components/NetworkScene";
import DetailsPanel from "./components/DetailsPanel";
import PrivacyPanel from "./components/PrivacyPanel";

import { buildView, LOCAL_API } from "./data/liveEvents";

import "./index.css";

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

  const [observations, setObservations] = useState([]);
  const [connection, setConnection] = useState('Connecting');
  const { nodes, events } = useMemo(() => buildView(observations), [observations]);
  const activeNodeId = events.at(-1)?.nodeId || null;
  const drillService = nodes.find((node) => node.id === viewServiceId) || null;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const response = await fetch(`${LOCAL_API}/events`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Local API unavailable');
        const data = await response.json();
        if (active) {
          setObservations(data.events);
          setConnection(data.events.length ? 'Monitoring' : 'Waiting for local events');
        }
      } catch {
        if (active) setConnection('Local API disconnected');
      }
      if (active) timer = window.setTimeout(refresh, 2000);
    }
    refresh();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
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
      nodes.find(
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
            {connection}
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
              ScriptWell
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
                Recent local observations
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
            nodes={nodes}
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
            nodes.find((node) => node.id === selectedNode?.id) || selectedNode
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
                    new Date(event.timestamp).toLocaleTimeString()
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