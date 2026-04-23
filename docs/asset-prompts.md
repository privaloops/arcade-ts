# Asset Generation Prompts

Prompts used to generate marketing/hero assets via ChatGPT image generation.
Keep them here so we can iterate instead of rewriting from scratch.

## Hero thumbnail / YouTube cover — 1280×720

Used for: `packages/sprixe-site/public/hero-thumbnail.jpg` (YouTube facade poster)
and potentially OG image.

> Note: avoid naming specific Capcom characters in the prompt — ChatGPT refuses
> or nerfs the output. Describe the archetype ("retro 90s arcade fighter") and
> let the style do the talking.

```
Create a YouTube thumbnail image, 1280x720 pixels, landscape 16:9 ratio.

Left side (40%): Aseprite pixel art editor interface, dark UI, visible
16-color vibrant palette fanning out, pixel grid canvas showing
work-in-progress sprite. UI elements are abstract/icon-based — no
readable small text labels.

Right side (60%): Dramatic close-up of a retro 90s-style arcade fighter
character mid-punch, rim-lit in magenta and cyan neon. Behind: faded
CRT scanline glow in warm amber. Style evokes early Capcom CPS1
beat-em-up aesthetic without copying any specific copyrighted character.

TOP CENTER OVERLAY TEXT — make this VERY large and crisp: "I built a
CPS1 ROM studio" in thick bold sans-serif white lettering with heavy
red drop shadow, occupying roughly 20% of vertical space. Below it,
smaller but still bold: "that runs in your browser" in cyan.

BOTTOM LEFT: small white "sprixe.dev" tag.

Overall: cinematic, stop-scroll, mobile-readable at thumbnail size.
High contrast. Saturated neon colors meet dark atmospheric background.
```

## Variant — explicit Final Fight characters

Alternative if you want the thumbnail to match a Final Fight demo video.
Risk: ChatGPT may refuse/nerf due to copyright; fall back to the
archetype prompt above if needed.

```
Create a vibrant 16:9 hero image (1920×1080) for "sprixe.dev", a
browser-based CPS1 arcade ROM studio.

SPLIT COMPOSITION:
LEFT HALF — An Aseprite-style pixel art editor interface, dark UI,
with a vertical toolbar, a rainbow color palette wheel, and a canvas
showing a zoomed-in pixel-art sprite of HAGGAR from Final Fight
(bald muscular wrestler with red pants and mustache), CPS1 16-color
palette style. Below the canvas, an animation timeline row shows
multiple walking-frame thumbnails of the same character.

RIGHT HALF — A large, highly detailed, semi-realistic 3D illustration
of HAGGAR from Final Fight mid-fight: muscular, red pants, angry
expression, fists clenched, photorealistic rendering. Dramatic rim
lighting in neon pink and cyan, arcade cabinet atmosphere.

BACKGROUND — Blurred arcade scene with a glowing red neon "INSERT
COIN" sign, dark bokeh, 80s/90s arcade vibe.

TEXT OVERLAYS:
- Top, large bold white outlined text with black shadow:
  "EDIT CPS1 ROMS"
- Just below, smaller cyan italic handwritten font:
  "in your browser"
- Bottom-left corner, clean white modern font: "sprixe.dev"

STYLE: High contrast, saturated colors (red/pink/cyan/orange),
cinematic arcade aesthetic, YouTube-thumbnail friendly (readable at
small sizes). Dramatic, energetic, nostalgic.
```

Swap "HAGGAR" for "CODY, GUY AND HAGGAR standing side by side as a
trio" if you want to show the full Final Fight cast.

## Post-processing

```bash
# Resize + JPG compress (quality 75 is a good LCP/visual tradeoff)
sips -Z 1280 -s format jpeg -s formatOptions 75 \
  ~/Desktop/source.png \
  --out packages/sprixe-site/public/hero-thumbnail.jpg
```

Target file size: < 300 KB for hero poster, < 100 KB for OG image.
