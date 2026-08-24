import { describe, expect, it } from 'vitest';

import { makeAudioClipData, makeAudioClip, makeMIDIClip } from './clip';
import { makeNoteEvent } from './midi';
import { createNewProject } from './project';
import { decodeProjectFile, encodeProject, encodeProjectFile } from './serialize';
import { rangeFromBeats } from './time';

/**
 * Hand-written the way Swift's `JSONEncoder` emits it in the 1.0 build: boxed
 * identifiers, enum cases as single-key objects with `_0` for unlabeled
 * payloads, and omitted keys for nil optionals.
 */
const SWIFT_FIXTURE = `{
  "version" : 1,
  "project" : {
    "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000001",
    "name" : "Swift Project",
    "createdAt" : "2026-08-01T10:00:00Z",
    "modifiedAt" : "2026-08-02T11:30:00Z",
    "tempo" : { "bpm" : 128 },
    "timeSignature" : { "numerator" : 3, "denominator" : 4 },
    "tempoChanges" : [
      {
        "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000010",
        "beatPosition" : 16,
        "tempo" : { "bpm" : 140 },
        "curveType" : "step"
      }
    ],
    "timeSignatureChanges" : [],
    "sampleRate" : 48000,
    "tracks" : [
      {
        "id" : { "rawValue" : "B3E9C0F4-1111-4A2B-9C3D-000000000002" },
        "name" : "Drums",
        "type" : "audio",
        "color" : "orange",
        "volume" : 0.5,
        "pan" : -0.25,
        "isMuted" : false,
        "isSolo" : true,
        "isArmed" : false,
        "inputSource" : { "audioDevice" : { "channelIndex" : 2 } },
        "clips" : [
          {
            "id" : { "rawValue" : "B3E9C0F4-1111-4A2B-9C3D-000000000003" },
            "name" : "Loop.wav",
            "timeRange" : {
              "start" : { "samples" : 96000, "sampleRate" : 48000 },
              "duration" : { "samples" : 192000, "sampleRate" : 48000 }
            },
            "content" : {
              "audio" : {
                "_0" : {
                  "fileReference" : {
                    "fileID" : "B3E9C0F4-1111-4A2B-9C3D-000000000004",
                    "originalPath" : "/Users/me/Loop.wav",
                    "relativePath" : "Audio Files/B3E9C0F4-1111-4A2B-9C3D-000000000004.wav",
                    "sampleRate" : 48000,
                    "channelCount" : 2,
                    "lengthInSamples" : 192000,
                    "bitDepth" : 24
                  },
                  "sourceStartSample" : 0,
                  "sourceLengthSamples" : 192000,
                  "pitchShift" : 0,
                  "timeStretch" : 1,
                  "warpMarkers" : [],
                  "preservePitch" : true
                }
              }
            },
            "gain" : 1,
            "fadeInDuration" : 480,
            "fadeOutDuration" : 0,
            "fadeInCurve" : "sCurve",
            "fadeOutCurve" : "linear",
            "isLooped" : false,
            "isMuted" : false,
            "isSelected" : false
          }
        ],
        "pluginSlots" : [],
        "automationLanes" : [
          {
            "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000005",
            "parameter" : { "volume" : {} },
            "points" : [
              {
                "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000006",
                "beatPosition" : 4,
                "value" : 0.8,
                "curveType" : "linear"
              }
            ],
            "isEnabled" : true,
            "isVisible" : false,
            "height" : 60
          },
          {
            "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000011",
            "parameter" : { "plugin" : { "slotIndex" : 1, "parameterID" : "cutoff" } },
            "points" : [],
            "isEnabled" : true,
            "isVisible" : false,
            "height" : 60
          }
        ],
        "isAutomationVisible" : false,
        "height" : 80,
        "isExpanded" : true
      },
      {
        "id" : { "rawValue" : "B3E9C0F4-1111-4A2B-9C3D-000000000007" },
        "name" : "Keys",
        "type" : "midi",
        "color" : "green",
        "volume" : 0.7937,
        "pan" : 0,
        "isMuted" : false,
        "isSolo" : false,
        "isArmed" : true,
        "midiOutput" : {
          "rackInstrument" : { "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000008", "channel" : 3 }
        },
        "clips" : [
          {
            "id" : { "rawValue" : "B3E9C0F4-1111-4A2B-9C3D-000000000009" },
            "name" : "Chords",
            "color" : "purple",
            "timeRange" : {
              "start" : { "samples" : 0, "sampleRate" : 48000 },
              "duration" : { "samples" : 96000, "sampleRate" : 48000 }
            },
            "content" : {
              "midi" : {
                "_0" : {
                  "events" : [
                    {
                      "id" : "B3E9C0F4-1111-4A2B-9C3D-00000000000A",
                      "beatPosition" : 0,
                      "type" : {
                        "note" : {
                          "_0" : { "pitch" : 60, "velocity" : 96, "duration" : 1 }
                        }
                      },
                      "channel" : 0
                    },
                    {
                      "id" : "B3E9C0F4-1111-4A2B-9C3D-00000000000B",
                      "beatPosition" : 1,
                      "type" : { "controlChange" : { "controller" : 74, "value" : 100 } },
                      "channel" : 2
                    }
                  ],
                  "originalTempo" : 128
                }
              }
            },
            "gain" : 1,
            "fadeInDuration" : 0,
            "fadeOutDuration" : 0,
            "fadeInCurve" : "linear",
            "fadeOutCurve" : "linear",
            "isLooped" : true,
            "loopLength" : { "samples" : 48000, "sampleRate" : 48000 },
            "isMuted" : false,
            "isSelected" : true
          }
        ],
        "pluginSlots" : [
          {
            "id" : "B3E9C0F4-1111-4A2B-9C3D-00000000000C",
            "pluginID" : {
              "type" : "vst3Effect",
              "manufacturer" : "Acme",
              "name" : "Reverb",
              "uniqueID" : "ACME-REV-1"
            },
            "isEnabled" : true,
            "parameterValues" : { "mix" : 0.3 },
            "stateData" : "AAEC"
          }
        ],
        "automationLanes" : [],
        "isAutomationVisible" : false,
        "height" : 80,
        "isExpanded" : true
      }
    ],
    "masterTrack" : {
      "id" : { "rawValue" : "B3E9C0F4-1111-4A2B-9C3D-00000000000D" },
      "name" : "Master",
      "type" : "master",
      "color" : "gray",
      "volume" : 1,
      "pan" : 0,
      "isMuted" : false,
      "isSolo" : false,
      "isArmed" : false,
      "clips" : [],
      "pluginSlots" : [],
      "automationLanes" : [],
      "isAutomationVisible" : false,
      "height" : 80,
      "isExpanded" : true
    },
    "vRack" : {
      "instruments" : [
        {
          "id" : "B3E9C0F4-1111-4A2B-9C3D-000000000008",
          "name" : "Grand Piano",
          "pluginSlot" : {
            "id" : "B3E9C0F4-1111-4A2B-9C3D-00000000000E",
            "isEnabled" : true,
            "parameterValues" : {}
          },
          "volume" : 0.7937,
          "isMuted" : false
        }
      ]
    },
    "markers" : [
      {
        "id" : "B3E9C0F4-1111-4A2B-9C3D-00000000000F",
        "name" : "Chorus",
        "beatPosition" : 32,
        "color" : "pink",
        "type" : "chorus"
      }
    ],
    "loopRegion" : {
      "start" : { "samples" : 0, "sampleRate" : 48000 },
      "duration" : { "samples" : 384000, "sampleRate" : 48000 }
    },
    "isLoopEnabled" : true,
    "audioFiles" : [
      {
        "fileID" : "B3E9C0F4-1111-4A2B-9C3D-000000000004",
        "originalPath" : "/Users/me/Loop.wav",
        "relativePath" : "Audio Files/B3E9C0F4-1111-4A2B-9C3D-000000000004.wav",
        "sampleRate" : 48000,
        "channelCount" : 2,
        "lengthInSamples" : 192000,
        "bitDepth" : 24
      }
    ],
    "metadata" : {
      "artist" : "Me",
      "album" : "Demos",
      "genre" : "Electronic",
      "comments" : "",
      "copyright" : ""
    },
    "dawState" : {
      "showVRack" : true,
      "showMixer" : false,
      "showInspector" : true,
      "zoomLevel" : 1.5,
      "horizontalScrollOffset" : 120,
      "verticalScrollOffset" : 0,
      "selectedTrackID" : { "rawValue" : "B3E9C0F4-1111-4A2B-9C3D-000000000007" },
      "playheadPosition" : 8,
      "openPluginWindows" : [
        {
          "id" : "B3E9C0F4-1111-4A2B-9C3D-00000000000C",
          "windowFrame" : {
            "origin" : { "x" : 100, "y" : 200 },
            "size" : { "width" : 640, "height" : 480 }
          },
          "isRackInstrument" : false,
          "trackID" : "B3E9C0F4-1111-4A2B-9C3D-000000000007"
        }
      ]
    },
    "formatVersion" : 1
  },
  "audioFileManifest" : [
    {
      "fileID" : "B3E9C0F4-1111-4A2B-9C3D-000000000004",
      "relativePath" : "Audio Files/B3E9C0F4-1111-4A2B-9C3D-000000000004.wav",
      "originalPath" : "/Users/me/Loop.wav"
    }
  ],
  "pluginStates" : []
}`;

