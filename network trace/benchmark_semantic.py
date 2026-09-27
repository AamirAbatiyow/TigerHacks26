"""Local latency/memory benchmark for the hybrid classifier. Uses synthetic fixtures only."""
import json
import resource
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def rss_mb():
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / 1e6 if sys.platform == "darwin" else peak / 1e3


def main():
    base = rss_mb()
    start = time.perf_counter()
    import semantic_classifier
    classifier = semantic_classifier.SemanticClassifier()
    load_ms = (time.perf_counter() - start) * 1000
    loaded = rss_mb()

    from classifier import collect_findings
    import classifier as hybrid
    hybrid.get_classifier = lambda: classifier

    fields = [(f"probe.field{i}Name", f"value {i}") for i in range(200)]
    single = []
    for item in fields:
        t = time.perf_counter()
        classifier.classify_many([item])
        single.append((time.perf_counter() - t) * 1000)

    payload = json.loads((ROOT / "tests" / "demo-payload.json").read_text())
    leaves = []
    hybrid._walk(payload, "", leaves)
    classifier._cache.clear()
    t = time.perf_counter()
    collect_findings(payload)
    cold_ms = (time.perf_counter() - t) * 1000
    warm = []
    for _ in range(50):
        t = time.perf_counter()
        collect_findings(payload)
        warm.append((time.perf_counter() - t) * 1000)
    hybrid.get_classifier = lambda: None
    t = time.perf_counter()
    for _ in range(50):
        collect_findings(payload)
    rules_ms = (time.perf_counter() - t) * 1000 / 50

    size_mb = classifier.model_path.stat().st_size / 1e6
    print(f"model file           {classifier.model_path.name} ({size_mb:.1f} MB)")
    print(f"model load           {load_ms:.0f} ms (includes {len(classifier.prototype_phrases)} prototype + "
          f"{len(semantic_classifier.BACKGROUND)} background embeddings)")
    print(f"per field (uncached) median {statistics.median(single):.2f} ms, p95 "
          f"{sorted(single)[int(len(single) * 0.95)]:.2f} ms")
    print(f"demo payload         {len(leaves)} leaves: cold {cold_ms:.1f} ms, warm median "
          f"{statistics.median(warm):.2f} ms, rules only {rules_ms:.2f} ms")
    print(f"peak RSS             {base:.0f} MB before, {loaded:.0f} MB after load (+{loaded - base:.0f} MB)")


if __name__ == "__main__":
    main()
