import mongoose from 'mongoose';

const { Schema } = mongoose;
const score = { type: Number, min: 0, max: 10, required: true };

const reportSchema = new Schema(
  {
    interview: { type: Schema.Types.ObjectId, ref: 'Interview', required: true, unique: true },
    generatedBy: { type: String, enum: ['llm', 'heuristic'], required: true },
    verdict: { type: String, enum: ['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire'], required: true },
    overall: score,
    scores: {
      correctness: score,
      complexity: score,
      communication: score,
      codeQuality: score,
      problemSolving: score,
    },
    summary: { type: String, required: true },
    timeComplexity: String,
    spaceComplexity: String,
    optimalComplexity: String,
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    codeReview: { type: [{ _id: false, lines: String, comment: String }], default: [] },
    nextSteps: { type: [String], default: [] },
    metrics: {
      durationSec: Number,
      runs: Number,
      bestPassed: Number,
      totalTests: Number,
      interruptions: Number,
      hintsUsed: Number,
      candidateTurns: Number,
    },
  },
  { timestamps: true },
);

export const Report = mongoose.model('Report', reportSchema);
