'use client';

import Image from "next/image";
import { useState, useRef } from "react";
import { transcribeAudio } from './actions';

export default function Home() {
  const [issueText, setIssueText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [severity, setSeverity] = useState<'emergency' | 'non-emergency' | 'none' | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const getLocation = (): Promise<{ lat: number; lon: number; address?: string }> => {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        const options = {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        };

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const locationData = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            };

            // Try to get address using browser's reverse geocoding
            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${locationData.lat}&lon=${locationData.lon}&format=json`,
                {
                  headers: {
                    'Accept-Language': navigator.language || 'en-US' // Use browser's language
                  }
                }
              );
              const data = await response.json();
              const address = data.display_name;
              setAddress(address);
              resolve({ ...locationData, address });
            } catch (error) {
              // If reverse geocoding fails, still return the coordinates
              console.error('Error getting address:', error);
              resolve(locationData);
            }
          },
          (error) => {
            console.error("Error getting location:", error);
            reject(error);
          },
          options
        );
      } else {
        const error = new Error("Geolocation is not supported");
        reject(error);
      }
    });
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newImageUrls = Array.from(files).map(file => URL.createObjectURL(file));
      setSelectedImages(prev => [...prev, ...newImageUrls]);
    }
  };

  const handleRemoveImage = (imageUrl: string) => {
    URL.revokeObjectURL(imageUrl);
    setSelectedImages(prev => prev.filter(img => img !== imageUrl));
  };

  const getRandomAnalysis = () => {
    const outcomes = ['emergency', 'non-emergency', 'none'] as const;
    const randomIndex = Math.floor(Math.random() * outcomes.length);
    const outcome = outcomes[randomIndex];
    
    let analysisText = '';
    switch (outcome) {
      case 'emergency':
        analysisText = "Critical safety hazard detected. Emergency services should be notified.";
        break;
      case 'non-emergency':
        analysisText = "Minor infrastructure issue detected. Consider reporting to 311.";
        break;
      case 'none':
        analysisText = "No significant issues detected in the provided information.";
        break;
    }

    return { severity: outcome, analysis: analysisText };
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const locationData = await getLocation();
      
      // Random analysis instead of mock fixed value
      const { severity: detectedSeverity, analysis: detectedIssue } = getRandomAnalysis();
      setSeverity(detectedSeverity);
      setAnalysis(detectedIssue);
    } catch (error) {
      alert("Please enable location services to use this app.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (action: 'emergency' | 'non-emergency') => {
    if (action === 'emergency') {
      setFeedbackMessage('Emergency services have been notified.');
    } else {
      setFeedbackMessage('Report sent to 311 services.');
    }
  };

  const handleClose = () => {
    setFeedbackMessage(null);
    setAnalysis(null);
    setSeverity(null);
    setAddress(null);
    selectedImages.forEach(url => URL.revokeObjectURL(url));
    setSelectedImages([]);
    setIssueText('');
  };

  const renderActionButtons = () => {
    switch (severity) {
      case 'emergency':
        return (
          <div className="flex justify-end">
            <button 
              className="warning-button"
              onClick={() => handleAction('emergency')}
            >
              Call 911
            </button>
          </div>
        );
      case 'non-emergency':
        return (
          <div className="flex justify-start">
            <button 
              className="secondary-button"
              onClick={() => handleAction('non-emergency')}
            >
              Report to 311
            </button>
          </div>
        );
      case 'none':
        return (
          <div className="flex justify-center">
            <button 
              className="secondary-button"
              onClick={() => {
                setAnalysis(null);
                setSeverity(null);
              }}
            >
              Close
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const convertToWav = async (audioBlob: Blob): Promise<Blob> => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Create WAV file
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numberOfChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // WAV Header
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Write audio data
    const offset = 44;
    const channelData = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    let index = 0;
    while (index < audioBuffer.length) {
      for (let i = 0; i < numberOfChannels; i++) {
        const sample = channelData[i][index] * 0x7FFF;
        view.setInt16(offset + (index * numberOfChannels + i) * 2, sample < 0 ? Math.max(-0x8000, Math.floor(sample)) : Math.min(0x7FFF, Math.ceil(sample)), true);
      }
      index++;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        try {
          const wavBlob = await convertToWav(audioBlob);
          const result = await transcribeAudio(wavBlob);
          
          if (result.text) {
            setIssueText((prev) => prev + ' ' + result.text.trim());
          } else if (result.error) {
            alert('Failed to transcribe audio. Please try again.');
          }
        } catch (error) {
          console.error('Error processing audio:', error);
          alert('Failed to process audio. Please try again.');
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to access microphone. Please ensure microphone permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 font-[family-name:var(--font-geist-sans)] flex items-center justify-center">
      <main className="flex flex-col items-center gap-8 max-w-4xl w-full">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          AI Civic Watch
        </h1>
        
        <div className="capture-section w-full max-w-2xl">
          <div className="flex flex-col gap-6">
            <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all duration-200">
              <textarea
                className="w-full p-4 bg-transparent resize-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600"
                placeholder="Describe the issue you're reporting..."
                value={issueText}
                onChange={(e) => setIssueText(e.target.value)}
                rows={4}
              />
              <div className="absolute right-3 bottom-3 flex gap-2 items-center">
                <button
                  className={`p-2.5 rounded-full transition-all duration-200 flex items-center justify-center ${
                    isRecording 
                      ? 'bg-error hover:bg-error-hover text-white' 
                      : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  onClick={isRecording ? stopRecording : startRecording}
                  title={isRecording ? "Stop recording" : "Start voice recording"}
                >
                  <svg 
                    className="w-5 h-5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    {isRecording ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 019 14.437V9.564z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    )}
                  </svg>
                </button>

                <button
                  className="p-2.5 rounded-full transition-all duration-200 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload image"
                >
                  <svg 
                    className="w-5 h-5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                    />
                  </svg>
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
              />
            </div>

            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedImages.map((imageUrl, index) => (
                  <div 
                    key={imageUrl} 
                    className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 flex-shrink-0"
                  >
                    <img
                      src={imageUrl}
                      alt={`Selected issue ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      className="absolute top-1 right-1 p-1 rounded-full bg-gray-900/50 hover:bg-gray-900/75 text-white transition-colors"
                      onClick={() => handleRemoveImage(imageUrl)}
                      title="Remove image"
                    >
                      <svg 
                        className="w-3 h-3" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              className="primary-button"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                "Analyze Issue"
              )}
            </button>
          </div>
        </div>

        {analysis && (
          <div className="capture-section w-full max-w-2xl">
            <h2 className="text-2xl font-bold mb-6">Analysis Result</h2>
            {address && (
              <div className="analysis-card">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Location:</span> {address}
                </p>
              </div>
            )}
            <p className="mb-6 text-lg">{analysis}</p>
            {feedbackMessage ? (
              <div className="flex flex-col items-center gap-4">
                <div className="feedback-message">
                  <p>{feedbackMessage}</p>
                </div>
                <button 
                  className="secondary-button"
                  onClick={handleClose}
                >
                  Close
                </button>
              </div>
            ) : (
              renderActionButtons()
            )}
          </div>
        )}
      </main>
    </div>
  );
}
