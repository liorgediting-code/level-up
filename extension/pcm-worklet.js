// AudioWorkletProcessor: resamples mono float audio from the input sample rate
// down to 16 kHz Int16 PCM and posts ~100 ms chunks back to the main thread.
class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate = (options && options.processorOptions && options.processorOptions.targetRate) || 16000;
    this.inRate = sampleRate; // AudioWorkletGlobalScope provides sampleRate
    this.ratio = this.inRate / this.targetRate;

    // Buffer ~100 ms of 16k samples before posting (1600 samples).
    this.chunkSize = 1600;
    this.buf = new Int16Array(this.chunkSize);
    this.bufIdx = 0;

    // Fractional source index for linear interpolation across process() calls.
    this.srcIdx = 0;

    // Tail of previous block, used so interpolation at the boundary works.
    this.prevTail = 0;
    this.hasPrev = false;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    // Downmix to mono by averaging channels.
    const ch0 = input[0];
    if (!ch0) return true;
    const numCh = input.length;
    const inLen = ch0.length;
    if (inLen === 0) return true;

    // Build a virtual mono buffer of length inLen + 1 (with prevTail at index -1
    // conceptually). We index it via a continuous srcIdx that decrements by inLen
    // at the end of each block.
    const getMono = (i) => {
      if (i < 0) return this.hasPrev ? this.prevTail : 0;
      if (i >= inLen) return 0;
      if (numCh === 1) return ch0[i];
      let s = 0;
      for (let c = 0; c < numCh; c++) s += input[c][i];
      return s / numCh;
    };

    // Walk srcIdx from its current value up to inLen, producing output samples.
    let i = this.srcIdx;
    while (i < inLen) {
      const i0 = Math.floor(i);
      const frac = i - i0;
      const s0 = getMono(i0);
      const s1 = getMono(i0 + 1);
      const sample = s0 + (s1 - s0) * frac;

      // Clamp and convert to Int16.
      let v = sample;
      if (v > 1) v = 1; else if (v < -1) v = -1;
      this.buf[this.bufIdx++] = (v * 0x7fff) | 0;

      if (this.bufIdx >= this.chunkSize) {
        // Transfer the underlying buffer.
        const out = this.buf;
        this.buf = new Int16Array(this.chunkSize);
        this.bufIdx = 0;
        this.port.postMessage(out.buffer, [out.buffer]);
      }

      i += this.ratio;
    }
    // Save state for next block.
    this.srcIdx = i - inLen; // carry over fractional position
    this.prevTail = getMono(inLen - 1);
    this.hasPrev = true;

    return true;
  }
}

registerProcessor("pcm-downsampler", PcmDownsampler);
