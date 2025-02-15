'use server'

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(audioBlob: Blob) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    const response = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: 'whisper-1',
    });

    return { text: response.text };
  } catch (error) {
    console.error('Transcription error:', error);
    return { error: 'Failed to transcribe audio' };
  }
} 