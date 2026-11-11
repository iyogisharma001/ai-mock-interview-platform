import mongoose from 'mongoose';

const { Schema } = mongoose;

const transcriptSchema = new Schema(
  {
    role: { type: String, enum: ['interviewer', 'candidate', 'system'], required: true },
    kind: { type: String, enum: ['greeting', 'reply', 'interruption', 'run-feedback', 'message', 'event'], default: 'message' },
    text: { type: String, required: true, maxlength: 8000 },
    meta: { type: Schema.Types.Mixed },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const runSchema = new Schema(
  {
    jobId: String,
    status: String,
    passed: Number,
    total: Number,
    durationMs: Number,
    timedOut: Boolean,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const interviewSchema = new Schema(
  {
    candidateName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true, index: true },
    language: { type: String, enum: ['python', 'javascript', 'cpp', 'markdown'], required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    finalCode: { type: String, default: '', maxlength: 100_000 },
    transcript: { type: [transcriptSchema], default: [] },
    runs: { type: [runSchema], default: [] },
    interruptions: { type: Number, default: 0 },
    hintsUsed: { type: Number, default: 0 },
    reportStatus: { type: String, enum: ['none', 'queued', 'ready', 'failed'], default: 'none' },
  },
  { timestamps: true },
);

interviewSchema.index({ status: 1, createdAt: -1 });
interviewSchema.index({ createdAt: -1 });

export const Interview = mongoose.model('Interview', interviewSchema);
