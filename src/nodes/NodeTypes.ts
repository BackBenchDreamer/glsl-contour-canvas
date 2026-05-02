import { registry } from '../engine/Registry';
import { FieldType } from '../engine/Graph';
import { snoise2D } from './glsl/snoise2D';
import { fbm } from './glsl/fbm';

registry.register('uv', {
  name: 'UV Coordinates',
  outputType: FieldType.Vector2,
  generateCode: (node) => `vec2 out_${node.id} = baseUv;`
});

registry.register('time', {
  name: 'Time',
  outputType: FieldType.StaticScalar,
  uniformTypes: { value: 'float' },
  getUniforms: (node) => ({ value: node.params.value ?? 0.0 }),
  generateCode: (node) => `float out_${node.id} = u_${node.id}_value;`
});

registry.register('noise_simplex', {
  name: 'Simplex Noise',
  inputs: { uv: FieldType.Vector2 },
  outputType: FieldType.StaticScalar,
  glslDependencies: [snoise2D],
  uniformTypes: { scale: 'float', offset: 'vec2' },
  getUniforms: (node) => ({
    scale: node.params.scale ?? 5.0,
    offset: node.params.offset ?? [0, 0]
  }),
  generateCode: (node, getInput) => {
    return `float out_${node.id} = snoise(${getInput('uv')} * u_${node.id}_scale + u_${node.id}_offset);`;
  }
});

registry.register('noise_fbm', {
  name: 'FBM Noise',
  inputs: { uv: FieldType.Vector2 },
  outputType: FieldType.StaticScalar,
  glslDependencies: [snoise2D, fbm],
  uniformTypes: { octaves: 'int', scale: 'float', offset: 'vec2' },
  getUniforms: (node) => ({
    octaves: node.params.octaves ?? 4,
    scale: node.params.scale ?? 3.0,
    offset: node.params.offset ?? [0, 0]
  }),
  generateCode: (node, getInput) => {
    return `float out_${node.id} = fbm(${getInput('uv')} * u_${node.id}_scale + u_${node.id}_offset, u_${node.id}_octaves);`;
  }
});

registry.register('warp', {
  name: 'Domain Warp',
  inputs: { uv: FieldType.Vector2, warpField: [FieldType.StaticScalar, FieldType.DynamicScalar, FieldType.Vector2] },
  outputType: FieldType.Vector2,
  uniformTypes: { intensity: 'float' },
  getUniforms: (node) => ({ intensity: node.params.intensity ?? 0.1 }),
  generateCode: (node, getInput) => {
    return `vec2 out_${node.id} = ${getInput('uv')} + vec2(${getInput('warpField')}) * u_${node.id}_intensity;`;
  }
});

