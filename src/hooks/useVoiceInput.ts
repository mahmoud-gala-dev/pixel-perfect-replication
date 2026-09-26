// =====================================================================
// KNOWLEDGE BRAIN — P2: VOICE INPUT & DICTATION HUB
// Native Web Speech API integration with Arabic (ar-SA/ar-EG) & English (en-US)
// =====================================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

// Web Speech API interface declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export type SupportedVoiceLang = "ar-SA" | "ar-EG" | "en-US" | "en-GB";

export interface UseVoiceInputOptions {
  lang?: SupportedVoiceLang | string;
  continuous?: boolean;
  interimResults?: boolean;
  autoDetectLanguage?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  language: string;
  isSupported: boolean;
  setLanguage: (lang: SupportedVoiceLang | string) => void;
  startListening: (customLang?: string) => void;
  stopListening: () => void;
  toggleListening: () => void;
  resetTranscript: () => void;
}

/**
 * Detects if a text string contains mostly Arabic script
 */
export function isArabicText(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  return arabicRegex.test(text);
}

/**
 * Hook for speech recognition across Arabic and English locales.
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [language, setLanguage] = useState<string>(options.lang || "ar-SA");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isSupported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Safe ignore
      }
      setIsListening(false);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  const startListening = useCallback(
    (customLang?: string) => {
      if (!isSupported) {
        toast.error("Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.");
        return;
      }

      // Terminate any running session
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Safe ignore
        }
      }

      const SpeechConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechConstructor) return;

      const recognition = new SpeechConstructor();
      recognition.continuous = optionsRef.current.continuous ?? false;
      recognition.interimResults = optionsRef.current.interimResults ?? true;
      const targetLang = customLang || language;
      recognition.lang = targetLang;

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript("");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let currentInterim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (!item || !item[0]) continue;

          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            currentInterim += item[0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript((prev) => (prev ? `${prev} ${finalTranscript.trim()}` : finalTranscript.trim()));
          if (optionsRef.current.onResult) {
            optionsRef.current.onResult(finalTranscript.trim(), true);
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
          if (optionsRef.current.onResult) {
            optionsRef.current.onResult(currentInterim, false);
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn("[VoiceInput] Recognition error:", event.error);
        if (event.error === "not-allowed") {
          toast.error("Microphone access denied. Please enable microphone permissions in your browser.");
        } else if (event.error === "no-speech") {
          // No speech detected, no need for intrusive alert
        } else {
          toast.error(`Voice recognition error: ${event.error}`);
        }

        if (optionsRef.current.onError) {
          optionsRef.current.onError(event.error);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (err) {
        console.error("Failed to start voice recognition:", err);
        setIsListening(false);
      }
    },
    [isSupported, language],
  );

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Safe ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    language,
    isSupported,
    setLanguage,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
}
