#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform uint u_seed;
uniform float u_speed;
uniform int u_palette;
uniform float u_contourResolution;
uniform bool u_linesOnly;
uniform bool u_vignetteGrain;

out vec4 fragColor;

// fast high-quality hash https://www.shadertoy.com/view/wfVczm
uint hash(uvec3 key, uint seed) { 
    uvec3 k = key;
    k *= 0x27d4eb2fu; 
    k ^= k >> 16;
    k *= 0x85ebca77u; 
    uint h = seed;
    h ^= k.x;
    h ^= h >> 16;
    h *= 0x9e3779b1u;
    h ^= k.y;
    h ^= h >> 16;
    h *= 0x9e3779b1u;
    h ^= k.z;
    h ^= h >> 16;
    h *= 0x9e3779b1u;
    h ^= h >> 16;
    h *= 0xed5ad4bbu;
    h ^= h >> 16;
    return h;
}

uint hash(uint key, uint seed) {
    uint k = key;
    k *= 0x27d4eb2fu; 
    k ^= k >> 16;
    k *= 0x85ebca77u; 
    uint h = seed;
    h ^= k;
    h ^= h >> 16;
    h *= 0x9e3779b1u;
    return h;
}

vec3 gradient(uint h) {
    vec3 gradients[12] = vec3[12](
        vec3(1.0, 1.0, 0.0), vec3(-1.0, 1.0, 0.0), vec3(1.0, -1.0, 0.0), vec3(-1.0, -1.0, 0.0),
        vec3(1.0, 0.0, 1.0), vec3(-1.0, 0.0, 1.0), vec3(1.0, 0.0, -1.0), vec3(-1.0, 0.0, -1.0),
        vec3(0.0, 1.0, 1.0), vec3(0.0, -1.0, 1.0), vec3(0.0, 1.0, -1.0), vec3(0.0, -1.0, -1.0)
    ); 
    return gradients[int(h % 12u)];
}

float interpolate(float value1, float value2, float value3, float value4, float value5, float value6, float value7, float value8, vec3 t) {
    return mix(
        mix(mix(value1, value2, t.x), mix(value3, value4, t.x), t.y),
        mix(mix(value5, value6, t.x), mix(value7, value8, t.x), t.y),
        t.z
    );
}

