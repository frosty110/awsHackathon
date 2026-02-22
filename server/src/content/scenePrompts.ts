import type { SceneId } from "@ai-dm/shared-types";

/** MiniMax video generation prompts keyed by scene ID. */
export const SCENE_PROMPTS: Record<SceneId, string> = {
  tavern_idle:
    "Dark fantasy tavern interior, warm firelight flickering on wooden beams, half-empty common room, stone hearth with low flames, tankards on tables, atmospheric smoke, medieval inn, cinematic looping ambient shot, no camera movement",
  tavern_tense:
    "Tense confrontation inside a dark medieval tavern, two figures facing off across a table, firelight casting dramatic shadows, patrons frozen in place, cinematic tension, dark fantasy aesthetic, looping ambient shot",
  goblin_ambush:
    "Goblins bursting through a wooden door into a tavern, green-skinned creatures with rusted weapons, chaotic attack scene, splinters flying, dark fantasy, dramatic lighting, cinematic action shot, looping",
  combat_melee:
    "Sword combat in a stone interior, sparks flying from clashing blades, two warriors fighting, dramatic torchlight, dark fantasy dungeon, cinematic action, looping combat scene",
  cave_entrance:
    "Dark cave mouth set into forested hills, eerie mist rolling out, twisted trees framing the entrance, moonlight filtering through clouds, dark fantasy landscape, cinematic establishing shot, looping",
  cave_interior:
    "Underground tunnel in a fantasy dungeon, dripping water, faint bioluminescent glow on cave walls, stalactites, narrow passage disappearing into darkness, cinematic ambient shot, looping",
  npc_dialogue:
    "Gruff dwarf barkeep behind a wooden counter in a medieval tavern, braided beard, dim firelight, fantasy character portrait scene, atmospheric, cinematic medium shot, looping",
  forest_path:
    "Winding path through a dark ancient forest, gnarled trees with twisted branches, fog drifting between trunks, faint moonlight, dark fantasy atmosphere, cinematic tracking shot, looping",
  town_street:
    "Medieval town street at night, cobblestone road, hanging lanterns casting warm pools of light, half-timbered buildings, dark fantasy aesthetic, atmospheric mist, cinematic shot, looping",
  campfire:
    "Campfire in a forest clearing at night, warm orange glow illuminating bedrolls and gear, embers floating upward, dark trees surrounding, fantasy adventure camp, cinematic ambient shot, looping",
  treasure_found:
    "Glowing magical artifact revealed in a dark stone chamber, golden light radiating from an ornate chest, dust particles in light beams, fantasy treasure discovery, cinematic reveal shot, looping",
  magic_spell:
    "Arcane magical energy swirling in the air, glowing blue and purple runes orbiting, fantasy spell casting, particle effects, dark atmospheric background, cinematic shot, looping",
  fireball:
    "Massive fireball erupting in a stone dungeon chamber, orange and red flames expanding, heat distortion, dramatic fantasy combat magic, cinematic explosion shot, looping",
  stealth:
    "Cloaked figure creeping through deep shadows in a stone corridor, moonlight through narrow windows, dark fantasy stealth scene, atmospheric tension, cinematic shot, looping",
  trap_danger:
    "Ancient trap mechanism activating in a dungeon corridor, arrows shooting from wall slots, pressure plate, stone dust falling, dark fantasy danger, dramatic cinematic shot, looping",
  locked_door:
    "Ornate locked door covered in ancient glowing runes, massive iron hinges, stone archway in a dungeon, mysterious light seeping through cracks, dark fantasy, cinematic shot, looping",
  rain_storm:
    "Heavy rain falling on a medieval town at night, lightning illuminating stone buildings, puddles on cobblestone, dramatic storm, dark fantasy atmosphere, cinematic wide shot, looping",
  victory:
    "Triumphant fantasy hero standing in golden light, epic rays breaking through clouds, victorious pose, dramatic moment, dark fantasy aesthetic, cinematic hero shot, looping",
  defeat:
    "Fallen warrior kneeling in fading light, somber atmosphere, dust settling, broken weapon nearby, dark fantasy defeat, melancholic cinematic shot, looping",
  potion_drink:
    "Glowing potion bottles on an alchemist table, bubbling liquids in various colors, fantasy alchemy lab, mysterious ambient light, dark atmospheric, cinematic close-up shot, looping",
  bridge_crossing:
    "Narrow stone bridge spanning a dark bottomless chasm, rope railings, mist rising from below, faint torchlight, dark fantasy architecture, cinematic wide shot, looping",
  throne_room:
    "Dark fantasy throne room with tall stone pillars, empty imposing throne, torchlight casting long shadows, gothic architecture, ominous atmosphere, cinematic establishing shot, looping",
  moonrise:
    "Full moon rising over dark fantasy hills, silver moonlight illuminating rolling landscape, silhouetted trees, atmospheric clouds, cinematic landscape shot, looping",
  merchant:
    "Medieval merchant stall displaying potions and fantasy weapons, colorful bottles, ornate swords, busy market atmosphere, lantern light, dark fantasy bazaar, cinematic shot, looping",
  dice_roll:
    "Glowing magical d20 die rolling across a worn wooden surface, fantasy runes on the die faces, warm tavern light, dramatic close-up, particle effects, cinematic shot, looping",
};
