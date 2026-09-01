import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../config/ai.config';
import type { PodcastVoiceGender } from '@lingua-card/shared/domain';

export interface DialogueInput {
  text: string;
  voiceId: string;
}

export interface ElevenLabsAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface ElevenLabsVoiceSegment {
  voiceId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  characterStartIndex: number;
  characterEndIndex: number;
  dialogueInputIndex: number;
}

export interface ElevenLabsDialogueResult {
  audio: Buffer;
  alignment: ElevenLabsAlignment;
  voiceSegments: ElevenLabsVoiceSegment[];
}

export interface ElevenLabsAlignedWord {
  text: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

interface ElevenLabsVoiceCandidate {
  id: string;
  gender: PodcastVoiceGender;
}

const ELEVENLABS_REQUEST_TIMEOUT_MS = 120_000;

@Injectable()
export class ElevenLabsDialogueAdapter {
  private readonly logger = new Logger(ElevenLabsDialogueAdapter.name);
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly configuredVoiceIds: Readonly<Record<PodcastVoiceGender, readonly string[]>>;
  private discoveredVoices: readonly ElevenLabsVoiceCandidate[] | null = null;

  constructor(config: ConfigService) {
    const ai = config.get<AiConfig>('ai');
    this.apiKey = ai?.elevenLabsApiKey ?? '';
    this.modelId = ai?.elevenLabsDialogueModel ?? 'eleven_v3';
    this.configuredVoiceIds = {
      female: ai?.elevenLabsFemaleVoiceIds ?? [],
      male: ai?.elevenLabsMaleVoiceIds ?? [],
    };
  }

  async resolveVoiceIds(genders: readonly PodcastVoiceGender[]): Promise<readonly string[]> {
    if (!genders.length) return [];
    const configured = selectGenderedVoiceIds(genders, this.configuredVoiceIds, []);
    if (configured) return configured;
    if (!this.apiKey) throw new ServiceUnavailableException('ElevenLabs is not configured');
    if (!this.discoveredVoices) this.discoveredVoices = await this.loadVoices();
    const selected = selectGenderedVoiceIds(
      genders, this.configuredVoiceIds, this.discoveredVoices,
    );
    if (!selected) {
      throw new ServiceUnavailableException(
        'ElevenLabs does not provide enough gender-matched voices for this dialogue',
      );
    }
    return selected;
  }

  private voiceGender(value: unknown): PodcastVoiceGender | null {
    if (!isRecord(value) || !isRecord(value['labels'])) return null;
    const gender = value['labels']['gender'];
    return gender === 'female' || gender === 'male' ? gender : null;
  }

  private voiceCandidate(value: unknown): ElevenLabsVoiceCandidate | null {
    if (!isRecord(value) || typeof value['voice_id'] !== 'string' || !value['voice_id']) return null;
    const gender = this.voiceGender(value);
    if (!gender) return null;
    return { id: value['voice_id'], gender };
  }

