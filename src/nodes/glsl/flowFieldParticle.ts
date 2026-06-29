/**
 * flowFieldParticle — LIC-style directional particle dashes.
 *
 * At each pixel a flow angle is computed from simplex noise, then we step
 * backwards numSteps times along that direction and accumulate brightness
 * from a sparse seed noise field.  The result is a field of short bright
 * dashes aligned to the noise vector field — resembling the p5js Perlin
 * flow-field sketch.
 *
 * Requires snoise() to be in scope (glslDependencies: [snoise2D]).
 */
export const flowFieldParticle = `
// Flow-field LIC particle — returns [0,1] brightness for the current pixel.
// fieldScale : spatial frequency of the angle-driving noise
// seedScale  : spatial frequency of the sparse seed noise
// stepSize   : UV step length per iteration
// numSteps   : how many steps to trace (dash length)
// time       : animated time offset
float flowFieldParticle(
  vec2  uv,
  float fieldScale,
  float seedScale,
  float stepSize,
  int   numSteps,
  float time
) {
  const float TAU = 6.28318530718;

  float acc   = 0.0;
  float total = float(numSteps);
  vec2  p     = uv;

  for (int i = 0; i < 64; ++i) {
    if (i >= numSteps) break;

    // Flow angle at this step — snoise returns [-1,1], map to [0, TAU]
    float angle = snoise(p * fieldScale + vec2(time * 0.31, time * 0.17)) * TAU;
    vec2  dir   = vec2(cos(angle), sin(angle));

    // Seed noise — sparse bright dots to accumulate
    float seed = snoise(p * seedScale + vec2(47.3, 91.1));
    // Threshold to keep it sparse: only values near +1 contribute
    seed = max(0.0, seed - 0.55) * (1.0 / 0.45);

    acc += seed;

    // Step backwards along flow
    p -= dir * stepSize;
  }

  return clamp(acc / (total * 0.15), 0.0, 1.0);
}
`;
