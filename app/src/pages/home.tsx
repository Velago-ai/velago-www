import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useSpeech } from "@/hooks/use-speech";
import { isAuthenticated } from "@/lib/auth";
import velagoLogo from "@assets/velago_logo_nobg.svg";


const LOGO_BLUE_FILTER = "brightness(0) saturate(100%) invert(18%) sepia(90%) saturate(2500%) hue-rotate(220deg) brightness(95%) contrast(95%)";
import { Mic, ArrowRight, Plane, Utensils, Package, Send, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CAROUSEL_TEXTS = [
  "Send a parcel to Berlin.",
  "Cheapest flight to London.",
  "Order my usual pizza.",
  "Food delivered tonight.",
  "Parcel pickup from home.",
  "Morning flight to Madrid."
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { isListening, transcript, isSupported, toggleListening, setTranscript } = useSpeech();

  // Redirect already-authenticated users straight to the voice page
  useEffect(() => {
    if (isAuthenticated()) {
      setLocation("/voice");
    }
  }, []);
  const [inputText, setInputText] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-rotating carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_TEXTS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Handle speech transcript updates
  useEffect(() => {
    if (transcript && !isListening) {
      handleQuery(transcript);
    } else if (transcript) {
      setInputText(transcript);
    }
  }, [transcript, isListening]);

  const handleQuery = () => {
    setTranscript("");
    setInputText("");
    setLocation("/voice");
    return;
    
    // Simple intent detection
    if (/(pizza|food|dinner|delivery|restaurant|eat)/i.test(lowerText)) {
      setResponse("Got it — I can help with food delivery. Where should it be delivered?");
    } else if (/(flight|airport|ticket|airline|fly)/i.test(lowerText)) {
      setResponse("Okay — what city are you flying from?");
    } else if (/(parcel|package|send|shipping|ship)/i.test(lowerText)) {
      setResponse("Sure — where is the parcel going?");
    } else {
      setResponse("I can currently help with food delivery, flights, and parcel delivery.");
    }
    
    // Scroll to response
    setTimeout(() => {
      responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      handleQuery(inputText);
    }
  };

  return (
    <main className="min-h-[100dvh] w-full pb-20 overflow-x-hidden">
      {/* Header */}
      <header className="w-full py-6 px-6 md:px-12 flex justify-between items-center max-w-7xl mx-auto">
        <img src={velagoLogo} alt="VelaGo Logo" className="h-14 md:h-20 object-contain" style={{ filter: LOGO_BLUE_FILTER }} />
        <Button
          className="rounded-full px-6 h-10 bg-primary-gradient text-white border-0"
          onClick={() => setLocation("/auth")}
        >
          Sign in
        </Button>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-4 pb-16 md:pt-10 md:pb-24 max-w-4xl mx-auto flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground mb-6 leading-[1.1]">
          Stop searching.<br /><span className="text-primary-gradient">Just say it.</span>
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mb-12 font-light">
          Book food, flights, or parcel deliveries — in seconds.
        </p>

        {/* Interaction Area */}
        <div className="w-full max-w-md relative flex flex-col items-center z-10">
          {/* Main Mic Button */}
          <div className="relative mb-8 group">
            <button
              onClick={toggleListening}
              className={`relative z-10 flex items-center justify-center w-28 h-28 md:w-32 md:h-32 rounded-full bg-primary-gradient shadow-xl text-white transition-transform duration-300 ${
                isListening ? 'scale-105 animate-breathing' : 'hover:scale-105'
              }`}
              aria-label="Tap to talk"
            >
              <Mic className={`w-10 h-10 md:w-12 md:h-12 ${isListening ? 'animate-pulse text-white' : 'text-white'}`} />
            </button>
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl -z-10 scale-150 group-hover:bg-primary/30 transition-colors"></div>
          </div>
          
          <div className="text-center mb-8 h-8">
            <span className="font-medium text-foreground text-lg">
              {isListening ? "Listening..." : "Tap to talk"}
            </span>
          </div>

          {/* Text Input with rotating placeholder */}
          <div className="w-full">
            <form onSubmit={handleTextSubmit} className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-blue-500/10 rounded-2xl blur-lg transition-opacity opacity-0 group-hover:opacity-100"></div>
              <div className="relative flex items-center bg-white rounded-2xl shadow-sm border border-border overflow-hidden transition-all focus-within:shadow-md focus-within:border-primary/30">
                <div className="absolute left-6 pointer-events-none overflow-hidden h-14 flex items-center right-14">
                  {!inputText && !isTyping && (
                    <>
                      <span className="text-muted-foreground text-base shrink-0">Say:&nbsp;</span>
                      <span 
                        key={carouselIndex} 
                        className="text-muted-foreground text-base animate-placeholder-slide whitespace-nowrap"
                      >
                        "{CAROUSEL_TEXTS[carouselIndex]}"
                      </span>
                    </>
                  )}
                </div>
                <Input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  className="border-0 shadow-none focus-visible:ring-0 h-14 px-6 text-base bg-transparent relative z-10"
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  variant="ghost" 
                  className="mr-2 h-10 w-10 text-primary hover:text-primary hover:bg-primary/10 rounded-xl"
                  disabled={!inputText.trim()}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </form>
            {!isSupported && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Voice input not supported in this browser. Please type instead.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Demo Response Area */}
      {response && (
        <section ref={responseRef} className="px-6 py-12 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="bg-white rounded-3xl p-8 shadow-lg border border-primary/10 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-6">
              <img src={velagoLogo} alt="Vela" className="w-12 h-12 object-contain" style={{ filter: LOGO_BLUE_FILTER }} />
            </div>
            <p className="text-2xl font-medium text-foreground mb-8">"{response}"</p>
            <div className="flex gap-4">
              <Button onClick={() => setResponse(null)} variant="outline" className="rounded-full px-6 h-12">Clear</Button>
              <Button onClick={() => setLocation("/voice")} className="rounded-full px-6 h-12 bg-primary-gradient text-white border-0">Continue Flow</Button>
            </div>
          </div>
        </section>
      )}

      {/* Services Section */}
      <section className="px-6 py-20 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16 text-foreground">Skip forms. Book by voice.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-accent/30 rounded-3xl p-8 flex flex-col items-center text-center transition-transform hover:-translate-y-2 duration-300 overflow-hidden">
              <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
                <Utensils className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Food delivery</h3>
              <p className="text-muted-foreground mb-6">Order food in seconds.</p>
              <div className="w-full overflow-hidden">
                <div className="logo-marquee-track items-center gap-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="flex items-center gap-6 shrink-0">
                      <img src={`${import.meta.env.BASE_URL}logos/mcdonalds.png`} alt="McDonald's" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/kfc.png`} alt="KFC" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/dominos.png`} alt="Domino's" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/subway.png`} alt="Subway" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/burgerking.png`} alt="Burger King" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/starbucks.png`} alt="Starbucks" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/dunkindonuts.png`} alt="Dunkin' Donuts" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/fiveguys.png`} alt="Five Guys" className="h-8 w-24 object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-accent/30 rounded-3xl p-8 flex flex-col items-center text-center transition-transform hover:-translate-y-2 duration-300 overflow-hidden">
              <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
                <Plane className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Flights</h3>
              <p className="text-muted-foreground mb-6">Search flights by voice.</p>
              <div className="w-full overflow-hidden">
                <div className="logo-marquee-track items-center gap-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="flex items-center gap-6 shrink-0">
                      <img src={`${import.meta.env.BASE_URL}logos/ryanair.png`} alt="Ryanair" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/wizzair.png`} alt="Wizzair" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/easyjet.png`} alt="easyJet" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/transavia.png`} alt="Transavia" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/volotea.png`} alt="Volotea" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/jet2.png`} alt="Jet2" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/indigo.png`} alt="IndiGo" className="h-8 w-24 object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-3xl p-8 flex flex-col items-center text-center transition-transform hover:-translate-y-2 duration-300 overflow-hidden">
              <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
                <Package className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-foreground">Parcel delivery</h3>
              <p className="text-muted-foreground mb-6">Book shipping without forms.</p>
              <div className="w-full overflow-hidden">
                <div className="logo-marquee-track items-center gap-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="flex items-center gap-6 shrink-0">
                      <img src={`${import.meta.env.BASE_URL}logos/GLS.png`} alt="GLS" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/DPD.png`} alt="DPD" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/FedEx.png`} alt="FedEx" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/DHL.png`} alt="DHL" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/UPS.png`} alt="UPS" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/SEUR.png`} alt="SEUR" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/InPost.png`} alt="InPost" className="h-8 w-24 object-contain" />
                      <img src={`${import.meta.env.BASE_URL}logos/CTT.png`} alt="CTT" className="h-8 w-24 object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-16 text-foreground">How it works</h2>
        <div className="flex flex-col md:flex-row gap-12 md:gap-6 justify-between relative">
          {/* Connecting line for desktop */}
          <div className="hidden md:block absolute top-10 left-[10%] right-[10%] h-0.5 bg-border -z-10"></div>
          
          <StepCard 
            number="1"
            title="Speak"
            description="Say what you need using natural language."
          />
          <StepCard 
            number="2"
            title="Vela understands"
            description="Finds the right booking flow instantly."
          />
          <StepCard 
            number="3"
            title="Done"
            description="Book faster without opening multiple apps."
          />
        </div>
      </section>

      {/* USP Block */}
      <section className="px-6 py-20 mb-12">
        <div className="max-w-4xl mx-auto bg-primary-gradient rounded-3xl p-10 md:p-16 text-white text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <RefreshCw className="w-16 h-16 mx-auto mb-8 opacity-80" />
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Next time, just say:<br/>"Same as before."</h2>
          <p className="text-lg md:text-xl font-light opacity-90 max-w-2xl mx-auto">
            VelaGo remembers past bookings, so reordering becomes instant. No navigating menus, no repeating details.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16 text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold mb-8">Try VelaGo now</h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
          <Button 
            size="lg" 
            className="h-14 px-8 rounded-full bg-primary-gradient text-white text-lg border-0 hover:shadow-lg transition-all w-full sm:w-auto"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <Mic className="mr-2 w-5 h-5" />
            Start with voice
          </Button>
          <Button 
            variant="ghost" 
            size="lg" 
            className="h-14 px-8 rounded-full text-lg w-full sm:w-auto"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setTimeout(() => {
                document.querySelector('input')?.focus();
              }, 500);
            }}
          >
            Type instead
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">No signup required for demo.</p>
      </section>
      
      <footer className="px-6 py-10 border-t border-border text-center flex flex-col items-center">
        <img src={velagoLogo} alt="VelaGo Logo" className="h-10 object-contain mb-4 opacity-70" style={{ filter: LOGO_BLUE_FILTER }} />
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} VelaGo. All rights reserved.</p>
      </footer>
    </main>
  );
}

function ServiceCard({ icon, title, description, bgColor }: { icon: React.ReactNode, title: string, description: string, bgColor: string }) {
  return (
    <div className={`${bgColor} rounded-3xl p-8 flex flex-col items-center text-center transition-transform hover:-translate-y-2 duration-300`}>
      <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-3 text-foreground">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center text-center bg-white rounded-3xl p-6 relative z-10 flex-1">
      <div className="w-16 h-16 rounded-full bg-accent text-foreground flex items-center justify-center text-2xl font-bold mb-6 shadow-sm">
        {number}
      </div>
      <h3 className="text-xl font-semibold mb-3 text-foreground">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
