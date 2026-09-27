import { useEffect, useMemo, useState } from "react";
import NetworkScene from "./components/NetworkScene";
import SimpleFlow from "./components/SimpleFlow";
import SessionTimeline from "./components/SessionTimeline";
import DetailsPanel from "./components/DetailsPanel";
import usePlayback from "./hooks/usePlayback";
import { normalizeSession, eventAtTime, flightProgress, FLIGHT_SECONDS } from "./data/session";
import { mockNodes } from "./data/mockNodes";
import { mockEventSequence } from "./data/mockEvents";
import "./index.css";
import "./views.css";

const demoInput = { source: { name: "MyHealth App" }, destinations: mockNodes };

function SessionExperience({ session, isDemo, view, onViewChange }) {
  const [inspection, setInspection] = useState(null);
  const lastRecordedTime = session.events.at(-1)?.at || 0;
  const playback = usePlayback(isDemo ? 24 : lastRecordedTime + FLIGHT_SECONDS);
  const demoCount = Math.floor(playback.liveTime / 8) + 1;
  const events = useMemo(() => isDemo ? Array.from({ length: demoCount }, (_, index) => {
    const template = mockEventSequence[index % mockEventSequence.length];
    return { ...template, id: `${template.id}-${index}`, at: index * 8 };
  }) : session.events, [isDemo, demoCount, session.events]);
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

  return <div className={`app dual-view ${view}`} data-playback-time={playback.cursor.toFixed(2)} data-playback-status={playback.status} data-transfer-progress={progress ?? ""}>
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src="./healthtrace-mark.svg" alt="" /><h1>HealthTrace</h1><span className="subtitle">See where your data travels</span></div>
      <div className="topbar-actions">
        <div className="mode-toggle" role="group" aria-label="Visualization view">
          <button className={view === "simple" ? "active" : ""} aria-pressed={view === "simple"} onClick={() => onViewChange("simple")}>Simple view</button>
          <button className={view === "technical" ? "active" : ""} aria-pressed={view === "technical"} onClick={() => onViewChange("technical")}>Technical view</button>
        </div>
        <span className="session-origin">{isDemo ? "Demo session" : "Captured session"}</span>
      </div>
    </header>
    <main className="workspace">
      {view === "simple" ? <SimpleFlow source={session.source} nodes={session.nodes} selectedNodeId={selectedNode?.id} activeEvent={currentEvent} progress={progress} onSelect={selectDestination} /> :
        <section className="visualization" aria-label="Technical 3D network">
          <div className="technical-hint">Drag to rotate / Scroll to zoom</div>
          <div className="session-summary"><span className="session-label">At this point in time</span><div className="summary-stat"><strong>{new Set(observedEvents.map((event) => event.nodeId)).size}</strong><span>destinations contacted</span></div><div className="summary-stat"><strong>{observedEvents.length}</strong><span>transfers recorded</span></div></div>
          <NetworkScene sourceName={session.source.name} nodes={session.nodes} selectedRequest={selectedRequest} drillService={null} activeNodeId={transfer?.nodeId} transfer={transfer} onEnterService={selectDestination} onSelectRequest={(request) => setInspection({ nodeId: selectedNode?.id, requestId: request.id })} onClear={() => setInspection(null)} />
        </section>}
      <DetailsPanel selectedNode={selectedNode} selectedRequest={selectedRequest} mode={view} onSelectRequest={(request) => setInspection({ nodeId: selectedNode.id, requestId: request?.id || null })} />
    </main>
    <SessionTimeline playback={playback} events={events} nodes={session.nodes} activeEvent={currentEvent} onSeek={seek} onReplay={replay} onGoLive={goLive} />
  </div>;
}

export default function App({ sessionData }) {
  const [view, setView] = useState("simple");
  const [snapshot, setSnapshot] = useState({ data: null, revision: 0 });
  useEffect(() => {
    function receive(event) {
      if (!event.detail || !Array.isArray(event.detail.destinations)) return;
      setSnapshot((previous) => ({ data: event.detail, revision: previous.revision + 1 }));
    }
    window.addEventListener("healthtrace:session", receive);
    return () => window.removeEventListener("healthtrace:session", receive);
  }, []);
  const input = snapshot.data || sessionData;
  const session = useMemo(() => normalizeSession(input || demoInput), [input]);
  return <SessionExperience key={snapshot.revision} session={session} isDemo={!input} view={view} onViewChange={setView} />;
}
