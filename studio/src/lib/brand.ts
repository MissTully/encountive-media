export const BRAND = {
  name: "Encountive",
  studio: "Encountive Studio",
  tagline: "Campaigns from a brief.",
  product:
    "AI-adaptive clinical simulation for safer, more confident healthcare teams.",
  engine: "The Encountive Engine",
  loop: "Scenario → coaching → evidence, at scale.",
  voice: [
    "Evidence-first. Prefer numbers, rubrics, and pilots over adjectives.",
    "Calm and specific. Speak like a clinical educator, not a startup launch.",
    "Never claim AI replaces faculty. Encountive coaches; humans remain accountable.",
    "Name the gap, then the mechanism, then the proof.",
    "Invite a scoped 60–90 day pilot. Do not hard-sell enterprise licenses in v1 ads.",
  ],
  facts: [
    {
      value: "90%",
      label: "anticipate AI’s major role in health care",
      source: "The Lancet Regional Health — Americas",
    },
    {
      value: "79%",
      label: "feel excited to use AI at work",
      source: "The Lancet Regional Health — Americas",
    },
    {
      value: "<15%",
      label: "feel proficient in core AI concepts",
      source: "The Lancet Regional Health — Americas",
    },
    { value: "4.0x", label: "projected ROI for hospital cohorts", source: "Encountive ROI model" },
    {
      value: "$150k",
      label: "turnover cost savings per year (modeled)",
      source: "Encountive ROI model",
    },
    { value: "~1.3 mo", label: "modeled payback period", source: "Encountive ROI model" },
    { value: "40%", label: "reduction in faculty prep time", source: "Encountive ROI model" },
  ],
  claimsOk: [
    "Rubric-first scenarios with transparent, auditable scoring",
    "Adaptive remediation after every attempt",
    "Exportable evidence: completion, repeats, rubric deltas, cohort views",
    "Web and mobile now; XR in development for H1 2027",
    "Scoped 60–90 day pilots with baseline-to-post measurement",
  ],
  claimsNo: [
    "AI replaces clinical faculty or preceptors",
    "Guaranteed board-pass or patient-outcome miracles",
    "Revolutionary / magical / overnight transformation",
    "Unsourced percentages",
    "Stock ‘futuristic hospital’ clichés that ignore real sim labs",
  ],
  cta: "Start with a scoped pilot.",
  audiences: [
    "Nursing programs",
    "Hospital systems",
    "Clinical training centers",
    "Workforce development",
  ],
} as const;

export const PIPELINE = [
  {
    step: "01",
    name: "Copy",
    detail: "Grok writes the deck from your brief and the brand kit.",
  },
  {
    step: "02",
    name: "Still",
    detail: "Imagine generates text-free photography. Type is never baked in.",
  },
  {
    step: "03",
    name: "Compose",
    detail: "Studio overlays exact headlines, stats, and the wordmark.",
  },
  {
    step: "04",
    name: "Motion",
    detail: "Imagine animates an approved still into a 6–10s clip.",
  },
  {
    step: "05",
    name: "Sound",
    detail: "Add a music bed, a voiceover, or both. Mix in the browser.",
  },
  {
    step: "06",
    name: "Review & publish",
    detail: "A person approves. Then push to LinkedIn and Instagram.",
  },
] as const;
