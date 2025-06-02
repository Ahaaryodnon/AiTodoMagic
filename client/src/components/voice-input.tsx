import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Brain, Trash2, HelpCircle } from "lucide-react";
import { speechRecognition, type SpeechRecognitionResult } from "@/lib/speech";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function VoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Ready to listen...");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const voiceCommandMutation = useMutation({
    mutationFn: async (transcription: string) => {
      const response = await apiRequest("POST", "/api/voice-command", { transcription });
      return response.json();
    },
    onSuccess: (data) => {
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      
      toast({
        title: "Voice Command Processed",
        description: data.response,
      });
    },
    onError: (error) => {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to process voice command",
        variant: "destructive",
      });
    },
  });

  const handleSpeechResult = (result: SpeechRecognitionResult) => {
    setTranscript(result.transcript);
    
    if (result.isFinal && result.transcript.trim()) {
      setIsProcessing(true);
      setStatus("AI is processing your request...");
      voiceCommandMutation.mutate(result.transcript);
      stopRecording();
    }
  };

  const startRecording = () => {
    if (!speechRecognition.isSupported()) {
      toast({
        title: "Speech Recognition Not Supported",
        description: "Your browser doesn't support speech recognition. Please try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    const success = speechRecognition.start({
      onStart: () => {
        setIsRecording(true);
        setStatus("Listening...");
        setTranscript("");
      },
      onResult: handleSpeechResult,
      onEnd: () => {
        setIsRecording(false);
        if (!isProcessing) {
          setStatus("Ready to listen...");
        }
      },
      onError: (error) => {
        setIsRecording(false);
        setStatus("Error: " + error);
        toast({
          title: "Speech Recognition Error",
          description: error,
          variant: "destructive",
        });
      },
    });

    if (!success) {
      toast({
        title: "Failed to Start Recording",
        description: "Please check your microphone permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    speechRecognition.stop();
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    setStatus("Ready to listen...");
  };

  // Voice wave visualization
  const VoiceWaves = () => (
    <div className="flex justify-center items-end space-x-1 h-16 mb-6">
      {[20, 40, 60, 80, 30].map((height, index) => (
        <div
          key={index}
          className={`w-2 bg-blue-500 rounded-full transition-all duration-300 ${
            isRecording ? 'voice-wave' : ''
          }`}
          style={{ 
            height: isRecording ? `${height}%` : '20%',
            animationDelay: `${index * 0.1}s`
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-6 text-gray-900 dark:text-white">
              Voice Command Center
            </h2>
            
            {/* Main Voice Button */}
            <div className="relative mb-8">
              <Button
                onClick={toggleRecording}
                disabled={isProcessing}
                className={`w-24 h-24 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {isRecording ? (
                  <MicOff className="text-white text-2xl" />
                ) : (
                  <Mic className="text-white text-2xl" />
                )}
              </Button>
              
              {/* Recording Indicator */}
              {isRecording && (
                <div className="absolute -inset-4 border-4 border-blue-500 rounded-full opacity-50 animate-ping" />
              )}
            </div>
            
            {/* Voice Waveform Visualization */}
            <VoiceWaves />
            
            {/* Status Display */}
            <div className="space-y-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {status}
              </div>
              
              {/* Live Transcription */}
              <div className="min-h-16 bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-left">
                <p className="text-sm text-gray-900 dark:text-gray-300">
                  {transcript || (
                    <span className="italic text-gray-500 dark:text-gray-400">
                      Speak your command...
                    </span>
                  )}
                </p>
              </div>
              
              {/* AI Processing Status */}
              {isProcessing && (
                <div className="flex items-center justify-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                  <Brain className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span>AI is processing your request...</span>
                </div>
              )}
            </div>
            
            {/* Quick Action Buttons */}
            <div className="mt-6 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  toast({
                    title: "Voice Commands Help",
                    description: `Available commands:
                    • "Add [task description]" - Create new task
                    • "Update [task] to [new description]" - Modify task
                    • "Make [task] high priority" - Set priority
                    • "Mark [task] as done" - Complete task`,
                  });
                }}
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Voice Commands Help
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={clearTranscript}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Transcription
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voice Commands Guide */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Voice Commands
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-300">Add Task</div>
                <div className="text-gray-600 dark:text-gray-400">"Add [task description]"</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-300">Update Task</div>
                <div className="text-gray-600 dark:text-gray-400">"Update [task] to [new description]"</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full mt-2" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-300">Set Priority</div>
                <div className="text-gray-600 dark:text-gray-400">"Make [task] high priority"</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-300">Complete Task</div>
                <div className="text-gray-600 dark:text-gray-400">"Mark [task] as done"</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
