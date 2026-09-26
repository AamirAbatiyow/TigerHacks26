export default function ServiceSymbol({ category = "App", className = "" }) {
  const shapes = {
    App: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    Analytics: <><path d="M5 19v-5m7 5V9m7 10V4" /></>,
    Advertising: <><path d="m5 9 12-5v16L5 15Z" /><path d="M5 10H2v4h3m3 2 2 5" /></>,
    API: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16" /></>,
    "First party": <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18m-12 5h6" /></>,
    Unknown: <><path d="M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6" /><path d="M12 18v.1" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[category] || shapes.API}</svg>;
}
