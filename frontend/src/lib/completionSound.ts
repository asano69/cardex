import * as Tone from "tone";

let synth: Tone.FMSynth | undefined;

function ensureSynth() {
  if (!synth) {
    synth = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 8,
      envelope: {
        attack: 0.001,
        decay: 0.08,
        sustain: 0,
        release: 0.05,
      },
    }).toDestination();
  }
  return synth;
}

export async function playCompletionSound() {
  await Tone.start();

  const synth = ensureSynth();

  synth.triggerAttackRelease("A5", "32n");

  synth.frequency.rampTo("E6", 0.06);
}
