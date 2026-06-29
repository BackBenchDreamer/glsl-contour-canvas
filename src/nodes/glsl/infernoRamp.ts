/**
 * infernoRamp — 4-stop heat colour ramp sampled from a [0,1] scalar.
 *
 * Stop positions and colours match a molten-lava palette:
 *   0.00  →  #04010a  (char black)
 *   0.25  →  #3a0800  (deep blood red)
 *   0.55  →  #b83000  (burnt orange)
 *   0.80  →  #ff6a00  (lava orange)
 *   1.00  →  #ffe060  (pale incandescent yellow)
 *
 * Usage: vec3 colour = infernoRamp(t);  // t in [0,1]
 */
export const infernoRamp = `
vec3 infernoRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.016, 0.004, 0.039);  // char black
  vec3 c1 = vec3(0.227, 0.031, 0.000);  // deep blood red
  vec3 c2 = vec3(0.722, 0.188, 0.000);  // burnt orange
  vec3 c3 = vec3(1.000, 0.416, 0.000);  // lava orange
  vec3 c4 = vec3(1.000, 0.878, 0.376);  // incandescent yellow

  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.55) return mix(c1, c2, (t - 0.25) / 0.30);
  if (t < 0.80) return mix(c2, c3, (t - 0.55) / 0.25);
               return mix(c3, c4, (t - 0.80) / 0.20);
}
`;
