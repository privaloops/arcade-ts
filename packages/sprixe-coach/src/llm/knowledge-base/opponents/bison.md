# M. Bison (Dictator) — SF2 Hyper Fighting

The final boss. Arcade CPU runs a reactive AI with well-known patterns that
the human player can exploit once read.

## Specials (player-executed moves, same set the AI uses)

- **Psycho Crusher**: hold-back charge ~40f, then forward + punch. Full-screen flying body attack.
- **Scissor Kick**: hold-back charge, then forward + kick. Mid-range pressure, two kicks in sequence.
- **Head Stomp**: hold-down charge, then up + kick. Anti-zoning, jumps over fireballs.
- **Devil Reverse**: punch after Head Stomp. Descent with a swinging fist, fake-out mixup.
- **Teleport**: a quick reposition, invincible on startup. Escape tool. Not always in every Bison version — present in sf2hf.

## AI behavior patterns (observable)

| Pattern | Trigger | Counter |
|---------|---------|---------|
| Teleport | 3+ rapid retreats, or cornered under pressure | Don't chase — wait and counter his landing |
| Psycho Crusher spam | Ryu throws fireballs at mid-range | Jump over / neutral jump / Shoryuken on read |
| Head Stomp | Full-screen distance + Ryu just threw a fireball | Crouching fierce anti-air, or walk back |
| Scissor Kick pressure | Close-range with Ryu grounded | Block low, then punish on recovery |
| Slide | Mid-range with Ryu zoning from the ground | Jump forward, punish with jump-in combo |
| Corner loop | Ryu in corner | Get out at all costs; block first hit, then jump out or reversal |
| Desperation jumps | Bison HP below ~20% | Expect reckless jump-ins, punish with anti-air |
| Knee Press on wakeup | Ryu knocked down | Block low or wake-up reversal |

## Counter strategy for Ryu

- **Patient footsies**. Bison whiffs his big hitboxes if you refuse to commit.
- **Punish whiffed Psycho Crusher**. Huge recovery — free 40% combo.
- **Anti-air his Head Stomp** with late Shoryuken or crouching HP.
- **Never corner yourself**. His scissor loop is death.
- **Use empty jumps** to bait his shoryu-reads, then throw or low poke.
- **Manage meter / timing**: Bison does not have metered supers in sf2hf; there is no meter to bait, just reads and positioning.

## Voice-line seed ideas (one-liners for the caster)

- "He's been retreating — watch for the teleport"
- "Psycho Crusher's coming, charge's almost done"
- "Bison in the corner — punish now!"
- "Don't corner yourself — back off"
- "Whiffed slide — free combo, go!"
- "Scissor kick coming, block low"
- "He's at low HP — expect the jump-in"
- "Anti-air that head stomp!"
