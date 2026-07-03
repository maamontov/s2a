function cleanName(name) {
  return name.replace(/\\/g, '/').replace(/\.[^.]+$/, '');
}

function frameObject(frame) {
  return {
    frame: { x: frame.contentX, y: frame.contentY, w: frame.sw, h: frame.sh },
    rotated: false,
    trimmed: frame.trimmed,
    spriteSourceSize: { x: frame.trimX, y: frame.trimY, w: frame.sw, h: frame.sh },
    sourceSize: { w: frame.sourceW, h: frame.sourceH }
  };
}

export function pixiJSON(atlas, imageName) {
  return JSON.stringify({
    frames: Object.fromEntries(atlas.frames.map(frame => [frame.path, frameObject(frame)])),
    meta: {
      app: 's2a', version: '1.0', image: imageName,
      format: 'RGBA8888', size: { w: atlas.width, h: atlas.height }, scale: '1'
    }
  }, null, 2);
}

export function genericJSON(atlas, imageName) {
  return JSON.stringify({
    image: imageName,
    width: atlas.width,
    height: atlas.height,
    frames: atlas.frames.map(frame => ({
      name: cleanName(frame.path), path: frame.path,
      x: frame.contentX, y: frame.contentY, width: frame.sw, height: frame.sh,
      sourceWidth: frame.sourceW, sourceHeight: frame.sourceH,
      offsetX: frame.trimX, offsetY: frame.trimY
    }))
  }, null, 2);
}

function godotString(value) {
  return `&${JSON.stringify(value)}`;
}

export function godotTRES(atlas, imageName) {
  const header = `[gd_resource type="SpriteFrames" load_steps=${atlas.frames.length + 2} format=3]\n\n[ext_resource type="Texture2D" path="res://${imageName}" id="1_atlas"]`;
  const resources = atlas.frames.map((frame, index) => {
    const margin = frame.trimmed ? `\nmargin = Rect2(${frame.trimX}, ${frame.trimY}, ${frame.sourceW - frame.sw}, ${frame.sourceH - frame.sh})` : '';
    return `\n[sub_resource type="AtlasTexture" id="AtlasTexture_${index + 1}"]\natlas = ExtResource("1_atlas")\nfilter_clip = true${margin}\nregion = Rect2(${frame.contentX}, ${frame.contentY}, ${frame.sw}, ${frame.sh})`;
  }).join('\n');
  const animations = atlas.frames.map((frame, index) => `{\n"frames": [{\n"duration": 1.0,\n"texture": SubResource("AtlasTexture_${index + 1}")\n}],\n"loop": false,\n"name": ${godotString(cleanName(frame.path))},\n"speed": 1.0\n}`).join(', ');
  return `${header}\n${resources}\n\n[resource]\nanimations = [${animations}]\n`;
}
