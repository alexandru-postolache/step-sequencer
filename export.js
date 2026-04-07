/**
 * MIDI (type 0) and WAV export helpers for the step sequencer.
 * WAV uses the same tidal-drum-machines samples as Strudel.
 * Timing: one pattern loop = one bar = measure × (60 / bpm) seconds (matches play() cpm).
 */
const SequencerExport = (function () {
  const SAMPLE_MANIFEST_URL =
    'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json';

  const GM_DRUM_MAP = {
    bd: 36,
    sd: 38,
    hh: 42,
    oh: 46,
    rd: 51,
    lt: 45,
    mt: 47,
    ht: 50,
    cr: 49,
    cp: 39,
  };

  const TICKS_PER_QUARTER = 480;
  const DRUM_CHANNEL = 9;
  const NOTE_OFF_DELTA_TICKS = 24;

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function encodeVarLen(n) {
    const bytes = [];
    bytes.push(n & 0x7f);
    n >>= 7;
    while (n > 0) {
      bytes.unshift((n & 0x7f) | 0x80);
      n >>= 7;
    }
    return bytes;
  }

  function writeMidiType0({ bpm, measure, stepsPerCycle, instruments, activeSteps, loopCount }) {
    const ticksPerBar = measure * TICKS_PER_QUARTER;
    const microsPerQuarter = Math.round(60000000 / bpm);

    const events = [];
    for (let loop = 0; loop < loopCount; loop++) {
      const barOffset = loop * ticksPerBar;
      for (const inst of instruments) {
        const note = GM_DRUM_MAP[inst];
        if (note === undefined) continue;
        const steps = activeSteps[inst] || [];
        for (const step of steps) {
          const tick = barOffset + Math.round((step / stepsPerCycle) * ticksPerBar);
          events.push({ tick, kind: 'on', note });
          events.push({ tick: tick + NOTE_OFF_DELTA_TICKS, kind: 'off', note });
        }
      }
    }

    events.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.kind === 'on' ? -1 : 1;
    });

    const trackData = [];

    trackData.push(0x00, 0xff, 0x58, 0x04, measure & 0xff, 0x02, 0x18, 0x08);

    trackData.push(0x00, 0xff, 0x51, 0x03);
    trackData.push(
      (microsPerQuarter >> 16) & 0xff,
      (microsPerQuarter >> 8) & 0xff,
      microsPerQuarter & 0xff
    );

    let prevTick = 0;
    const statusOn = 0x90 | DRUM_CHANNEL;
    const statusOff = 0x80 | DRUM_CHANNEL;

    for (const ev of events) {
      const delta = ev.tick - prevTick;
      prevTick = ev.tick;
      trackData.push(...encodeVarLen(delta));
      if (ev.kind === 'on') {
        trackData.push(statusOn, ev.note & 0x7f, 0x64);
      } else {
        trackData.push(statusOff, ev.note & 0x7f, 0x00);
      }
    }

    trackData.push(0x00, 0xff, 0x2f, 0x00);

    const trackLen = trackData.length;
    const headerLen = 6;
    const file = new Uint8Array(8 + 4 + headerLen + 8 + 4 + trackLen);

    let o = 0;
    const w32 = (v) => {
      file[o++] = (v >> 24) & 0xff;
      file[o++] = (v >> 16) & 0xff;
      file[o++] = (v >> 8) & 0xff;
      file[o++] = v & 0xff;
    };
    const w16 = (v) => {
      file[o++] = (v >> 8) & 0xff;
      file[o++] = v & 0xff;
    };

    file.set([0x4d, 0x54, 0x68, 0x64], o);
    o += 4;
    w32(6);
    w16(0);
    w16(1);
    w16(TICKS_PER_QUARTER);

    file.set([0x4d, 0x54, 0x72, 0x6b], o);
    o += 4;
    w32(trackLen);
    file.set(trackData, o);

    return new Blob([file], { type: 'audio/midi' });
  }

  function encodeWavFromBuffer(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const interleaved = new Float32Array(length * numChannels);
    for (let ch = 0; ch < numChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        interleaved[i * numChannels + ch] = data[i];
      }
    }

    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = interleaved.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const s = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(
        offset,
        s < 0 ? s * 0x8000 : s * 0x7fff,
        true
      );
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  let manifestCache = null;

  async function loadSampleManifest() {
    if (manifestCache) return manifestCache;
    const res = await fetch(SAMPLE_MANIFEST_URL);
    if (!res.ok) throw new Error('Could not load sample list');
    manifestCache = await res.json();
    return manifestCache;
  }

  async function decodeSample(offline, url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sample failed: ${url}`);
    const arr = await res.arrayBuffer();
    return offline.decodeAudioData(arr.slice(0));
  }

  async function renderWavBlob({
    bank,
    measure,
    bpm,
    stepsPerCycle,
    instruments,
    activeSteps,
    loopCount,
    sampleRate,
    perVoiceGain,
  }) {
    const manifest = await loadSampleManifest();
    const base = manifest._base;
    const cycleSec = measure * (60 / bpm);
    const stepSec = cycleSec / stepsPerCycle;
    const tailSec = 0.35;
    const totalSec = cycleSec * loopCount + tailSec;
    const frameCount = Math.ceil(totalSec * sampleRate);

    const offline = new OfflineAudioContext(2, frameCount, sampleRate);

    const buffers = new Map();
    const loadKey = async (key) => {
      if (buffers.has(key)) return buffers.get(key);
      const paths = manifest[key];
      if (!paths || !paths.length) throw new Error(`Unknown sample key: ${key}`);
      const url = base + paths[0];
      const buf = await decodeSample(offline, url);
      buffers.set(key, buf);
      return buf;
    };

    const gain = offline.createGain();
    gain.gain.value = perVoiceGain;
    gain.connect(offline.destination);

    for (let loop = 0; loop < loopCount; loop++) {
      for (const inst of instruments) {
        const steps = activeSteps[inst] || [];
        if (steps.length === 0) continue;
        const key = `${bank}_${inst}`;
        let audioBuf;
        try {
          audioBuf = await loadKey(key);
        } catch (e) {
          throw new Error(`Sample not found for ${key}. Try another bank.`);
        }
        for (const step of steps) {
          const t = loop * cycleSec + step * stepSec;
          const src = offline.createBufferSource();
          src.buffer = audioBuf;
          src.connect(gain);
          try {
            src.start(t);
          } catch (_) {
            /* ignore scheduling edge cases */
          }
        }
      }
    }

    const rendered = await offline.startRendering();
    return encodeWavFromBuffer(rendered);
  }

  return {
    GM_DRUM_MAP,
    downloadBlob,
    buildMidiBlob: writeMidiType0,
    renderWavBlob: renderWavBlob,
    loadSampleManifest,
  };
})();
