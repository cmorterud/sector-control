# Soldier voice prototype

Six locally authored speech clips, two variants of each line:

- Incoming! Get down!
- Grenade!
- Smoke out!

Generated on macOS with the installed Daniel and Eddy (English UK) synthesizer voices, then trimmed, filtered, leveled and converted to mono 22.05 kHz PCM WAV. These are synthetic placeholder performances. No microphone recordings, runtime speech synthesis, or third-party speech service is used. Assets are served with the game, cached and mixed through its normal spatial audio output and recorder.

Optional regeneration on a Mac with those voices and ffmpeg installed:

```sh
python3 tools/generate-voices.py
```

Normal builds and CI use the checked-in WAV files and do not run that script.