describe('reading a project written by the macOS 1.0 build', () => {
  const { version, project } = decodeProjectFile(SWIFT_FIXTURE);

  it('reads the envelope version', () => {
    expect(version).toBe(1);
  });

  it('unwraps boxed track and clip identifiers into flat strings', () => {
    expect(project.tracks[0].id).toBe('B3E9C0F4-1111-4A2B-9C3D-000000000002');
    expect(project.tracks[0].clips[0].id).toBe('B3E9C0F4-1111-4A2B-9C3D-000000000003');
    expect(project.dawState.selectedTrackID).toBe('B3E9C0F4-1111-4A2B-9C3D-000000000007');
  });

  it('reads project chrome', () => {
    expect(project.name).toBe('Swift Project');
    expect(project.tempo.bpm).toBe(128);
    expect(project.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(project.sampleRate).toBe(48000);
    expect(project.tempoChanges[0].tempo.bpm).toBe(140);
    expect(project.markers[0].type).toBe('chorus');
    expect(project.isLoopEnabled).toBe(true);
    expect(project.loopRegion?.duration.samples).toBe(384000);
  });

  it('reads an audio clip out of the enum payload', () => {
    const clip = project.tracks[0].clips[0];
    expect(clip.content.kind).toBe('audio');
    if (clip.content.kind !== 'audio') throw new Error('expected audio content');

    expect(clip.content.audio.fileReference.relativePath).toBe(
      'Audio Files/B3E9C0F4-1111-4A2B-9C3D-000000000004.wav'
    );
    expect(clip.content.audio.preservePitch).toBe(true);
    expect(clip.fadeInCurve).toBe('sCurve');
    expect(clip.fadeInDuration).toBe(480);
  });

  it('reads MIDI events including labeled enum payloads', () => {
    const clip = project.tracks[1].clips[0];
    if (clip.content.kind !== 'midi') throw new Error('expected midi content');

    const [note, cc] = clip.content.midi.events;
    expect(note.type).toEqual({
      kind: 'note',
      note: { pitch: 60, velocity: 96, duration: 1 }
    });
    expect(cc.type).toEqual({ kind: 'controlChange', controller: 74, value: 100 });
    expect(clip.content.midi.originalTempo).toBe(128);
    expect(clip.loopLength?.samples).toBe(48000);
    expect(clip.color).toBe('purple');
  });

  it('reads routing enums', () => {
    expect(project.tracks[0].inputSource).toEqual({ kind: 'audioDevice', channelIndex: 2 });
    expect(project.tracks[1].midiOutput).toEqual({
      kind: 'rackInstrument',
      id: 'B3E9C0F4-1111-4A2B-9C3D-000000000008',
      channel: 3
    });
  });

  it('reads automation parameters with and without payloads', () => {
    const lanes = project.tracks[0].automationLanes;
    expect(lanes[0].parameter).toEqual({ kind: 'volume' });
    expect(lanes[0].points[0].value).toBeCloseTo(0.8);
    expect(lanes[1].parameter).toEqual({ kind: 'plugin', slotIndex: 1, parameterID: 'cutoff' });
  });

  it('reads plugin slots and the V-Rack', () => {
    const slot = project.tracks[1].pluginSlots[0];
    expect(slot.pluginID?.name).toBe('Reverb');
    expect(slot.parameterValues.mix).toBeCloseTo(0.3);
    expect(slot.stateData).toBe('AAEC');
    expect(project.vRack.instruments[0].name).toBe('Grand Piano');
  });

  it('reads the plugin window rect', () => {
    expect(project.dawState.openPluginWindows[0].windowFrame).toEqual({
      origin: { x: 100, y: 200 },
      size: { width: 640, height: 480 }
    });
  });

  it('leaves omitted optionals undefined instead of inventing values', () => {
    expect(project.tracks[0].midiOutput).toBeUndefined();
    expect(project.tracks[0].instrumentSlot).toBeUndefined();
    expect(project.tracks[1].inputSource).toBeUndefined();
    expect(project.tracks[0].clips[0].loopLength).toBeUndefined();
  });
});

describe('writing a project back out', () => {
  it('re-emits the Swift shapes so the 1.0 build can read it', () => {
    const { project } = decodeProjectFile(SWIFT_FIXTURE);
    const json = JSON.parse(encodeProjectFile(project));

    expect(json.version).toBe(1);
    expect(json.project.tracks[0].id).toEqual({
      rawValue: 'B3E9C0F4-1111-4A2B-9C3D-000000000002'
    });
    expect(json.project.tracks[0].clips[0].content.audio._0.preservePitch).toBe(true);
    expect(json.project.tracks[1].clips[0].content.midi._0.events[0].type.note._0.pitch).toBe(60);
    expect(json.project.tracks[1].midiOutput.rackInstrument.channel).toBe(3);
    expect(json.project.tracks[0].automationLanes[0].parameter).toEqual({ volume: {} });
    expect(json.project.dawState.selectedTrackID).toEqual({
      rawValue: 'B3E9C0F4-1111-4A2B-9C3D-000000000007'
    });
    expect(json.audioFileManifest[0].fileID).toBe('B3E9C0F4-1111-4A2B-9C3D-000000000004');
  });

  it('omits nil optionals rather than writing null', () => {
    const { project } = decodeProjectFile(SWIFT_FIXTURE);
    const json = JSON.parse(encodeProjectFile(project));
    const audioTrack = json.project.tracks[0];

    expect('midiOutput' in audioTrack).toBe(false);
    expect('instrumentSlot' in audioTrack).toBe(false);
    expect('loopLength' in audioTrack.clips[0]).toBe(false);
  });

  it('uses sorted keys and Swift pretty-printed spacing', () => {
    const text = encodeProjectFile(createNewProject('Sorted'));
    expect(text).toContain('"audioFileManifest" : ');
    expect(text.indexOf('"audioFileManifest"')).toBeLessThan(text.indexOf('"pluginStates"'));
  });

  it('survives a full round trip without drift', () => {
    const { project } = decodeProjectFile(SWIFT_FIXTURE);
    const again = decodeProjectFile(encodeProjectFile(project)).project;
    expect(again).toEqual(project);
  });

  it('round-trips a freshly created project with audio and MIDI clips', () => {
    const project = createNewProject('New Song');
    const bpm = project.tempo.bpm;

    project.tracks[1].clips.push(
      makeMIDIClip('Riff', rangeFromBeats(0, 4, bpm), [
        makeNoteEvent(0, 64, 110, 0.5),
        makeNoteEvent(1.5, 67, 90, 0.25)
      ])
    );

    project.tracks[0].clips.push(
      makeAudioClip(
        'Kick',
        rangeFromBeats(2, 2, bpm),
        makeAudioClipData({
          fileID: 'C0000000-0000-4000-8000-000000000001',
          originalPath: 'C:/audio/kick.wav',
          relativePath: 'Audio Files/C0000000-0000-4000-8000-000000000001.wav',
          sampleRate: 44100,
          channelCount: 1,
          lengthInSamples: 22050,
          bitDepth: 16
        })
      )
    );

    const again = decodeProjectFile(encodeProjectFile(project)).project;
    expect(again).toEqual(project);
  });

  it('accepts a bare project object without the envelope', () => {
    const project = createNewProject('Legacy');
    const bare = JSON.stringify(encodeProject(project));
    expect(decodeProjectFile(bare).project.name).toBe('Legacy');
  });

  it('rejects malformed input with a clear message', () => {
    expect(() => decodeProjectFile('not json')).toThrow(/Invalid project file/);
    expect(() => decodeProjectFile('{"project":{"id":"x","content":1}}')).toThrow(
      /Invalid project file/
    );
  });
});