vec3 fade(vec3 t) {
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float perlinNoise(vec3 position, uint seed) {
    vec3 floorPosition = floor(position);
    vec3 fractPosition = position - floorPosition;
    uvec3 cellCoordinates = uvec3(ivec3(floorPosition));
    float value1 = dot(gradient(hash(cellCoordinates, seed)), fractPosition);
    float value2 = dot(gradient(hash(cellCoordinates + uvec3(1, 0, 0), seed)), fractPosition - vec3(1.0, 0.0, 0.0));
    float value3 = dot(gradient(hash(cellCoordinates + uvec3(0, 1, 0), seed)), fractPosition - vec3(0.0, 1.0, 0.0));
    float value4 = dot(gradient(hash(cellCoordinates + uvec3(1, 1, 0), seed)), fractPosition - vec3(1.0, 1.0, 0.0));
    float value5 = dot(gradient(hash(cellCoordinates + uvec3(0, 0, 1), seed)), fractPosition - vec3(0.0, 0.0, 1.0));
    float value6 = dot(gradient(hash(cellCoordinates + uvec3(1, 0, 1), seed)), fractPosition - vec3(1.0, 0.0, 1.0));
    float value7 = dot(gradient(hash(cellCoordinates + uvec3(0, 1, 1), seed)), fractPosition - vec3(0.0, 1.0, 1.0));
    float value8 = dot(gradient(hash(cellCoordinates + uvec3(1, 1, 1), seed)), fractPosition - vec3(1.0, 1.0, 1.0));
    return interpolate(value1, value2, value3, value4, value5, value6, value7, value8, fade(fractPosition));
}

float perlinNoise(vec3 position, int octaveCount, float persistence, float lacunarity, uint seed) {
    float value = 0.0;
    float amplitude = 1.0;
    for (int i = 0; i < octaveCount; i++) {
        uint s = hash(uint(i), seed); 
        value += perlinNoise(position, s) * amplitude;
        amplitude *= persistence;
        position *= lacunarity;
    }
    return value;
}

// Random function for grain
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / u_resolution.y; // maintain aspect ratio
    vec2 normUv = fragCoord / u_resolution.xy; // 0..1 for vignette
    
    // Evaluate noise
    float value = perlinNoise(vec3(uv, u_time * u_speed), 2, 1.0, 3.0, u_seed);
    value = (value + 1.0) * 0.5; // map from [-1, 1] to [0, 1]
    
    float band = floor(value * u_contourResolution);
    
    float thickness = 0.01 + (u_contourResolution / 1000.0); // scale thickness slightly with resolution
    if (u_linesOnly) thickness = 0.02; // Thicker lines if lines only

    // Palettes
    vec4 baseColor, c1, c2, c3;
    
    if (u_palette == 0) { // Warm
        baseColor = vec4(1.0, 0.95, 0.9, 1.0);
        c1 = vec4(1.0, 0.65, 0.0, 1.0); // Yellow
        c2 = vec4(1.0, 0.45, 0.0, 1.0); // Orange
        c3 = vec4(1.0, 0.0, 0.0, 1.0);  // Red
    } else if (u_palette == 1) { // Ice
        baseColor = vec4(0.02, 0.05, 0.1, 1.0);
        c1 = vec4(0.0, 0.3, 0.6, 1.0);
        c2 = vec4(0.0, 0.6, 0.8, 1.0);
        c3 = vec4(0.5, 0.9, 1.0, 1.0);
    } else if (u_palette == 2) { // Mono
        baseColor = vec4(0.1, 0.1, 0.1, 1.0);
        c1 = vec4(0.4, 0.4, 0.4, 1.0);
        c2 = vec4(0.7, 0.7, 0.7, 1.0);
        c3 = vec4(1.0, 1.0, 1.0, 1.0);
    } else { // Neon
        baseColor = vec4(0.05, 0.0, 0.1, 1.0);
        c1 = vec4(0.0, 1.0, 0.5, 1.0); // Green
        c2 = vec4(0.0, 0.8, 1.0, 1.0); // Cyan
        c3 = vec4(1.0, 0.0, 1.0, 1.0); // Magenta
    }

    vec4 finalColor = baseColor;
    
    if (!u_linesOnly) {
        // Filled bands style - interpolate based on the band height
        float t = fract(band / 10.0);
        if (t < 0.33) finalColor = mix(c1, c2, t * 3.0);
        else if (t < 0.66) finalColor = mix(c2, c3, (t - 0.33) * 3.0);
        else finalColor = mix(c3, c1, (t - 0.66) * 3.0);
        
        // Add subtle shading
        finalColor.rgb *= (0.8 + 0.2 * fract(value * u_contourResolution));
    }

    // Lines calculation
    float l1 = step(fract(band / 10.0), thickness);
    float l2 = step(fract(band / 7.5), thickness);
    float l3 = step(fract(band / 5.0), thickness);

    // Apply lines
    if (u_linesOnly) {
        finalColor = mix(finalColor, c1, l3);
        finalColor = mix(finalColor, c2, l2);
        finalColor = mix(finalColor, c3, l1);
    } else {
        // In filled mode, maybe just add a subtle dark edge
        float edge = step(fract(value * u_contourResolution), 0.05);
        finalColor.rgb = mix(finalColor.rgb, vec3(0.0), edge * 0.3);
    }
    
    // Vignette and Grain
    if (u_vignetteGrain) {
        // Vignette
        vec2 vCenter = normUv - 0.5;
        float dist = length(vCenter);
        float vignette = smoothstep(0.7, 0.2, dist);
        finalColor.rgb *= vignette;
        
        // Grain
        float noise = random(normUv * u_time) * 0.1;
        finalColor.rgb -= noise;
    }

    fragColor = finalColor;
}
