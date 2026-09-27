"""On-device semantic field classifier.

A small sentence encoder (all-MiniLM-L6-v2, ONNX) embeds a normalized description
of each JSON leaf and compares it with cached category prototype embeddings.
Nothing leaves the machine: there is no network access at inference time, and if
the model or its runtime is missing the classifier reports itself unavailable so
callers fall back to deterministic rules only.
"""
import os
import re
import threading
import unicodedata
from collections import OrderedDict
from pathlib import Path

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_DIR = Path(os.environ.get(
    "HEALTHTRACE_SEMANTIC_MODEL_DIR", Path(__file__).resolve().parent / "models" / "all-MiniLM-L6-v2"))
MODEL_FILES = ("model_qint8_arm64.onnx", "model.onnx")
MAX_TOKENS = 64

# Conservative acceptance: the best category must beat the runner-up category and
# either clear a similarity floor with some distance from benign/background phrases,
# or clear a lower floor while being far from every background phrase.
MIN_SIMILARITY = 0.50
MIN_BACKGROUND_MARGIN = 0.05
LOW_SIMILARITY = 0.42
LOW_BACKGROUND_MARGIN = 0.20
MIN_CATEGORY_MARGIN = 0.03

PROTOTYPES = {
    "reproductive_health": [
        "birth control method", "contraception", "contraceptive method", "pregnancy intention",
        "trying to conceive a baby", "pregnancy status", "menstrual cycle", "last menstrual period",
        "fertility information", "ovulation tracking", "intrauterine device iud", "due date of pregnancy",
    ],
    "sexual_health": [
        "sexual health", "sexually transmitted infection test result", "hiv status", "sexual activity",
        "number of sexual partners", "condom use", "sexual orientation",
    ],
    "mental_health": [
        "mental health", "depression screening score", "anxiety level", "mood rating",
        "patient health questionnaire phq 9 score", "therapy or counseling sessions", "psychiatric history",
        "suicidal thoughts", "stress level",
    ],
    "substance_use": [
        "alcohol consumption", "drinks per week", "smoking status", "cigarettes per day", "tobacco use",
        "recreational drug use", "cannabis use", "vaping nicotine",
    ],
    "insurance": [
        "health insurance", "insurance member id", "insurance policy number", "health plan provider",
        "insurance carrier", "insurance group number", "medicaid or medicare number",
    ],
    "financial": [
        "credit card number", "debit card number", "card verification code", "card security code",
        "card expiration date", "cardholder name on card", "bank account number", "bank routing number",
        "international bank account number", "swift bic bank code", "payment card token",
    ],
    "biometrics": [
        "body weight", "height", "body mass index bmi", "blood pressure reading", "heart rate",
        "blood glucose level", "body temperature", "oxygen saturation", "vital signs", "sleep hours",
    ],
    "medications": [
        "current medications", "prescription drug list", "rx list", "medication name", "drug dosage",
        "pills taken daily", "medication allergies", "pharmacy refill of a prescription",
    ],
    "diagnoses": [
        "medical diagnosis", "health condition", "chronic disease", "medical history",
        "diagnosis code icd 10", "known illnesses", "health concern",
    ],
    "symptoms": [
        "symptoms", "nausea", "headache", "fatigue", "pain level", "fever", "dizziness",
        "how long symptoms have lasted", "symptom severity",
    ],
    "location": [
        "geographic location", "latitude", "longitude", "gps coordinates", "home address",
        "street address", "zip code", "postal code", "city and state",
    ],
    "identity": [
        "full name", "first name", "last name", "email address", "phone number", "mobile number",
        "date of birth", "social security number", "patient name", "user account id",
    ],
    "device_identifiers": [
        "device id", "advertising identifier", "ip address", "mac address", "browser fingerprint",
        "user agent string", "session id", "cookie id", "screen resolution",
    ],
    "appointments": [
        "appointment date", "doctor name", "healthcare provider", "clinic visit", "physician",
        "next appointment time", "pharmacy name", "preferred pharmacy",
    ],
}

# Ordinary analytics/envelope fields. A field that is closer to one of these than
# to any sensitive prototype is left unclassified.
BACKGROUND = [
    "event id", "event name", "schema version", "timestamp", "created at time", "occurred at time",
    "request method", "page path", "page url", "origin url", "referrer", "application name",
    "source application", "button trigger", "click action", "price in dollars", "total cost",
    "currency", "quantity count", "product sku", "offer id", "status", "version number",
    "feature flag enabled", "analytics enabled", "language setting", "theme", "sort order",
    "page number", "utm campaign source", "error message", "response code",
    "emailing preference", "email marketing opt in", "newsletter subscription", "logged in flag",
]

