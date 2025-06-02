export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onResult?: (result: SpeechRecognitionResult) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

class SpeechRecognitionService {
  private recognition: any = null;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
      }
    }
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  start(callbacks: SpeechRecognitionCallbacks): boolean {
    if (!this.recognition || this.isListening) {
      return false;
    }

    this.recognition.onstart = () => {
      this.isListening = true;
      callbacks.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      let confidence = 0;
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0].transcript;
        confidence = result[0].confidence;
        isFinal = result.isFinal;
      }

      callbacks.onResult?.({
        transcript: transcript.trim(),
        confidence,
        isFinal
      });
    };

    this.recognition.onerror = (event: any) => {
      callbacks.onError?.(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      callbacks.onEnd?.();
    };

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      callbacks.onError?.('Failed to start speech recognition');
      return false;
    }
  }

  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  getIsListening(): boolean {
    return this.isListening;
  }
}

export const speechRecognition = new SpeechRecognitionService();
