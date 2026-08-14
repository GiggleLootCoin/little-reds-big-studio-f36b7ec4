export type BuddyExpandedVoice = {
  id: string;
  label: string;
  note: string;
  nativeLanguage: string;
  languages: string[];
  character: string;
  gender: "feminine" | "masculine";
  accent: string;
  age: "young adult" | "adult" | "mature";
  provider: "aura-en" | "aura-es";
};

const en = (
  id: string,
  label: string,
  gender: "feminine" | "masculine",
  accent: string,
  age: BuddyExpandedVoice["age"],
  note: string,
  character: string,
): BuddyExpandedVoice => ({
  id,
  label,
  note,
  nativeLanguage: "English",
  languages: ["English"],
  character,
  gender,
  accent,
  age,
  provider: "aura-en",
});

// Display names are deliberately independent from provider IDs. Provider IDs stay hidden
// so the UI can use memorable human identities without gender/name mismatches.
export const BUDDY_EXPANDED_VOICES: readonly BuddyExpandedVoice[] = [
  en("amalthea", "Penny", "feminine", "Filipino English", "young adult", "Cheerful, natural, engaging", "Warm, lively and easy company; the sort who can make a tedious job feel oddly manageable."),
  en("andromeda", "Frankie", "feminine", "American", "adult", "Casual, expressive, comfortable", "Relaxed, candid and companionable, with the conversational ease of someone who already knows the good story."),
  en("apollo", "Mason", "masculine", "American", "adult", "Confident, comfortable, casual", "Self-assured without peacocking. Useful, grounded and quietly funny."),
  en("arcas", "Ellis", "masculine", "American", "adult", "Natural, smooth, clear", "Clean delivery, calm presence and absolutely no patience for waffle."),
  en("aries", "Benny", "masculine", "American", "adult", "Warm, energetic, caring", "Bright energy with a caring streak; mischievous enough to keep things interesting."),
  en("asteria", "Dani", "feminine", "American", "adult", "Clear, confident, knowledgeable, energetic", "Sharp-minded, upbeat and capable without sounding like a corporate training video."),
  en("athena", "Maren", "feminine", "American", "mature", "Calm, smooth, professional", "Composed and reassuring with the sort of voice that makes complicated things feel less complicated."),
  en("atlas", "Gus", "masculine", "American", "mature", "Enthusiastic, confident, approachable", "Friendly heavyweight energy: reassuring, open and never needlessly loud."),
  en("aurora", "Tessa", "feminine", "American", "adult", "Cheerful, expressive, energetic", "Big smile in the voice, lively without becoming a human notification sound."),
  en("callista", "Rae", "feminine", "American", "adult", "Clear, energetic, professional, smooth", "Crisp enough for instructions, warm enough for an actual conversation."),
  en("cora", "Lila", "feminine", "American", "adult", "Smooth, melodic, caring", "Gentle musicality with a natural emotional lift; lovely for stories and softer conversations."),
  en("cordelia", "Nell", "feminine", "American", "young adult", "Approachable, warm, polite", "The reassuring friend who says 'we've got this' and somehow makes it believable."),
  en("delia", "Pippa", "feminine", "American", "young adult", "Casual, friendly, cheerful, breathy", "Light, breezy and playful, with just enough cheek to nick your chips."),
  en("draco", "Alfie", "masculine", "British", "adult", "Warm, approachable, trustworthy, baritone", "A proper warm British baritone; reassuring rather than bank-announcement formal."),
  en("electra", "Sloane", "feminine", "American", "adult", "Professional, engaging, knowledgeable", "Precise and clever with a warm landing; confident without showing off."),
  en("harmonia", "June", "feminine", "American", "adult", "Empathetic, clear, calm, confident", "Calm competence with a distinctly human pulse underneath."),
  en("helena", "Maggie", "feminine", "American", "adult", "Caring, natural, positive, friendly, raspy", "A little rasp, a lot of heart and absolutely no motivational-poster nonsense."),
  en("hera", "Claire", "feminine", "American", "adult", "Smooth, warm, professional", "Polished enough for serious work, warm enough to remember the joke."),
  en("hermes", "Theo", "masculine", "American", "adult", "Expressive, engaging, professional", "Fast brain, clean delivery and a cheeky spark when the moment calls for it."),
  en("hyperion", "Callum", "masculine", "Australian", "adult", "Caring, warm, empathetic", "Easy Australian warmth with a steady, thoughtful centre."),
  en("iris", "Millie", "feminine", "American", "young adult", "Cheerful, positive, approachable", "Friendly and upbeat without the forced 'have a blessed day' routine."),
  en("janus", "Savannah", "feminine", "American Southern", "adult", "Smooth, trustworthy, Southern", "Slow-burn charm and calm confidence, with excellent imaginary biscuits."),
  en("juno", "Ruby", "feminine", "American", "adult", "Natural, engaging, melodic, breathy", "Musical and intimate, with a quietly funny edge when invited."),
  en("jupiter", "Grant", "masculine", "American", "adult", "Expressive, knowledgeable, baritone", "Informed and substantial without sounding like he is auditioning for a documentary."),
  en("luna", "Sadie", "feminine", "American", "young adult", "Friendly, natural, engaging", "Youthful, warm and ridiculously easy to listen to for ages."),
  en("mars", "Dean", "masculine", "American", "adult", "Smooth, patient, trustworthy, baritone", "Steady low register built for calm explanations and late-night chats."),
  en("minerva", "Elise", "feminine", "American", "adult", "Positive, friendly, natural", "Bright, sensible and quietly reassuring; never over-sold."),
  en("neptune", "Martin", "masculine", "American", "adult", "Professional, patient, polite", "Patient and composed, with a dependable presence and no unnecessary drama."),
  en("odysseus", "Jonah", "masculine", "American", "adult", "Calm, smooth, comfortable, professional", "Modern storyteller energy: grounded, thoughtful and unhurried."),
  en("ophelia", "Zoe", "feminine", "American", "adult", "Expressive, enthusiastic, cheerful", "Lively and sunny with enough restraint to remain pleasant after the third paragraph."),
  en("orion", "Benji", "masculine", "American", "adult", "Approachable, comfortable, calm, polite", "The sensible friend who answers the phone on the first ring."),
  en("orpheus", "Marcus", "masculine", "American", "adult", "Professional, clear, confident, trustworthy", "Rich and polished, but never sounds like he is selling you a timeshare."),
  en("pandora", "Harriet", "feminine", "British", "adult", "Smooth, calm, melodic, breathy", "Soft British elegance with a gentle conversational pull."),
  en("phoebe", "Peaches", "feminine", "American", "adult", "Energetic, warm, casual", "Affectionate, lively and slightly chaotic in precisely the useful way."),
  en("pluto", "Nate", "masculine", "American", "adult", "Smooth, calm, empathetic, baritone", "Low, mellow and exceptionally good at making a crisis feel smaller."),
  en("saturn", "Warren", "masculine", "American", "adult", "Knowledgeable, confident, baritone", "Measured, intelligent and pleasantly bookish without sounding dusty."),
  en("selene", "Brooke", "feminine", "American", "adult", "Expressive, engaging, energetic", "Bright charisma with a soft edge and plenty of conversational lift."),
  en("thalia", "Jess", "feminine", "American", "adult", "Clear, confident, energetic, enthusiastic", "Crisp, lively and always ready to celebrate a small win."),
  en("theia", "Chloe", "feminine", "Australian", "adult", "Expressive, polite, sincere", "Warm Australian sincerity: straightforward, friendly and genuinely present."),
  en("vesta", "Hannah", "feminine", "American", "adult", "Natural, expressive, patient, empathetic", "Feels like a good conversation in a warm kitchen."),
  en("zeus", "Victor", "masculine", "American", "adult", "Deep, trustworthy, smooth", "A deep voice with soft edges; confident without turning every sentence into a movie trailer."),
];

export const BUDDY_EXPANDED_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Dutch",
  "Italian",
  "Japanese",
  "Portuguese",
  "Russian",
  "Chinese",
  "Korean",
  "Hindi",
  "Arabic",
] as const;