# Common shorthand in field names that the encoder's vocabulary does not resolve.
ABBREVIATIONS = {
    "bc": "birth control", "rx": "prescription", "meds": "medications", "med": "medication",
    "dx": "diagnosis", "hx": "history", "sx": "symptoms", "dob": "date of birth",
    "geo": "geographic", "lat": "latitude", "lng": "longitude", "lon": "longitude",
    "bp": "blood pressure", "hr": "heart rate", "addr": "address", "tel": "telephone",
    "appt": "appointment", "dr": "doctor", "ssn": "social security number", "lmp": "last menstrual period",
    "ttc": "trying to conceive", "phq": "phq depression questionnaire", "gad": "gad anxiety questionnaire",
    "sti": "sexually transmitted infection", "std": "sexually transmitted disease", "ip": "ip address",
    "ua": "user agent", "etoh": "alcohol", "num": "number", "qty": "quantity",
    "cvc": "card verification code", "cvv": "card security code", "iban": "international bank account number",
}

_SAFE_VALUE = re.compile(r"[A-Za-z][A-Za-z0-9 .,'/+-]{0,47}")


def key_words(path):
    """Words from a dotted/bracketed JSON path in any snake, camel, or kebab casing."""
    text = re.sub(r"\[\d+\]", " ", str(path))
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    text = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", text)
    text = re.sub(r"([A-Za-z])(\d)|(\d)([A-Za-z])", lambda m: " ".join(g for g in m.groups() if g), text)
    words = re.findall(r"[a-z]+|\d+", text.lower())
    return [ABBREVIATIONS.get(word, word) for word in words]


def value_text(value):
    """Short human-readable string values help. Identifiers, prose, and type words for
    numbers/booleans dilute short keys (measured: lower recall), so they are omitted."""
    if not isinstance(value, str):
        return ""
    text = str(value).replace("_", " ").strip()
    if not _SAFE_VALUE.fullmatch(text) or "@" in text or "://" in text:
        return ""
    if any(len(word) >= 6 and re.search(r"\d", word) and re.search(r"[a-z]", word, re.I) for word in text.split()):
        return ""
    if text.lower() in {"none", "null", "n/a", "na", "unknown", "true", "false"}:
        return ""
    return text.lower()


def semantic_text(path, value):
    words = " ".join(key_words(path))
    if "[" in str(path):
        words += " list"
    detail = value_text(value)
    return f"{words} {detail}".strip()


class WordPieceTokenizer:
    """BERT uncased tokenization (basic split + greedy WordPiece), matching the model's vocab."""

    def __init__(self, vocab_path):
        self.vocab = {line.rstrip("\n"): index
                      for index, line in enumerate(Path(vocab_path).read_text(encoding="utf-8").splitlines())}
        self.cls, self.sep, self.unk = self.vocab["[CLS]"], self.vocab["[SEP]"], self.vocab["[UNK]"]

    @staticmethod
    def _basic(text):
        text = unicodedata.normalize("NFD", text.lower())
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        pieces = []
        for chunk in text.split():
            current = ""
            for ch in chunk:
                if unicodedata.category(ch).startswith("P") or (ch.isascii() and not ch.isalnum()):
                    if current:
                        pieces.append(current)
                    pieces.append(ch)
                    current = ""
                else:
                    current += ch
            if current:
                pieces.append(current)
        return pieces

    def _wordpiece(self, word):
        if len(word) > 100:
            return [self.unk]
        ids, start = [], 0
        while start < len(word):
            end, found = len(word), None
            while start < end:
                piece = word[start:end] if start == 0 else "##" + word[start:end]
                if piece in self.vocab:
                    found = self.vocab[piece]
                    break
                end -= 1
            if found is None:
                return [self.unk]
            ids.append(found)
            start = end
        return ids

    def encode(self, text, max_tokens=MAX_TOKENS):
        ids = [token for word in self._basic(text) for token in self._wordpiece(word)]
        return [self.cls] + ids[: max_tokens - 2] + [self.sep]


