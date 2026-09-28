import { useEffect, useRef } from "react";
import { formatTime } from "../data/session";

export default function SessionTimeline({ playback, events, nodes, activeEvent, onSeek, onReplay, onGoLive }) {
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeEvent?.id]);
  return <footer className="session-timeline" aria-label="Session playback">
    <div className="playback-controls">
      <button className="transport-button" onClick={playback.toggle} aria-label={playback.status === "paused" ? "Play session" : "Pause session"}>{playback.status === "paused" ? "▶" : "Ⅱ"}</button>
      <output className="playback-time">{formatTime(playback.cursor)} <span>/ {formatTime(playback.liveTime)}</span></output>
      <input className="time-slider" aria-label="Session time" aria-valuetext={formatTime(playback.cursor)} type="range" min="0" max={playback.liveTime} step="0.05" value={playback.cursor} onChange={(event) => onSeek(Number(event.target.value))} />
      <span className="playback-status">{playback.status === "live" ? "Live" : playback.status === "paused" ? "Paused" : "Replay"}</span>
      <button className="return-live" onClick={onGoLive} disabled={playback.status === "live"}>Go live</button>
    </div>
    <div className="session-events" ref={listRef}>
      {events.length === 0 && <p>No transfers recorded yet.</p>}
      {events.map((event) => <button key={event.id} className={`session-event ${event.scriptwell ? "scriptwell" : ""} ${activeEvent?.id === event.id ? "selected" : ""} ${event.at > playback.cursor ? "future" : ""}`} aria-pressed={activeEvent?.id === event.id} onClick={() => onReplay(event)}>
        <time>{formatTime(event.at)}</time><strong>{nodes.find((node) => node.id === event.nodeId)?.name}</strong><span>{event.title}</span>
      </button>)}
    </div>
  </footer>;
}
