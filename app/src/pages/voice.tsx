import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, Send, LogOut, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAccessToken, clearTokens } from "@/lib/auth";
import { fetchMe, signOut, updateMe } from "@/lib/api-auth";
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
  "brightness(0) saturate(100%) invert(18%) sepia(90%) saturate(2500%) hue-rotate(220deg) brightness(95%) contrast(95%)";

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
  ["sender_name", "Full Name"],
  ["sender_phone", "Phone"],
  ["sender_email", "Email"],
  ["sender_address", "Address"],
  ["sender_city", "City"],
  ["sender_postcode", "Postal Code"],
];
const RECEIVER_FIELDS: [string, string][] = [
  ["receiver_name", "Full Name"],
  ["receiver_phone", "Phone"],
  ["receiver_email", "Email"],
  ["receiver_address", "Address"],
  ["receiver_city", "City"],
  ["receiver_postcode", "Postal Code"],
];
const PASSENGER_FIELDS: [string, string][] = [
  ["first_name", "First Name"],
  ["last_name", "Last Name"],
  ["email", "Email"],
  ["phone", "Phone"],
];

function pickAddress(saved: Record<string, unknown> | null | undefined) {
  if (!saved || typeof saved !== "object") return null;
  const keys = ["default", "home", "sender", "shipping", "billing", "primary"];
  for (const key of keys) {
    const v = (saved as Record<string, unknown>)[key];
    if (v && typeof v === "object") return v as Record<string, string>;
    if (typeof v === "string" && v.trim()) return { address: v };
  }
  const values = Object.values(saved);
  for (const v of values) {
    if (v && typeof v === "object") return v as Record<string, string>;
    if (typeof v === "string" && (v as string).trim())
      return { address: v as string };
  }
  return null;
}

function getAddressForForm(saved: Record<string, unknown> | null | undefined) {
  if (!saved) return { address: "", city: "", postcode: "" };
  // flat object (e.g. from PATCH response)
  if (typeof saved.address === "string" || typeof saved.city === "string") {
    return {
      address: String(saved.address ?? ""),
      city: String(saved.city ?? ""),
      postcode: String(saved.postcode ?? saved.zip ?? ""),
    };
  }
  // nested
  const addr = pickAddress(saved);
  return {
    address: String(addr?.address ?? ""),
    city: String(addr?.city ?? ""),
    postcode: String(addr?.postcode ?? addr?.zip ?? ""),
  };
}

