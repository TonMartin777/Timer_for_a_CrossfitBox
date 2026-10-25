// Web Audio API Synthesizer for CrossFit Box Timer Sound Cues

class GymAudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Ignore if called outside a user gesture; unlockAudio() handles gesture unlock
      });
    }

    return this.ctx;
  }

  public async unlockAudio(): Promise<boolean> {
    const ctx = this.getContext();
    if (!ctx) return false;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Play an ultra-short silent buffer to unlock iOS/Android Safari & Chrome audio
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      return ctx.state === 'running';
    } catch (err) {
      console.warn('Could not unlock Web Audio Context:', err);
      return false;
    }
  }

  public getAudioState(): 'running' | 'suspended' | 'unsupported' {
    if (typeof window === 'undefined') return 'unsupported';
    if (!this.ctx) return 'suspended';
    return this.ctx.state === 'running' ? 'running' : 'suspended';
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private playTone(
    frequency: number,
    durationMs: number,
    type: OscillatorType = 'sawtooth',
    gainPeak: number = 0.35,
    startTimeOffsetSec: number = 0
  ): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const startTime = ctx.currentTime + startTimeOffsetSec;
    const durationSec = durationMs / 1000;

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    // Add a subtle harmonic layer so the beep cuts through loud gym music
    subOsc.type = 'square';
    subOsc.frequency.setValueAtTime(frequency * 0.5, startTime);

    gainNode.gain.setValueAtTime(0.001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gainPeak, startTime + 0.015);
    gainNode.gain.setValueAtTime(gainPeak, startTime + Math.max(0.02, durationSec - 0.04));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(gainNode);
    subOsc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startTime);
    subOsc.start(startTime);
    osc.stop(startTime + durationSec);
    subOsc.stop(startTime + durationSec);
  }

  /**
   * Short crisp beep for the 3 - 2 - 1 pre-workout countdown
   */
  public playCountdownBeep(): void {
    this.playTone(880, 160, 'square', 0.3);
  }

  /**
   * Long energetic high beep on workout START ("GO!")
   */
  public playStartHorn(): void {
    this.playTone(1046.5, 650, 'sawtooth', 0.42);
  }

  /**
   * Crisp interval beep at the start of every new EMOM minute boundary
   */
  public playEmomMinuteBeep(): void {
    this.playTone(987.77, 180, 'square', 0.38, 0);
    this.playTone(1318.5, 320, 'sawtooth', 0.4, 0.2);
  }

  /**
   * Loud long buzzer when workout reaches TIME CAP / 00:00 (FINISH)
   */
  public playFinishHorn(): void {
    this.playTone(587.33, 1100, 'sawtooth', 0.48, 0);
    this.playTone(880, 1100, 'square', 0.35, 0);
  }
}

export const gymAudio = new GymAudioManager();

