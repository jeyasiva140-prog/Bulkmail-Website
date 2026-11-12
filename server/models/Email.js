import mongoose from 'mongoose';

const recipientSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['sent', 'failed'], required: true },
  error: { type: String, default: '' }
}, { _id: false });

const emailSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true, maxlength: 180 },
  body: { type: String, required: true, maxlength: 20000 },
  recipients: { type: [recipientSchema], default: [] },
  totalRecipients: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Email', emailSchema);
