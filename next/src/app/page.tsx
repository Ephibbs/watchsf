'use client';

import { useState, useRef } from "react";
import { transcribeAudio } from './actions';

interface EvaluationResponse {
  level: 'EMERGENCY' | 'NON_EMERGENCY' | 'NO_CONCERN';
  confidence: number;
  reasoning: string;
  recommended_action: string;
  trigger: '911' | '311' | 'NONE';
  report_data: object;
}

export default function Home() {
  const [issueText, setIssueText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [severity, setSeverity] = useState<'EMERGENCY' | 'NON_EMERGENCY' | 'NO_CONCERN' | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<EvaluationResponse | null>(null);

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

  const getAnalysis = async (
    text: string,
    location: { lat: number; lon: number; address?: string },
    images: string[]
  ): Promise<EvaluationResponse> => {
    try {
      // Convert first image URL to base64 if it exists
      let imageData = null;
      if (images.length > 0) {
        const response = await fetch(images[0]);
        const blob = await response.blob();
        const reader = new FileReader();
        imageData = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            // Remove data:image/jpeg;base64, prefix as backend expects raw base64
            const base64String = reader.result as string;
            const base64Data = base64String.split(',')[1];
            resolve(base64Data);
          };
          reader.readAsDataURL(blob);
        });
      }

      // Create FormData object
      const formData = new FormData();
      formData.append('text', text);
      formData.append('location', `${location.address || `${location.lat},${location.lon}`}`);
      
      if (imageData) {
        // Convert base64 back to blob for FormData
        const byteCharacters = atob(imageData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        formData.append('image', blob, 'image.jpg');
      }

      const response = await fetch('http://localhost:8000/evaluate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to get analysis');
      }
      const data = await response.json();
      setAnalysisResult(data);
      console.log('Analysis response:', data);
      return data;
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
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
      const result = await getAnalysis(issueText, locationData, selectedImages);
      setSeverity(result.level);
      setAnalysis(result.reasoning);
      
      // Only hide form after we have the result
      setTimeout(() => {
        setShowForm(false);
        setShowAnalysis(true);
      }, 300);
    } catch (error) {
      console.error(error);
      alert("An error occurred while analyzing the issue.");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmAlert = async (isEmergency: boolean) => {
    try {
      // Convert first image to base64 if it exists
      let imageBase64 = null;
      if (selectedImages.length > 0) {
        const response = await fetch(selectedImages[0]);
        const blob = await response.blob();
        const reader = new FileReader();
        imageBase64 = await new Promise((resolve) => {
          reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove data URL prefix
            resolve(base64String.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });
      }
      const url = isEmergency ? 'http://localhost:8000/confirm-911' : 'http://localhost:8000/confirm-311';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_data: analysisResult?.report_data,
          image_base64: imageBase64
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit 311 report');
      }

      const result = await response.json();
      console.log('Confirmation result:', result);
      if (isEmergency) {
        setFeedbackMessage('Emergency services have been notified.');
      } else {
        setFeedbackMessage('Report sent to 311 services.');
      }
    } catch (error) {
      console.error('Error submitting 311 report:', error);
      alert('Failed to submit 311 report. Please try again.');
    }
  }

  const handleAction = async (action: 'emergency' | 'non-emergency') => {
    if (action === 'emergency') {
      await confirmAlert(true);
    } else {
      await confirmAlert(false);
    }
  };

  const handleClose = () => {
    setShowAnalysis(false);
    setTimeout(() => {
      setFeedbackMessage(null);
      setAnalysis(null);
      setSeverity(null);
      setAddress(null);
      selectedImages.forEach(url => URL.revokeObjectURL(url));
      setSelectedImages([]);
      setIssueText('');
      setShowForm(true);
    }, 300);
  };

  const renderActionButtons = () => {
    switch (severity) {
      case 'EMERGENCY':
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
      case 'NON_EMERGENCY':
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
      case 'NO_CONCERN':
        return (
          <div className="flex justify-center">
            <button 
              className="secondary-button"
              onClick={handleClose}
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
    <div className="min-h-screen font-[family-name:var(--font-geist-sans)] bg-contain bg-center bg-no-repeat" 
         style={{ backgroundImage: 'url("/originalevan_simple_digital_icon_of_the_golden_gate_bridge_--_0f9cbc8b-0951-450d-ae37-143e8f76c577_0.svg")', backgroundSize: '95vh' }}>
      <div className="min-h-screen bg-white/30">
        <header className="w-full py-4 px-8 fixed top-0 z-50">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-red-300 to-red-400 bg-clip-text text-transparent">
              AI Civic Watch
            </h1>
            <nav className="flex gap-4">
              <a href="#" className="text-gray-600 hover:text-primary transition-colors">About</a>
              <a href="#" className="text-gray-600 hover:text-primary transition-colors">Contact</a>
            </nav>
          </div>
        </header>
        <main className="min-h-screen grid place-items-center max-w-4xl mx-auto p-4 sm:p-8">
            {showForm && (
              <div className={`capture-section w-full max-w-2xl transition-all duration-300 ease-in-out ${
              showForm ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-4 invisible'
            }`}>
              <h1 className="text-3xl font-bold bg-gray-900 bg-clip-text text-transparent text-center drop-shadow-[0_1px_1px_rgba(255,255,255,1)] mb-6">
                What are you reporting?
              </h1>
              <div className="flex flex-col gap-6">
                <div className="bg-white relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all duration-200">
                  <textarea
                    className="w-full p-4 bg-transparent resize-none outline-none text-gray-900 placeholder-gray-400 dark:placeholder-gray-600"
                    placeholder="Describe the issue..."
                    value={issueText}
                    onChange={(e) => setIssueText(e.target.value)}
                    rows={4}
                  />
                  <div className="absolute right-3 bottom-3 flex gap-2 items-center">
                    <button
                      className={`p-2.5 rounded-full transition-all duration-200 flex items-center justify-center ${
                        isRecording 
                          ? 'bg-error hover:bg-error-hover text-white' 
                          : 'bg-gray-100 hover:bg-gray-200'
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
                      className="p-2.5 rounded-full transition-all duration-200 flex items-center justify-center bg-gray-100 hover:bg-gray-200"
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

                    <button
                      className="p-2.5 rounded-full transition-all duration-200 flex items-center justify-center bg-primary hover:bg-primary-hover text-white"
                      onClick={handleSubmit}
                      disabled={isLoading}
                      title="Analyze Issue"
                    >
                      {isLoading ? (
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg 
                          className="w-5 h-5" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      )}
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
              </div>
              </div>
            )}
            {analysis && (
              <div className={`capture-section w-full max-w-2xl transition-all duration-300 ease-in-out ${
                showAnalysis ? 'opacity-100 translate-y-0 visible z-20' : 'opacity-0 translate-y-4 invisible z-0'
              }`}>
                <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <button 
                      onClick={handleClose}
                      className="text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-2"
                    >
                      <svg 
                        className="w-5 h-5" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                      </svg>
                      Back
                    </button>
                    <h2 className="text-2xl font-bold">Analysis Result</h2>
                  </div>
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
                    </div>
                  ) : (
                    renderActionButtons()
                  )}
                </div>
              </div>
            )}
        </main>
      </div>
    </div>
  );
}
