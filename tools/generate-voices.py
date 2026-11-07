"""Optional macOS-only asset authoring; runtime serves ordinary local WAV files.
Requires /usr/bin/say and ffmpeg. No network services or runtime speech synthesis.
"""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LINES = {"incoming": "Incoming! Get down!", "grenade": "Grenade!", "smoke": "Smoke out!"}
VOICES = [("Daniel", 205), ("Eddy (English (UK))", 200)]
OUT = ROOT / "public/audio/voices"
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="sector-voices-") as tmp:
    for line, text in LINES.items():
        for variant, (voice, rate) in enumerate(VOICES):
            raw = Path(tmp) / "speech.aiff"
            subprocess.run(["/usr/bin/say", "-v", voice, "-r", str(rate), "-o", str(raw), text], check=True)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "silenceremove=start_periods=1:start_duration=0.015:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB,areverse,highpass=f=150,lowpass=f=4600,loudnorm=I=-18:TP=-2:LRA=7,afade=t=in:d=0.008", "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", str(OUT / f"{line}-{variant}.wav")], check=True)
