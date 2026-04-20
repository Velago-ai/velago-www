import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, Send, Info, User2, CheckCircle2, Pencil } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { getAccessToken, clearTokens } from "@/lib/auth";
import { fetchMe, signOut } from "@/lib/api-auth";
import { userStore, useProfile } from "@/lib/user-store";
import velagoLogo from "@assets/velago_logo_nobg.svg";

// ── Constants ────────────────────────────────────────────────────────────────

const WS_URL = "wss://ws.velago.ai/ws";
const CAPTURE_RATE = 48000;
const PLAYBACK_RATE = 24000;
const INPUT_GAIN = 1.0;
const ALLOW_BARGE_IN = false;
const MIN_PLAYBACK_SAMPLES = 4800;
const FLUSH_DELAY_MS = 120;
const LOGO_FILTER =
  "brightness(0) saturate(100%) invert(28%) sepia(98%) saturate(3500%) hue-rotate(228deg) brightness(98%) contrast(101%)";

// ── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface TextEntry {
  id: string;
  type: "text";
  role: "user" | "agent";
  content: string;
}

interface ReviewEntry {
  id: string;
  type: "review";
  title: string;
  rows: { label: string; value: string; empty: boolean }[];
}

interface QuoteEntry {
  id: string;
  type: "quote";
  provider: string;
  price: string;
  currency: string;
  route: string;
  isCheapest: boolean;
  name?: string;
  flightInfo?: string;
  fareName?: string;
  fareIncludes?: string;
}

interface ConfirmedEntry {
  id: string;
  type: "confirmed";
  orderId: string;
  price: string;
  currency: string;
}

type TranscriptEntry = TextEntry | ReviewEntry | QuoteEntry | ConfirmedEntry;

// ── Helpers ──────────────────────────────────────────────────────────────────

const SENDER_FIELDS: [string, string][] = [
  ["sender_name", "Full name"],
  ["sender_phone", "Phone"],
  ["sender_email", "Email"],
  ["sender_address", "Address"],
  ["sender_city", "City"],
  ["sender_postcode", "Postal code"],
];
const RECEIVER_FIELDS: [string, string][] = [
  ["receiver_name", "Full name"],
  ["receiver_phone", "Phone"],
  ["receiver_email", "Email"],
  ["receiver_address", "Address"],
  ["receiver_city", "City"],
  ["receiver_postcode", "Postal code"],
];
const PASSENGER_FIELDS: [string, string][] = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
];

function extractFlightCodes(value: string): string[] {
  return (
    value
      .toUpperCase()
      .match(/[A-Z0-9]{2,3}\d{1,5}-[A-Z]{3}-[A-Z]{3}/g)
      ?.map((v) => v.trim()) ?? []
  );
}

function collectUniqueFlightCodes(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (!v) continue;
    for (const code of extractFlightCodes(v)) {
      if (!seen.has(code)) { seen.add(code); result.push(code); }
    }
  }
  return result;
}

function resolveOfferRoute(
  offer: Record<string, unknown>,
  ext: Record<string, unknown>
): [string, string] {
  const summaryText = String(offer.name ?? offer.summary ?? offer.description ?? "");
  const m = summaryText.match(/\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/);
  if (m) return [m[1], m[2]];
  const q = String((offer.details as Record<string, unknown> | undefined)?.query ?? "").toUpperCase();
  const m2 = q.match(/\b([A-Z]{3})\s+TO\s+([A-Z]{3})\b/);
  if (m2) return [m2[1], m2[2]];
  const from = String(ext.origin_country ?? ext.origin ?? offer.origin_country ?? offer.origin ?? "?").toUpperCase();
  const to = String(ext.destination_country ?? ext.destination ?? offer.destination_country ?? offer.destination ?? "?").toUpperCase();
  return [from, to];
}


// ── Component ────────────────────────────────────────────────────────────────