  private async loadVoices(): Promise<readonly ElevenLabsVoiceCandidate[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ELEVENLABS_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
        headers: { 'xi-api-key': this.apiKey },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ServiceUnavailableException('Podcast voices could not be loaded from ElevenLabs');
      }
      const value: unknown = await response.json();
      if (!isRecord(value) || !Array.isArray(value['voices'])) {
        throw new ServiceUnavailableException('ElevenLabs returned an invalid voice list');
      }
      const voices = value['voices'].flatMap(voice => {
        const candidate = this.voiceCandidate(voice);
        return candidate ? [candidate] : [];
      });
      return [...new Map(voices.map(voice => [voice.id, voice])).values()]
        .sort((left, right) => left.id.localeCompare(right.id));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Podcast voices could not be loaded from ElevenLabs');
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(inputs: DialogueInput[], languageCode: string): Promise<ElevenLabsDialogueResult> {
    if (!this.apiKey) throw new ServiceUnavailableException('ElevenLabs is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ELEVENLABS_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'xi-api-key': this.apiKey },
          body: JSON.stringify({
            inputs: inputs.map(input => ({ text: input.text, voice_id: input.voiceId })),
            model_id: this.modelId,
            language_code: languageCode,
            apply_text_normalization: 'auto',
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        this.logger.warn(`ElevenLabs dialogue generation failed with status ${response.status}: ${detail}`);
        throw new ServiceUnavailableException('Podcast audio provider rejected the generation request');
      }
      return this.parseResponse(await response.json());
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      throw new ServiceUnavailableException(`ElevenLabs dialogue generation failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async alignAudio(audio: Buffer, text: string): Promise<readonly ElevenLabsAlignedWord[]> {
    if (!this.apiKey) throw new ServiceUnavailableException('ElevenLabs is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ELEVENLABS_REQUEST_TIMEOUT_MS);
    try {
      const body = new FormData();
      body.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'podcast.mp3');
      body.append('text', text);
      const response = await fetch('https://api.elevenlabs.io/v1/forced-alignment', {
        method: 'POST', headers: { 'xi-api-key': this.apiKey }, body, signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        this.logger.warn(`ElevenLabs forced alignment failed with status ${response.status}: ${detail}`);
        throw new ServiceUnavailableException('Podcast audio alignment was rejected by the provider');
      }
      const value: unknown = await response.json();
      const words = isRecord(value) ? parseAlignedWords(value['words']) : null;
      if (!words?.length) {
        throw new ServiceUnavailableException('ElevenLabs returned incomplete word timing data');
      }
      return words;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      throw new ServiceUnavailableException(`ElevenLabs audio alignment failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(value: unknown): ElevenLabsDialogueResult {
    if (!isRecord(value) || typeof value['audio_base64'] !== 'string') {
      throw new ServiceUnavailableException('ElevenLabs returned an invalid audio response');
    }
    const alignment = parseAlignment(value['alignment']);
    const voiceSegments = parseVoiceSegments(value['voice_segments']);
    const encodedAudio = value['audio_base64'];
    if (encodedAudio.length > 20_000_000 || !isBase64(encodedAudio)) {
      throw new ServiceUnavailableException('ElevenLabs returned invalid audio data');
    }
    const audio = Buffer.from(encodedAudio, 'base64');
    if (!audio.length || !alignment || !voiceSegments) {
      throw new ServiceUnavailableException('ElevenLabs returned incomplete timing data');
    }
    return { audio, alignment, voiceSegments };
  }

}

export function selectGenderedVoiceIds(
  genders: readonly PodcastVoiceGender[],
  configured: Readonly<Record<PodcastVoiceGender, readonly string[]>>,
  discovered: readonly ElevenLabsVoiceCandidate[],
): string[] | null {
  const used = new Set<string>();
  const selected: string[] = [];
  for (const gender of genders) {
    const voiceId = configured[gender].find(id => !used.has(id))
      ?? discovered.find(voice => voice.gender === gender && !used.has(voice.id))?.id;
    if (!voiceId) return null;
    used.add(voiceId);
    selected.push(voiceId);
  }
  return selected;
}

function parseAlignment(value: unknown): ElevenLabsAlignment | null {
  if (!isRecord(value)) return null;
  const characters = stringArray(value['characters']);
  const starts = numberArray(value['character_start_times_seconds']);
  const ends = numberArray(value['character_end_times_seconds']);
  if (!characters || !starts || !ends || characters.length !== starts.length
    || starts.length !== ends.length || !isNonDecreasing(starts) || !isNonDecreasing(ends)
    || starts.some((start, index) => start > ends[index])) return null;
  return { characters, characterStartTimesSeconds: starts, characterEndTimesSeconds: ends };
}

function parseVoiceSegments(value: unknown): ElevenLabsVoiceSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments: ElevenLabsVoiceSegment[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const voiceId = item['voice_id'];
    const startTimeSeconds = item['start_time_seconds'];
    const endTimeSeconds = item['end_time_seconds'];
    const characterStartIndex = item['character_start_index'];
    const characterEndIndex = item['character_end_index'];
    const dialogueInputIndex = item['dialogue_input_index'];
    if (typeof voiceId !== 'string' || !voiceId
      || !isNonNegativeNumber(startTimeSeconds) || !isNonNegativeNumber(endTimeSeconds)
      || endTimeSeconds < startTimeSeconds
      || !isNonNegativeInteger(characterStartIndex) || !isNonNegativeInteger(characterEndIndex)
      || characterEndIndex <= characterStartIndex
      || !isNonNegativeInteger(dialogueInputIndex)) return null;
    segments.push({
      voiceId, startTimeSeconds, endTimeSeconds, characterStartIndex,
      characterEndIndex, dialogueInputIndex,
    });
  }
  return segments;
}

function parseAlignedWords(value: unknown): ElevenLabsAlignedWord[] | null {
  if (!Array.isArray(value)) return null;
  const words: ElevenLabsAlignedWord[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const text = item['text'];
    const startTimeSeconds = item['start'];
    const endTimeSeconds = item['end'];
    if (typeof text !== 'string' || !text
      || !isNonNegativeNumber(startTimeSeconds) || !isNonNegativeNumber(endTimeSeconds)
      || endTimeSeconds < startTimeSeconds) return null;
    if (!text.trim()) continue;
    words.push({ text, startTimeSeconds, endTimeSeconds });
  }
  return isNonDecreasing(words.map(word => word.startTimeSeconds)) ? words : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;
}

function numberArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every(
    item => typeof item === 'number' && Number.isFinite(item) && item >= 0,
  ) ? value : null;
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/u.test(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeNumber(value) && Number.isInteger(value);
}

function isNonDecreasing(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < values[index - 1]) return false;
  }
  return true;
}
