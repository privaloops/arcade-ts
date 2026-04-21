# Move-id calibration notes

SF2HF exposes each character's current attack through a single byte
(`attack_id`) but the attack-id → move-name table is NOT publicly
documented. We calibrate it by playing each move once and reading the
`[coach:calibrate]` log line.

## How to calibrate

1. Start a fight vs Honda (or any opponent) with `?coachLang=fr&tts=0`
   so the console output isn't drowned by LLM calls.
2. Open DevTools Console.
3. For EACH of the moves listed below, wait until you are clearly
   in-neutral (not in an animation), press the move once, and copy the
   `[coach:calibrate]` line that appears.
4. Report the lines back so the table in `move-names.ts` can be filled.

## Moves to calibrate, in order

### Ryu — normals (press in standing neutral)
- [ ] Jab (light punch, A)
- [ ] Strong (medium punch, S)
- [ ] Fierce (heavy punch, D)
- [ ] Short (light kick, Z)
- [ ] Forward (medium kick, X)
- [ ] Roundhouse (heavy kick, C)

### Ryu — crouching normals (hold down + button)
- [ ] Crouching jab
- [ ] Crouching strong
- [ ] Crouching fierce
- [ ] Crouching short
- [ ] Crouching forward
- [ ] Crouching roundhouse (sweep)

### Ryu — jumping normals (jump + button in air)
- [ ] Neutral jump heavy punch
- [ ] Neutral jump heavy kick

### Ryu — specials (each of the 3 strengths if possible)
- [ ] Hadouken jab
- [ ] Hadouken strong
- [ ] Hadouken fierce
- [ ] Shoryuken jab
- [ ] Shoryuken strong
- [ ] Shoryuken fierce
- [ ] Tatsumaki light
- [ ] Tatsumaki medium
- [ ] Tatsumaki heavy

Once the Ryu table is complete we do the same for the opponents
actually used in the demo (Bison first, then Honda as a bonus).
