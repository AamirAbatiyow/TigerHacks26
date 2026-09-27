import { useEffect, useState } from "react";
import { advancePlayback } from "../data/session";

export default function usePlayback(initialTime) {
  const [playback, setPlayback] = useState(() => ({ liveTime: initialTime, cursor: initialTime, status: "live" }));
  useEffect(() => {
    let previous = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = (now - previous) / 1000;
      previous = now;
      setPlayback((state) => advancePlayback(state, delta));
    }, 50);
    return () => window.clearInterval(interval);
  }, []);
  function seek(time, play = false) {
    setPlayback((state) => ({ ...state, cursor: Math.max(0, Math.min(time, state.liveTime)), status: play ? "playing" : "paused" }));
  }
  function toggle() {
    setPlayback((state) => ({ ...state, status: state.status === "paused" ? "playing" : "paused" }));
  }
  function goLive() {
    setPlayback((state) => ({ ...state, cursor: state.liveTime, status: "live" }));
  }
  return { ...playback, seek, toggle, goLive };
}
