

const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['editor', 'viewer'], default: 'editor' }
  }],
  createdAt: { type: Date, default: Date.now },
  version: { type: Number, default: 0 },
});

module.exports = mongoose.model('Document', DocumentSchema);