registry.register('transform', {
  name: 'Scalar Transform',
  inputs: { scalar: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: (node) => FieldType.DynamicScalar, // Will adapt to input later, using Dynamic for simplicity
  inline: true,
  uniformTypes: { mult: 'float', add: 'float' },
  getUniforms: (node) => ({
    mult: node.params.mult ?? 1.0,
    add: node.params.add ?? 0.0
  }),
  generateCode: (node, getInput) => {
    return `(${getInput('scalar')} * u_${node.id}_mult + u_${node.id}_add)`;
  }
});

registry.register('contour', {
  name: 'Contour Extraction',
  inputs: { scalar: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.StaticScalar,
  uniformTypes: { frequency: 'float', thickness: 'float', smoothing: 'float' },
  getUniforms: (node) => ({
    frequency: node.params.frequency ?? 10.0,
    thickness: node.params.thickness ?? 0.1,
    smoothing: node.params.smoothing ?? 0.02
  }),
  generateCode: (node, getInput) => {
    return `
    float v_${node.id} = fract(${getInput('scalar')} * u_${node.id}_frequency);
    float out_${node.id} = smoothstep(u_${node.id}_thickness + u_${node.id}_smoothing, u_${node.id}_thickness, v_${node.id});
    `;
  }
});

registry.register('color_map', {
  name: 'Color Map',
  inputs: { mask: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.Vector3,
  uniformTypes: { color1: 'vec3', color2: 'vec3' },
  getUniforms: (node) => ({
    color1: node.params.color1 ?? [0, 0, 0],
    color2: node.params.color2 ?? [1, 1, 1]
  }),
  generateCode: (node, getInput) => {
    return `vec3 out_${node.id} = mix(u_${node.id}_color1, u_${node.id}_color2, ${getInput('mask')});`;
  }
});

registry.register('math_add', {
  name: 'Add',
  inputs: { a: [FieldType.StaticScalar, FieldType.DynamicScalar], b: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.DynamicScalar,
  inline: true,
  generateCode: (node, getInput) => `(${getInput('a')} + ${getInput('b')})`
});

registry.register('blend', {
  name: 'Blend (Scalar)',
  inputs: { a: [FieldType.StaticScalar, FieldType.DynamicScalar], b: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.DynamicScalar,
  inline: true,
  generateCode: (node, getInput) => {
    const op = node.params.op ?? 'add';
    const a = getInput('a');
    const b = getInput('b');
    if (op === 'add') return `(${a} + ${b})`;
    if (op === 'mult') return `(${a} * ${b})`;
    if (op === 'min') return `min(${a}, ${b})`;
    if (op === 'max') return `max(${a}, ${b})`;
    return `(${a} + ${b})`;
  }
});

registry.register('mix', {
  name: 'Mix (Lerp)',
  inputs: { a: [FieldType.StaticScalar, FieldType.DynamicScalar], b: [FieldType.StaticScalar, FieldType.DynamicScalar], t: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.DynamicScalar,
  inline: true,
  generateCode: (node, getInput) => `mix(${getInput('a')}, ${getInput('b')}, ${getInput('t')})`
});

registry.register('mask', {
  name: 'Mask',
  inputs: { base: [FieldType.StaticScalar, FieldType.DynamicScalar], mask: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.DynamicScalar,
  inline: true,
  generateCode: (node, getInput) => `(${getInput('base')} * ${getInput('mask')})`
});

registry.register('output', {
  name: 'Output',
  inputs: { color: FieldType.Vector3 },
  generateCode: (node, getInput) => {
    return `
    fragColor = vec4(${getInput('color')}, 1.0);
    `;
  }
});

registry.register('data_field', {
  name: 'Data Field (Texture)',
  inputs: { uv: FieldType.Vector2 },
  outputType: FieldType.StaticScalar,
  uniformTypes: { dataTex: 'sampler2D' },
  generateCode: (node, getInput) => {
    return `float out_${node.id} = texture(u_${node.id}_dataTex, ${getInput('uv')}).r;`;
  }
});

// TEMPORAL NODES

registry.register('pass_boundary', {
  name: 'Pass Boundary',
  inputs: { in: FieldType.DynamicScalar },
  outputType: FieldType.DynamicScalar,
  generateCode: (node, getInput) => {
    return `float out_${node.id} = ${getInput('in')};`;
  }
});

registry.register('feedback', {
  name: 'Feedback',
  inputs: { uv: FieldType.Vector2 },
  outputType: FieldType.DynamicScalar,
  uniformTypes: { previousFrameTex: 'sampler2D' },
  generateCode: (node, getInput) => {
    return `float out_${node.id} = texture(u_${node.id}_previousFrameTex, ${getInput('uv')}).r;`;
  }
});

registry.register('decay', {
  name: 'Decay',
  inputs: { uv: FieldType.Vector2, current: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.DynamicScalar,
  uniformTypes: { previousFrameTex: 'sampler2D', rate: 'float' },
  getUniforms: (node) => ({ rate: node.params.rate ?? 0.95 }),
  generateCode: (node, getInput) => {
    return `
    float prev_${node.id} = texture(u_${node.id}_previousFrameTex, ${getInput('uv')}).r;
    float out_${node.id} = max(${getInput('current')}, prev_${node.id} * u_${node.id}_rate);
    `;
  }
});

registry.register('accumulation', {
  name: 'Accumulation',
  inputs: { uv: FieldType.Vector2, current: [FieldType.StaticScalar, FieldType.DynamicScalar] },
  outputType: FieldType.DynamicScalar,
  uniformTypes: { previousFrameTex: 'sampler2D', weight: 'float' },
  getUniforms: (node) => ({ weight: node.params.weight ?? 0.1 }),
  generateCode: (node, getInput) => {
    return `
    float prev_${node.id} = texture(u_${node.id}_previousFrameTex, ${getInput('uv')}).r;
    float out_${node.id} = mix(prev_${node.id}, ${getInput('current')}, u_${node.id}_weight);
    `;
  }
});

registry.register('diffusion', {
  name: 'Diffusion',
  inputs: { uv: FieldType.Vector2 },
  outputType: FieldType.DynamicScalar,
  uniformTypes: { previousFrameTex: 'sampler2D', texelSize: 'vec2', rate: 'float' },
  getUniforms: (node) => ({ texelSize: [1 / 1024, 1 / 1024], rate: node.params.rate ?? 1.0 }),
  generateCode: (node, getInput) => {
    return `
    vec2 uv_${node.id} = ${getInput('uv')};
    vec2 offset_${node.id} = u_${node.id}_texelSize;
    float center_${node.id} = texture(u_${node.id}_previousFrameTex, uv_${node.id}).r;
    float left_${node.id} = texture(u_${node.id}_previousFrameTex, uv_${node.id} + vec2(-offset_${node.id}.x, 0.0)).r;
    float right_${node.id} = texture(u_${node.id}_previousFrameTex, uv_${node.id} + vec2(offset_${node.id}.x, 0.0)).r;
    float up_${node.id} = texture(u_${node.id}_previousFrameTex, uv_${node.id} + vec2(0.0, offset_${node.id}.y)).r;
    float down_${node.id} = texture(u_${node.id}_previousFrameTex, uv_${node.id} + vec2(0.0, -offset_${node.id}.y)).r;
    float laplace_${node.id} = left_${node.id} + right_${node.id} + up_${node.id} + down_${node.id} - 4.0 * center_${node.id};
    float out_${node.id} = center_${node.id} + laplace_${node.id} * u_${node.id}_rate;
    `;
  }
});

export * from '../engine/Registry';
