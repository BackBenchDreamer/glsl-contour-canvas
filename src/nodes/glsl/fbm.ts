export const fbm = `
// Fractional Brownian Motion
float fbm(vec2 x, int octaves) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  // Rotate to reduce axial bias
  mat2 rot = mat2(cos(0.5), sin(0.5),
                  -sin(0.5), cos(0.50));
  for (int i = 0; i < 10; ++i) { // max 10 octaves
    if (i >= octaves) break;
    v += a * snoise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}
`;
