import type { SceneId } from "@ai-dm/shared-types";

/** MiniMax video generation prompts keyed by scene ID.
 *
 * Style: "living photograph" — photorealistic, locked-off tripod camera,
 * mostly still frame with 1-2 subtle moving elements that bring the
 * scene to life (fire flickering, trees swaying, dust drifting).
 * Combat scenes feel paused mid-action with small details in motion.
 */
export const SCENE_PROMPTS: Record<SceneId, string> = {
  tavern_idle:
    "Photorealistic dark fantasy tavern interior, fixed tripod camera, completely static shot, no camera movement. Warm firelight flickers gently on wooden beams, half-empty common room, stone hearth with low flames dancing subtly, faint smoke drifting lazily upward. A tankard sits on a table, liquid barely rippling. Living photograph, 5 second seamless loop",
  tavern_tense:
    "Photorealistic tense standoff inside a dark medieval tavern, fixed tripod camera, completely static shot, no camera movement. Two figures frozen mid-confrontation across a table, firelight casting dramatic shadows that flicker slightly. A patron in the background slowly looks down at their drink. Living photograph, 5 second seamless loop",
  goblin_ambush:
    "Photorealistic frozen moment of goblins mid-burst through a wooden door into a tavern, fixed tripod camera, completely static shot, no camera movement. Green-skinned creatures with rusted weapons caught in motion, wood splinters hanging in air drifting slowly, dust particles floating in torchlight. Living photograph of paused chaos, 5 second seamless loop",
  combat_melee:
    "Photorealistic frozen sword combat in a stone dungeon interior, fixed tripod camera, completely static shot, no camera movement. Two warriors locked with blades touching, bright sparks slowly cascading from the contact point, torchlight flickering on stone walls. Muscles tensed, sweat droplets suspended. Living photograph of paused action, 5 second seamless loop",
  cave_entrance:
    "Photorealistic dark cave mouth set into forested hills, fixed tripod camera, completely static shot, no camera movement. Eerie mist slowly rolling out of the entrance, twisted tree branches swaying gently in wind, moonlight filtering through drifting clouds. Living photograph, 5 second seamless loop",
  cave_interior:
    "Photorealistic underground tunnel in a fantasy dungeon, fixed tripod camera, completely static shot, no camera movement. Water drops falling slowly from stalactites, faint bioluminescent glow pulsing gently on cave walls, narrow passage disappearing into darkness. Living photograph, 5 second seamless loop",
  npc_dialogue:
    "Photorealistic gruff dwarf barkeep behind a wooden counter in a medieval tavern, fixed tripod camera, completely static shot, no camera movement. Braided beard, dim firelight flickering on his face, he slowly looks up then glances back down. Atmospheric dust motes drifting in warm light. Living photograph, 5 second seamless loop",
  forest_path:
    "Photorealistic winding path through a dark ancient forest, fixed tripod camera, completely static shot, no camera movement. Gnarled trees with branches swaying gently in breeze, fog drifting slowly between trunks, faint moonlight casting still shadows on the ground. Living photograph, 5 second seamless loop",
  town_street:
    "Photorealistic medieval town street at night, fixed tripod camera, completely static shot, no camera movement. Cobblestone road, hanging lanterns with flames gently swaying, warm pools of light on half-timbered buildings, faint atmospheric mist drifting at ground level. Living photograph, 5 second seamless loop",
  campfire:
    "Photorealistic campfire in a forest clearing at night, fixed tripod camera, completely static shot, no camera movement. Warm orange flames crackling and dancing, embers floating slowly upward, bedrolls and gear illuminated in warm glow, dark trees surrounding completely still. Living photograph, 5 second seamless loop",
  treasure_found:
    "Photorealistic glowing magical artifact revealed in a dark stone chamber, fixed tripod camera, completely static shot, no camera movement. Golden light radiating softly from an ornate chest, dust particles drifting lazily through light beams, everything else perfectly still. Living photograph, 5 second seamless loop",
  magic_spell:
    "Photorealistic arcane magical energy frozen in the air, fixed tripod camera, completely static shot, no camera movement. Glowing blue and purple runes orbiting slowly, faint particle effects drifting gently, dark atmospheric background perfectly still. Living photograph, 5 second seamless loop",
  fireball:
    "Photorealistic frozen moment of a fireball erupting in a stone dungeon chamber, fixed tripod camera, completely static shot, no camera movement. Orange and red flames suspended mid-expansion, faint heat distortion shimmering slowly, embers floating in place. Living photograph of paused destruction, 5 second seamless loop",
  stealth:
    "Photorealistic cloaked figure frozen mid-creep through deep shadows in a stone corridor, fixed tripod camera, completely static shot, no camera movement. Moonlight through narrow windows casting still beams, the figure's cloak barely rippling, dust motes drifting in the light. Living photograph, 5 second seamless loop",
  trap_danger:
    "Photorealistic ancient trap mechanism caught mid-activation in a dungeon corridor, fixed tripod camera, completely static shot, no camera movement. Arrows suspended in flight from wall slots, stone dust falling slowly from the ceiling, pressure plate barely depressed. Living photograph of frozen danger, 5 second seamless loop",
  locked_door:
    "Photorealistic ornate locked door covered in ancient runes that pulse with faint light, fixed tripod camera, completely static shot, no camera movement. Massive iron hinges, stone archway in a dungeon, mysterious light gently seeping and flickering through door cracks. Living photograph, 5 second seamless loop",
  rain_storm:
    "Photorealistic heavy rain falling on a medieval town at night, fixed tripod camera, completely static shot, no camera movement. Raindrops splashing on cobblestone, distant lightning briefly illuminating stone buildings, puddles rippling gently, dark fantasy atmosphere. Living photograph, 5 second seamless loop",
  victory:
    "Photorealistic triumphant fantasy hero standing still in golden light, fixed tripod camera, completely static shot, no camera movement. Epic rays slowly breaking through parting clouds, hero's cape barely rippling in gentle wind, dramatic golden hour lighting. Living photograph, 5 second seamless loop",
  defeat:
    "Photorealistic fallen warrior kneeling motionless in fading light, fixed tripod camera, completely static shot, no camera movement. Somber atmosphere, dust settling slowly around them, broken weapon nearby, a single ember drifting upward from the ground. Living photograph, 5 second seamless loop",
  potion_drink:
    "Photorealistic glowing potion bottles on an alchemist table, fixed tripod camera, completely static shot, no camera movement. Liquids bubbling gently in various colored bottles, mysterious ambient light shifting subtly, wisps of vapor rising slowly from an open flask. Living photograph, 5 second seamless loop",
  bridge_crossing:
    "Photorealistic narrow stone bridge spanning a dark bottomless chasm, fixed tripod camera, completely static shot, no camera movement. Rope railings perfectly still, faint mist rising slowly from below, single torch flame flickering gently on the far side. Living photograph, 5 second seamless loop",
  throne_room:
    "Photorealistic dark fantasy throne room with tall stone pillars, fixed tripod camera, completely static shot, no camera movement. Empty imposing throne, torchlight casting long shadows that flicker gently on gothic architecture walls, dust motes drifting in shafts of light. Living photograph, 5 second seamless loop",
  moonrise:
    "Photorealistic full moon hanging over dark fantasy hills, fixed tripod camera, completely static shot, no camera movement. Silver moonlight illuminating rolling landscape, silhouetted trees with branches barely swaying, clouds drifting very slowly across the moon. Living photograph, 5 second seamless loop",
  merchant:
    "Photorealistic medieval merchant stall displaying potions and fantasy weapons, fixed tripod camera, completely static shot, no camera movement. Colorful bottles with liquids gently glowing, ornate swords catching lantern light, the merchant slowly looking up from their wares. Living photograph, 5 second seamless loop",
  dice_roll:
    "Photorealistic glowing magical d20 die resting on a worn wooden surface, fixed tripod camera, completely static shot, no camera movement. Fantasy runes on the die faces pulsing with faint light, warm tavern glow, subtle particle effects drifting around the die. Living photograph, 5 second seamless loop",
};
