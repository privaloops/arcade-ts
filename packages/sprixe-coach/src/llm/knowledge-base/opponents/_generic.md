# Generic opponent fallback

Used when facing a character we have not yet written a dedicated predictor
for. Only two patterns apply to every SF2 CPU:

- **Aggression at low HP**: below 20% HP, most CPUs abandon their normal
  neutral and start throwing out risky specials. The coach should warn the
  player to stay patient and capitalize on whiff punishes.
- **Reposition after repeated retreats**: after 3+ rapid retreats, most
  CPUs try to reset spacing — either with a jump, a dash, a teleport, or
  a neutral jump-back, depending on the character. The coach should advise
  patience and anticipation.

When this generic fallback fires, the LLM should name the opponent
generically ("he", the character's name from state.p2.charId) and describe
the pattern in neutral terms instead of naming a specific move.
