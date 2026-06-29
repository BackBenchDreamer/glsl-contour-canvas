/**
 * rainbow_color_map node GLSL
 *
 * Maps a scalar noise field to a cycling HSV hue, then gates brightness
 * by a separate contour mask — each elevation band gets a distinct hue.
 *
 * Uniforms:
 *   u_{id}_hueShift  — base hue offset [0,1], animated via time
 *   u_{id}_hueRange  — fraction of the hue wheel covered across the noise range
 *   u_{id}_saturation — colour saturation [0,1]
 *   u_{id}_brightness — peak line brightness
 *
 * Inputs:
 *   field   — StaticScalar | DynamicScalar  (the raw noise value, drives hue)
 *   mask    — StaticScalar | DynamicScalar  (the contour extraction, gates visibility)
 */
export const rainbowColorMap = `
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;