export default function Voice() {
  const [, setLocation] = useLocation();

  // Profile from session store
  const profile = useProfile();

  // UI state
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Imperative refs — Web Audio + WebSocket (no re-render needed)
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCursorRef = useRef(0);
  const pendingInt16Ref = useRef<Int16Array[]>([]);
  const pendingSamplesRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentSpeakingUntilRef = useRef(0);
  const isRecordingRef = useRef(false);
  const idCounterRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  function nextId() { return String(++idCounterRef.current); }

  // ── Auth load (best-effort) ──────────────────────────────────────────────
  useEffect(() => {
    const token = getAccessToken();
    if (token) fetchMe(token).then((p) => userStore.set(p)).catch(() => null);
    return () => { wsRef.current?.close(1000); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, isTyping]);

  // ── Playback ─────────────────────────────────────────────────────────────

  async function ensurePlayback() {
    if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: PLAYBACK_RATE });
    if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();
    if (playbackCursorRef.current < playCtxRef.current.currentTime)
      playbackCursorRef.current = playCtxRef.current.currentTime;
  }
  async function primePlayback() {
    await ensurePlayback();
    if (!playCtxRef.current) return;
    const b = playCtxRef.current.createBuffer(1, 1, playCtxRef.current.sampleRate);
    const s = playCtxRef.current.createBufferSource();
    s.buffer = b; s.connect(playCtxRef.current.destination); s.start(0);
  }
  async function scheduleBuffer(int16: Int16Array) {
    await ensurePlayback();
    if (!playCtxRef.current) return;
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    const buf = playCtxRef.current.createBuffer(1, f32.length, PLAYBACK_RATE);
    buf.getChannelData(0).set(f32);
    const src = playCtxRef.current.createBufferSource();
    src.buffer = buf; src.connect(playCtxRef.current.destination);
    const now = playCtxRef.current.currentTime;
    const startAt = Math.max(now, playbackCursorRef.current);
    playbackCursorRef.current = startAt + buf.duration;
    src.start(startAt);
  }
  function schedulePending() {
    if (pendingSamplesRef.current === 0) return;
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    const merged = new Int16Array(pendingSamplesRef.current);
    let off = 0;
    for (const chunk of pendingInt16Ref.current) { merged.set(chunk, off); off += chunk.length; }
    pendingInt16Ref.current = [];
    pendingSamplesRef.current = 0;
    void scheduleBuffer(merged);
  }
  function handleAudio(ab: ArrayBuffer) {
    const samples = ab.byteLength / 2;
    const durationMs = (samples / PLAYBACK_RATE) * 1000;
    agentSpeakingUntilRef.current = Math.max(agentSpeakingUntilRef.current, Date.now() + durationMs + 150);
    pendingInt16Ref.current.push(new Int16Array(ab));
    pendingSamplesRef.current += samples;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(schedulePending, FLUSH_DELAY_MS);
    if (pendingSamplesRef.current >= MIN_PLAYBACK_SAMPLES) schedulePending();
  }
  function resetPlayback() {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    pendingInt16Ref.current = [];
    pendingSamplesRef.current = 0;
    playbackCursorRef.current = 0;
    agentSpeakingUntilRef.current = 0;
    if (playCtxRef.current) { playCtxRef.current.close(); playCtxRef.current = null; }
  }

  // ── WebSocket ────────────────────────────────────────────────────────────
  function connect(token: string | null) {
    void primePlayback();
    setStatus("connecting");
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onopen = () => { setStatus("connected"); setIsTyping(true); };
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) { handleAudio(e.data); return; }
      if (e.data instanceof Blob) { void e.data.arrayBuffer().then(handleAudio); return; }
      try { handleEvent(JSON.parse(e.data as string)); } catch { /* ignore */ }
    };
    ws.onclose = (e) => {
      setStatus(e.code === 1000 ? "disconnected" : "error");
      setIsTyping(false);
      stopRecording();
      resetPlayback();
    };
    ws.onerror = () => setStatus("error");
  }

  // ── Events ───────────────────────────────────────────────────────────────
  function pushEntry(entry: TranscriptEntry) {
    setIsTyping(false);
    setTranscript((prev) => [...prev, entry]);
  }

  const handleEvent = useCallback((msg: Record<string, unknown>) => {
    const t = String(msg.type ?? "");
    if (t === "ConversationText") {
      pushEntry({
        id: nextId(),
        type: "text",
        role: msg.role === "user" ? "user" : "agent",
        content: String(msg.content ?? msg.text ?? ""),
      });
      return;
    }
    if (t === "AgentThinking" || t === "FunctionCallRequest" || t === "BookingFieldsProgress") {
      setIsTyping(true);
      return;
    }
    if (t === "AgentAudioDone") {
      agentSpeakingUntilRef.current = Math.max(agentSpeakingUntilRef.current, Date.now() + 250);
      setIsTyping(false);
      return;
    }
    if (t === "UserStartedSpeaking") { setIsTyping(false); return; }
    if (t === "QuoteReady") {
      setIsTyping(false);
      const allOffers = (msg.all_offers as unknown[]) ?? [];
      const cheapest = msg.cheapest_offer as Record<string, unknown> | undefined;
      if (allOffers.length > 1) {
        for (const offer of allOffers) {
          const o = offer as Record<string, unknown>;
          const isCheapest = o.service_id === cheapest?.service_id;
          pushEntry(buildQuoteEntry(o, isCheapest));
        }
      } else if (cheapest) {
        pushEntry(buildQuoteEntry(cheapest, true));
      }
      return;
    }
    if (t === "SenderReview") {
      setIsTyping(false);
      const entry = buildReviewEntry("Sender details", msg.collected_sender as Record<string, string>, SENDER_FIELDS);
      if (entry) pushEntry(entry);
      return;
    }
    if (t === "ReceiverReview") {
      setIsTyping(false);
      const entry = buildReviewEntry("Receiver details", msg.collected_receiver as Record<string, string>, RECEIVER_FIELDS);
      if (entry) pushEntry(entry);
      return;
    }
    if (t === "PassengerReview") {
      setIsTyping(false);
      const entry = buildReviewEntry("Passenger details", msg.collected_passenger as Record<string, string>, PASSENGER_FIELDS);
      if (entry) pushEntry(entry);
      return;
    }
    if (t === "BookingReview") {
      setIsTyping(false);
      const rev = (msg.booking_review ?? {}) as Record<string, Record<string, string>>;
      if (rev.sender && Object.values(rev.sender).some((v) => v && v !== "null")) {
        const entry = buildReviewEntry("Sender", rev.sender, SENDER_FIELDS);
        if (entry) pushEntry(entry);
      }
      if (rev.receiver && Object.values(rev.receiver).some((v) => v && v !== "null")) {
        const entry = buildReviewEntry("Receiver", rev.receiver, RECEIVER_FIELDS);
        if (entry) pushEntry(entry);
      }
      return;
    }
    if (t === "BookingConfirmed") {
      setIsTyping(false);
      pushEntry({
        id: nextId(),
        type: "confirmed",
        orderId: String(msg.order_id ?? ""),
        price: msg.price != null ? Number(msg.price).toFixed(2) : "—",
        currency: String(msg.currency ?? "EUR"),
      });
      return;
    }
    setIsTyping(true);
  }, []);

  function buildReviewEntry(
    title: string,
    data: Record<string, string> | null | undefined,
    fields: [string, string][]
  ): ReviewEntry | null {
    if (!data || !Object.values(data).some((v) => v && v !== "null")) return null;
    return {
      id: nextId(),
      type: "review",
      title,
      rows: fields.map(([key, label]) => {
        const val = data[key];
        const hasValue = Boolean(val && val !== "null");
        return { label, value: hasValue ? val : "—", empty: !hasValue };
      }),
    };
  }

  function buildQuoteEntry(offer: Record<string, unknown>, isCheapest: boolean): QuoteEntry {
    const ext = ((offer.details as Record<string, unknown> | undefined)?.extraction ?? {}) as Record<string, unknown>;
    const rawSegments = Array.isArray(offer.flight_segments)
      ? (offer.flight_segments as string[])
      : Array.isArray(offer.segments)
      ? (offer.segments as string[])
      : [];
    const flightCodes = collectUniqueFlightCodes(rawSegments);
    const summaryCodes = collectUniqueFlightCodes([
      offer.name as string, offer.summary as string, offer.description as string, offer.flight_info as string,
    ]);
    const displayCodes = flightCodes.length ? flightCodes : summaryCodes;
    const [from, to] = resolveOfferRoute(offer, ext);
    const route = displayCodes.length ? displayCodes.join(" / ") : `${from} → ${to}`;
    const flightInfo = String(offer.flight_info ?? offer.description ?? "");
    let fareName = "";
    let fareIncludes = "";
    const infoItems: string[] = [];
    for (const part of flightInfo.split("|").map((p) => p.trim())) {
      const eqIdx = part.indexOf("=");
      if (eqIdx < 0) continue;
      const k = part.substring(0, eqIdx).trim();
      const v = part.substring(eqIdx + 1).trim();
      if (k === "depart") infoItems.push(`🛫 ${v}`);
      else if (k === "arrive") infoItems.push(`🛬 ${v}`);
      else if (k === "duration") infoItems.push(`⏱ ${v}`);
      else if (k === "trip") infoItems.push(v === "one_way" ? "One way" : "Round trip");
      else if (k === "fare") fareName = v;
      else if (k === "includes") fareIncludes = v;
    }
    return {
      id: nextId(),
      type: "quote",
      provider: String(offer.provider ?? ""),
      price: offer.price != null ? Number(offer.price).toFixed(2) : "—",
      currency: String(offer.currency ?? "EUR"),
      route, isCheapest,
      name: offer.name ? String(offer.name) : undefined,
      flightInfo: infoItems.length ? infoItems.join("  •  ") : undefined,
      fareName: fareName || undefined,
      fareIncludes: fareIncludes || undefined,
    };
  }

  function startSession() {
    const token = getAccessToken();
    setTranscript([]);
    const plan = userStore.get()?.plan;
    connect(plan === "pro" && token ? token : null);
  }

  // ── Mic ──────────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      await ensurePlayback();
      audioCtxRef.current = new AudioContext({ sampleRate: CAPTURE_RATE });
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: CAPTURE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const src = audioCtxRef.current.createMediaStreamSource(mediaStreamRef.current);
      const proc = audioCtxRef.current.createScriptProcessor(2048, 1, 1);
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = INPUT_GAIN;
      const mute = audioCtxRef.current.createGain();
      mute.gain.value = 0;
      proc.onaudioprocess = (ev) => {
        if (!isRecordingRef.current || !wsRef.current || wsRef.current.readyState !== 1) return;
        if (!ALLOW_BARGE_IN && Date.now() < agentSpeakingUntilRef.current) return;
        const f32 = ev.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
          const s = Math.max(-1, Math.min(1, f32[i] * INPUT_GAIN));
          i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        wsRef.current.send(i16.buffer);
      };
      src.connect(gain); gain.connect(proc); proc.connect(mute); mute.connect(audioCtxRef.current.destination);
      processorRef.current = proc;
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch {
      pushEntry({ id: nextId(), type: "text", role: "agent", content: "⚠ Mic access denied" });
    }
  }
  function stopRecording() {
    isRecordingRef.current = false;
    setIsRecording(false);
    processorRef.current?.disconnect(); processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null;
    audioCtxRef.current?.close(); audioCtxRef.current = null;
  }
  function toggleMic() {
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      startSession();
      // Auto-start mic once connected
      const tryStart = () => {
        if (wsRef.current?.readyState === 1) void startRecording();
        else setTimeout(tryStart, 200);
      };
      setTimeout(tryStart, 250);
      return;
    }
    if (isRecording) stopRecording(); else void startRecording();
  }

  function sendText(e: React.FormEvent) {
    e.preventDefault();
    const text = textInput.trim();
    if (!text) return;
    if (!wsRef.current || wsRef.current.readyState !== 1) {
      // Show as a local demo bubble so the UI is responsive even offline
      pushEntry({ id: nextId(), type: "text", role: "user", content: text });
      setTextInput("");
      setIsTyping(true);
      setTimeout(() => {
        pushEntry({
          id: nextId(),
          type: "text",
          role: "agent",
          content: "Connect to start a session — tap the mic to begin.",
        });
      }, 600);
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "TextMessage", text }));
    pushEntry({ id: nextId(), type: "text", role: "user", content: text });
    setTextInput("");
    setIsTyping(true);
  }

  function selectQuote(provider: string, price: string, currency: string) {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    const text = `Yes, ${provider} for ${price} ${currency}`;
    wsRef.current.send(JSON.stringify({ type: "InjectUserMessage", text }));
    pushEntry({ id: nextId(), type: "text", role: "user", content: text });
    setIsTyping(true);
  }

  async function handleLogout() {
    const token = getAccessToken();
    wsRef.current?.close(1000);
    if (token) await signOut(token).catch(() => null);
    clearTokens();
    userStore.set(null);
    setLocation("/");
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === 1)
        wsRef.current.send(JSON.stringify({ type: "KeepAlive" }));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  const isIdle = transcript.length === 0 && !isTyping && status === "disconnected";

  const rightSlot = (
    <button
      onClick={() => setLocation("/settings")}
      className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
      aria-label="Account"
      title={profile ? (profile.email ?? "Account") : "Account"}
    >
      <User2 className="w-4 h-4" />
    </button>
  );

  return (
    <AppLayout rightSlot={rightSlot}>
      <div className="flex flex-col w-full max-w-3xl mx-auto px-4 md:px-8 pt-4 pb-4 overflow-hidden h-[calc(100dvh-56px-64px)] md:h-[calc(100dvh-60px)]">
        {/* Empty state */}
        {isIdle && (
          <div className="flex-1 flex items-center justify-center vg-fade-up">
            <p className="text-center text-lg md:text-xl text-muted-foreground font-medium max-w-sm">
              Tell me what you need — a flight, a delivery, a dinner reservation. I'll handle the rest.
            </p>
          </div>
        )}

        {/* Chat thread */}
        {!isIdle && (
          <div className="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-3">
            {transcript.map((entry, i) => (
              <Bubble key={entry.id} entry={entry} index={i} onSelect={selectQuote} />
            ))}
            {isTyping && <TypingDots />}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {/* Mic + voice notice */}
        <div className="flex flex-col items-center pt-2 pb-3">
          <div className="relative">
            {isRecording && (
              <>
                <span className="mic-pulse-ring" />
                <span className="mic-pulse-ring delay-1" />
                <span className="mic-pulse-ring delay-2" />
              </>
            )}
            <button
              onClick={toggleMic}
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300
                bg-primary hover:scale-105 ${isRecording ? "scale-105" : ""}`}
              style={{ background: "#3D5AFE" }}
              aria-label={isRecording ? "Stop recording" : "Tap to talk"}
            >
              {isRecording ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
            </button>
          </div>
          <div className="mt-3 text-sm font-semibold text-foreground">
            {isRecording ? "Listening…" : status === "connecting" ? "Connecting…" : "Tap to talk"}
          </div>
          {isRecording && (
            <div className="waveform mt-2" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
          )}
          {isRecording && (
            <div className="mt-3 flex items-center gap-2 rounded-full bg-secondary border border-border text-primary text-xs font-medium px-3 py-1.5 max-w-md text-center">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Speaking… data appears in chat as you talk. Type to correct any field.
            </div>
          )}
        </div>

        {/* Text input */}
        <form onSubmit={sendText} className="flex items-center gap-2 mt-1">
          <div className="relative flex-1">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder='Say: "Send a parcel to Berlin."'
              className="w-full h-12 pl-5 pr-12 rounded-full bg-white border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Hidden helper kept to preserve Logout flow (used elsewhere if needed) */}
        <button onClick={handleLogout} className="hidden">logout</button>
      </div>
    </AppLayout>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function VelaAvatar() {
  return (
    <div
      className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0"
      aria-hidden
    >
      <img src={velagoLogo} alt="" className="w-5 h-5" style={{ filter: LOGO_FILTER }} />
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-2 px-2">
      <VelaAvatar />
      <div className="flex gap-1 bg-white border border-border rounded-2xl rounded-tl-md px-3 py-2.5">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({ entry, index, onSelect }: { entry: TranscriptEntry; index: number; onSelect?: (provider: string, price: string, currency: string) => void }) {
  const delay = `${Math.min(index, 6) * 50}ms`;

  if (entry.type === "text") {
    if (entry.role === "user") {
      return (
        <div className="flex justify-end vg-fade-up" style={{ animationDelay: delay }}>
          <div className="max-w-[80%] bg-primary text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed shadow-sm">
            {entry.content}
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-end gap-2 vg-fade-up" style={{ animationDelay: delay }}>
        <VelaAvatar />
        <div className="max-w-[80%] bg-white border border-border rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {entry.content}
        </div>
      </div>
    );
  }

  if (entry.type === "review") {
    const allFilled = entry.rows.every((r) => !r.empty);
    return (
      <div className="flex items-start gap-2 vg-fade-up" style={{ animationDelay: delay }}>
        <VelaAvatar />
        <div className="vg-card flex-1 p-4">
          <div className="flex items-start gap-2 mb-3">
            <div className="font-semibold text-sm text-foreground flex-1">{entry.title}</div>
            <span className={`vg-chip ${allFilled ? "vg-chip-confirmed" : "vg-chip-info"}`}>
              {allFilled ? (
                <>
                  <CheckCircle2 className="w-3 h-3" /> Ready to confirm
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Collecting via voice…
                </>
              )}
            </span>
          </div>
          <div className="divide-y divide-border">
            {entry.rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold w-24 shrink-0">
                  {r.label}
                </span>
                <span className={`flex-1 ${r.empty ? "italic text-muted-foreground" : "font-semibold text-foreground"}`}>
                  {r.empty ? "—" : r.value}
                </span>
                <button className="p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === "quote") {
    return (
      <div className="flex items-start gap-2 vg-fade-up" style={{ animationDelay: delay }}>
        <VelaAvatar />
        <div className={`vg-card flex-1 p-4 ${entry.isCheapest ? "ring-1 ring-primary/30" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{entry.provider}</div>
            {entry.isCheapest && <span className="vg-chip vg-chip-confirmed">Cheapest</span>}
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-2xl font-bold text-foreground font-display">{entry.price}</span>
            <span className="text-sm text-muted-foreground">{entry.currency}</span>
          </div>
          <div className="text-sm text-muted-foreground">{entry.route}</div>
          {entry.name && <div className="text-xs text-muted-foreground mt-0.5">{entry.name}</div>}
          {entry.flightInfo && <div className="text-xs text-foreground mt-1">{entry.flightInfo}</div>}
          {entry.fareName && (
            <div className="text-xs font-semibold text-primary uppercase tracking-wide mt-1">{entry.fareName}</div>
          )}
          <div className="mt-3 flex justify-end">
            <button className="vg-btn-primary py-2 px-5 text-sm" onClick={(e) => { e.stopPropagation(); onSelect?.(entry.provider, entry.price, entry.currency); }}>Select</button>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === "confirmed") {
    return (
      <div className="flex items-start gap-2 vg-fade-up" style={{ animationDelay: delay }}>
        <VelaAvatar />
        <div className="vg-card flex-1 p-5 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="font-display font-bold text-lg text-foreground">Order confirmed</div>
          <div className="text-sm text-muted-foreground mt-1">
            {entry.price} {entry.currency}
          </div>
          {entry.orderId && (
            <div className="text-xs text-muted-foreground mt-1 break-all">Reference: {entry.orderId}</div>
          )}
          <button className="vg-btn-primary mt-4 text-sm">Track order</button>
        </div>
      </div>
    );
  }

  return null;
}
