# Adding the next competitor video

The pipeline for a new video is: **you (human) run Gemini → you hand over the `.md` + the
YouTube URL → the agent extracts frames and tears them down.** The Gemini stage stays
manual (the owner's choice); everything after it is scripted-by-hand below.

`ffmpeg` (8.1.1) and `yt-dlp` (2026.08) are already installed **system-wide** — nothing to
install, and nothing gets downloaded into this folder except the frames and the `.mp4`
(which is gitignored).

---

## Step 1 — Gemini (manual, done by the owner)

Run the video through Gemini with **Prompt 1** (the timestamped feature-inventory prompt —
see the pipeline diagram / `AI_SYSTEM_CONTEXT.md` for the exact format). Gemini returns a
markdown doc where each feature is:

```
#### [MM:SS] Feature name
- **File Name**: `NN_MMmSSs_CODE_Description.png`
- **Timestamp Link**: [MM:SS on YouTube](https://www.youtube.com/watch?v=<id>&t=<sec>)
- **Feature Information**: <one-paragraph description>
```

Hand the agent **(a)** that `.md` and **(b)** the YouTube URL.

## Step 2 — Download + extract frames (agent)

Pick the next slot: `sources/dzylo/video-03/` (or a new vendor folder). Then:

```bash
# from competitor-research/ ; VID = the folder, URL = the youtube link
VID=video-03
URL="https://www.youtube.com/watch?v=XXXXXXXXXXX"
mkdir -p "source/frames/$VID"

# download (yt-dlp is installed; --js-runtimes deno silences the JS-runtime warning if deno is present)
python -m yt_dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
  --merge-output-format mp4 -o "source/downloads/$VID.mp4" "$URL"

# extract one frame per timestamp — run this per [sec] from the Gemini doc:
#   ffmpeg -y -ss <sec> -i source/downloads/$VID.mp4 -vframes 1 -q:v 2 source/frames/$VID/<name>.png
```

The reference script `INTERIOR LANE/RESEARCH/process_videos.py` does exactly this loop, but
**hardcodes every timestamp in the source** — copy its ffmpeg call, not its structure; drive
the loop from the new Gemini `.md` instead of editing code. (The `-ss` before `-i` is a fast
seek; `-q:v 2` is high-quality JPEG-equivalent PNG.)

**Sanity check:** the number of `**File Name**` entries in the Gemini doc must equal the
number of PNGs produced. A mismatch means a timestamp was dropped.

## Step 3 — Tear it down (agent)

Open each PNG (Read tool) and write an entry in `analysis/NN-<name>.md` using the fixed
shape (see `analysis/01-procurement.md` for the template): On screen · Fields · Columns ·
Actions · States · Implies (data) · Implies (API) · **Verdict** · **VEYRA delta** · Plan ref.

- Work in **batches of ~10 frames** so a later session can resume.
- **Flag B-roll frames** (stock footage between sections) — video 2 had ~14; capture the
  narrated feature from the Gemini text but mark the frame as non-UI.
- Give **every** frame a verdict; end the file with a `NN/NN ✓` coverage checklist.

## Step 4 — Fold into the register

Add/merge the new findings into `FEATURE-REGISTER.md` under the right VEYRA module, merging
duplicates (a feature shown in two videos = one row, two sources). Update the coverage matrix.

---

**Do not** re-download or re-extract the two existing Dzylo videos — they're done. **Do not**
enable RLS or write to Supabase as part of this — this folder is research only.
