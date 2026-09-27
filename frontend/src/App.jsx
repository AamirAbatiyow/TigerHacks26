import { useEffect, useMemo, useState } from "react";
import NetworkScene from "./components/NetworkScene";
import SimpleFlow from "./components/SimpleFlow";
import SessionTimeline from "./components/SessionTimeline";
import DetailsPanel from "./components/DetailsPanel";
import PrivacyPanel from "./components/PrivacyPanel";
import usePlayback from "./hooks/usePlayback";
import { normalizeSession, eventAtTime, flightProgress, FLIGHT_SECONDS } from "./data/session";
import { LOCAL_API, toSession } from "./data/liveEvents";
import "./index.css";
import "./views.css";

function SessionExperience({ session, observations, view, onViewChange, connection, duration }) {
  const [inspection, setInspection] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(() => new URLSearchParams(window.location.search).has("privacy"));
  const playback = usePlayback(duration);
  const events = session.events;
  const currentEvent = eventAtTime(events, playback.cursor);
  const progress = flightProgress(currentEvent, playback.cursor);
  const transfer = progress === null ? null : { nodeId: currentEvent.nodeId, progress };
  const nodeId = inspection?.nodeId ?? currentEvent?.nodeId;
  const selectedNode = session.nodes.find((node) => node.id === nodeId) || null;
  const requestId = inspection ? inspection.requestId : currentEvent?.requestId;
  const selectedRequest = selectedNode?.requests.find((request) => request.id === requestId) || null;
  const observedEvents = events.filter((event) => event.at <= playback.cursor);

  function selectDestination(node) { setInspection({ nodeId: node.id, requestId: null }); }
  function seek(time) { setInspection(null); playback.seek(time); }
  function replay(event) { setInspection(null); playback.seek(event.at, true); }
  function goLive() { setInspection(null); playback.goLive(); }

  return <div className={`app dual-view ${view} ${privacyOpen ? "privacy-mode" : ""}`} data-playback-time={playback.cursor.toFixed(2)} data-playback-status={playback.status} data-transfer-progress={progress ?? ""}>
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src="./healthtrace-mark.svg" alt="" /><h1>PatientPrivy</h1><span className="subtitle">See where your data travels</span></div>
      <div className="topbar-actions">
        <button className="privacy-button" aria-pressed={privacyOpen} onClick={() => setPrivacyOpen((open) => !open)}>{privacyOpen ? "Network inspector" : "Privacy actions"}</button>
        <div className="mode-toggle" role="group" aria-label="Visualization view">
          <button className={view === "simple" ? "active" : ""} aria-pressed={view === "simple"} onClick={() => onViewChange("simple")}>Simple view</button>
          <button className={view === "technical" ? "active" : ""} aria-pressed={view === "technical"} onClick={() => onViewChange("technical")}>Technical view</button>
        </div>
        <span className="session-origin">{connection}</span>
      </div>
    </header>
    <main className={`workspace ${privacyOpen ? "privacy-open" : ""}`}>
      {view === "simple" ? <SimpleFlow source={session.source} nodes={session.nodes} selectedNodeId={selectedNode?.id} activeEvent={currentEvent} progress={progress} onSelect={selectDestination} /> :
        <section className="visualization" aria-label="Technical 3D network">
          <div className="technical-hint">Drag to rotate / Scroll to zoom</div>
          <div className="session-summary"><span className="session-label">At this point in time</span><div className="summary-stat"><strong>{new Set(observedEvents.map((event) => event.nodeId)).size}</strong><span>destinations contacted</span></div><div className="summary-stat"><strong>{observedEvents.length}</strong><span>transfers recorded</span></div></div>
          <NetworkScene sourceName={session.source.name} nodes={session.nodes} activeNodeId={transfer?.nodeId} transfer={transfer} onEnterService={selectDestination} onClear={() => setInspection(null)} />
        </section>}
      {privacyOpen ? <PrivacyPanel observations={observations} /> : <DetailsPanel selectedNode={selectedNode} selectedRequest={selectedRequest} mode={view} onSelectRequest={(request) => setInspection({ nodeId: selectedNode.id, requestId: request?.id || null })} />}
    </main>
    <SessionTimeline playback={playback} events={events} nodes={session.nodes} activeEvent={currentEvent} onSeek={seek} onReplay={replay} onGoLive={goLive} />
  </div>;
}

export default function App() {
  const [view, setView] = useState("simple");
  const [snapshot, setSnapshot] = useState(null);
  const [observations, setObservations] = useState([]);
  const [connection, setConnection] = useState("Connecting");

  useEffect(() => {
    function receive(event) {
      if (!event.detail || !Array.isArray(event.detail.destinations)) return;
      setSnapshot((previous) => ({ data: event.detail, revision: (previous?.revision || 0) + 1 }));
    }
    window.addEventListener("healthtrace:session", receive);
    return () => window.removeEventListener("healthtrace:session", receive);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const response = await fetch(`${LOCAL_API}/events`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Local API unavailable");
        const data = await response.json();
        if (active) {
          setObservations(Array.isArray(data.events) ? data.events : []);
          setConnection(data.events?.length ? "Monitoring" : "Waiting for local events");
        }
      } catch (error) {
        if (error.name !== "AbortError" && active) setConnection("Local API disconnected");
      }
      if (active) timer = window.setTimeout(refresh, 2000);
    }
    refresh();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, []);

  const input = snapshot?.data || toSession(observations, { simple: view === "simple" });
  const session = useMemo(() => normalizeSession(input), [input]);
  const duration = (session.events.at(-1)?.at || 0) + FLIGHT_SECONDS;
  return <SessionExperience key={snapshot?.revision || "live"} session={session} observations={observations} view={view} onViewChange={setView} connection={snapshot ? "Loaded session" : connection} duration={duration} />;
}