function formatUserName(p: ReturnType<typeof userStore.get>): string {
  if (!p) return "";
  const parts = [p.title, p.first_name ?? p.given_name, p.last_name ?? p.family_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || p.name || p.email || "";
}

function planLabel(plan: string | undefined): string {
  if (plan === "pro") return "Pro";
  return "Demo";
}

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

  // Profile modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("Mr");
  const [formFirst, setFormFirst] = useState("");
  const [formLast, setFormLast] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formPostcode, setFormPostcode] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

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

  // ── Auth guard + profile load ────────────────────────────────────────────

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setLocation("/auth"); return; }
    fetchMe(token).then((p) => userStore.set(p)).catch(() => null);
    return () => { wsRef.current?.close(1000); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, isTyping]);

  // ── Profile modal helpers ────────────────────────────────────────────────

  function openProfile() {
    const p = userStore.get();
    setFormTitle(p?.title ?? "Mr.");
    setFormFirst(p?.first_name ?? p?.given_name ?? "");
    setFormLast(p?.last_name ?? p?.family_name ?? "");
    setFormEmail(p?.email ?? "");
    setFormPhone(p?.phone ?? p?.phone_number ?? "");
    const addr = getAddressForForm(p?.saved_addresses);
    setFormAddress(addr.address);
    setFormCity(addr.city);
    setFormPostcode(addr.postcode);
    setUpdateError(null);
    setUpdateSuccess(false);
    setProfileOpen(true);
  }

  async function handleUpdate() {
    const token = getAccessToken();
    if (!token) return;

    const allFilled = [formTitle, formFirst, formLast, formEmail, formPhone, formAddress, formCity, formPostcode]
      .every((v) => v.trim() !== "");

    if (!allFilled) {
      setUpdateError("Please fill in all fields to activate your Pro plan.");
      return;
    }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(false);
    try {
      const updated = await updateMe(token, {
        title: formTitle,
        first_name: formFirst,
        last_name: formLast,
        email: formEmail,
        phone: formPhone,
        plan: "pro",
        saved_addresses: {
          address: formAddress,
          city: formCity,
          postcode: formPostcode,
        },
      });
      userStore.set(updated);
      setUpdateSuccess(true);
    } catch (err) {
      setUpdateError((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

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
    // Only send token for pro plan; free/demo connects anonymously
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setIsTyping(true);
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) { handleAudio(e.data); return; }
      if (e.data instanceof Blob) { void e.data.arrayBuffer().then(handleAudio); return; }
      try { handleEvent(JSON.parse(e.data as string)); } catch { /* ignore parse errors */ }
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

    if (t === "UserStartedSpeaking") {
      setIsTyping(false);
      return;
    }

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
      const entry = buildReviewEntry("Sender Details", msg.collected_sender as Record<string, string>, SENDER_FIELDS);
      if (entry) pushEntry(entry);
      return;
    }
    if (t === "ReceiverReview") {
      setIsTyping(false);
      const entry = buildReviewEntry("Receiver Details", msg.collected_receiver as Record<string, string>, RECEIVER_FIELDS);
      if (entry) pushEntry(entry);
      return;
    }
    if (t === "PassengerReview") {
      setIsTyping(false);
      const entry = buildReviewEntry("Passenger Details", msg.collected_passenger as Record<string, string>, PASSENGER_FIELDS);
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
      offer.name as string,
      offer.summary as string,
      offer.description as string,
      offer.flight_info as string,
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
      route,
      isCheapest,
      name: offer.name ? String(offer.name) : undefined,
      flightInfo: infoItems.length ? infoItems.join("  •  ") : undefined,
      fareName: fareName || undefined,
      fareIncludes: fareIncludes || undefined,
    };
  }

  // ── Session start ────────────────────────────────────────────────────────

  function startSession() {
    const token = getAccessToken();
    if (!token) { setLocation("/auth"); return; }
    setTranscript([]);
    // Send token only for pro plan; anonymous WS for free/demo
    const plan = userStore.get()?.plan;
    connect(plan === "pro" ? token : null);
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

      src.connect(gain);
      gain.connect(proc);
      proc.connect(mute);
      mute.connect(audioCtxRef.current.destination);
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
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    if (isRecording) stopRecording(); else void startRecording();
  }

  // ── Text send ────────────────────────────────────────────────────────────

  function sendText(e: React.FormEvent) {
    e.preventDefault();
    const text = textInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: "TextMessage", text }));
    setTextInput("");
    setIsTyping(true);
  }

  // ── Logout ───────────────────────────────────────────────────────────────

  async function handleLogout() {
    const token = getAccessToken();
    wsRef.current?.close(1000);
    if (token) await signOut(token).catch(() => null);
    clearTokens();
    userStore.set(null);
    setLocation("/auth");
  }

  // ── Keepalive ────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === 1)
        wsRef.current.send(JSON.stringify({ type: "KeepAlive" }));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const isConnected = status === "connected";
  const plan = planLabel(profile?.plan);
  const isPro = profile?.plan === "pro";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-border px-6 py-4 flex items-center gap-3">
        <img src={velagoLogo} alt="VelaGo" className="h-10 object-contain shrink-0" style={{ filter: LOGO_FILTER }} />

        {/* Profile pill button */}
        <div className="flex-1 min-w-0">
          {profile && (
            <button
              onClick={openProfile}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 hover:bg-black/10 border border-black/10 transition-colors text-left max-w-full"
            >
              <span className="text-sm font-medium text-foreground truncate">
                {formatUserName(profile)}
              </span>
              <span
                className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isPro
                    ? "bg-primary/15 text-primary"
                    : "bg-muted-foreground/15 text-muted-foreground"
                }`}
              >
                {plan}
              </span>
            </button>
          )}
        </div>

        {/* Status + logout */}
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {status === "connected" ? "Connected" : status === "connecting" ? "Connecting…" : status === "error" ? "Error" : "Disconnected"}
          </span>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Profile Sheet */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="left" className="w-80 sm:w-96 flex flex-col">
          <SheetHeader>
            <SheetTitle>Account</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="details" className="flex-1 overflow-y-auto mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1">User details</TabsTrigger>
              <TabsTrigger value="payment" className="flex-1">Payment methods</TabsTrigger>
            </TabsList>

            {/* ── User details ── */}
            <TabsContent value="details" className="mt-4 flex flex-col gap-4 pb-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Title</Label>
                <Select value={formTitle} onValueChange={setFormTitle}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mr.">Mr.</SelectItem>
                    <SelectItem value="Ms.">Ms.</SelectItem>
                    <SelectItem value="Mrs.">Mrs.</SelectItem>
                    <SelectItem value="Mx.">Mx.</SelectItem>
                    <SelectItem value="Dr.">Dr.</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">First name</Label>
                  <Input value={formFirst} onChange={(e) => setFormFirst(e.target.value)} autoComplete="given-name" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Last name</Label>
                  <Input value={formLast} onChange={(e) => setFormLast(e.target.value)} autoComplete="family-name" />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Email</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} autoComplete="email" />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Phone</Label>
                <Input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} autoComplete="tel" />
              </div>

              <hr className="border-border" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide -mb-2">
                Delivery address
              </p>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Street address</Label>
                <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} autoComplete="street-address" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">City</Label>
                  <Input value={formCity} onChange={(e) => setFormCity(e.target.value)} autoComplete="address-level2" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">ZIP / Postcode</Label>
                  <Input value={formPostcode} onChange={(e) => setFormPostcode(e.target.value)} autoComplete="postal-code" />
                </div>
              </div>

              {updateError && <p className="text-sm text-destructive">{updateError}</p>}
              {updateSuccess && <p className="text-sm text-green-600">Saved successfully</p>}

              <Button
                onClick={handleUpdate}
                disabled={updating}
                className="rounded-full bg-primary-gradient text-white border-0 h-10"
              >
                {updating ? "Saving…" : "Update"}
              </Button>
            </TabsContent>

            {/* ── Payment methods ── */}
            <TabsContent value="payment" className="mt-4 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Connect your payment method to book and pay for orders seamlessly.
              </p>
              <Button variant="outline" className="rounded-full" disabled>
                Connect to Revolut
              </Button>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* User profile card */}
      {profile && (
        <div className="px-4 pt-4 max-w-xl w-full mx-auto">
          <div className="bg-white rounded-2xl px-4 py-3 border border-border text-xs text-muted-foreground grid grid-cols-2 gap-1">
            {profile.email && (
              <span><span className="font-medium text-foreground">Email</span> {profile.email}</span>
            )}
            {(profile.phone ?? profile.phone_number) && (
              <span><span className="font-medium text-foreground">Phone</span> {profile.phone ?? profile.phone_number}</span>
            )}
            {(() => {
              const addr = pickAddress(profile.saved_addresses);
              return (
                <>
                  {addr?.address && <span><span className="font-medium text-foreground">Address</span> {String(addr.address)}</span>}
                  {addr?.city && <span><span className="font-medium text-foreground">City</span> {String(addr.city)}</span>}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Mic area */}
      <div className="flex flex-col items-center py-8 px-4">
        {status === "disconnected" || status === "error" ? (
          <>
            <button
              onClick={startSession}
              className="relative z-10 flex items-center justify-center w-24 h-24 rounded-full bg-primary-gradient text-white shadow-xl hover:scale-105 transition-transform duration-300"
              aria-label="Start new session"
            >
              <Mic className="w-9 h-9" />
            </button>
            <span className="text-sm text-muted-foreground mt-3">
              {status === "error" ? "Connection error — " : ""}Start new session
            </span>
          </>
        ) : (
          <>
            <div className="relative group mb-3">
              <button
                onClick={toggleMic}
                disabled={!isConnected}
                className={`relative z-10 flex items-center justify-center w-24 h-24 rounded-full text-white transition-all duration-300 shadow-xl
                  ${isConnected ? "bg-primary-gradient" : "bg-muted cursor-not-allowed"}
                  ${isRecording ? "scale-105 animate-breathing" : isConnected ? "hover:scale-105" : ""}
                `}
                aria-label="Tap to talk"
              >
                {isRecording ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
              </button>
              {isConnected && (
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl -z-10 scale-150 group-hover:bg-primary/30 transition-colors" />
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {status === "connecting"
                ? "Connecting…"
                : isRecording
                ? "Listening… tap to stop"
                : "Tap to speak"}
            </span>
          </>
        )}
      </div>

      {/* Transcript */}
      <div className="flex-1 px-4 pb-4 max-w-xl w-full mx-auto flex flex-col gap-2 min-h-0">
        <div className="flex-1 bg-white rounded-3xl border border-border overflow-y-auto p-4 flex flex-col gap-2 min-h-[200px] max-h-[50vh]">
          {transcript.length === 0 && !isTyping && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {status === "disconnected" || status === "error"
                ? "Press Start new session to begin"
                : "Vela is ready — start speaking"}
            </p>
          )}

          {transcript.map((entry) => {
            if (entry.type === "text") {
              return (
                <div key={entry.id} className="text-sm leading-relaxed">
                  <span
                    className={`font-semibold text-xs uppercase tracking-wide mr-2 ${
                      entry.role === "user" ? "text-primary" : "text-green-600"
                    }`}
                  >
                    {entry.role === "user" ? "You" : "Vela"}
                  </span>
                  {entry.content}
                </div>
              );
            }

            if (entry.type === "review") {
              return (
                <div key={entry.id} className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
                    {entry.title}
                  </p>
                  {entry.rows.map((row) => (
                    <div key={row.label} className="flex gap-2 py-1 border-b border-amber-100 last:border-0 text-sm">
                      <span className="min-w-[80px] text-xs font-semibold text-amber-600 uppercase tracking-wide shrink-0">
                        {row.label}
                      </span>
                      <span className={row.empty ? "text-amber-400 italic" : "text-amber-900 font-medium"}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }

            if (entry.type === "quote") {
              return (
                <div
                  key={entry.id}
                  className={`rounded-2xl p-4 border ${
                    entry.isCheapest
                      ? "bg-primary/5 border-primary/30"
                      : "bg-muted/30 border-border opacity-80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        entry.isCheapest ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {entry.provider}
                    </span>
                    {entry.isCheapest && (
                      <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                        Best price
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {entry.price}{" "}
                    <span className="text-sm font-normal text-muted-foreground">{entry.currency}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{entry.route}</div>
                  {entry.name && <div className="text-xs text-muted-foreground mt-0.5">{entry.name}</div>}
                  {entry.flightInfo && <div className="text-xs text-foreground mt-1">{entry.flightInfo}</div>}
                  {entry.fareName && (
                    <div className="text-xs font-semibold text-primary uppercase tracking-wide mt-1">
                      {entry.fareName}
                    </div>
                  )}
                  {entry.fareIncludes && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.fareIncludes.split(";").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
              );
            }

            if (entry.type === "confirmed") {
              return (
                <div key={entry.id} className="rounded-2xl bg-green-50 border border-green-200 p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-green-600 mb-1">
                    ✅ Booking Confirmed
                  </div>
                  <div className="text-xl font-bold text-green-900">
                    {entry.price} {entry.currency}
                  </div>
                  {entry.orderId && (
                    <div className="text-xs text-green-700 mt-0.5 break-all">Order: {entry.orderId}</div>
                  )}
                </div>
              );
            }

            return null;
          })}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Vela is typing…</span>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {/* Text input */}
        <form onSubmit={sendText} className="flex gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a message…"
            disabled={!isConnected}
            className="rounded-2xl"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!isConnected || !textInput.trim()}
            className="shrink-0 rounded-2xl bg-primary-gradient text-white border-0 w-11 h-11"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
