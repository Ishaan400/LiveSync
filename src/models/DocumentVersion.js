const mongoose = require('mongoose');

const DocumentVersionSchema = new mongoose.Schema({
  docId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  update: { type: Buffer, required: true }, // Stores a single Automerge change
});

DocumentVersionSchema.index({ docId: 1, timestamp: -1 });

module.exports = mongoose.model('DocumentVersion', DocumentVersionSchema);