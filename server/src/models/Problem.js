import mongoose from 'mongoose';

const { Schema } = mongoose;

const testCaseSchema = new Schema(
  {
    input: { type: [Schema.Types.Mixed], default: [] }, // positional arguments
    expected: { type: Schema.Types.Mixed },
    hidden: { type: Boolean, default: false },
  },
  { _id: false },
);

const problemSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['coding', 'system-design'], default: 'coding', index: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true, index: true },
    tags: { type: [String], default: [], index: true },
    topic: { type: String, default: '', index: true }, // primary category used for browsing
    sheets: { type: [String], default: [], index: true }, // curated lists, e.g. "striver-sde"
    sheetSection: { type: String, default: '' },
    order: { type: Number, default: 0 },
    description: { type: String, required: true },
    functionName: {
      python: { type: String },
      javascript: { type: String },
      cpp: { type: String },
    },
    // Typed signature the C++ test harness is generated from.
    cppSignature: {
      ret: { type: String },
      params: { type: [String], default: undefined },
    },
    starterCode: {
      python: { type: String, default: '' },
      javascript: { type: String, default: '' },
      cpp: { type: String, default: '' },
      markdown: { type: String, default: '' },
    },
    testCases: { type: [testCaseSchema], default: [] },
    compare: { type: String, enum: ['exact', 'sorted'], default: 'exact' },
    expectedTime: { type: String, default: 'O(n)' },
    expectedSpace: { type: String, default: '' },
    hints: { type: [String], default: [] },
    rubric: { type: String, default: '' }, // interviewer-only guidance
  },
  { timestamps: true, minimize: false },
);

problemSchema.methods.toPublic = function toPublic() {
  return toPublicProblem(this.toObject());
};

export function toPublicProblem(p) {
  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    type: p.type,
    difficulty: p.difficulty,
    tags: p.tags,
    topic: p.topic,
    sheets: p.sheets || [],
    sheetSection: p.sheetSection || '',
    hintCount: (p.hints || []).length, // hint text stays server-side until the candidate asks
    hasTests: (p.testCases || []).length > 0,
    description: p.description,
    functionName: p.functionName,
    starterCode: p.starterCode,
    languages: p.type === 'coding' ? ['python', 'javascript', 'cpp'] : ['markdown'],
    sampleTests: (p.testCases || []).filter((t) => !t.hidden).map((t) => ({ input: t.input, expected: t.expected })),
    totalTests: (p.testCases || []).length,
  };
}

problemSchema.index({ sheets: 1, order: 1 });
problemSchema.index({ topic: 1, difficulty: 1, title: 1 });

export const Problem =mongoose.model('Problem', problemSchema);
