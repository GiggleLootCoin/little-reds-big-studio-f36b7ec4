export type BuddyExpandedVoice = {
  id: string;
  label: string;
  note: string;
  nativeLanguage: string;
  languages: string[];
  character: string;
  gender: "feminine" | "masculine";
  accent: string;
  provider: "aura-en" | "aura-es";
};
const en = (id:string,label:string,gender:"feminine"|"masculine",accent:string,note:string,character:string): BuddyExpandedVoice => ({id,label,note,nativeLanguage:"English",languages:["English"],character,gender,accent,provider:"aura-en"});
export const BUDDY_EXPANDED_VOICES: readonly BuddyExpandedVoice[] = [
 en("amalthea","Velvet Bloom","feminine","Filipino English","Engaging, natural, cheerful","The sunny one who somehow makes paperwork sound survivable."),
 en("andromeda","Sunday Vinyl","feminine","American","Casual, expressive, comfortable","Easy company with excellent imaginary records."),
 en("apollo","Copperline","masculine","American","Confident, comfortable, casual","Knows what he's doing; doesn't need to make a fuss about it."),
 en("arcas","Clearwater","masculine","American","Natural, smooth, clear","Straight-talking, polished, and allergic to waffle."),
 en("aries","Good Trouble","masculine","American","Warm, energetic, caring","Cheerful mischief with a surprisingly responsible side."),
 en("asteria","Starling","feminine","American","Clear, confident, knowledgeable, energetic","Bright brain, quick smile, zero interest in sounding corporate."),
 en("athena","Velour","feminine","American","Calm, smooth, professional","Knows the answer and delivers it without waving a giant flag about it."),
 en("atlas","Big Sky","masculine","American","Enthusiastic, confident, approachable","Friendly heavyweight energy; reassuring rather than booming."),
 en("aurora","Firefly","feminine","American","Cheerful, expressive, energetic","Sparkly without being a human glitter bomb."),
 en("callista","Silver Thread","feminine","American","Clear, energetic, professional, smooth","Crisp enough for instructions, warm enough for conversation."),
 en("cora","Clover","feminine","American","Smooth, melodic, caring","Softly musical and very good at making a sentence feel finished."),
 en("cordelia","Kindred","feminine","American","Approachable, warm, polite","The voice that says 'we've got this' and nearly makes you believe it."),
 en("delia","Peach Soda","feminine","American","Casual, friendly, cheerful, breathy","Light, breezy and just mischievous enough to steal your chips."),
 en("draco","East End Ember","masculine","British","Warm, approachable, trustworthy, baritone","A proper British baritone with enough warmth to avoid sounding like a bank announcement."),
 en("electra","Switchblade Smile","feminine","American","Professional, engaging, knowledgeable","Sharp delivery, warm landing; clever without showing off."),
 en("harmonia","Soft Focus","feminine","American","Empathetic, clear, calm, confident","Calm competence with a human pulse underneath."),
 en("helena","Honeycomb","feminine","American","Caring, natural, positive, friendly, raspy","A little rasp, a lot of heart, absolutely no motivational-poster nonsense."),
 en("hera","Golden Fern","feminine","American","Smooth, warm, professional","Polished enough for work, warm enough to remember the joke."),
 en("hermes","Quicksilver","masculine","American","Expressive, engaging, professional","Fast brain, clean delivery, cheeky little spark."),
 en("hyperion","Southern Cross","masculine","Australian","Caring, warm, empathetic","Aussie warmth with a calm, steady centre."),
 en("iris","Daydream","feminine","American","Cheerful, positive, approachable","Friendly sunshine without the forced 'have a blessed day' business."),
 en("janus","Magnolia Smoke","feminine","American Southern","Smooth, trustworthy, southern","Slow-burn charm and the confidence of someone who has already found the biscuits."),
 en("juno","Honeywire","feminine","American","Natural, engaging, melodic, breathy","Musical, intimate and quietly funny when invited."),
 en("jupiter","Low Orbit","masculine","American","Expressive, knowledgeable, baritone","Big low-end presence with a surprisingly gentle landing."),
 en("luna","Moonbeam","feminine","American","Friendly, natural, engaging","Warm, youthful and easy to listen to for ages."),
 en("mars","Redline","masculine","American","Smooth, patient, trustworthy, baritone","Steady low register; built for calm explanations and late-night chats."),
 en("minerva","North Star","feminine","American","Positive, friendly, natural","Bright, sensible and quietly reassuring."),
 en("neptune","Harbour","masculine","American","Professional, patient, polite","Calm waters, deep voice, no unnecessary drama."),
 en("odysseus","Long Way Home","masculine","American","Calm, smooth, comfortable, professional","Storyteller bones with a modern, grounded delivery."),
 en("ophelia","Brightside","feminine","American","Expressive, enthusiastic, cheerful","Big smile in the voice; enthusiasm with brakes."),
 en("orion","Blue Hour","masculine","American","Approachable, comfortable, calm, polite","The sensible friend who answers the phone on the first ring."),
 en("orpheus","Velvet Baritone","masculine","American","Professional, clear, confident, trustworthy","Rich and polished, without sounding like he's auditioning for a trailer."),
 en("pandora","Rain on Glass","feminine","British","Smooth, calm, melodic, breathy","Soft British elegance with a little midnight atmosphere."),
 en("phoebe","Peaches & Static","feminine","American","Energetic, warm, casual","Lively, affectionate and slightly chaotic in the best possible way."),
 en("pluto","After Midnight","masculine","American","Smooth, calm, empathetic, baritone","Low, mellow and excellent at making a crisis feel smaller."),
 en("saturn","Oak & Ink","masculine","American","Knowledgeable, confident, baritone","Measured, intelligent and pleasantly bookish."),
 en("selene","Electric Honey","feminine","American","Expressive, engaging, energetic","Bright charisma with a soft edge."),
 en("thalia","Laughing Glass","feminine","American","Clear, confident, energetic, enthusiastic","Crisp, lively and ready to celebrate a small win."),
 en("theia","Southern Light","feminine","Australian","Expressive, polite, sincere","Warm Australian sincerity; no nonsense, plenty of charm."),
 en("vesta","Hearthside","feminine","American","Natural, expressive, patient, empathetic","Feels like a good conversation in a warm kitchen."),
 en("zeus","Thunder Velvet","masculine","American","Deep, trustworthy, smooth","Big voice, soft edges. More velvet thunder than angry cloud."),
];
export const BUDDY_EXPANDED_LANGUAGES = ["English","Spanish","French","German","Italian","Portuguese","Russian","Chinese","Japanese","Korean","Hindi","Arabic","Dutch"] as const;
