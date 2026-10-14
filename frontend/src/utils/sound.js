let audioContext = null;

function getContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

export function playTone(frequency, duration = 0.08, type = "sine", gainValue = 0.25, delay = 0) {
  const context = getContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = 0;
  oscillator.connect(gain);
  gain.connect(context.destination);

  const start = context.currentTime + delay;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function playPopup() {
  playTone(660, 0.07, "sine", 0.18);
  playTone(880, 0.08, "sine", 0.16, 0.07);
}

export function playDing() {
  playTone(880, 0.12, "sine", 0.18);
  playTone(1174, 0.16, "sine", 0.16, 0.1);
}
