/**
 * Claude via the existing Supabase `claude-proxy`, with a local API-key fallback.
 * Port of DAWCore/AI/ClaudeService.swift.
 */

import { noteName } from '$lib/core/midi';
import {
  claudeProxyURL,
  isClaudeConfigured,
  isSupabaseConfigured,
  readAIConfig
} from './config';
import { parseNotesFromResponse } from './parse';
import { AIServiceError, type GeneratedMIDINote, type MIDIGenerationResult, type TrackNoteContext } from './types';

const MODEL = 'claude-sonnet-4-20250514';

async function postClaude(body: Record<string, unknown>): Promise<string> {
  if (!isClaudeConfigured()) {
    throw new AIServiceError(
      'Claude is not configured. Add a Supabase URL in the AI panel, or a local Anthropic key.'
    );
  }

  const { supabaseAnonKey, anthropicKey } = readAIConfig();
  const proxy = claudeProxyURL();

  let response: Response;
  try {
    if (isSupabaseConfigured() && proxy) {
      response = await fetch(proxy, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify(body)
      });
    } else {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
    }
  } catch (error) {
    throw new AIServiceError(`Network error talking to Claude: ${(error as Error).message}`);
  }

  const json = (await response.json().catch(() => null)) as
    | { content?: { type: string; text?: string }[]; error?: { message?: string } | string }
    | null;

  if (!response.ok) {
    const message =
      typeof json?.error === 'string'
        ? json.error
        : json?.error && typeof json.error === 'object'
          ? (json.error.message ?? JSON.stringify(json.error))
          : `HTTP ${response.status}`;
    throw new AIServiceError(`Claude error: ${message}`);
  }

  const text = json?.content?.find((block) => block.type === 'text')?.text;
  if (!text) throw new AIServiceError('Claude returned an empty reply');
  return text;
}

function notesBlock(tracks: TrackNoteContext[]): string {
  if (tracks.length === 0) {
    return 'This is the first MIDI on the timeline — establish the musical foundation.';
  }

  return tracks
    .map((track) => {
      const lines = track.notes.slice(0, 50).map((note) => {
        return `  - ${noteName(note.pitch)} at beat ${note.start.toFixed(2)}, duration ${note.duration.toFixed(2)}`;
      });
      const extra = track.notes.length > 50 ? `\n  ... and ${track.notes.length - 50} more notes` : '';
      return `${track.trackName}:\n${lines.join('\n')}${extra}`;
    })
    .join('\n\n');
}

function generateSystemPrompt(
  beatCount: number,
  tempo: number,
  timeSignature: { numerator: number; denominator: number },
  otherTracks: TrackNoteContext[]
): string {
  return `You are a professional MIDI composer. Generate MIDI note data that works musically with existing content.

Musical Context:
- Tempo: ${tempo} BPM
- Time Signature: ${timeSignature.numerator}/${timeSignature.denominator}
- Duration: ${beatCount} beats (beat 0.0 to ${beatCount}.0)

EXISTING MIDI ON OTHER TRACKS (you MUST compose to complement this):
${notesBlock(otherTracks)}

CRITICAL COMPOSITION RULES:
1. Analyze the existing notes to determine the key/scale being used
2. Your new notes MUST be in the same key and harmonize with the existing content
3. Choose a complementary register
4. Match the rhythmic feel
5. Avoid playing the exact same notes at the same time unless doubling

IMPORTANT: You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "notes": [
    {"pitch": 60, "start": 0.0, "duration": 1.0, "velocity": 100}
  ]
}

Rules:
- pitch: MIDI note number 0-127 (60 = C4)
- start: Beat position (0.0 = start, must be less than ${beatCount})
- duration: Length in beats
- velocity: 1-127
Respond with ONLY the JSON, no explanation or markdown.`;
}

function editSystemPrompt(
  current: GeneratedMIDINote[],
  beatCount: number,
  tempo: number,
  timeSignature: { numerator: number; denominator: number },
  otherTracks: TrackNoteContext[]
): string {
  const currentBlock = current
    .map(
      (n) =>
        `{"pitch": ${n.pitch}, "start": ${n.start.toFixed(3)}, "duration": ${n.duration.toFixed(3)}, "velocity": ${n.velocity}}`
    )
    .join(',\n  ');

  return `You are editing an existing MIDI region. Rewrite the notes according to the user's instructions, keeping the same duration.

Tempo: ${tempo} BPM
Time signature: ${timeSignature.numerator}/${timeSignature.denominator}
Region length: ${beatCount} beats (0.0 to ${beatCount}.0)

CURRENT NOTES IN THE SELECTION:
[
  ${currentBlock}
]

OTHER TRACKS:
${notesBlock(otherTracks)}

Return the full replacement set of notes as JSON only:
{"notes": [{"pitch": 60, "start": 0.0, "duration": 1.0, "velocity": 100}]}`;
}

export async function generateMIDI(options: {
  prompt: string;
  beatCount: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  otherTracks: TrackNoteContext[];
}): Promise<MIDIGenerationResult> {
  const text = await postClaude({
    model: MODEL,
    max_tokens: 4096,
    system: generateSystemPrompt(
      options.beatCount,
      options.tempo,
      options.timeSignature,
      options.otherTracks
    ),
    messages: [{ role: 'user', content: options.prompt }]
  });

  return {
    notes: parseNotesFromResponse(text),
    suggestedName: options.prompt.slice(0, 20)
  };
}

export async function editMIDI(options: {
  prompt: string;
  currentNotes: GeneratedMIDINote[];
  beatCount: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  otherTracks: TrackNoteContext[];
}): Promise<MIDIGenerationResult> {
  const text = await postClaude({
    model: MODEL,
    max_tokens: 4096,
    system: editSystemPrompt(
      options.currentNotes,
      options.beatCount,
      options.tempo,
      options.timeSignature,
      options.otherTracks
    ),
    messages: [{ role: 'user', content: options.prompt }]
  });

  return {
    notes: parseNotesFromResponse(text),
    suggestedName: `Edited: ${options.prompt.slice(0, 15)}`
  };
}

export async function chatWithClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  system: string
): Promise<string> {
  return postClaude({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages
  });
}
