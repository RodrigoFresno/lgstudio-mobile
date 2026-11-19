#version 300 es

precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_dpr;
uniform vec2 u_mouse;
uniform vec2 u_mouseSpring;
uniform float u_time;
uniform float u_mergeRate;
uniform float u_shapeWidth;
uniform float u_shapeHeight;
uniform float u_shapeRadius;
uniform float u_shapeRoundness;
uniform float u_shadowExpand;
uniform float u_shadowFactor;
uniform vec2 u_shadowPosition;
uniform int u_bgType;
uniform int u_exportTransparent;
uniform sampler2D u_bgTexture;
uniform sampler2D u_iconTexture;
uniform float u_bgTextureRatio;
uniform vec4 u_iconRect;
uniform float u_iconOpacity;
uniform int u_iconReady;
uniform int u_bgTextureReady;
uniform int u_showShape1;

float chessboard(vec2 uv, float size, int mode) {
  float yBars = step(size * 2.0, mod(uv.y * 2.0, size * 4.0));
  float xBars = step(size * 2.0, mod(uv.x * 2.0, size * 4.0));

  if (mode == 0) {
    return yBars;
  } else if (mode == 1) {
    return xBars;
  } else {
    return abs(yBars - xBars);
  }
}

float halfColor(vec2 uv) {
  if (uv.y > 0.5) {
    return 1.0;
  } else {
    return 0.0;
  }
}

#include './lib/sdf.glsl'

float sdgMin(float a, float b) {
  return a < b
    ? a
    : b;
}

// 输入：原始 uv、canvas 宽高比、纹理宽高比
// 输出：变换后的 uv，可直接用于 texture 采样
vec2 getCoverUV(vec2 uv, float canvasAspect, float textureAspect) {
  if (canvasAspect > textureAspect) {
    // canvas 更宽，纹理竖向拉伸
    float scale = textureAspect / canvasAspect;
    uv.y = uv.y * scale + 0.5 - 0.5 * scale;
  } else {
    // canvas 更高，纹理横向拉伸
    float scale = canvasAspect / textureAspect;
    uv.x = uv.x * scale + 0.5 - 0.5 * scale;
  }
  return uv;
}

void main() {
  vec2 u_resolution1x = u_resolution.xy / u_dpr;
  // float chessboardBg = chessboard(gl_FragCoord.xy, 14.0);
  vec3 bgColor = vec3(1.0);

  if (u_exportTransparent == 1) {
    // Export the glass against a neutral source, never the user's preview background.
    bgColor = vec3(0.82);
  } else if (u_bgType <= 0) {
    // Keep the checkerboard only in the editor preview.
    {
      bgColor = vec3(1.0 - chessboard(gl_FragCoord.xy / u_dpr, 20.0, 2) / 4.0);
    }
  } else if (u_bgType <= 1) {
    if (v_uv.x < 0.5 && v_uv.y > 0.5) {
      bgColor = vec3(chessboard(gl_FragCoord.xy / u_dpr, 10.0, 0));
    } else if (v_uv.x > 0.5 && v_uv.y < 0.5) {
      bgColor = vec3(chessboard(gl_FragCoord.xy / u_dpr, 10.0, 1));
    } else if (v_uv.x < 0.5 && v_uv.y < 0.5) {
      bgColor = vec3(0.0);
    }
  } else if (u_bgType <= 2) {
    bgColor = vec3(halfColor(gl_FragCoord.xy / u_resolution) * 0.6 + 0.3);
  } else if (u_bgType <= 11) {
    if (u_bgTextureReady != 1) {
      // chessboard
      bgColor = vec3(1.0 - chessboard(gl_FragCoord.xy / u_dpr, 20.0, 2) / 4.0);
    } else {
      vec2 uv = getCoverUV(v_uv, u_resolution.x / u_resolution.y, u_bgTextureRatio);

      // 不需要判断越界，CLAMP_TO_EDGE 会自动处理
      bgColor = texture(u_bgTexture, uv).rgb;
    }
  }

  // Composite the imported artwork into the scene BEFORE the blur and glass
  // passes. This is the key difference from a flat HTML overlay: the main
  // Liquid Glass shader now refracts, disperses and blurs the artwork together
  // with the background.
  vec2 shapeP1 = (vec2(0.0) - u_resolution.xy * 0.5) / u_resolution.y;
  vec2 shapeP2 = (vec2(0.0) - u_mouseSpring) / u_resolution.y;
  float shapeDistance = mainSDF(shapeP1, shapeP2, gl_FragCoord.xy);
  float shapeEdgeAa = max(fwidth(shapeDistance), 0.00001);

  if (u_iconReady == 1 && u_iconOpacity > 0.0 && u_iconRect.z > 0.0 && u_iconRect.w > 0.0) {
    vec2 iconUv = (v_uv - u_iconRect.xy) / u_iconRect.zw;
    if (all(greaterThanEqual(iconUv, vec2(0.0))) && all(lessThanEqual(iconUv, vec2(1.0))) && shapeDistance <= 0.0) {
      vec4 iconPixel = texture(u_iconTexture, iconUv);
      float glassMask = 1.0 - smoothstep(-shapeEdgeAa, shapeEdgeAa, shapeDistance);
      float artworkAlpha = iconPixel.a * clamp(u_iconOpacity, 0.0, 1.0) * glassMask;
      bgColor = mix(bgColor, iconPixel.rgb, artworkAlpha);
    }
  }

  // draw shadow
  vec2 shadowP1 =
    (vec2(0, 0) -
      u_resolution.xy * 0.5 +
      vec2(u_shadowPosition.x * u_dpr, u_shadowPosition.y * u_dpr)) /
    u_resolution.y;
  vec2 shadowP2 =
    (vec2(0, 0) - u_mouseSpring + vec2(u_shadowPosition.x * u_dpr, u_shadowPosition.y * u_dpr)) /
    u_resolution.y;
  float merged = mainSDF(shadowP1, shadowP2, gl_FragCoord.xy);

  float shadow = exp(-1.0 / u_shadowExpand * abs(merged) * u_resolution1x.y) * 0.6 * u_shadowFactor;

  fragColor = vec4(bgColor - vec3(shadow), 1.0);
}