class SemanticClassifier:
    def __init__(self, model_dir=MODEL_DIR, cache_size=4096):
        import numpy as np
        import onnxruntime as ort

        self.np = np
        model_dir = Path(model_dir)
        model_path = next((model_dir / name for name in MODEL_FILES if (model_dir / name).exists()), None)
        if model_path is None:
            raise FileNotFoundError(f"No ONNX model in {model_dir}")
        self.model_path = model_path
        self.tokenizer = WordPieceTokenizer(model_dir / "vocab.txt")
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(os.environ.get("HEALTHTRACE_SEMANTIC_THREADS", "2"))
        options.log_severity_level = 3
        self.session = ort.InferenceSession(str(model_path), options, providers=["CPUExecutionProvider"])
        self.input_names = {i.name for i in self.session.get_inputs()}
        self._cache = OrderedDict()
        self._cache_size = cache_size
        self._lock = threading.Lock()

        labels, phrases = [], []
        for category, examples in PROTOTYPES.items():
            labels += [category] * len(examples)
            phrases += examples
        self.prototype_labels = labels
        self.prototype_phrases = phrases
        self.prototypes = self._encode(phrases)
        self.background = self._encode(BACKGROUND)
        self.categories = list(PROTOTYPES)
        self._category_index = {c: np.array([i for i, l in enumerate(labels) if l == c]) for c in self.categories}

    def _encode(self, texts):
        np = self.np
        encoded = [self.tokenizer.encode(t) for t in texts]
        width = max(len(ids) for ids in encoded)
        input_ids = np.zeros((len(encoded), width), dtype=np.int64)
        mask = np.zeros_like(input_ids)
        for row, ids in enumerate(encoded):
            input_ids[row, :len(ids)] = ids
            mask[row, :len(ids)] = 1
        feeds = {"input_ids": input_ids, "attention_mask": mask}
        if "token_type_ids" in self.input_names:
            feeds["token_type_ids"] = np.zeros_like(input_ids)
        hidden = self.session.run(None, feeds)[0]
        weights = mask[..., None].astype(np.float32)
        pooled = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1e-9, None)
        return pooled / np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9, None)

    def embed(self, texts):
        """Normalized embeddings with an in-memory LRU cache (never persisted)."""
        np = self.np
        with self._lock:
            missing = list(dict.fromkeys(t for t in texts if t not in self._cache))
            if missing:
                for text, vector in zip(missing, self._encode(missing)):
                    self._cache[text] = vector
                while len(self._cache) > self._cache_size:
                    self._cache.popitem(last=False)
            for text in texts:
                self._cache.move_to_end(text)
            return np.stack([self._cache[t] for t in texts])

    def score(self, texts):
        """Per text: (category scores dict, best background score, best prototype phrase per category)."""
        vectors = self.embed(texts)
        sims = vectors @ self.prototypes.T
        background = (vectors @ self.background.T).max(axis=1)
        results = []
        for row in range(len(texts)):
            scores, nearest = {}, {}
            for category, index in self._category_index.items():
                best = int(index[sims[row, index].argmax()])
                scores[category] = float(sims[row, best])
                nearest[category] = self.prototype_phrases[best]
            results.append((scores, float(background[row]), nearest))
        return results

    def classify_many(self, items):
        """items: [(path, value)] -> [None | {category, score, margin, prototype, text}]."""
        if not items:
            return []
        texts = [semantic_text(path, value) for path, value in items]
        # A key that is itself a benign envelope field stays benign whatever its value says.
        keys = [semantic_text(path, None) for path, _ in items]
        key_background = [bg for _, bg, _ in self.score(keys)]
        output = []
        for text, key_bg, (scores, background, nearest) in zip(texts, key_background, self.score(texts)):
            background = max(background, key_bg)
            ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
            (category, best), (_, second) = ranked[0], ranked[1]
            accepted = best - second >= MIN_CATEGORY_MARGIN and (
                (best >= MIN_SIMILARITY and best - background >= MIN_BACKGROUND_MARGIN)
                or (best >= LOW_SIMILARITY and best - background >= LOW_BACKGROUND_MARGIN))
            output.append({"category": category, "score": round(best, 3), "margin": round(best - second, 3),
                           "background": round(background, 3), "prototype": nearest[category],
                           "text": text} if accepted else None)
        return output


_instance = None
_state = "unloaded"
_load_lock = threading.Lock()


def get_classifier():
    """Lazily load once per process; returns None when disabled or unavailable."""
    global _instance, _state
    if _state == "unloaded":
        with _load_lock:
            if _state == "unloaded":
                if os.environ.get("HEALTHTRACE_SEMANTIC", "1") == "0":
                    _state = "disabled"
                else:
                    try:
                        _instance = SemanticClassifier()
                        _state = "ready"
                    except Exception as error:  # collectors must keep running on rules alone
                        print(f"Semantic classifier unavailable; using rules only ({error})", flush=True)
                        _state = "unavailable"
    return _instance
