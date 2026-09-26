import { useState } from "react";
import NetworkScene from "./components/NetworkScene";
import DetailsPanel from "./components/DetailsPanel";
import "./index.css";

const mockEvents = [
  {
    id: 1,
    time: "2:01:14 AM",
    title: "Symptom information",
    destination: "Analytics Provider",
  },
  {
    id: 2,
    time: "2:01:18 AM",
    title: "Session identifier",
    destination: "Analytics Provider",
  },
  {
    id: 3,
    time: "2:01:31 AM",
    title: "Medication information",
    destination: "Metrics API",
  },
];

function App() {
  const [selectedNode, setSelectedNode] = useState(null);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>HealthTrace</h1>
          <span className="subtitle">Live data flow</span>
        </div>

        <div className="status">
          <span className="status-dot" />
          Monitoring
        </div>
      </header>

      <main className="workspace">
        <section className="visualization">
          <div className="legend">
            <span><i className="cyan" /> First party</span>
            <span><i className="purple" /> Analytics</span>
            <span><i className="pink" /> Advertising</span>
            <span><i className="green" /> API</span>
            <span><i className="yellow" /> Unknown</span>
          </div>

          <NetworkScene onSelectNode={setSelectedNode} />
        </section>

        <DetailsPanel selectedNode={selectedNode} />
      </main>

      <footer className="timeline">
        {mockEvents.map((event) => (
          <div className="timeline-event" key={event.id}>
            <span className="timeline-time">{event.time}</span>

            <div>
              <strong>{event.title}</strong>
              <span>{event.destination}</span>
            </div>
          </div>
        ))}
      </footer>
    </div>
  );
}

export default App;