/** Shared types for the assistant and Generative Fill. */

export type AIAudioModel = 'elevenlabs_sfx' | 'elevenlabs_music' | 'minimax_music';

export const AI_AUDIO_MODELS: {
  id: AIAudioModel;
  label: string;
  description: string;
  provider: string;
}[] = [
  {
    id: 'elevenlabs_sfx',
    label: 'ElevenLabs Sound Effects',
    description: 'Short sounds, hits, textures, foley',
    provider: 'ElevenLabs'
  },
  {
    id: 'elevenlabs_music',
    label: 'ElevenLabs Music',
    description: 'Musical loops, melodies, compositions',
    provider: 'ElevenLabs'
  },
  {
    id: 'minimax_music',
    label: 'MiniMax Music',
    description: 'Full songs with vocals and instruments',
    provider: 'MiniMax'
  }
];

export interface GeneratedMIDINote {
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface MIDIGenerationResult {
  notes: GeneratedMIDINote[];
  suggestedName: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
}

export interface TrackNoteContext {
  trackName: string;
  notes: GeneratedMIDINote[];
}

export class AIServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIServiceError';
  }
}
