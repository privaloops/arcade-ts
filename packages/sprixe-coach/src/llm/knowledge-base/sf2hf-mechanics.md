# SF2 Hyper Fighting — General Mechanics

## Round structure
- Max HP: 176 units per fighter.
- Timer: 99 seconds, BCD. In Hyper Fighting the clock ticks at roughly 2 units per real second (accelerated vs Champion Edition).
- Best of 3 rounds. Perfect = won round without taking a single hit.

## Frame data (approximate)

| Move | Startup | Recovery | Notes |
|------|---------|----------|-------|
| Ryu Shoryuken (jab) | 5f | 33f | Whiff = free punish |
| Ryu Shoryuken (fierce) | 7f | 48f | Strongest, biggest whiff |
| Ryu Hadouken (jab) | 12f | 32f | Zoning at range |
| Bison Psycho Crusher | ~10f after 40f charge | ~30f | Huge hitbox, huge recovery |
| Bison Scissor Kick | ~6f after charge | ~20f | Two hits |
| Bison Head Stomp startup | ~10f | varies (air) | Full invincibility frames on jump |
| Bison Slide | ~7f | ~14f | Low profile, fast |
| Bison Teleport | ~5f | ~15f | Invincible startup |

## Stun / dizzy

- Every hit builds stun counter.
- If stun exceeds a threshold before decay, fighter is dizzy → free combo window (~2s).
- Decay rate increases with time since last hit.

## Corner

- Corner in SF2HF world coordinates: approximately X < 180 (left) or X > 820 (right) on a ~900-wide stage.
- Cornered fighter has no back-up space, so throws and mix-ups are harder to escape.
- Bison in the corner is severely limited — prime punish window for Ryu.

## Distance bands (approximate, in screen pixels)

| Band | X-delta | Typical use |
|------|---------|-------------|
| Touching | <60 | Throw / jab |
| Close | 60-130 | Buttons, scissor kick range |
| Mid | 130-260 | Footsies, slide range |
| Long | 260-360 | Hadouken / Psycho Crusher zoning |
| Full-screen | >360 | Head Stomp bait range |
